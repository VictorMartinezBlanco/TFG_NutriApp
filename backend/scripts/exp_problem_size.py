"""Reports the size of the CP-SAT model for the real generation case.

Builds the model exactly as generate_plan does, snapshotting variable and
constraint counts after each construction stage (base variables and links,
structural rules, plausibility rules, clinical constraints, objective), and then
runs the solver with logging enabled to capture the model size after CP-SAT's
presolve. One row per configuration: the app default (7 days x 4 meals) plus a
short and a long plan.

Usage (from Repo/backend, venv active):
    python -m scripts.exp_problem_size [--out PATH]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re

from ortools.sat.python import cp_model

from app.db import connection_pool
from app.solver import config as C
from app.solver.catalog import apply_constraints
from app.solver.loader import (
    load_client,
    load_constraints,
    load_food_pool,
    load_meal_type_codes,
)
from app.solver.objective import set_objective
from app.solver import model as solver_model

NUTRI = "03f06edf-603e-489d-8aed-71bc93f97ef0"
CLIENT_NAME = "Lucia Fernandez"

DEFAULT_OUT = os.path.join(
    os.path.dirname(__file__), "..", "..", "feedback-docs", "experimentos-motor",
    "tamano_problema_crudos.json",
)

PRESOLVE_TIME_S = 20.0


def _snapshot(model: cp_model.CpModel):
    proto = model.Proto()
    n_bool = 0
    n_int = 0
    for v in proto.variables:
        dom = list(v.domain)
        if dom == [0, 1]:
            n_bool += 1
        else:
            n_int += 1
    return {"bool_vars": n_bool, "int_vars": n_int,
            "constraints": len(proto.constraints)}


def _delta(after, before):
    return {k: after[k] - before[k] for k in after}


def build_with_stages(client, dd, mm, foods, cons, ncodes, mcodes):
    """Replicates generate_plan's build, snapshotting after each stage."""
    stages = {}
    warnings: list[str] = []

    orig_structural = solver_model._structural_constraints
    orig_plausibility = solver_model._plausibility_constraints
    marks = {}

    def structural(pm, cl, warn):
        marks["base"] = _snapshot(pm.model)
        orig_structural(pm, cl, warn)
        marks["structural"] = _snapshot(pm.model)

    def plausibility(pm, codes, warn):
        orig_plausibility(pm, codes, warn)
        marks["plausibility"] = _snapshot(pm.model)

    solver_model._structural_constraints = structural
    solver_model._plausibility_constraints = plausibility
    try:
        pm = solver_model.build_base_model(client, dd, mm, foods, mcodes, warnings)
    finally:
        solver_model._structural_constraints = orig_structural
        solver_model._plausibility_constraints = orig_plausibility

    tag_members: dict[int, list[int]] = {}
    for f in foods:
        for tid in f.tag_ids:
            tag_members.setdefault(tid, []).append(f.id)
    applied = apply_constraints(
        pm, cons, tag_members=tag_members, nutrient_codes=ncodes,
        meal_codes=mcodes, weights=C.DEFAULT_WEIGHTS,
    )
    marks["clinical"] = _snapshot(pm.model)
    set_objective(pm, applied.obj, C.DEFAULT_WEIGHTS)
    marks["objective"] = _snapshot(pm.model)

    zero = {"bool_vars": 0, "int_vars": 0, "constraints": 0}
    order = ["base", "structural", "plausibility", "clinical", "objective"]
    prev = zero
    for name in order:
        stages[name] = _delta(marks[name], prev)
        prev = marks[name]
    stages["total"] = marks["objective"]
    return pm, stages


def presolved_size(pm):
    """Runs the solver briefly with logging and parses the presolved size."""
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = PRESOLVE_TIME_S
    solver.parameters.num_search_workers = C.SOLVE_WORKERS
    solver.parameters.log_search_progress = True
    solver.parameters.log_to_stdout = False
    lines: list[str] = []
    solver.log_callback = lines.append
    solver.Solve(pm.model)
    log = "\n".join(lines)

    # each callback entry can span several lines; the presolved summary is one
    # entry that starts with the header and lists variables and constraint
    # kinds below it.
    def clean(n):
        return int(n.replace("'", "").replace(",", ""))

    block = next(
        (ln for ln in lines if ln.startswith("Presolved optimization model")), "")
    out = {"log_excerpt": [l.strip() for l in block.splitlines() if l.strip()]}
    mv = re.search(r"#Variables:\s*([\d',]+)", block)
    if mv:
        out["variables"] = clean(mv.group(1))
    booleans = re.search(r"#Booleans:\s*([\d',]+)", log)
    if booleans:
        out["booleans_in_search"] = clean(booleans.group(1))
    kinds = re.findall(r"#(k\w+):\s*([\d',]+)", block)
    if kinds:
        out["constraint_kinds"] = {k: clean(v) for k, v in kinds}
    return out


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=DEFAULT_OUT)
    args = ap.parse_args()

    async with connection_pool() as pool:
        async with pool.acquire() as conn:
            ncodes = {r["id"]: r["code"]
                      for r in await conn.fetch("SELECT id, code FROM nutrient")}
            foods = await load_food_pool(conn, NUTRI)
            cid = await conn.fetchval(
                "SELECT id FROM client WHERE nutritionist_id=$1 AND full_name_pseudonym=$2",
                NUTRI, CLIENT_NAME,
            )
            client = await load_client(conn, cid)
            cons = await load_constraints(conn, cid, NUTRI)
            m4 = await load_meal_type_codes(conn, 4)

    results = {"catalog_size": len(foods), "client": CLIENT_NAME,
               "n_constraints": len(cons), "configs": {}}
    for dd in (3, 7, 14):
        label = f"{dd}d_4m"
        print(f"[run ] {label}: building")
        pm, stages = build_with_stages(client, dd, 4, foods, cons, ncodes, m4)
        print(f"[run ] {label}: solving {PRESOLVE_TIME_S}s for presolve stats")
        pres = presolved_size(pm)
        results["configs"][label] = {"stages": stages, "presolved": pres}
        total = stages["total"]
        print(f"      total: {total['bool_vars']} bool + {total['int_vars']} int vars, "
              f"{total['constraints']} constraints; presolved: "
              f"{pres.get('variables', '?')} vars")

    out_path = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(results, fh, indent=1, ensure_ascii=False)
    print(f"\nresultados en {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

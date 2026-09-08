"""Figures of the solver experiments, generated from the raw results.

Reads the raw JSON files in feedback-docs/experimentos-motor and writes the
figures next to them, PNG and PDF. Skips any figure whose raw file is missing,
so it can run while the campaign is still incomplete. Everything user-facing is
in Spanish: these figures go straight into the thesis.

Run (from Repo/backend, venv active):
    python -m scripts.plot_exp
"""

from __future__ import annotations

import json
from pathlib import Path
from statistics import mean, median

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

EXP_DIR = Path(__file__).resolve().parents[2] / "feedback-docs" / "experimentos-motor"

# Okabe-Ito, colorblind safe.
COLORS = {
    "antes": "#0072B2",
    "despues": "#E69F00",
    "off": "#0072B2",
    "on": "#009E73",
    "on_kcal": "#CC79A7",
    "v0": "#0072B2",
    "v1": "#E69F00",
    "v2": "#009E73",
}

FAMILY_LABELS = {"prefer": "Preferencias", "spread": "Reparto", "variety": "Variedad"}

NUTRITIONAL = {"kcal_target", "macro_target", "nutrient_min", "nutrient_max",
               "meal_kcal_ratio"}


def _style(ax) -> None:
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.grid(axis="y", alpha=0.3, linewidth=0.6)
    ax.set_axisbelow(True)


def _save(fig, name: str) -> None:
    for ext in ("png", "pdf"):
        fig.savefig(EXP_DIR / f"{name}.{ext}", dpi=300, bbox_inches="tight")
    plt.close(fig)
    print(f"  {name}.png / .pdf")


def _q_by_family(path: Path) -> dict[str, list[float]]:
    with open(path, encoding="utf-8") as fh:
        results = json.load(fh)
    out: dict[str, list[float]] = {}
    for entry in results.values():
        if entry.get("status") not in ("optimal", "feasible"):
            continue
        step = entry.get("dominant_step_scaled") or 0
        if not step:
            continue
        by_fam: dict[str, float] = {}
        for t in entry["terms"]:
            if t["family"] in NUTRITIONAL:
                continue
            by_fam[t["family"]] = by_fam.get(t["family"], 0) + t["weighted_bound"]
        for fam, bound in by_fam.items():
            out.setdefault(fam, []).append(bound / step)
    return out


def fig_magnitudes() -> None:
    """Q per family, before and after the weight rebalance, log scale."""
    antes = EXP_DIR / "magnitudes_crudos.json"
    despues = EXP_DIR / "magnitudes_despues_crudos.json"
    if not antes.exists():
        print("  (sin magnitudes_crudos.json, se salta fig_magnitudes)")
        return
    series = {"antes": _q_by_family(antes)}
    if despues.exists():
        series["despues"] = _q_by_family(despues)

    fams = ["prefer", "spread", "variety"]
    fig, ax = plt.subplots(figsize=(7.2, 3.4))
    yticks, ylabels = [], []
    y = 0
    for fam in fams:
        for label, data in series.items():
            if fam not in data:
                continue
            qs = data[fam]
            ax.scatter(qs, [y] * len(qs), s=26, alpha=0.7,
                       color=COLORS[label], zorder=3,
                       label=("Antes del ajuste" if label == "antes"
                              else "Después del ajuste")
                       if (fam == fams[0]) else None)
            ax.scatter([median(qs)], [y], marker="|", s=340,
                       color=COLORS[label], zorder=4)
            yticks.append(y)
            ylabels.append(f"{FAMILY_LABELS[fam]}\n"
                           f"({'antes' if label == 'antes' else 'después'})")
            y += 1
        y += 0.5
    ax.axvline(1.0, color="#D55E00", linewidth=1.2, linestyle="--")
    ax.text(1.15, yticks[-1] + 0.45, "Q = 1", color="#D55E00", fontsize=9,
            va="top")
    ax.set_xscale("log")
    ax.set_yticks(yticks)
    ax.set_yticklabels(ylabels, fontsize=8)
    ax.set_xlabel("Q: rango completo de la familia / coste de 1 unidad natural "
                  "de desviación (escala log)")
    ax.invert_yaxis()
    _style(ax)
    ax.grid(axis="x", alpha=0.3, linewidth=0.6)
    ax.grid(axis="y", alpha=0)
    if len(series) > 1:
        ax.legend(frameon=False, fontsize=8, loc="lower right")
    ax.set_title("Conmensurabilidad de las familias del objetivo, por caso")
    _save(fig, "fig_magnitudes_q")


DEMO_NAMES = {"david": "David", "lucia": "Lucía", "sofia": "Sofía", "tomas": "Tomás",
              "carlos": "Carlos", "nadia": "Nadia", "maria": "María"}


def _case_name(key: str) -> str:
    """Case label as the thesis names it: banco N or the demo client name."""
    if key.startswith("bank"):
        return "banco " + key[4:].split("_", 1)[0]
    if key.startswith("demo_"):
        tail = key.split("_")[-1]
        return DEMO_NAMES.get(tail, tail)
    return key.replace("_", "\n", 1)


def fig_simetria() -> None:
    path = EXP_DIR / "simetria_crudos.json"
    if not path.exists():
        print("  (sin simetria_crudos.json, se salta fig_simetria)")
        return
    with open(path, encoding="utf-8") as fh:
        results = json.load(fh)
    arms = ("off", "on", "on_kcal")
    arm_labels = {"off": "Sin orden", "on": "Cadena lexicográfica",
                  "on_kcal": "Orden escalar (kcal)"}
    cases = [(k, v) for k, v in results.items()
             if v.get("applicable") and all(v.get(a) for a in arms)]
    if not cases:
        print("  (simetria sin casos completos, se salta)")
        return
    labels = [_case_name(k) for k, _ in cases]
    x = range(len(cases))
    width = 0.27
    fig, ax = plt.subplots(figsize=(9.2, 3.6))
    for i, arm in enumerate(arms):
        means = [mean(r["wall_s"] for r in v[arm]) for _, v in cases]
        mins = [min(r["wall_s"] for r in v[arm]) for _, v in cases]
        maxs = [max(r["wall_s"] for r in v[arm]) for _, v in cases]
        pos = [xi + (i - 1) * width for xi in x]
        err = [[m - lo for m, lo in zip(means, mins)],
               [hi - m for m, hi in zip(means, maxs)]]
        ax.bar(pos, means, width, yerr=err, capsize=2,
               color=COLORS[arm], error_kw={"linewidth": 0.8},
               label=arm_labels[arm])
    ax.set_xticks(list(x))
    ax.set_xticklabels(labels, fontsize=7)
    ax.set_ylabel("Tiempo de resolución (s)")
    ax.set_title("Rotura de simetría entre días: tiempo total, media y rango "
                 "de las repeticiones")
    _style(ax)
    ax.legend(frameon=False, fontsize=9)
    _save(fig, "fig_simetria_tiempos")


def fig_escalado() -> None:
    path = EXP_DIR / "escalado_crudos.json"
    if not path.exists():
        print("  (sin escalado_crudos.json, se salta fig_escalado)")
        return
    with open(path, encoding="utf-8") as fh:
        results = json.load(fh)

    def cell(dd, mm, cat, field, scale):
        entry = results.get(f"{dd}d_{mm}m_{cat}f")
        if not entry or not entry["reps"]:
            return None
        vals = [r[field] * scale for r in entry["reps"]
                if r.get(field) is not None]
        return (mean(vals), min(vals), max(vals)) if vals else None

    def sweeps(field, scale):
        return [
            ("Días del plan", [(d, cell(d, 4, 100, field, scale))
                               for d in (3, 7, 14)]),
            ("Comidas por día", [(m, cell(7, m, 100, field, scale))
                                 for m in (3, 4, 5)]),
            ("Tamaño del catálogo", [(c, cell(7, 4, c, field, scale))
                                     for c in (30, 60, 100)]),
        ]

    fig, rows = plt.subplots(2, 3, figsize=(9.6, 5.6), sharey="row")
    specs = [
        (rows[0], sweeps("solve_time_ms", 1 / 1000),
         "Tiempo de resolución (s)"),
        (rows[1], sweeps("optimality_gap", 100),
         "Brecha de optimalidad (%)"),
    ]
    for axes, data, ylabel in specs:
        for ax, (title, points) in zip(axes, data):
            pts = [(x, v) for x, v in points if v]
            if not pts:
                continue
            xs = [p[0] for p in pts]
            means = [p[1][0] for p in pts]
            err = [[m - p[1][1] for m, p in zip(means, pts)],
                   [p[1][2] - m for m, p in zip(means, pts)]]
            ax.errorbar(xs, means, yerr=err, marker="o", capsize=3,
                        color="#0072B2", linewidth=1.4)
            ax.set_xticks(xs)
            if ax is axes[0]:
                ax.set_ylabel(ylabel)
            if ylabel.startswith("Tiempo"):
                ax.set_title(title, fontsize=10)
            _style(ax)
    fig.suptitle("Escalado por dimensión (resto en el caso por defecto). "
                 "Con el tiempo en el límite, la brecha separa las "
                 "configuraciones", fontsize=11)
    _save(fig, "fig_escalado")


def fig_versiones() -> None:
    """Realism versus solve time across model versions, same catalog and cases."""
    if not (EXP_DIR / "versiones_v2.json").exists():
        print("  (sin versiones_v2.json, se salta fig_versiones)")
        return
    from scripts.exp_versions import version_metrics

    labels = ["v0", "v1", "v2"]
    names = {"v0": "v0\ninicial", "v1": "v1\n+ reglas base",
             "v2": "v2\n+ plausibilidad"}
    metrics = {l: version_metrics(l) for l in labels}

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(8.6, 3.4))
    x = range(len(labels))
    width = 0.38
    ax1.bar([xi - width / 2 for xi in x],
            [metrics[l]["pct_attractor"] for l in labels], width,
            color="#0072B2", label="Raciones en 10 o 300 g exactos")
    ax1.bar([xi + width / 2 for xi in x],
            [metrics[l]["pct_outside_profile"] for l in labels], width,
            color="#E69F00", label="Raciones fuera del perfil real")
    for i, l in enumerate(labels):
        ax1.text(i - width / 2, metrics[l]["pct_attractor"] + 1.2,
                 f"{metrics[l]['pct_attractor']:.0f}%", ha="center", fontsize=8)
        ax1.text(i + width / 2, metrics[l]["pct_outside_profile"] + 1.2,
                 f"{metrics[l]['pct_outside_profile']:.0f}%", ha="center",
                 fontsize=8)
    ax1.set_xticks(list(x))
    ax1.set_xticklabels([names[l] for l in labels], fontsize=8)
    ax1.set_ylim(0, 112)
    ax1.set_ylabel("Porcentaje de raciones")
    ax1.set_title("Realismo de las raciones", fontsize=10)
    ax1.legend(frameon=False, fontsize=8, loc="upper right")
    _style(ax1)

    means = [metrics[l]["time_mean"] for l in labels]
    err = [[metrics[l]["time_mean"] - metrics[l]["time_min"] for l in labels],
           [metrics[l]["time_max"] - metrics[l]["time_mean"] for l in labels]]
    ax2.bar(list(x), means, 0.5, yerr=err, capsize=3,
            color=[COLORS[l] for l in labels], error_kw={"linewidth": 0.8})
    for i, m in enumerate(means):
        ax2.text(i, m + 2.5, f"{m:.0f} s", ha="center", fontsize=8)
    ax2.set_xticks(list(x))
    ax2.set_xticklabels([names[l] for l in labels], fontsize=8)
    ax2.set_ylabel("Tiempo de resolución (s), media y rango")
    ax2.set_title("Coste de resolución", fontsize=10)
    _style(ax2)

    fig.suptitle("Tres versiones del modelo sobre el mismo catálogo y los "
                 "mismos casos", fontsize=11, y=1.04)
    _save(fig, "fig_versiones")


def main() -> int:
    print("generando figuras en", EXP_DIR)
    fig_magnitudes()
    fig_simetria()
    fig_escalado()
    fig_versiones()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

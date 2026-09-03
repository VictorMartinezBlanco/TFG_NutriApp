"""Figures of the tolerance bands experiment, from the raw results.

Reads bandas_crudos.json in feedback-docs/experimentos-objetivo and writes the
figures next to it, PNG and PDF. Labels in Spanish: they go into the thesis.

Run (from Repo/backend, venv active):
    python -m scripts.plot_objective
"""

from __future__ import annotations

import json
from pathlib import Path
from statistics import median

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

EXP_DIR = Path(__file__).resolve().parents[2] / "feedback-docs" / "experimentos-objetivo"
RAW = EXP_DIR / "bandas_crudos.json"

# Okabe-Ito, colorblind safe.
COLORS = {"base": "#0072B2", "A": "#E69F00", "B": "#009E73"}
ARM_LABELS = {"base": "Base (sin bandas)", "A": "A (bandas)", "B": "B (bandas, estructura x10)"}

CONFLICT = {"demo_30_tomas"}

CASE_LABELS = {
    "bank2_kcal_only": "banco 2",
    "bank3_kcal_prefer": "banco 3",
    "bank4_forbid_protmin": "banco 4",
    "bank5_forbid_sodmax": "banco 5",
    "bank8_design": "banco 8",
    "demo_27_david": "David",
    "demo_28_lucia": "Lucía",
    "demo_29_sofia": "Sofía",
    "demo_30_tomas": "Tomás",
    "demo_31_carlos": "Carlos",
    "demo_32_nadia": "Nadia",
    "design_macro": "diseño macro",
}


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


def _load():
    with open(RAW, encoding="utf-8") as fh:
        return json.load(fh)


def _plans(entry, arm):
    return [r for r in entry.get(arm, []) if r.get("status") != "no_plan"]


def fig_variedad(results) -> None:
    """Median unused foods per case and arm, with the optimal count on top."""
    cases = [c for c in CASE_LABELS if c in results]
    arms = [a for a in COLORS if any(a in results[c] for c in cases)]
    fig, ax = plt.subplots(figsize=(10, 4.2))
    width = 0.8 / len(arms)
    for i, arm in enumerate(arms):
        xs, ys = [], []
        for j, c in enumerate(cases):
            reps = _plans(results[c], arm)
            if not reps:
                continue
            xs.append(j + (i - (len(arms) - 1) / 2) * width)
            ys.append(median(r["unused"] for r in reps))
            opt = sum(1 for r in reps if r["status"] == "optimal")
            ax.text(xs[-1], ys[-1] + 0.8, f"{opt}/{len(reps)}", ha="center",
                    va="bottom", fontsize=6.5, color=COLORS[arm])
        ax.bar(xs, ys, width=width * 0.95, color=COLORS[arm], label=ARM_LABELS[arm])
    ax.set_xticks(range(len(cases)))
    ax.set_xticklabels([CASE_LABELS[c] for c in cases], rotation=30, ha="right")
    ax.set_ylabel("Alimentos sin usar (mediana de 3)")
    ax.set_title("Variedad realizada por caso y brazo (sobre cada barra, óptimos probados)")
    ax.legend(frameon=False, fontsize=8)
    _style(ax)
    _save(fig, "fig_bandas_variedad")


def fig_desviacion(results) -> None:
    """Signed daily kcal deviations of every rep, per case and arm, with both
    bands shaded and the plan mean per rep as a dash. The conflict case (Tomás,
    1.200 kcal below target by construction) would flatten the scale; it stays
    in the tables."""
    cases = [c for c in CASE_LABELS if c in results and c not in CONFLICT
             and any("kcal" in r.get("targets", {}) for a in ("A", "B") for r in _plans(results[c], a))]
    if not cases:
        return
    arms = [a for a in ("base", "A", "B") if any(_plans(results[c], a) for c in cases)]
    fig, ax = plt.subplots(figsize=(10, 4.2))
    band_day = band_mean = None
    width = 0.8 / len(arms)
    for i, arm in enumerate(arms):
        for j, c in enumerate(cases):
            x0 = j + (i - (len(arms) - 1) / 2) * width
            for k, r in enumerate(_plans(results[c], arm)):
                t = r.get("targets", {}).get("kcal")
                if t is None:
                    continue
                if arm != "base":
                    band_day, band_mean = t["band_day"], t["band_mean"]
                xs = [x0 + (k - 1) * width / 4] * len(t["daily_signed"])
                ax.scatter(xs, t["daily_signed"], s=9, color=COLORS[arm], alpha=0.55,
                           label=ARM_LABELS[arm] if (j == 0 and k == 0) else None)
                ax.scatter([xs[0]], [t["mean_signed"]], marker="_", s=120,
                           color=COLORS[arm], linewidths=1.6)
    if band_day:
        ax.axhspan(-band_day, band_day, color="grey", alpha=0.10, lw=0)
        ax.axhspan(-band_mean, band_mean, color="grey", alpha=0.14, lw=0)
        ax.text(len(cases) - 0.55, band_day + 1, f"banda diaria ±{band_day}", fontsize=7,
                va="bottom", ha="right", color="dimgrey")
        ax.text(len(cases) - 0.55, -band_mean - 1, f"banda de la media ±{band_mean}",
                fontsize=7, va="top", ha="right", color="dimgrey")
    ax.axhline(0, color="black", lw=0.6)
    ax.set_xticks(range(len(cases)))
    ax.set_xticklabels([CASE_LABELS[c] for c in cases])
    ax.set_ylabel("Desviación del objetivo calórico (kcal)")
    ax.set_title("Desviación diaria (puntos) y media del plan (trazo) por repetición")
    ax.legend(frameon=False, fontsize=8, loc="upper center", ncol=3,
              bbox_to_anchor=(0.5, -0.12))
    _style(ax)
    _save(fig, "fig_bandas_desviacion")


def fig_tiempos(results) -> None:
    """Median wall time per case and arm."""
    cases = [c for c in CASE_LABELS if c in results]
    arms = [a for a in COLORS if any(a in results[c] for c in cases)]
    fig, ax = plt.subplots(figsize=(10, 3.8))
    width = 0.8 / len(arms)
    for i, arm in enumerate(arms):
        xs, ys = [], []
        for j, c in enumerate(cases):
            reps = _plans(results[c], arm)
            if not reps:
                continue
            xs.append(j + (i - (len(arms) - 1) / 2) * width)
            ys.append(median(r["wall_s"] for r in reps))
        ax.bar(xs, ys, width=width * 0.95, color=COLORS[arm], label=ARM_LABELS[arm])
    ax.axhline(90, color="grey", lw=0.8, ls="--")
    ax.text(len(cases) - 0.5, 91, "límite 90 s", fontsize=7, ha="right", color="dimgrey")
    ax.set_xticks(range(len(cases)))
    ax.set_xticklabels([CASE_LABELS[c] for c in cases], rotation=30, ha="right")
    ax.set_ylabel("Tiempo de resolución (s, mediana de 3)")
    ax.set_title("Tiempo por caso y brazo")
    ax.legend(frameon=False, fontsize=8)
    _style(ax)
    _save(fig, "fig_bandas_tiempos")


def main() -> int:
    if not RAW.exists():
        print("sin crudos:", RAW)
        return 1
    results = _load()
    print("generando figuras en", EXP_DIR)
    fig_variedad(results)
    fig_desviacion(results)
    fig_tiempos(results)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

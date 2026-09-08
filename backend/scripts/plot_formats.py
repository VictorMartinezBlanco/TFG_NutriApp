"""Figures of the prompt format study, generated from the raw results.

Reads feedback-docs/estudio-formatos/resultados_crudos.json (and the precheck
results when present) and writes the study figures next to them, PNG and PDF.
Everything user-facing is in Spanish: these figures go straight into the
thesis. Rerunning the script regenerates every figure from the same raw data.

Run (from Repo/backend, venv active):
    python -m scripts.plot_formats
"""

from __future__ import annotations

import json
from pathlib import Path
from statistics import mean, stdev

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

STUDY_DIR = Path(__file__).resolve().parents[2] / "feedback-docs" / "estudio-formatos"
RESULTS_FILE = STUDY_DIR / "resultados_crudos.json"
PRECHECKS_FILE = STUDY_DIR / "resultados_prechecks.json"

FORMAT_LABELS = {
    "natural": "Natural",
    "telegrafico": "Telegráfico",
    "plantilla": "Plantilla",
    "clave_valor": "Clave-valor",
    "verboso": "Verboso",
}
# Okabe-Ito, colorblind safe; one fixed hue per format across every figure.
FORMAT_COLORS = {
    "natural": "#0072B2",
    "telegrafico": "#E69F00",
    "plantilla": "#009E73",
    "clave_valor": "#CC79A7",
    "verboso": "#56B4E9",
}


def _style(ax) -> None:
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.grid(axis="y", alpha=0.3, linewidth=0.6)
    ax.set_axisbelow(True)


def _save(fig, name: str) -> None:
    for ext in ("png", "pdf"):
        fig.savefig(STUDY_DIR / f"{name}.{ext}", dpi=300, bbox_inches="tight")
    plt.close(fig)
    print(f"  {name}.png / .pdf")


def _bar_labels(ax, bars, fmt: str = "{:.1f}") -> None:
    for b in bars:
        ax.annotate(
            fmt.format(b.get_height()).replace(".", ","),
            (b.get_x() + b.get_width() / 2, b.get_height()),
            ha="center", va="bottom", fontsize=9, xytext=(0, 2),
            textcoords="offset points",
        )


def _per_rep(rows: list[dict], fmt: str, value) -> list[float]:
    """One aggregate per repetition round, for honest error bars."""
    reps = sorted({r["rep"] for r in rows})
    out = []
    for rep in reps:
        cell = [r for r in rows if r["format"] == fmt and r["rep"] == rep]
        out.append(value(cell))
    return out


def fig_acierto_mensaje(rows: list[dict], formats: list[str]) -> None:
    means, stds = [], []
    for f in formats:
        vals = _per_rep(rows, f, lambda c: 100 * mean(r["success"] for r in c))
        means.append(mean(vals))
        stds.append(stdev(vals) if len(vals) > 1 else 0)
    fig, ax = plt.subplots(figsize=(7, 4.2))
    bars = ax.bar(
        [FORMAT_LABELS[f] for f in formats], means,
        yerr=stds, capsize=4, width=0.62,
        color=[FORMAT_COLORS[f] for f in formats],
        error_kw={"linewidth": 1, "alpha": 0.7},
    )
    _bar_labels(ax, bars)
    ax.set_ylabel("Tasa de acierto por mensaje (%)")
    ax.set_ylim(0, 105)
    ax.set_title("Tasa de acierto por mensaje según el formato del texto")
    _style(ax)
    _save(fig, "fig1_acierto_mensaje")


def fig_recall_precision(rows: list[dict], formats: list[str]) -> None:
    def recall(c):
        return 100 * sum(r["n_matched"] for r in c) / sum(r["n_expected"] for r in c)

    def precision(c):
        produced = sum(r["n_matched"] + r["n_spurious"] for r in c)
        return 100 * sum(r["n_matched"] for r in c) / produced if produced else 0

    rec = [mean(_per_rep(rows, f, recall)) for f in formats]
    prec = [mean(_per_rep(rows, f, precision)) for f in formats]
    x = range(len(formats))
    w = 0.36
    fig, ax = plt.subplots(figsize=(7, 4.2))
    b1 = ax.bar([i - w / 2 for i in x], rec, w, label="Exhaustividad (recall)",
                color="#0072B2")
    b2 = ax.bar([i + w / 2 for i in x], prec, w, label="Precisión",
                color="#E69F00")
    _bar_labels(ax, b1)
    _bar_labels(ax, b2)
    ax.set_xticks(list(x))
    ax.set_xticklabels([FORMAT_LABELS[f] for f in formats])
    ax.set_ylabel("Sobre las restricciones esperadas (%)")
    ax.set_ylim(0, 124)
    ax.set_yticks(range(0, 101, 20))
    ax.set_title("Exhaustividad y precisión por restricción según el formato")
    ax.legend(frameon=False, loc="upper center", ncols=2)
    _style(ax)
    _save(fig, "fig2_recall_precision")


def fig_latencia(rows: list[dict], formats: list[str]) -> None:
    means, stds = [], []
    for f in formats:
        vals = [r["latency_ms"] / 1000 for r in rows
                if r["format"] == f and r["latency_ms"] is not None]
        means.append(mean(vals))
        stds.append(stdev(vals) if len(vals) > 1 else 0)
    fig, ax = plt.subplots(figsize=(7, 4.2))
    bars = ax.bar(
        [FORMAT_LABELS[f] for f in formats], means, yerr=stds, capsize=4,
        width=0.62, color=[FORMAT_COLORS[f] for f in formats],
        error_kw={"linewidth": 1, "alpha": 0.7},
    )
    _bar_labels(ax, bars)
    ax.set_ylabel("Latencia por llamada (s)")
    ax.set_title("Latencia media del traductor según el formato")
    _style(ax)
    _save(fig, "fig3_latencia")


def fig_tokens(rows: list[dict], formats: list[str]) -> None:
    t_in = [mean([r["tokens_input"] for r in rows
                  if r["format"] == f and r["tokens_input"] is not None])
            for f in formats]
    t_out = [mean([r["tokens_output"] for r in rows
                   if r["format"] == f and r["tokens_output"] is not None])
             for f in formats]
    x = range(len(formats))
    w = 0.36
    fig, ax = plt.subplots(figsize=(7, 4.2))
    b1 = ax.bar([i - w / 2 for i in x], t_in, w, label="Tokens de entrada",
                color="#0072B2")
    b2 = ax.bar([i + w / 2 for i in x], t_out, w, label="Tokens de salida",
                color="#E69F00")
    _bar_labels(ax, b1, "{:.0f}")
    _bar_labels(ax, b2, "{:.0f}")
    ax.set_xticks(list(x))
    ax.set_xticklabels([FORMAT_LABELS[f] for f in formats])
    ax.set_ylabel("Tokens medios por llamada")
    ax.set_title("Consumo de tokens según el formato")
    ax.legend(frameon=False)
    _style(ax)
    _save(fig, "fig4_tokens")


def fig_heatmap(rows: list[dict], formats: list[str]) -> None:
    messages = sorted({r["message"] for r in rows})
    reps = len({r["rep"] for r in rows})
    grid = [[sum(r["success"] for r in rows
                 if r["format"] == f and r["message"] == m)
             for m in messages] for f in formats]
    fig, ax = plt.subplots(figsize=(8.2, 3.4))
    im = ax.imshow(grid, cmap="Blues", vmin=0, vmax=reps, aspect="auto")
    for i, f in enumerate(formats):
        for j, _ in enumerate(messages):
            v = grid[i][j]
            ax.text(j, i, str(v), ha="center", va="center", fontsize=9,
                    color="white" if v > reps / 2 else "#1a1a1a")
    ax.set_xticks(range(len(messages)))
    ax.set_xticklabels([f"M{m}" for m in messages])
    ax.set_yticks(range(len(formats)))
    ax.set_yticklabels([FORMAT_LABELS[f] for f in formats])
    ax.set_title(f"Repeticiones acertadas por mensaje y formato (de {reps})")
    fig.colorbar(im, ax=ax, shrink=0.8, ticks=range(reps + 1))
    _save(fig, "fig5_mapa_mensajes")


def fig_prechecks(pre: list[dict], formats: list[str]) -> None:
    if any(not [r for r in pre if r["format"] == f] for f in formats):
        print("  (prechecks skipped: pass not complete yet)")
        return
    pct_ok = []
    for f in formats:
        cell = [r for r in pre if r["format"] == f]
        pct_ok.append(100 * sum(r["status"] == "ok" for r in cell) / len(cell))
    fig, ax = plt.subplots(figsize=(7, 4.2))
    bars = ax.bar(
        [FORMAT_LABELS[f] for f in formats], pct_ok, width=0.62,
        color=[FORMAT_COLORS[f] for f in formats],
    )
    _bar_labels(ax, bars)
    ax.set_ylabel("Mensajes que superan los prechecks (%)")
    ax.set_ylim(0, 105)
    ax.set_title("Formatos frente a las pasadas de validación previa")
    _style(ax)
    _save(fig, "fig6_prechecks")


def main() -> None:
    spec = json.loads((STUDY_DIR / "mensajes.json").read_text(encoding="utf-8"))
    formats = spec["formats"]
    rows = json.loads(RESULTS_FILE.read_text(encoding="utf-8"))
    print(f"figures from {len(rows)} raw cells:")
    fig_acierto_mensaje(rows, formats)
    fig_recall_precision(rows, formats)
    fig_latencia(rows, formats)
    fig_tokens(rows, formats)
    fig_heatmap(rows, formats)
    if PRECHECKS_FILE.exists():
        pre = json.loads(PRECHECKS_FILE.read_text(encoding="utf-8"))
        fig_prechecks(pre, formats)
    else:
        print("  (prechecks skipped: no results file)")


if __name__ == "__main__":
    main()

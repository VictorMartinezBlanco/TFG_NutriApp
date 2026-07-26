"""Deterministic language gate, ahead of any engine call.

Telling the language apart is a solved problem, so it stays out of the model
(small local models proved unreliable at it). The gate is deliberately
forgiving: languages close to Spanish are let through and very short texts are
not judged, because blocking a Spanish message written without accents is a
far worse failure than letting a borderline one reach the translator, which
rejects what it cannot resolve anyway.
"""

from __future__ import annotations

from langdetect import DetectorFactory, LangDetectException, detect_langs

# langdetect is probabilistic by default; a fixed seed makes it reproducible.
DetectorFactory.seed = 0

# es/en are the supported languages; ca, gl and pt are close enough to Spanish
# that accent-less Spanish is routinely mistaken for them.
_ALLOWED = {"es", "en", "ca", "gl", "pt"}
_MIN_WORDS = 3
_MIN_PROB = 0.90


def unsupported_language(text: str) -> bool:
    if len(text.split()) < _MIN_WORDS:
        return False
    try:
        langs = detect_langs(text)
    except LangDetectException:
        return False
    top = langs[0]
    return top.prob >= _MIN_PROB and top.lang not in _ALLOWED

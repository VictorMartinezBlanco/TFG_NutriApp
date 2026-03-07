# Notas útiles de la plantilla TFGTeXiS

- **Cambiar estilo de títulos de capítulos:** Editar `TeXiS\TeXiS_pream.tex` y comentar la línea `\usepackage[Lenny]{fncychap}` para usar el estilo básico de LaTeX.
- **Añadir espacio entre párrafos:** En `TeXiS\TeXiS_pream.tex`, buscar `\setlength{\parskip}{0.2ex}` y aumentar el valor (ej. a `1ex`). No usar `\\` al final de los párrafos.
- **Paquete lipsum:** Si ya no se usa `\lipsum`, se puede comentar o eliminar el paquete `lipsum` al final de `TeXiS\TeXiS_pream.tex`.
- **Manual completo:** `TeXiS-Manual-1.0.pdf` (incluido con la plantilla). Plantilla basada en TeXiS de Marco Antonio y Pedro Pablo Gómez Martín (http://gaia.fdi.ucm.es/research/texis/).

# NutriApp

Trabajo de Fin de Grado — Doble Grado en Ingeniería Informática y ADE, Universidad Complutense de Madrid.

NutriApp es una plataforma web para nutricionistas profesionales. El núcleo del proyecto es un copiloto de IA que traduce lo que pide cada nutricionista a restricciones formales, aplica el estilo clínico que el profesional declara como reglas y genera borradores de planes nutricionales personalizados para cada cliente; el profesional siempre revisa y firma antes de entregar. Alrededor del copiloto se mantiene un conjunto reducido de funciones de gestión (clientes, planes, alimentos, calendario, mensajería y ajustes).

La generación de planes combina recuperación del estilo del nutricionista, un solver de programación con restricciones (OR-Tools CP-SAT) y un modelo de lenguaje que traduce los requisitos en lenguaje natural a restricciones. Esa parte corre en el backend de Python.

## Estado

El sistema completo está implementado y desplegado: el panel del nutricionista (clientes, planes, alimentos, calendario, mensajería, ajustes y generación de planes con IA), el panel del cliente (plan firmado, marcas de comidas, peso, citas y mensajes), el motor CP-SAT con su validador y la API en Render, y el worker de generación que ejecuta el modelo de lenguaje en local. Todo sobre Supabase con aislamiento por usuario mediante RLS.

La aplicación pública está en:

**https://nutriapp-tfg.netlify.app**

La API del motor de generación está en https://tfg-nutriapp.onrender.com (comprobación de estado en `/health`).

Es un prototipo académico. Las credenciales del nutricionista de demostración se entregan por canal seguro a tutores y revisores; no están en el repositorio.

## Estructura del repositorio

```
frontend/         Aplicación Next.js 14 (paneles del nutricionista y del cliente). Ver frontend/README.md
backend/          Motor CP-SAT, validador, traductor LLM, worker y API en Python. Ver backend/README.md
MEMORIA/          Memoria del TFG (LaTeX, plantilla TFGTeXiS - UCM)
MOCK-UP V1/       Capturas del prototipo inicial en Figma
feedback-docs/    Documentos de trabajo: especificación y formalización del motor, experimentos con sus datos, guía de la prueba con nutricionistas
```

## Cómo correr en local

Cada parte tiene su propio README con los pasos:

- Frontend: ver [frontend/README.md](frontend/README.md).
- Backend: ver [backend/README.md](backend/README.md).

La base de datos es un proyecto de Supabase compartido por ambas partes. El frontend la lee con la clave pública bajo RLS; el backend usa la clave de servidor para el pipeline de IA.

## Autor

Víctor Martínez Blanco, Facultad de Informática, UCM

## Directores

- Alejandro Hernández Cerezo
- Pablo Gutiérrez Sánchez

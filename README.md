# NutriApp

Trabajo de Fin de Grado — Doble Grado en Ingeniería Informática y ADE, Universidad Complutense de Madrid.

NutriApp es una plataforma web para nutricionistas profesionales. El núcleo del proyecto es un copiloto de IA que aprende el estilo clínico de cada nutricionista a partir de sus planes históricos y genera borradores de planes nutricionales semanales personalizados para cada cliente; el profesional siempre revisa antes de entregar. Alrededor del copiloto se mantiene un conjunto reducido de funciones de gestión (clientes, planes, alimentos, calendario, mensajería y ajustes).

La generación de planes combina recuperación del estilo del nutricionista, un solver de programación con restricciones (OR-Tools CP-SAT) y un modelo de lenguaje que traduce los requisitos en lenguaje natural a restricciones. Esa parte corre en el backend de Python y aún está en desarrollo.

## Estado

El panel del nutricionista está implementado y desplegado: gestión de clientes, planes, alimentos, calendario, mensajería y ajustes, todo sobre Supabase con aislamiento por nutricionista mediante RLS. El backend de IA y el panel del cliente son trabajo en curso.

La aplicación pública (panel del nutricionista, sin la parte de IA) está en:

**https://nutriapp-tfg.netlify.app**

Es un prototipo académico. Las credenciales del nutricionista de demostración se entregan por canal seguro a tutores y revisores; no están en el repositorio.

## Estructura del repositorio

```
frontend/         Aplicación Next.js 14 (panel del nutricionista). Ver frontend/README.md
backend/          Capa de datos y backend de IA en Python. Ver backend/README.md
MEMORIA/          Memoria del TFG (LaTeX, plantilla TFGTeXiS - UCM)
MOCK-UP/          Mockups de la aplicación
```

## Cómo correr en local

Cada parte tiene su propio README con los pasos:

- Frontend: ver [frontend/README.md](frontend/README.md).
- Backend: ver [backend/README.md](backend/README.md).

La base de datos es un proyecto de Supabase compartido por ambas partes. El frontend la lee con la clave pública bajo RLS; el backend usa la clave de servidor para el pipeline de IA.

## Autor

Víctor — Facultad de Informática, UCM

## Tutores

- Alejandro Hernández Cerezo
- Pablo Gutiérrez Sánchez

# NutriApp: acceso al sistema y al material adicional

Trabajo de Fin de Grado. Desarrollo de una Plataforma Web Inteligente para Nutricionistas.
Autor: Víctor Martínez Blanco. Directores: Alejandro Hernández Cerezo y Pablo Gutiérrez Sánchez.
Doble Grado en Ingeniería Informática y ADE, Facultad de Informática, Universidad Complutense de Madrid. Septiembre de 2026.

## Sistema desplegado

- Aplicación web (frontend, Netlify): https://nutriapp-tfg.netlify.app
- API del motor de generación (backend, Render, Fráncfort): https://tfg-nutriapp.onrender.com (comprobación de estado en `/health`; el plan gratuito de Render tarda unos 20 segundos en despertar tras un rato sin uso).
- Base de datos: Supabase (PostgreSQL, Fráncfort). Solo accesible a través de la aplicación y de la API.

Las credenciales de las cuentas de prueba (un nutricionista y un cliente de demostración) se envían por canal aparte; no figuran en este documento ni en el código.

La generación con inteligencia artificial depende de un worker que ejecuta el modelo de lenguaje en local (Ollama) por la razón que explica la memoria: que los datos clínicos no salgan del sistema. Si el worker no está encendido en el momento de la prueba, la petición queda en cola y la interfaz lo indica ("Waiting for the generation worker to pick this up"); el resto de la aplicación funciona con normalidad.

## Código

- Repositorio privado en GitHub: https://github.com/VictorMartinezBlanco/TFG_NutriApp
- El fichero `TFG_NutriApp.zip` adjunto es una copia exacta del repositorio en el commit de la entrega (exportado con `git archive`, sin ficheros de entorno ni dependencias instaladas). Incluye la memoria en PDF en `MEMORIA/TFGTeXiS.pdf`.

Estructura del repositorio:

- `backend/`: motor de generación (OR-Tools CP-SAT), validador, traductor y comprobaciones previas con el modelo de lenguaje, API HTTP (FastAPI), worker de generación, migraciones SQL de la base de datos y bancos de prueba (`scripts/`).
- `frontend/`: aplicación web en Next.js 14 con los dos paneles (nutricionista y cliente).
- `MEMORIA/`: fuentes LaTeX de la memoria (plantilla TFGTeXiS) y el PDF compilado.
- `feedback-docs/`: documentos de trabajo del proyecto: especificación y formalización del motor, experimentos con sus datos crudos y figuras, guía de la prueba con nutricionistas y registro de puntos abiertos con los directores.
- `MOCK-UP V1/`: capturas del prototipo inicial en Figma.

## Cómo arrancar en local

Requisitos: Python 3.11 o superior (el despliegue usa 3.14), Node 20, un proyecto de Supabase con las migraciones de `backend/migrations/sql/` aplicadas en orden, y Ollama con el modelo `qwen2.5:7b-instruct` (y `qwen2.5:3b-instruct` para las comprobaciones previas) si se quiere usar la generación con IA.

1. Clonar el repositorio o descomprimir el zip.
2. Backend: en `backend/`, crear un entorno virtual, instalar `requirements.txt` y copiar `.env.example` a `.env.local` con la URL del pooler de Supabase y un token para la API.
3. Arrancar la API: `uvicorn app.api.main:app --reload --port 8000`.
4. Arrancar el worker de generación: `python -m app.worker.run` (o `--fake` para probar el flujo sin Ollama).
5. Frontend: en `frontend/`, `npm install`, copiar `.env.example` a `.env.local` con la URL y la clave pública de Supabase, la URL de la API (`http://localhost:8000`) y el mismo token.
6. `npm run dev` y abrir http://localhost:3000.

Los README de cada carpeta (`backend/README.md`, `frontend/README.md`) detallan las variables de entorno y los bancos de prueba.

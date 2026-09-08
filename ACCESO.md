# NutriApp: acceso al sistema

Trabajo de Fin de Grado. Desarrollo de una Plataforma Web Inteligente para Nutricionistas.
Autor: Víctor Martínez Blanco. Directores: Alejandro Hernández Cerezo y Pablo Gutiérrez Sánchez.
Doble Grado en Ingeniería Informática y Administración de Empresas, Facultad de Informática, Universidad Complutense de Madrid. Septiembre de 2026.

## Direcciones

- Aplicación web: https://nutriapp-tfg.netlify.app
- API del motor de generación: https://tfg-nutriapp.onrender.com, con comprobación de estado en https://tfg-nutriapp.onrender.com/health
- Repositorio privado: https://github.com/VictorMartinezBlanco/TFG_NutriApp
- Memoria en PDF dentro del material adjunto: `MEMORIA/TFGTeXiS.pdf`
- Prototipo navegable en Figma, público en solo lectura: https://www.figma.com/proto/NoxrgqUAFGwA4JQ2jgz9DR/NutriApp?node-id=567-2&page-id=546%3A2&starting-point-node-id=567%3A2&scaling=min-zoom&content-scaling=fixed
  Abre en el selector de versión, desde donde se recorren tanto la versión 1 como la 2. El fichero de diseño, con el lienzo y las capas, está en https://www.figma.com/design/NoxrgqUAFGwA4JQ2jgz9DR/NutriApp
- Capturas del prototipo, por si el enlace no estuviera disponible: las 25 pantallas de la versión 2 en `MOCK-UP V2/` y las 24 de la versión 1 en `MOCK-UP V1/`

## Cuentas de prueba

Nutricionista:

- usuario: `nutri.test@nutriapp.dev`
- contraseña: `NutriTest400a68757adb!`

Clienta (panel del cliente, Lucía Fernández):

- usuario: `lucia.client@nutriapp.dev`
- contraseña: `Lucia5b87feb1c9e31eca!`

Son cuentas de demostración de un prototipo académico, sin datos de personas reales. Para cambiar de una a otra hay que cerrar sesión y volver a entrar.

## Qué ver en diez minutos

1. Entrar con la cuenta de nutricionista. El panel abre en Dashboard, con el número de clientes, la adherencia media, las próximas citas y los planes pendientes de firma.
2. Clients, y abrir la ficha de María González. Ahí están su objetivo, sus restricciones escritas en lenguaje llano con la etiqueta Must o Prefer, su plan activo, su evolución de peso y su próxima cita.
3. Foods. Es el catálogo de alimentos con su buscador; Add food da de alta uno propio del nutricionista.
4. Plans, y dentro Generate. Elegir un cliente y escribir con palabras normales lo que necesita, por ejemplo "nada de lácteos, unas 2000 kcal al día y mucha verdura". El asistente traduce el mensaje a restricciones formales y las enseña para que el profesional las confirme, las corrija o añada más a mano.
5. Confirmar. La generación corre en segundo plano y la pantalla va informando del estado.
6. Cuando termina, revisar el borrador día a día y firmarlo con Sign plan. Hasta que no está firmado, el cliente no lo ve.
7. Settings, pestaña My clinical style. Son las reglas que el nutricionista declara una vez y se aplican a todos sus clientes.
8. Cerrar sesión y entrar con la cuenta de la clienta. My plan enseña el plan firmado, permite marcar las comidas hechas y anotar el peso; el nutricionista ve esas marcas al instante en la ficha.

## Avisos

**Arranque en frío de la API.** El alojamiento del backend es un plan gratuito que duerme el servicio tras un rato sin uso. La primera petición tarda entre 20 y 30 segundos en responder; las siguientes son inmediatas. Se puede despertar de antemano abriendo la dirección de `/health`.

**Generación de planes.** El modelo de lenguaje corre en un worker en mi ordenador, y no en la nube, para que los datos clínicos no salgan del sistema. Lo mantengo encendido durante el periodo de evaluación. Si en el momento de la prueba estuviera apagado o el equipo suspendido, la petición no se pierde: se queda en cola, la interfaz lo indica con el mensaje "Waiting for the generation worker to pick this up" y se procesa en cuanto el worker vuelve. Esto afecta igual a las dietas pedidas con el asistente y a las configuradas a mano, porque las dos pasan por la misma cola. El resto de la aplicación funciona siempre.

**Tiempo de generación.** Con el worker activo, generar una dieta semanal tarda uno o dos minutos: el traductor llama al modelo y después el motor de optimización busca la solución.

**Base de datos.** El proyecto de Supabase se pausa solo tras siete días sin actividad. Lo mantengo activo durante la evaluación; si aun así la aplicación diera un error de conexión, basta con avisarme y lo reactivo en un minuto.

**Idioma.** La interfaz está en inglés y la memoria en castellano, tal y como se explica en el capítulo 4.

## Cómo arrancar en local

Requisitos: Python 3.11 o superior, Node 20, un proyecto de Supabase con las migraciones de `backend/migrations/sql/` aplicadas en orden, y Ollama con los modelos `qwen2.5:7b-instruct` y `qwen2.5:3b-instruct` si se quiere probar la parte de inteligencia artificial.

1. Clonar el repositorio o descomprimir el zip.
2. En `backend/`, crear un entorno virtual, instalar `requirements.txt` y copiar `.env.example` a `.env.local` con la URL del pooler de Supabase y un token para la API.
3. Arrancar la API con `uvicorn app.api.main:app --reload --port 8000`.
4. Arrancar el worker con `python -m app.worker.run`, o con `--fake` para recorrer el flujo sin Ollama.
5. En `frontend/`, `npm install` y copiar `.env.example` a `.env.local` con la URL y la clave pública de Supabase, la dirección de la API y el mismo token.
6. `npm run dev` y abrir http://localhost:3000.

Los README de `backend/` y `frontend/` detallan las variables de entorno y cómo lanzar los bancos de prueba.

## Estructura del repositorio

- `frontend/`: aplicación Next.js 14 con los dos paneles, el del nutricionista y el del cliente.
- `backend/`: motor de generación con OR-Tools CP-SAT, validador, traductor y comprobaciones previas con el modelo de lenguaje, API en FastAPI, worker, migraciones SQL y bancos de prueba.
- `MEMORIA/`: fuentes LaTeX de la memoria y el PDF compilado.
- `feedback-docs/`: documentos de trabajo, con la especificación y la formalización del motor, los experimentos con sus datos crudos, la guía de la prueba con nutricionistas y el histórico del diseño de la base de datos.
- `MOCK-UP V1/` y `MOCK-UP V2/`: capturas del prototipo de Figma antes y después del giro hacia el copiloto.

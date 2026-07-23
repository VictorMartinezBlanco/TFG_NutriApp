-- Cola de generacion de planes. Una tabla que hace de tablon de tareas entre el
-- frontend/API (que encolan) y el worker local (que consume). Nadie llama al
-- worker directamente: la BD es el punto de encuentro.
--
-- kind decide que hace el worker con la tarea y donde deja el resultado:
--   'translate' -> solo traduce el texto libre (Ollama) y devuelve las
--                  constraints propuestas en result; NO genera plan. Alimenta el
--                  modal permanent/temporary.
--   'generate'  -> pipeline completo (traduce si hace falta, solver, validador,
--                  persiste el borrador) y deja plan_id.
--
-- status recorre queued -> in_progress -> done | failed. status/kind como TEXT
-- con CHECK, no enums nuevos, coherente con 0007. Sin enum -> una sola
-- transaccion (a diferencia de 0009).
--
-- El worker corre en la maquina donde vive Ollama y escribe con el rol de
-- confianza (bypassa RLS). El frontend lee la cola bajo RLS con la clave publica.
--
-- Idempotente: CREATE ... IF NOT EXISTS, DROP POLICY IF EXISTS antes de CREATE.
-- Aplicar: python _apply_0011.py (con la secret key), o pegar en el SQL Editor
-- de Supabase.

CREATE TABLE IF NOT EXISTS generation_task (
  id              SERIAL PRIMARY KEY,
  nutritionist_id UUID    NOT NULL REFERENCES nutritionist(id) ON DELETE CASCADE,
  client_id       INTEGER NOT NULL REFERENCES client(id)       ON DELETE CASCADE,
  kind            TEXT NOT NULL DEFAULT 'generate'
                    CHECK (kind IN ('translate', 'generate')),
  -- texto libre del nutri, cuando lo hubo. NULL si solo trae constraints.
  input_text      TEXT,
  -- constraints que viajan con la tarea (las temporary del modal), en la forma
  -- serializable de ConstraintIn. Vacio para una tarea 'translate'.
  constraints     JSONB NOT NULL DEFAULT '[]'::jsonb,
  duration_days   INTEGER NOT NULL DEFAULT 7 CHECK (duration_days BETWEEN 1 AND 90),
  meals_per_day   INTEGER NOT NULL DEFAULT 5 CHECK (meals_per_day BETWEEN 1 AND 6),
  status          TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'in_progress', 'done', 'failed')),
  -- resultado, segun kind y status:
  --   generate + done  -> plan_id
  --   translate + done -> result (constraints propuestas + rejected)
  --   failed           -> error legible (motivo o infactibilidad)
  plan_id         INTEGER REFERENCES plan(id) ON DELETE SET NULL,
  result          JSONB,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ
);

-- El worker coge la mas antigua en cola; el indice parcial hace ese SELECT barato.
CREATE INDEX IF NOT EXISTS idx_generation_task_queued
  ON generation_task(created_at) WHERE status = 'queued';
-- Listado del subapartado "In progress" del nutri.
CREATE INDEX IF NOT EXISTS idx_generation_task_nutri
  ON generation_task(nutritionist_id, created_at);

-- ===== Row Level Security =====
-- Cada nutri solo ve sus tareas, mismo patron que client/plan. El worker usa el
-- rol de confianza y no pasa por aqui.
ALTER TABLE generation_task ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_generation_task_owner ON generation_task;
CREATE POLICY p_generation_task_owner ON generation_task
  FOR ALL TO authenticated
  USING (nutritionist_id = auth.uid())
  WITH CHECK (nutritionist_id = auth.uid());

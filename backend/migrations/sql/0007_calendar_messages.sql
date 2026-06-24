-- Calendario, disponibilidad y mensajeria del nutri (Bloque 5d).
-- Tres tablas nuevas + sus policies. Idempotente: CREATE ... IF NOT EXISTS y
-- DROP POLICY IF EXISTS antes de cada CREATE POLICY, asi se puede reaplicar.
--
-- En v0 solo accede el nutri. La cara cliente de message (que el cliente vea y
-- escriba sus mensajes) se anade en el Bloque 8, cuando exista panel cliente.
--
-- day_of_week usa 0=lunes .. 6=domingo (no el DOW de Postgres, que es 0=domingo),
-- para alinear con el orden de la UI.

-- ===== Citas =====
CREATE TABLE IF NOT EXISTS appointment (
  id              SERIAL PRIMARY KEY,
  nutritionist_id UUID    NOT NULL REFERENCES nutritionist(id) ON DELETE CASCADE,
  client_id       INTEGER NOT NULL REFERENCES client(id)       ON DELETE CASCADE,
  scheduled_at    TIMESTAMPTZ NOT NULL,
  duration_min    INTEGER NOT NULL DEFAULT 60 CHECK (duration_min > 0),
  status          TEXT NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_appointment_nutri_when
  ON appointment(nutritionist_id, scheduled_at) WHERE deleted_at IS NULL;

-- ===== Disponibilidad semanal =====
-- Sin soft-delete: el editor de Settings hace set-replace (borra todo y reinserta).
CREATE TABLE IF NOT EXISTS availability (
  id              SERIAL PRIMARY KEY,
  nutritionist_id UUID NOT NULL REFERENCES nutritionist(id) ON DELETE CASCADE,
  day_of_week     SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_availability_range CHECK (start_time < end_time)
);
CREATE INDEX IF NOT EXISTS idx_availability_nutri_dow
  ON availability(nutritionist_id, day_of_week);

-- ===== Mensajes =====
-- Sin updated_at: los mensajes no se editan en v0.
CREATE TABLE IF NOT EXISTS message (
  id              SERIAL PRIMARY KEY,
  nutritionist_id UUID    NOT NULL REFERENCES nutritionist(id) ON DELETE CASCADE,
  client_id       INTEGER NOT NULL REFERENCES client(id)       ON DELETE CASCADE,
  sender          TEXT NOT NULL CHECK (sender IN ('nutritionist', 'client')),
  body            TEXT NOT NULL,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_message_thread
  ON message(nutritionist_id, client_id, created_at) WHERE deleted_at IS NULL;
-- Indice parcial para contar no leidos rapido.
CREATE INDEX IF NOT EXISTS idx_message_unread
  ON message(client_id, read_at) WHERE read_at IS NULL AND deleted_at IS NULL;

-- ===== updated_at automatico (reusa la funcion de 0001) =====
DROP TRIGGER IF EXISTS trg_appointment_updated ON appointment;
CREATE TRIGGER trg_appointment_updated BEFORE UPDATE ON appointment
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_availability_updated ON availability;
CREATE TRIGGER trg_availability_updated BEFORE UPDATE ON availability
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===== Row Level Security =====
-- Cada nutri solo ve lo suyo, mismo patron que client/plan.
ALTER TABLE appointment  ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE message      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_appointment_owner ON appointment;
CREATE POLICY p_appointment_owner ON appointment
  FOR ALL TO authenticated
  USING (nutritionist_id = auth.uid())
  WITH CHECK (nutritionist_id = auth.uid());

DROP POLICY IF EXISTS p_availability_owner ON availability;
CREATE POLICY p_availability_owner ON availability
  FOR ALL TO authenticated
  USING (nutritionist_id = auth.uid())
  WITH CHECK (nutritionist_id = auth.uid());

-- Solo la cara del nutri. El cliente accede en el Bloque 8.
DROP POLICY IF EXISTS p_message_owner_nutri ON message;
CREATE POLICY p_message_owner_nutri ON message
  FOR ALL TO authenticated
  USING (nutritionist_id = auth.uid())
  WITH CHECK (nutritionist_id = auth.uid());

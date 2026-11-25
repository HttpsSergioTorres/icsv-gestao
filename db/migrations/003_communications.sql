CREATE TABLE icsv_notices (
  id uuid PRIMARY KEY,
  congregation_id uuid NOT NULL REFERENCES icsv_records(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES icsv_records(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1500),
  audience text NOT NULL CHECK (audience IN ('todos', 'geral', 'kids')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX icsv_notices_congregation ON icsv_notices (congregation_id, created_at DESC);

CREATE TABLE icsv_prayer_requests (
  id uuid PRIMARY KEY,
  congregation_id uuid NOT NULL REFERENCES icsv_records(id) ON DELETE RESTRICT,
  author_id uuid NOT NULL REFERENCES icsv_records(id) ON DELETE RESTRICT,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1200),
  anonymous boolean NOT NULL,
  audience text NOT NULL CHECK (audience IN ('geral', 'kids')),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),
  created_at timestamptz NOT NULL DEFAULT now(),
  moderated_by uuid REFERENCES icsv_records(id) ON DELETE RESTRICT,
  moderated_at timestamptz,
  CHECK (
    (status = 'pendente' AND moderated_by IS NULL AND moderated_at IS NULL)
    OR (status <> 'pendente' AND moderated_by IS NOT NULL AND moderated_at IS NOT NULL)
  )
);

CREATE INDEX icsv_prayer_requests_feed ON icsv_prayer_requests (congregation_id, audience, status, created_at DESC);
CREATE INDEX icsv_prayer_requests_author ON icsv_prayer_requests (congregation_id, author_id, created_at DESC);

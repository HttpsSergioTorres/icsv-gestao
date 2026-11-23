CREATE TABLE icsv_records (
  id uuid PRIMARY KEY,
  resource text NOT NULL,
  congregation_id uuid REFERENCES icsv_records(id) ON DELETE RESTRICT,
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (id, resource)
);

CREATE INDEX icsv_records_list ON icsv_records (resource, congregation_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX icsv_users_email ON icsv_records (lower(data->>'email'))
  WHERE resource = 'usuarios' AND deleted_at IS NULL;

CREATE UNIQUE INDEX icsv_registration_person ON icsv_records ((data->>'eventoId'), (data->>'pessoaId'))
  WHERE resource = 'inscricoes' AND deleted_at IS NULL;

CREATE UNIQUE INDEX icsv_team_person ON icsv_records ((data->>'ministerioId'), (data->>'pessoaId'))
  WHERE resource = 'equipes' AND deleted_at IS NULL;

CREATE TABLE icsv_record_links (
  source_id uuid NOT NULL REFERENCES icsv_records(id) ON DELETE CASCADE,
  field text NOT NULL,
  target_id uuid NOT NULL,
  target_resource text NOT NULL,
  PRIMARY KEY (source_id, field),
  FOREIGN KEY (target_id, target_resource) REFERENCES icsv_records(id, resource) ON DELETE RESTRICT
);

CREATE INDEX icsv_record_links_target ON icsv_record_links (target_id);

CREATE TABLE icsv_credentials (
  user_id uuid PRIMARY KEY REFERENCES icsv_records(id) ON DELETE CASCADE,
  password_hash text NOT NULL
);

CREATE TABLE icsv_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES icsv_credentials(user_id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE INDEX icsv_sessions_user ON icsv_sessions (user_id);

CREATE TABLE icsv_recovery (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES icsv_credentials(user_id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE icsv_login_attempts (
  email_hash text PRIMARY KEY,
  attempts integer NOT NULL,
  window_start timestamptz NOT NULL
);

CREATE TABLE icsv_record_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  resource text NOT NULL,
  record_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_fields text[] NOT NULL
);

CREATE INDEX icsv_record_history_lookup ON icsv_record_history (resource, record_id, changed_at DESC);

CREATE TABLE icsv_kids_invites (
  id uuid PRIMARY KEY,
  congregation_id uuid NOT NULL REFERENCES icsv_records(id),
  child_id uuid NOT NULL REFERENCES icsv_records(id),
  created_by uuid NOT NULL REFERENCES icsv_records(id),
  code_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE TABLE icsv_kids_links (
  id uuid PRIMARY KEY,
  congregation_id uuid NOT NULL REFERENCES icsv_records(id),
  child_id uuid NOT NULL REFERENCES icsv_records(id),
  guardian_id uuid NOT NULL REFERENCES icsv_records(id),
  invite_id uuid REFERENCES icsv_kids_invites(id),
  status text NOT NULL CHECK (status IN ('pendente', 'confirmado', 'rejeitado', 'revogado')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES icsv_records(id)
);

CREATE UNIQUE INDEX icsv_kids_current_link
  ON icsv_kids_links (congregation_id, child_id, guardian_id)
  WHERE status IN ('pendente', 'confirmado');

CREATE INDEX icsv_kids_guardian_links ON icsv_kids_links (guardian_id, congregation_id);
CREATE INDEX icsv_kids_review_queue ON icsv_kids_links (congregation_id, requested_at DESC);

CREATE TABLE icsv_kids_acceptances (
  link_id uuid NOT NULL REFERENCES icsv_kids_links(id),
  term_version text NOT NULL,
  term_hash text NOT NULL,
  guardian_id uuid NOT NULL REFERENCES icsv_records(id),
  guardian_name text NOT NULL,
  guardian_email text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  demo boolean NOT NULL,
  PRIMARY KEY (link_id, term_version, term_hash)
);

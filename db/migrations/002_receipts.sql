CREATE TABLE icsv_receipts (
  id uuid PRIMARY KEY,
  congregation_id uuid NOT NULL REFERENCES icsv_records(id) ON DELETE RESTRICT,
  name text NOT NULL,
  mime text NOT NULL CHECK (mime IN ('application/pdf', 'image/jpeg', 'image/png')),
  contents bytea NOT NULL CHECK (octet_length(contents) BETWEEN 1 AND 5242880),
  created_at timestamptz NOT NULL DEFAULT now()
);

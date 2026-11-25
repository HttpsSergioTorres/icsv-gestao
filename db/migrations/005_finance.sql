CREATE TABLE icsv_finance_accounts (
  id uuid PRIMARY KEY,
  congregation_id uuid NOT NULL REFERENCES icsv_records(id) ON DELETE RESTRICT,
  name text NOT NULL,
  reference text NOT NULL,
  opening_cents bigint NOT NULL,
  UNIQUE (id, congregation_id)
);

CREATE UNIQUE INDEX icsv_finance_account_reference
  ON icsv_finance_accounts (congregation_id, lower(reference));

CREATE TABLE icsv_finance_allocations (
  movement_id uuid PRIMARY KEY REFERENCES icsv_records(id) ON DELETE CASCADE,
  congregation_id uuid NOT NULL REFERENCES icsv_records(id) ON DELETE RESTRICT,
  segment text CHECK (segment IN ('caeb', 'missoes', 'campo')),
  bank_account_id uuid,
  updated_by uuid NOT NULL REFERENCES icsv_records(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (bank_account_id, congregation_id) REFERENCES icsv_finance_accounts(id, congregation_id) ON DELETE RESTRICT
);

CREATE INDEX icsv_finance_allocation_scope ON icsv_finance_allocations (congregation_id);

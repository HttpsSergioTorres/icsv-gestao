CREATE TABLE icsv_managed_accounts (
  user_id uuid PRIMARY KEY REFERENCES icsv_records(id) ON DELETE CASCADE,
  external_guardian boolean NOT NULL DEFAULT false
);

CREATE TABLE icsv_access_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES icsv_managed_accounts(user_id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES icsv_records(id) ON DELETE RESTRICT,
  congregation_id uuid REFERENCES icsv_records(id) ON DELETE RESTRICT,
  UNIQUE NULLS NOT DISTINCT (user_id, profile_id, congregation_id)
);

CREATE VIEW icsv_account_access AS
SELECT id, user_id, profile_id, congregation_id FROM icsv_access_assignments
UNION ALL
SELECT u.id, u.id, (u.data->>'perfilId')::uuid, u.congregation_id
FROM icsv_records u
WHERE u.resource = 'usuarios'
  AND NOT EXISTS (SELECT 1 FROM icsv_managed_accounts a WHERE a.user_id = u.id);

ALTER TABLE icsv_sessions ADD COLUMN assignment_id uuid;

UPDATE icsv_records SET data = jsonb_set(data, '{nome}', '"ICSV San Vale"')
WHERE id = '10000000-0000-4000-8000-000000000100' AND resource = 'congregacoes'
  AND data->>'nome' = 'Sede Campo San Vale';

INSERT INTO icsv_records (id, resource, data)
SELECT '10000000-0000-4000-8000-000000000100', 'congregacoes', '{"nome":"ICSV San Vale","ativo":true}'
WHERE NOT EXISTS (
  SELECT 1 FROM icsv_records WHERE resource = 'congregacoes'
    AND deleted_at IS NULL AND lower(data->>'nome') = 'icsv san vale'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO icsv_records (id, resource, data) VALUES
  ('10000000-0000-4000-8000-000000000010', 'perfis', '{"nome":"Usuário comum","escopo":"congregacao","ativo":true,"permissoes":["communications:use","finance:report"]}'),
  ('10000000-0000-4000-8000-000000000011', 'perfis', '{"nome":"Responsável Kids","escopo":"congregacao","ativo":true,"permissoes":["kids:guardian"]}'),
  ('10000000-0000-4000-8000-000000000012', 'perfis', '{"nome":"Kids","escopo":"congregacao","ativo":true,"permissoes":["kids:play","communications:use"]}'),
  ('10000000-0000-4000-8000-000000000013', 'perfis', '{"nome":"Tutorial do Sistema","escopo":"congregacao","ativo":true,"permissoes":["tutorial:read","communications:use"]}'),
  ('10000000-0000-4000-8000-000000000014', 'perfis', '{"nome":"Moderação","escopo":"congregacao","ativo":true,"permissoes":["communications:use","communications:post","communications:moderate"]}'),
  ('10000000-0000-4000-8000-000000000015', 'perfis', '{"nome":"Administração de usuários","escopo":"congregacao","ativo":true,"permissoes":["congregacoes:read","pessoas:read","usuarios:read","usuarios:write","perfis:read","communications:use"]}')
ON CONFLICT (id) DO NOTHING;

UPDATE icsv_records p SET data = jsonb_set(data, '{permissoes}', (
  SELECT jsonb_agg(DISTINCT grant_name)
  FROM jsonb_array_elements_text(coalesce(p.data->'permissoes', '[]'::jsonb) || extra.grants) AS grant_name
))
FROM (VALUES
  ('10000000-0000-4000-8000-000000000001'::uuid, '["finance:manage","finance:report","kids:manage","communications:use","communications:post","communications:moderate","training:manage","tutorial:read"]'::jsonb),
  ('10000000-0000-4000-8000-000000000002'::uuid, '["communications:use","finance:report"]'::jsonb),
  ('10000000-0000-4000-8000-000000000006'::uuid, '["finance:manage","finance:report","communications:use"]'::jsonb),
  ('10000000-0000-4000-8000-000000000007'::uuid, '["training:learn","finance:report","communications:use"]'::jsonb)
) AS extra(id, grants)
WHERE p.id = extra.id AND p.resource = 'perfis';

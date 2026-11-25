import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { specialProfiles } from '../src/lib/domain/access.ts';
import { demoKidsTerm } from '../src/lib/domain/kids-demo-term.ts';

export async function seedKids(client, { id, congregationId, adminId, ordinaryUserId }) {
  const children = [
    { id: id(1140), nome: 'Lia Nuvem (fictícia)', nascimento: '2019-05-15' },
    { id: id(1141), nome: 'Miguel Lago (fictício)', nascimento: '2020-08-21' },
  ];
  for (const child of children) {
    await client.query(`
      INSERT INTO icsv_records (id, resource, congregation_id, data)
      VALUES ($1, 'pessoas', $2, $3) ON CONFLICT (id) DO NOTHING
    `, [child.id, congregationId, {
      nome: child.nome, nascimento: child.nascimento, tipo: 'visitante',
      congregacaoId: congregationId, ativo: true,
      autorizacaoResponsavel: false, autorizacaoImagem: false,
    }]);
    await client.query(`
      INSERT INTO icsv_record_links (source_id, field, target_id, target_resource)
      VALUES ($1, 'congregacaoId', $2, 'congregacoes') ON CONFLICT DO NOTHING
    `, [child.id, congregationId]);
  }

  const external = {
    id: id(1142),
    nome: 'Daniel Lago (responsável fictício)',
    email: 'responsavel@icsv.example',
  };
  await client.query(`
    INSERT INTO icsv_records (id, resource, congregation_id, data)
    VALUES ($1, 'usuarios', $2, $3) ON CONFLICT (id) DO NOTHING
  `, [external.id, congregationId, {
    nome: external.nome, email: external.email, ativo: true,
    congregacaoId: congregationId, perfilId: specialProfiles.guardian,
  }]);
  await client.query(`
    INSERT INTO icsv_record_links (source_id, field, target_id, target_resource)
    VALUES ($1, 'perfilId', $2, 'perfis'), ($1, 'congregacaoId', $3, 'congregacoes')
    ON CONFLICT DO NOTHING
  `, [external.id, specialProfiles.guardian, congregationId]);
  const salt = randomBytes(16).toString('hex');
  const passwordHash = `${salt}:${scryptSync('ICSV-demo-2026!', salt, 64).toString('hex')}`;
  await client.query(`
    INSERT INTO icsv_credentials (user_id, password_hash)
    VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING
  `, [external.id, passwordHash]);
  await client.query(`
    INSERT INTO icsv_managed_accounts (user_id, external_guardian)
    VALUES ($1, true) ON CONFLICT DO NOTHING
  `, [external.id]);
  await client.query(`
    INSERT INTO icsv_access_assignments (user_id, profile_id, congregation_id)
    VALUES ($1, $2, $3), ($1, $4, $3), ($5, $4, $3) ON CONFLICT DO NOTHING
  `, [external.id, specialProfiles.guardian, congregationId, specialProfiles.kids, ordinaryUserId]);

  const demoHash = createHash('sha256').update(demoKidsTerm.text).digest('hex');
  for (const [index, guardianId] of [ordinaryUserId, external.id].entries()) {
    const linkId = id(1143 + index);
    await client.query(`
      INSERT INTO icsv_kids_links (id, congregation_id, child_id, guardian_id, status, reviewed_at, reviewed_by)
      VALUES ($1, $2, $3, $4, 'confirmado', now(), $5) ON CONFLICT DO NOTHING
    `, [linkId, congregationId, children[index].id, guardianId, adminId]);
    await client.query(`
      INSERT INTO icsv_kids_acceptances (link_id, term_version, term_hash, guardian_id, guardian_name, guardian_email, demo)
      SELECT $1, $2, $3, u.id, u.data->>'nome', u.data->>'email', true
      FROM icsv_records u JOIN icsv_kids_links l ON l.id = $1 AND l.guardian_id = u.id
      WHERE u.id = $4 AND u.resource = 'usuarios'
      ON CONFLICT DO NOTHING
    `, [linkId, demoKidsTerm.version, demoHash, guardianId]);
  }
}

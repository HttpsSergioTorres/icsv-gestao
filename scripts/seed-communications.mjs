export async function seedCommunications(client, fixtures) {
  const { id, congregationId, adminId, volunteerUserId, ordinaryUserId } = fixtures;
  const notices = [
    [1600, 'Encontro da comunidade', 'No próximo encontro, vamos receber as famílias e apresentar as equipes de voluntariado.', 'todos'],
    [1601, 'Organização das equipes', 'As lideranças podem consultar a agenda e confirmar as próximas escalas na plataforma.', 'geral'],
    [1602, 'Tempo de descobrir', 'Visite o espaço Kids para conhecer histórias da Bíblia e jogar o quiz.', 'kids'],
  ];

  for (const [fixture, title, body, audience] of notices) {
    await client.query(`
      INSERT INTO icsv_notices (id, congregation_id, created_by, title, body, audience)
      VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING
    `, [id(fixture), congregationId, adminId, title, body, audience]);
  }

  const prayers = [
    [1603, ordinaryUserId, 'Pelas famílias que estão se adaptando a uma nova cidade.', true, 'geral', 'aprovado'],
    [1604, volunteerUserId, 'Pela sabedoria dos voluntários que vão acolher as famílias no próximo encontro.', false, 'geral', 'pendente'],
    [1605, ordinaryUserId, 'Pelo cuidado da comunidade nas próximas semanas.', false, 'geral', 'rejeitado'],
    [1606, ordinaryUserId, 'Pelas crianças que estão começando em uma nova escola.', true, 'kids', 'aprovado'],
  ];

  for (const [fixture, author, body, anonymous, audience, status] of prayers) {
    const moderator = status === 'pendente' ? null : adminId;
    await client.query(`
      INSERT INTO icsv_prayer_requests (
        id, congregation_id, author_id, body, anonymous, audience, status, moderated_by, moderated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
        CASE WHEN $8::uuid IS NULL THEN NULL ELSE now() END
      ) ON CONFLICT (id) DO NOTHING
    `, [id(fixture), congregationId, author, body, anonymous, audience, status, moderator]);
  }
}

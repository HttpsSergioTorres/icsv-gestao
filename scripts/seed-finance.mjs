export async function seedFinance(client, { congregationId, adminId, id }) {
  const accounts = [
    [910, 'Conta administrativa simulada', 'FIC-ADMIN-001', 60_000],
    [911, 'Conta missões simulada', 'FIC-MISSAO-002', 10_000],
  ];
  for (const [suffix, name, reference, openingCents] of accounts) {
    await client.query(`
      INSERT INTO icsv_finance_accounts (id, congregation_id, name, reference, opening_cents)
      VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING
    `, [id(suffix), congregationId, name, reference, openingCents]);
  }

  async function insert(suffix, resource, data, references = {}) {
    const recordId = id(suffix);
    const payload = { ...data, congregacaoId: congregationId };
    const { rowCount } = await client.query(`
      INSERT INTO icsv_records (id, resource, congregation_id, data)
      VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING
    `, [recordId, resource, congregationId, payload]);
    if (!rowCount) return;

    for (const [field, target] of Object.entries({ ...references, congregacaoId: 'congregacoes' })) {
      await client.query(`
        INSERT INTO icsv_record_links (source_id, field, target_id, target_resource)
        VALUES ($1, $2, $3, $4)
      `, [recordId, field, payload[field], target]);
    }
  }

  await insert(912, 'categorias', { nome: 'Receitas comunitárias de demonstração', tipo: 'receita', ativo: true });
  await insert(913, 'categorias', { nome: 'Ações comunitárias de demonstração', tipo: 'despesa', ativo: true });
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

  const movements = [
    [920, 'Contribuição beneficente de demonstração', 'receita', 480, 'caeb', 910],
    [921, 'Cestas de apoio de demonstração', 'despesa', 130, 'caeb', 910],
    [922, 'Contribuição para missões de demonstração', 'receita', 350, 'missoes', 911],
    [923, 'Deslocamento missionário de demonstração', 'despesa', 90, 'missoes', 911],
    [924, 'Contribuição administrativa de demonstração', 'receita', 560, 'campo', 910],
    [925, 'Materiais administrativos de demonstração', 'despesa', 200, 'campo', 910],
  ];

  const allocations = [[701, null, 910]];
  for (const [suffix, descricao, tipo, valor, segment, account] of movements) {
    await insert(suffix, 'movimentacoes', {
      descricao, tipo, valor, data: date, categoriaId: id(tipo === 'receita' ? 912 : 913),
      ...(tipo === 'despesa' ? { comprovante: `Recibo fictício DEMO-${suffix}` } : {}),
    }, { categoriaId: 'categorias' });
    allocations.push([suffix, segment, account]);
  }

  for (const [movement, segment, account] of allocations) {
    await client.query(`
      INSERT INTO icsv_finance_allocations (movement_id, congregation_id, segment, bank_account_id, updated_by)
      SELECT movement.id, movement.congregation_id, $3, account.id, $5
      FROM icsv_records movement JOIN icsv_finance_accounts account
        ON account.id = $4 AND account.congregation_id = movement.congregation_id
      WHERE movement.id = $1 AND movement.congregation_id = $2
        AND movement.resource = 'movimentacoes' AND movement.deleted_at IS NULL
      ON CONFLICT (movement_id) DO NOTHING
    `, [id(movement), congregationId, segment, id(account), adminId]);
  }
}

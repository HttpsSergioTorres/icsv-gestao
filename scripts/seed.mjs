import { randomBytes, scryptSync } from 'node:crypto';
import { withDatabase } from './db.mjs';
import { seedCommunications } from './seed-communications.mjs';
import { seedFinance } from './seed-finance.mjs';
import { seedKids } from './seed-kids.mjs';
import { seedTraining } from './seed-training.mjs';

if (process.env.NODE_ENV === 'production') throw new Error('O seed fictício é exclusivo para desenvolvimento.');
const connection = new URL(process.env.DATABASE_URL ?? 'postgresql://localhost');
if (!['localhost', '127.0.0.1', '[::1]'].includes(connection.hostname) ||
    connection.searchParams.has('host') || connection.searchParams.has('hostaddr')) {
  throw new Error('Execute o seed fictício apenas com um banco de desenvolvimento em loopback.');
}

const demoPassword = 'ICSV-demo-2026!';
const id = (suffix) => `10000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const congregation = id(100);
const person = id(200);
const volunteer = id(201);
const ministry = id(300);
const event = id(500);
const service = id(600);
const category = id(700);
const project = id(800);

const resources = [
  'congregacoes', 'pessoas', 'ministerios', 'equipes', 'eventos', 'inscricoes',
  'servicos', 'escalas', 'categorias', 'movimentacoes', 'projetos', 'tarefas', 'perfis', 'usuarios',
];

const reading = (names) => names.map((name) => `${name}:read`);
const managing = (names) => names.flatMap((name) => [`${name}:read`, `${name}:write`]);

const profiles = [
  [1, 'Administrador geral do campo', 'campo', ['dashboard:read', 'reports:read', ...managing(resources)]],
  [2, 'Secretaria', 'congregacao', [
    'dashboard:read', 'reports:read', ...reading(['congregacoes', 'servicos', 'escalas']),
    ...managing(['pessoas', 'ministerios', 'equipes', 'eventos', 'inscricoes']),
  ]],
  [3, 'Administrador de congregação', 'congregacao', [
    'dashboard:read', 'reports:read', 'perfis:read', ...managing(resources.filter((resource) => resource !== 'perfis')),
  ]],
  [4, 'Pastor ou liderança', 'congregacao', [
    'dashboard:read', 'reports:read', ...reading(['congregacoes', 'pessoas', 'equipes', 'servicos', 'escalas']),
    ...managing(['ministerios', 'eventos', 'inscricoes', 'projetos', 'tarefas']),
  ]],
  [5, 'Líder de ministério', 'congregacao', [
    'dashboard:read', ...reading(['congregacoes', 'pessoas', 'ministerios', 'eventos']),
    ...managing(['equipes', 'servicos', 'escalas', 'projetos', 'tarefas']),
  ]],
  [6, 'Financeiro', 'congregacao', [
    'dashboard:read', 'reports:read', ...reading(['congregacoes', 'eventos']),
    ...managing(['categorias', 'movimentacoes']),
  ]],
  [7, 'Voluntário', 'congregacao', [
    'dashboard:read', ...reading(['congregacoes', 'ministerios', 'eventos', 'servicos', 'escalas']),
  ]],
];

const seedDate = () => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};
const date = seedDate();

async function insert(client, recordId, resource, payload, links = {}) {
  const { rowCount } = await client.query(`
    INSERT INTO icsv_records (id, resource, congregation_id, data)
    VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING
  `, [recordId, resource, payload.congregacaoId ?? null, payload]);
  if (!rowCount) return;

  if (payload.congregacaoId) links.congregacaoId = 'congregacoes';
  for (const [field, target] of Object.entries(links)) {
    await client.query(`
      INSERT INTO icsv_record_links (source_id, field, target_id, target_resource)
      VALUES ($1, $2, $3, $4)
    `, [recordId, field, payload[field], target]);
  }
}

async function makeAccount(client, recordId, nome, email, perfilId, congregacaoId, pessoaId) {
  const links = { perfilId: 'perfis', ...(pessoaId ? { pessoaId: 'pessoas' } : {}) };
  await insert(client, recordId, 'usuarios', { nome, email, perfilId, congregacaoId, ativo: true, ...(pessoaId ? { pessoaId } : {}) }, links);
  const salt = randomBytes(16).toString('hex');
  const passwordHash = `${salt}:${scryptSync(demoPassword, salt, 64).toString('hex')}`;
  await client.query(`
    INSERT INTO icsv_credentials (user_id, password_hash) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING
  `, [recordId, passwordHash]);
}

await withDatabase(async (client) => {
  await client.query('BEGIN');
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('icsv_record_mutations'))");
    const grantByProfile = {
      1: ['finance:manage', 'kids:manage', 'communications:post', 'communications:moderate', 'training:manage', 'tutorial:read'],
      6: ['finance:manage'],
      7: ['training:learn'],
    };
    for (const [index, nome, escopo, baseline] of profiles) {
      const permissoes = [...new Set([...baseline, 'communications:use', 'finance:report', ...(grantByProfile[index] ?? [])])];
      await insert(client, id(index), 'perfis', { nome, escopo, permissoes, ativo: true });
    }
    await insert(client, congregation, 'congregacoes', { nome: 'ICSV San Vale', ativo: true });
    await makeAccount(client, id(21), 'Administração fictícia', 'admin@icsv.example', id(1), null);
    await makeAccount(client, id(22), 'Secretaria fictícia', 'secretaria@icsv.example', id(2), congregation);

    const personDefaults = { ativo: true, autorizacaoResponsavel: false, autorizacaoImagem: false };
    await insert(client, person, 'pessoas', {
      ...personDefaults, nome: 'Membro Demonstração', tipo: 'membro', congregacaoId: congregation,
    });
    await insert(client, volunteer, 'pessoas', {
      ...personDefaults, nome: 'Voluntária Demonstração', tipo: 'voluntario', congregacaoId: congregation,
    });
    await insert(client, id(202), 'pessoas', {
      ...personDefaults, nome: 'Visitante Demonstração', tipo: 'visitante', congregacaoId: congregation,
    });
    await insert(client, ministry, 'ministerios', {
      nome: 'Recepção — demonstração', tipo: 'ministerio', congregacaoId: congregation, liderId: person, ativo: true,
    }, { liderId: 'pessoas' });
    await insert(client, id(301), 'equipes', {
      congregacaoId: congregation, ministerioId: ministry, pessoaId: volunteer, funcao: 'Acolhimento', ativo: true,
    }, { ministerioId: 'ministerios', pessoaId: 'pessoas' });

    await insert(client, event, 'eventos', {
      titulo: 'Encontro de demonstração', tipo: 'evento', congregacaoId: congregation, ministerioId: ministry,
      inicio: `${date}T19:00:00-03:00`, fim: `${date}T21:00:00-03:00`,
      local: 'Espaço fictício', status: 'agendado', recorrencia: 'nenhuma',
    }, { ministerioId: 'ministerios' });
    await insert(client, id(501), 'inscricoes', {
      congregacaoId: congregation, eventoId: event, pessoaId: person, status: 'confirmado',
    }, { eventoId: 'eventos', pessoaId: 'pessoas' });
    await insert(client, service, 'servicos', {
      nome: 'Acolhimento', congregacaoId: congregation, ministerioId: ministry, ativo: true,
    }, { ministerioId: 'ministerios' });
    await insert(client, id(601), 'escalas', {
      congregacaoId: congregation, eventoId: event, ministerioId: ministry, servicoId: service,
      pessoaId: volunteer, status: 'confirmada',
    }, { eventoId: 'eventos', ministerioId: 'ministerios', servicoId: 'servicos', pessoaId: 'pessoas' });

    await insert(client, category, 'categorias', { nome: 'Materiais', tipo: 'despesa', congregacaoId: congregation, ativo: true });
    await insert(client, id(701), 'movimentacoes', {
      congregacaoId: congregation, eventoId: event, categoriaId: category, tipo: 'despesa',
      descricao: 'Materiais de demonstração', valor: 25.15, data: new Date().toISOString().slice(0, 10),
    }, { eventoId: 'eventos', categoriaId: 'categorias' });
    await insert(client, project, 'projetos', {
      nome: 'Organização do encontro', congregacaoId: congregation, eventoId: event, status: 'em_andamento',
    }, { eventoId: 'eventos' });
    await insert(client, id(801), 'tarefas', {
      titulo: 'Conferir materiais', projetoId: project, congregacaoId: congregation, prazo: date, status: 'pendente',
    }, { projetoId: 'projetos' });

    await makeAccount(client, id(23), 'Consulta fictícia', 'comum@icsv.example', id(10), congregation);
    await makeAccount(client, id(24), 'Voluntária fictícia', 'voluntario@icsv.example', id(7), congregation, volunteer);
    await makeAccount(client, id(25), 'Financeiro fictício', 'financeiro@icsv.example', id(6), congregation);
    await makeAccount(client, id(26), 'Moderação fictícia', 'moderador@icsv.example', id(14), congregation);

    for (const [userId, profileIds] of [[id(23), [id(10), id(13)]], [id(24), [id(7), id(13)]], [id(25), [id(6), id(13)]], [id(26), [id(14), id(13)]]]) {
      await client.query('INSERT INTO icsv_managed_accounts (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
      for (const profileId of profileIds) {
        await client.query(`
          INSERT INTO icsv_access_assignments (user_id, profile_id, congregation_id)
          VALUES ($1, $2, $3) ON CONFLICT DO NOTHING
        `, [userId, profileId, congregation]);
      }
    }
    const fixtures = {
      id, congregationId: congregation, adminId: id(21), ordinaryUserId: id(23), volunteerUserId: id(24),
      personId: person, volunteerPersonId: volunteer, ministryId: ministry,
    };
    await seedCommunications(client, fixtures);
    await seedFinance(client, fixtures);
    await seedKids(client, fixtures);
    await seedTraining(client, fixtures);

    await client.query('COMMIT');
    console.log('Dados fictícios disponíveis na base de desenvolvimento.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
});

import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { protectedAdminProfileId, resourceNames } from '../src/lib/domain/resource-names.ts';

const usage = 'Uso: node scripts/criar-admin.mjs --nome "<nome>" --email "<e-mail>"\n'
  + 'Forneça a senha em uma única linha por stdin, sem eco no terminal.';

class ProvisionError extends Error {}

function accountOptions() {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        nome: { type: 'string' },
        email: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    }));
  } catch {
    throw new ProvisionError(usage);
  }

  if (values.help) return null;

  const name = z.string().trim().min(1).max(200).safeParse(values.nome);
  if (!name.success || /\p{Cc}/u.test(name.data)) {
    throw new ProvisionError('Informe um nome válido em --nome, com até 200 caracteres.');
  }

  const email = z.string().trim().max(254).toLowerCase().pipe(z.email()).safeParse(values.email);
  if (!email.success) throw new ProvisionError('Informe um e-mail válido em --email.');
  return { nome: name.data, email: email.data };
}

async function readPassword() {
  if (process.stdin.isTTY) {
    throw new ProvisionError('Leia a senha sem eco, por exemplo com read -rsp no Bash, e envie por stdin.');
  }

  const invalid = 'Forneça uma senha em UTF-8 de 8 a 128 caracteres em uma única linha por stdin.';
  const chunks = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    length += chunk.length;
    if (length > 4 * 128 + 2) throw new ProvisionError(invalid);
    chunks.push(chunk);
  }

  let value;
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
    value = decoder.decode(Buffer.concat(chunks)).replace(/\r?\n$/, '');
  } catch {
    throw new ProvisionError(invalid);
  }

  if (value.length < 8 || value.length > 128 || !value.trim() || /\p{Cc}/u.test(value)) {
    throw new ProvisionError(invalid);
  }
  return value;
}

async function provision(client, account, passwordHash) {
  await client.query('BEGIN');
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('icsv_record_mutations'))");
    const { rows: [state] } = await client.query(`
      SELECT EXISTS (SELECT 1 FROM icsv_records WHERE resource = 'usuarios') AS provisioned
    `);
    if (state.provisioned) {
      throw new ProvisionError('A base já possui usuários. Este comando é exclusivo para o provisionamento inicial.');
    }

    const profile = {
      nome: 'Administrador geral do campo',
      escopo: 'campo',
      permissoes: [
        'dashboard:read',
        'reports:read',
        ...resourceNames.flatMap((name) => [`${name}:read`, `${name}:write`]),
      ],
      ativo: true,
    };
    const accountId = randomUUID();
    const user = { ...account, perfilId: protectedAdminProfileId, congregacaoId: null, ativo: true };

    await client.query(`
      INSERT INTO icsv_records (id, resource, data)
      VALUES ($1, 'perfis', $2), ($3, 'usuarios', $4)
    `, [protectedAdminProfileId, profile, accountId, user]);
    await client.query(`
      INSERT INTO icsv_record_links (source_id, field, target_id, target_resource)
      VALUES ($1, 'perfilId', $2, 'perfis')
    `, [accountId, protectedAdminProfileId]);
    await client.query(`
      INSERT INTO icsv_credentials (user_id, password_hash) VALUES ($1, $2)
    `, [accountId, passwordHash]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

try {
  const account = accountOptions();
  if (!account) {
    console.log(usage);
  } else {
    const password = await readPassword();
    const salt = randomBytes(16).toString('hex');
    const passwordHash = `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
    const { withDatabase } = await import('./db.mjs');
    if (!process.env.DATABASE_URL) throw new ProvisionError('Configure DATABASE_URL para a base autorizada.');
    await withDatabase((client) => provision(client, account, passwordHash));
    console.log('Primeira conta administrativa criada.');
  }
} catch (error) {
  const message = error instanceof ProvisionError ? error.message
    : error?.code === '42P01' ? 'Execute as migrações do ICSV antes de criar a primeira conta.'
    : error?.code === '23505' ? 'A base já contém o perfil reservado para administração inicial.'
    : 'Não foi possível provisionar. Verifique a conexão, as migrações e o estado da base.';
  console.error(message);
  process.exitCode = 1;
}

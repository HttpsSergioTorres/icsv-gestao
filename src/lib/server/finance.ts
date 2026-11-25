import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  financeSegments,
  type FinanceAccount,
  type FinanceCategory,
  type FinanceData,
  type FinanceMovement,
  type FinancePeriod,
  type FinanceReport,
  type FinanceSection,
  type FinanceSegment,
  type FinanceStatement,
  type FinanceTotals,
} from "@/lib/domain/finance";
import type { PoolClient } from "pg";
import { headquarters } from "./access-admin";
import { requireUser, type Actor } from "./auth";
import { database, recordTransaction } from "./db";
import { ApiError } from "./http";
import { listRecords, type Item } from "./records";

type Allocation = { movement_id: string; segment: FinanceSegment | null; bank_account_id: string | null };

const periodSchema = z.object({
  de: z.iso.date("Informe uma data inicial válida.").optional(),
  ate: z.iso.date("Informe uma data final válida.").optional(),
});
const accountSchema = z.strictObject({
  nome: z.string().trim().min(1, "Informe o nome da conta simulada.").max(120),
  referencia: z.string().trim().min(1, "Informe uma referência fictícia.").max(30),
  saldoInicial: z.number("Informe um saldo inicial válido.").min(-999_999_999.99).max(999_999_999.99)
    .refine((value) => Number(value.toFixed(2)) === value, "Use até duas casas decimais."),
});
const allocationSchema = z.strictObject({
  movimentoId: z.uuid("Selecione uma movimentação válida."),
  segmento: z.enum(["caeb", "missoes", "campo"]).nullable(),
  contaId: z.uuid("Selecione uma conta válida.").nullable(),
});

export function canViewFinance(actor: Actor, section: FinanceSection) {
  return (actor.scope === "campo" || !!actor.congregacaoId) && actor.grants.has("finance:manage")
    || Boolean(actor.congregacaoId && section === "relatorios" && actor.grants.has("finance:report"));
}

async function financeCongregation(actor: Actor, section: FinanceSection, client?: PoolClient) {
  if (!canViewFinance(actor, section)) {
    throw new ApiError(403, "Você não tem acesso a esta seção financeira na congregação selecionada.");
  }
  return actor.congregacaoId ?? (await headquarters(client)).id;
}

function inPeriod(day: string, { de, ate }: FinancePeriod) {
  return (!de || day >= de) && (!ate || day <= ate);
}

function toCents(value: number) {
  return Math.round(value * 100);
}

function totals(rows: FinanceMovement[]): FinanceTotals {
  let income = 0;
  let expense = 0;
  for (const row of rows) {
    if (row.tipo === "receita") income += toCents(row.valor);
    else expense += toCents(row.valor);
  }

  return { receitas: income / 100, despesas: expense / 100, saldo: (income - expense) / 100, registros: rows.length };
}

function groups(movements: FinanceMovement[], keyFor: (row: FinanceMovement) => string) {
  const result = new Map<string, FinanceMovement[]>();
  for (const row of movements) {
    const key = keyFor(row);
    const group = result.get(key);
    if (group) group.push(row);
    else result.set(key, [row]);
  }
  return result;
}

function makeReport(movements: FinanceMovement[], categories: FinanceCategory[]): FinanceReport {
  const names = new Map(categories.map(({ id, nome }) => [id, nome]));
  const byCategory = groups(movements, ({ categoriaId }) => names.get(categoriaId) ?? "Sem categoria");
  const byMonth = groups(movements, ({ data }) => data.slice(0, 7));

  return {
    totais: totals(movements),
    categorias: [...byCategory].map(([nome, rows]) => ({ nome, ...totals(rows) }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    meses: [...byMonth].sort(([a], [b]) => b.localeCompare(a))
      .map(([mes, rows]) => ({ mes, ...totals(rows) })),
  };
}

function statement(account: FinanceAccount, allRows: FinanceMovement[], period: FinancePeriod): FinanceStatement {
  const { de } = period;
  const preceding = de ? allRows.filter(({ data }) => data < de) : [];
  const current = allRows.filter(({ data }) => inPeriod(data, period));
  let running = toCents(account.saldoInicial) + toCents(totals(preceding).saldo);
  const saldoAnterior = running / 100;
  const lancamentos = current.map((movement) => {
    const sign = movement.tipo === "receita" ? 1 : -1;
    running += sign * toCents(movement.valor);
    return { ...movement, saldo: running / 100 };
  });

  return { ...account, lancamentos, saldoAnterior, totais: totals(current), saldoFinal: running / 100 };
}

function financialMovements(items: Item[], assignments: Allocation[]): FinanceMovement[] {
  const allocations = new Map(assignments.map((row) => [row.movement_id, row]));
  return items.map((item): FinanceMovement => {
    const assignment = allocations.get(item.id);
    return {
      id: item.id,
      data: String(item.data),
      descricao: String(item.descricao),
      tipo: item.tipo === "receita" ? "receita" : "despesa",
      valor: Number(item.valor),
      categoriaId: String(item.categoriaId),
      segmento: assignment?.segment ?? null,
      contaId: assignment?.bank_account_id ?? null,
    };
  }).sort((a, b) => a.data.localeCompare(b.data));
}

async function accounts(congregationId: string): Promise<FinanceAccount[]> {
  const { rows } = await database().query<{ id: string; name: string; reference: string; opening_cents: string }>(`
    SELECT id, name, reference, opening_cents FROM icsv_finance_accounts
    WHERE congregation_id = $1 ORDER BY name, id
  `, [congregationId]);

  return rows.map(({ id, name, reference, opening_cents }) => ({
    id, nome: name, referencia: reference, saldoInicial: Number(opening_cents) / 100,
  }));
}

async function allocations(congregationId: string): Promise<Allocation[]> {
  const { rows } = await database().query<Allocation>(`
    SELECT movement_id, segment, bank_account_id FROM icsv_finance_allocations WHERE congregation_id = $1
  `, [congregationId]);
  return rows;
}

async function financeCategories(actor: Actor, congregationId: string): Promise<FinanceCategory[]> {
  const records = await listRecords(actor, "categorias", congregationId);
  return records.map(({ id, nome, tipo, ativo }) => ({
    id, nome: String(nome), tipo: tipo === "receita" ? "receita" : "despesa", ativo: ativo === true,
  }));
}

export async function readFinance(request: Request, section: FinanceSection): Promise<FinanceData> {
  const actor = await requireUser();
  const congregationId = await financeCongregation(actor, section);
  const query = new URL(request.url).searchParams;
  if (query.has("congregacaoId") && query.get("congregacaoId") !== congregationId) {
    throw new ApiError(403, "Consulte os dados da congregação selecionada.");
  }
  const period = periodSchema.parse({ de: query.get("de") || undefined, ate: query.get("ate") || undefined });
  if (period.de && period.ate && period.de > period.ate) {
    throw new ApiError(400, "A data final deve ser igual ou posterior à data inicial.");
  }

  if (section === "cadastros") {
    return { secao: section, categorias: await financeCategories(actor, congregationId) };
  }

  const usesCategories = section === "painel" || section === "relatorios";
  const usesAccounts = section === "prestacao-de-contas" || section === "extratos-e-saldos";
  const [items, assignments, categories, bankAccounts] = await Promise.all([
    listRecords(actor, "movimentacoes", congregationId),
    section === "relatorios" ? [] : allocations(congregationId),
    usesCategories ? financeCategories(actor, congregationId) : [],
    usesAccounts ? accounts(congregationId) : [],
  ]);
  const allRows = financialMovements(items, assignments);
  const movements = allRows.filter(({ data }) => inPeriod(data, period));

  if (section === "relatorios") return { secao: section, relatorio: makeReport(movements, categories) };
  if (section === "painel") {
    const segments: ({ nome: string } & FinanceTotals)[] = Object.entries(financeSegments).map(([key, nome]) => ({
      nome, ...totals(movements.filter(({ segmento }) => segmento === key)),
    }));
    segments.push({ nome: "Sem classificação", ...totals(movements.filter(({ segmento }) => !segmento)) });
    return { secao: section, relatorio: makeReport(movements, categories), segmentos: segments };
  }
  if (section === "prestacao-de-contas") {
    return { secao: section, movimentos: movements, contas: bankAccounts, totais: totals(movements) };
  }
  if (section === "extratos-e-saldos") {
    const byAccount = groups(allRows, ({ contaId }) => contaId ?? "");
    return {
      secao: section,
      extratos: bankAccounts.map((account) => statement(account, byAccount.get(account.id) ?? [], period)),
      semConta: totals(movements.filter(({ contaId }) => !contaId)),
    };
  }
  const selected = movements.filter(({ segmento }) => segmento === section);
  return { secao: section, movimentos: selected, totais: totals(selected) };
}

export async function createFinanceAccount(section: string, input: unknown) {
  return recordTransaction(async (client) => {
    const actor = await requireUser(client);
    const congregationId = await financeCongregation(actor, "extratos-e-saldos", client);
    if (section !== "extratos-e-saldos") throw new ApiError(405, "Operação indisponível nesta seção.");
    const data = accountSchema.parse(input);
    const id = randomUUID();
    await client.query(`
      INSERT INTO icsv_finance_accounts (id, congregation_id, name, reference, opening_cents)
      VALUES ($1, $2, $3, $4, $5)
    `, [id, congregationId, data.nome, data.referencia, toCents(data.saldoInicial)]);
    return { id };
  });
}

export async function allocateMovement(section: string, input: unknown) {
  await recordTransaction(async (client) => {
    const actor = await requireUser(client);
    const congregationId = await financeCongregation(actor, "prestacao-de-contas", client);
    if (section !== "prestacao-de-contas") throw new ApiError(405, "Operação indisponível nesta seção.");
    const { movimentoId, segmento, contaId } = allocationSchema.parse(input);

    const movement = await client.query(`
      SELECT 1 FROM icsv_records
      WHERE id = $1 AND resource = 'movimentacoes' AND congregation_id = $2 AND deleted_at IS NULL
    `, [movimentoId, congregationId]);
    if (!movement.rowCount) throw new ApiError(404, "Movimentação não encontrada.");
    if (contaId) {
      const account = await client.query(`
        SELECT 1 FROM icsv_finance_accounts WHERE id = $1 AND congregation_id = $2
      `, [contaId, congregationId]);
      if (!account.rowCount) throw new ApiError(404, "Conta simulada não encontrada.");
    }

    await client.query(`
      INSERT INTO icsv_finance_allocations (movement_id, congregation_id, segment, bank_account_id, updated_by)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (movement_id) DO UPDATE SET
        congregation_id = EXCLUDED.congregation_id, segment = EXCLUDED.segment,
        bank_account_id = EXCLUDED.bank_account_id, updated_by = EXCLUDED.updated_by, updated_at = now()
    `, [movimentoId, congregationId, segmento, contaId, actor.id]);
  });
}

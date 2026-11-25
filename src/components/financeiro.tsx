"use client";

import Link from "next/link";
import { ArrowDownToLine, ArrowRight, Plus } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  financeSection,
  financeSegments,
  isFinanceSegment,
  type FinanceAccount,
  type FinanceData,
  type FinanceMovement,
  type FinancePeriod,
  type FinanceReport,
  type FinanceSection,
  type FinanceStatement,
  type FinanceTotals,
} from "@/lib/domain/finance";
import { api, downloadCsv, formatDate, integer, messageOf, money, write } from "./client-api";
import { useSession } from "./gestao-shell";
import { Modal } from "./modal";
import { Empty, LoadError, Loading, PageHeading } from "./painel";

const descriptions: Record<FinanceSection, string> = {
  cadastros: "Consulte as categorias da congregação e abra os cadastros financeiros.",
  "prestacao-de-contas": "Confira receitas e despesas e vincule lançamentos a segmentos e contas simuladas.",
  "extratos-e-saldos": "Consulte os extratos e saldos calculados a partir das movimentações vinculadas.",
  caeb: "Movimentações classificadas manualmente na Caixa de Evangelização e Beneficência.",
  missoes: "Movimentações classificadas manualmente em Missões.",
  campo: "Movimentações classificadas manualmente em Campo.",
  relatorios: "Consulte os resultados por mês e categoria da congregação selecionada.",
  painel: "Acompanhe o resultado financeiro e a distribuição dos lançamentos.",
};

type QueryResult = { url: string; data: FinanceData } | { url: string; error: string };

function FinanceSummary({ totals }: { totals: FinanceTotals }) {
  return <dl className="report-metrics">
    <div><dt>Receitas</dt><dd>{money.format(totals.receitas)}</dd></div>
    <div><dt>Despesas</dt><dd>{money.format(totals.despesas)}</dd></div>
    <div><dt>Saldo</dt><dd>{money.format(totals.saldo)}</dd></div>
    <div><dt>Lançamentos</dt><dd>{integer.format(totals.registros)}</dd></div>
  </dl>;
}

function TotalsTable({
  title, label, rows,
}: {
  title: string;
  label: string;
  rows: ({ nome: string } & FinanceTotals)[];
}) {
  if (!rows.length) return null;
  return <section className="dash-section finance-block">
    <div className="section-heading"><h2>{title}</h2></div>
    <div className="table-scroll"><table>
      <thead><tr>
        <th scope="col">{label}</th><th scope="col">Receitas</th><th scope="col">Despesas</th>
        <th scope="col">Saldo</th><th scope="col">Lançamentos</th>
      </tr></thead>
      <tbody>{rows.map((row) => <tr key={row.nome}>
        <th scope="row">{row.nome}</th>
        <td>{money.format(row.receitas)}</td>
        <td>{money.format(row.despesas)}</td>
        <td>{money.format(row.saldo)}</td>
        <td>{integer.format(row.registros)}</td>
      </tr>)}</tbody>
    </table></div>
  </section>;
}

function Report({ report }: { report: FinanceReport }) {
  return <>
    <FinanceSummary totals={report.totais} />
    {!report.totais.registros && <Empty title="Nenhuma movimentação no período" />}
    <TotalsTable title="Resultado mensal" label="Mês"
      rows={report.meses.map(({ mes, ...row }) => ({ nome: monthLabel(mes), ...row }))} />
    <TotalsTable title="Resultado por categoria" label="Categoria"
      rows={report.categorias} />
  </>;
}

function monthLabel(month: string) {
  return `${month.slice(5, 7)}/${month.slice(0, 4)}`;
}

function exportReport(report: FinanceReport) {
  const headers = ["Grupo", "Descrição", "Receitas", "Despesas", "Saldo", "Lançamentos"];
  const row = (group: string, description: string, values: FinanceTotals) => [
    group, description, money.format(values.receitas), money.format(values.despesas),
    money.format(values.saldo), String(values.registros),
  ];
  downloadCsv("icsv-financeiro.csv", [
    headers,
    row("Total", "Resultado no período", report.totais),
    ...report.meses.map((month) => row("Mês", monthLabel(month.mes), month)),
    ...report.categorias.map((category) => row("Categoria", category.nome, category)),
  ]);
}

function MovementsTable({
  rows, withBalance = false, action,
}: {
  rows: (FinanceMovement & { saldo?: number })[];
  withBalance?: boolean;
  action?: (row: FinanceMovement) => ReactNode;
}) {
  if (!rows.length) return <Empty title="Nenhum lançamento no período" />;
  return <div className="table-scroll"><table className="finance-movements">
    <thead><tr>
      <th scope="col">Data</th><th scope="col">Descrição</th><th scope="col">Tipo</th>
      <th scope="col">Valor</th><th scope="col">Segmento</th>
      {withBalance && <th scope="col">Saldo acumulado</th>}
      {action && <th scope="col">Ações</th>}
    </tr></thead>
    <tbody>{rows.map((row) => <tr key={row.id}>
      <td>{formatDate(row.data)}</td><th scope="row">{row.descricao}</th>
      <td>{row.tipo === "receita" ? "Receita" : "Despesa"}</td>
      <td>{money.format(row.valor)}</td><td>{row.segmento ? financeSegments[row.segmento] : "Sem classificação"}</td>
      {withBalance && <td>{row.saldo === undefined ? "—" : money.format(row.saldo)}</td>}
      {action && <td>{action(row)}</td>}
    </tr>)}</tbody>
  </table></div>;
}

function Statement({ account }: { account: FinanceStatement }) {
  return <section className="dash-section finance-block">
    <div className="section-heading finance-statement-heading">
      <h2>{account.nome}</h2><span>{account.referencia}</span>
    </div>
    <dl className="report-metrics">
      <div><dt>Saldo anterior</dt><dd>{money.format(account.saldoAnterior)}</dd></div>
      <div><dt>Créditos no período</dt><dd>{money.format(account.totais.receitas)}</dd></div>
      <div><dt>Débitos no período</dt><dd>{money.format(account.totais.despesas)}</dd></div>
      <div><dt>Saldo final</dt><dd>{money.format(account.saldoFinal)}</dd></div>
    </dl>
    <MovementsTable rows={account.lancamentos} withBalance />
  </section>;
}

function NewAccount({ close, finish }: { close: () => void; finish: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("/api/financeiro/extratos-e-saldos", write("POST", {
        nome: fields.get("nome"), referencia: fields.get("referencia"),
        saldoInicial: Number(fields.get("saldoInicial")),
      }));
      finish();
    } catch (failure) {
      setError(messageOf(failure));
      setBusy(false);
    }
  }

  return <Modal title="Nova conta simulada" close={() => { if (!busy) close(); }}>
    <form onSubmit={submit}>
      <p className="modal-note">Use uma referência fictícia. O saldo inicial antecede todos os lançamentos vinculados.</p>
      <div className="editor-grid">
        <label>Nome da conta<input name="nome" required maxLength={120} /></label>
        <label>Referência fictícia<input name="referencia" required maxLength={30} /></label>
        <label>Saldo inicial (R$)<input name="saldoInicial" type="number" step="0.01" defaultValue="0" required /></label>
      </div>
      {error && <p className="alert" role="alert">{error}</p>}
      <footer className="modal-actions">
        <button className="btn btn-secondary" type="button" onClick={close} disabled={busy}>Voltar</button>
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar conta"}</button>
      </footer>
    </form>
  </Modal>;
}

function LinkMovement({
  movement, accounts, close, finish,
}: {
  movement: FinanceMovement;
  accounts: FinanceAccount[];
  close: () => void;
  finish: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("/api/financeiro/prestacao-de-contas", write("PATCH", {
        movimentoId: movement.id, segmento: fields.get("segmento") || null, contaId: fields.get("contaId") || null,
      }));
      finish();
    } catch (failure) {
      setError(messageOf(failure));
      setBusy(false);
    }
  }

  return <Modal title="Classificar lançamento" close={() => { if (!busy) close(); }}>
    <form onSubmit={submit}>
      <p className="modal-note">{movement.descricao}</p>
      <div className="editor-grid">
        <label>Segmento<select name="segmento" defaultValue={movement.segmento ?? ""}>
          <option value="">Sem classificação</option>
          {Object.entries(financeSegments).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
        <label>Conta simulada<select name="contaId" defaultValue={movement.contaId ?? ""}>
          <option value="">Sem vínculo bancário</option>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.nome} ({account.referencia})</option>)}
        </select></label>
      </div>
      {error && <p className="alert" role="alert">{error}</p>}
      <footer className="modal-actions">
        <button className="btn btn-secondary" type="button" onClick={close} disabled={busy}>Voltar</button>
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar classificação"}</button>
      </footer>
    </form>
  </Modal>;
}

export function Financeiro({ section, canManage }: { section: FinanceSection; canManage: boolean }) {
  const user = useSession();
  const [period, setPeriod] = useState<FinancePeriod>({});
  const [result, setResult] = useState<QueryResult>();
  const [attempt, setAttempt] = useState(0);
  const [newAccount, setNewAccount] = useState(false);
  const [movement, setMovement] = useState<FinanceMovement>();
  const [notice, setNotice] = useState("");
  const path = `/api/financeiro/${section}?${new URLSearchParams({
    ...(period.de ? { de: period.de } : {}), ...(period.ate ? { ate: period.ate } : {}),
  })}`;

  useEffect(() => {
    const aborter = new AbortController();
    api<FinanceData>(path, { signal: aborter.signal })
      .then((data) => { if (!aborter.signal.aborted) setResult({ url: path, data }); })
      .catch((error: unknown) => { if (!aborter.signal.aborted) setResult({ url: path, error: messageOf(error) }); });
    return () => aborter.abort();
  }, [path, attempt]);

  const current = result?.url === path ? result : undefined;
  const data = current && "data" in current ? current.data : undefined;
  const error = current && "error" in current ? current.error : undefined;

  function reload() {
    setResult(undefined);
    setAttempt((value) => value + 1);
  }

  function saved(message: string) {
    setNewAccount(false);
    setMovement(undefined);
    setNotice(message);
    reload();
  }

  return <div className="finance-page">
    <PageHeading title={financeSection(section)?.label ?? "Financeiro"} description={descriptions[section]}>
      {data?.secao === "relatorios" && data.relatorio.totais.registros > 0 && <button type="button" className="btn btn-secondary"
        onClick={() => exportReport(data.relatorio)}><ArrowDownToLine size={17} />Exportar CSV</button>}
      {section === "extratos-e-saldos" && canManage && <button type="button" className="btn btn-primary"
        onClick={() => setNewAccount(true)}><Plus size={17} />Nova conta simulada</button>}
    </PageHeading>
    {section !== "cadastros" && <div className="filters finance-filters">
      <label>De<input type="date" value={period.de ?? ""} max={period.ate}
        onChange={(event) => setPeriod({ ...period, de: event.target.value })} /></label>
      <label>Até<input type="date" value={period.ate ?? ""} min={period.de}
        onChange={(event) => setPeriod({ ...period, ate: event.target.value })} /></label>
      {(period.de || period.ate) && <button type="button" className="btn btn-secondary" onClick={() => setPeriod({})}>Limpar período</button>}
    </div>}
    {notice && <p role="status" className="success-banner">{notice}</p>}
    {!data && (error ? <LoadError error={error} retry={reload} /> : <Loading />)}
    {data?.secao === "cadastros" && <>
      <div className="finance-actions">
        {user.permissions.categorias?.read && <Link href="/categorias" className="btn btn-primary">Categorias financeiras<ArrowRight size={17} /></Link>}
        {user.permissions.movimentacoes?.read && <Link href="/movimentacoes" className="btn btn-secondary">Movimentações<ArrowRight size={17} /></Link>}
      </div>
      {data.categorias.length ? <section className="dash-section finance-block">
        <div className="section-heading"><h2>Categorias da congregação</h2></div>
        <div className="table-scroll"><table>
          <thead><tr><th scope="col">Categoria</th><th scope="col">Tipo</th><th scope="col">Situação</th></tr></thead>
          <tbody>{data.categorias.map((category) => <tr key={category.id}>
            <th scope="row">{category.nome}</th><td>{category.tipo === "receita" ? "Receita" : "Despesa"}</td>
            <td>{category.ativo ? "Ativa" : "Inativa"}</td>
          </tr>)}</tbody>
        </table></div>
      </section> : <Empty title="Nenhuma categoria cadastrada" />}
    </>}
    {data?.secao === "prestacao-de-contas" && <>
      {user.permissions.movimentacoes?.read && <div className="finance-actions">
        <Link href="/movimentacoes" className="btn btn-secondary">Abrir movimentações e comprovantes<ArrowRight size={17} /></Link>
      </div>}
      <FinanceSummary totals={data.totais} />
      <MovementsTable rows={data.movimentos} action={(row) => {
        const account = data.contas.find(({ id }) => id === row.contaId);
        return <div className="finance-allocation">
          <small>{account?.nome ?? "Sem vínculo bancário"}</small>
          <button className="small-action" type="button" onClick={() => setMovement(row)}>Classificar</button>
        </div>;
      }} />
    </>}
    {data?.secao === "extratos-e-saldos" && <>
      <p className="finance-note">Contas simuladas. Os lançamentos vinculados formam o extrato sem conexão bancária.</p>
      {data.extratos.length > 0 ? data.extratos.map((account) => <Statement key={account.id} account={account} />)
        : <Empty title="Nenhuma conta simulada cadastrada" />}
      {!!data.semConta.registros && <p className="finance-note">
        {integer.format(data.semConta.registros)} lançamentos sem vínculo bancário no período. Vincule-os na <Link href="/financeiro/prestacao-de-contas">Prestação de contas</Link>.
      </p>}
    </>}
    {data && isFinanceSegment(data.secao) && "movimentos" in data && <>
      <FinanceSummary totals={data.totais} />
      <p className="finance-note">As regras oficiais de lançamento e aprovação estão pendentes. Classifique os registros na <Link href="/financeiro/prestacao-de-contas">Prestação de contas</Link>.</p>
      <MovementsTable rows={data.movimentos} />
    </>}
    {data?.secao === "relatorios" && <Report report={data.relatorio} />}
    {data?.secao === "painel" && <>
      <Report report={data.relatorio} />
      <TotalsTable title="Resultado por segmento" label="Segmento" rows={data.segmentos} />
    </>}
    {newAccount && <NewAccount close={() => setNewAccount(false)} finish={() => saved("Conta simulada cadastrada.")} />}
    {movement && data?.secao === "prestacao-de-contas" && <LinkMovement movement={movement} accounts={data.contas}
      close={() => setMovement(undefined)} finish={() => saved("Classificação salva.")} />}
  </div>;
}

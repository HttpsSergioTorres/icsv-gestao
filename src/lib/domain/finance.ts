export const financeSections = [
  { slug: "cadastros", label: "Cadastros" },
  { slug: "prestacao-de-contas", label: "Prestação de contas" },
  { slug: "extratos-e-saldos", label: "Extratos e saldos bancários" },
  { slug: "caeb", label: "CAEB — Caixa de Evangelização e Beneficência" },
  { slug: "missoes", label: "Missões" },
  { slug: "campo", label: "Campo" },
  { slug: "relatorios", label: "Relatórios" },
  { slug: "painel", label: "Painel financeiro" },
] as const;

export type FinanceSection = (typeof financeSections)[number]["slug"];

export const financeSegments = {
  caeb: "CAEB",
  missoes: "Missões",
  campo: "Campo",
} as const;

export type FinanceSegment = keyof typeof financeSegments;

export function isFinanceSegment(value: string): value is FinanceSegment {
  return Object.hasOwn(financeSegments, value);
}

export function financeSection(slug: string) {
  return financeSections.find((section) => section.slug === slug);
}

export type FinancePeriod = { de?: string; ate?: string };
export type FinanceTotals = { receitas: number; despesas: number; saldo: number; registros: number };

export type FinanceReport = {
  totais: FinanceTotals;
  categorias: ({ nome: string } & FinanceTotals)[];
  meses: ({ mes: string } & FinanceTotals)[];
};

export type FinanceCategory = { id: string; nome: string; tipo: "receita" | "despesa"; ativo: boolean };
export type FinanceAccount = { id: string; nome: string; referencia: string; saldoInicial: number };
export type FinanceMovement = {
  id: string;
  data: string;
  descricao: string;
  tipo: "receita" | "despesa";
  valor: number;
  categoriaId: string;
  segmento: FinanceSegment | null;
  contaId: string | null;
};

export type FinanceStatement = FinanceAccount & {
  saldoAnterior: number;
  totais: FinanceTotals;
  saldoFinal: number;
  lancamentos: (FinanceMovement & { saldo: number })[];
};

export type FinanceData =
  | { secao: "relatorios"; relatorio: FinanceReport }
  | { secao: "cadastros"; categorias: FinanceCategory[] }
  | { secao: "prestacao-de-contas"; movimentos: FinanceMovement[]; contas: FinanceAccount[]; totais: FinanceTotals }
  | { secao: "extratos-e-saldos"; extratos: FinanceStatement[]; semConta: FinanceTotals }
  | { secao: FinanceSegment; movimentos: FinanceMovement[]; totais: FinanceTotals }
  | { secao: "painel"; relatorio: FinanceReport; segmentos: ({ nome: string } & FinanceTotals)[] };

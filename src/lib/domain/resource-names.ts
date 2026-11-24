export const resourceNames = [
  "congregacoes",
  "pessoas",
  "ministerios",
  "equipes",
  "eventos",
  "inscricoes",
  "servicos",
  "escalas",
  "categorias",
  "movimentacoes",
  "projetos",
  "tarefas",
  "perfis",
  "usuarios",
] as const;

export type ResourceName = (typeof resourceNames)[number];

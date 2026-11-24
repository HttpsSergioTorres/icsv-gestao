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

export const protectedAdminProfileId = "10000000-0000-4000-8000-000000000001";

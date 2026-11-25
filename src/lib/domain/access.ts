export const specialProfiles = {
  common: "10000000-0000-4000-8000-000000000010",
  guardian: "10000000-0000-4000-8000-000000000011",
  kids: "10000000-0000-4000-8000-000000000012",
  tutorial: "10000000-0000-4000-8000-000000000013",
  moderation: "10000000-0000-4000-8000-000000000014",
  userAdmin: "10000000-0000-4000-8000-000000000015",
} as const;

export const extensionPermissions = [
  { value: "finance:report", label: "Consultar relatórios financeiros" },
  { value: "finance:manage", label: "Administrar o Financeiro" },
  { value: "kids:manage", label: "Confirmar vínculos Kids" },
  { value: "kids:guardian", label: "Gerenciar os próprios vínculos Kids" },
  { value: "kids:play", label: "Acessar o espaço Kids" },
  { value: "communications:use", label: "Acessar avisos e pedidos de oração" },
  { value: "communications:post", label: "Publicar avisos" },
  { value: "communications:moderate", label: "Moderar pedidos de oração" },
  { value: "tutorial:read", label: "Acessar o Tutorial do Sistema" },
  { value: "training:learn", label: "Participar de treinamentos dos próprios ministérios" },
  { value: "training:manage", label: "Administrar treinamentos" },
] as const;

export function profileHome(grants: Iterable<string>) {
  const access = new Set(grants);
  if (access.has("kids:play")) return "/kids";
  if (access.has("kids:guardian")) return "/responsavel";
  if (access.has("tutorial:read") && !access.has("dashboard:read")) return "/tutorial";
  return "/";
}

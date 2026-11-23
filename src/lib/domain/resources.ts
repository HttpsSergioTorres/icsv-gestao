import { z } from "zod";
import { eventTime } from "./occurrences";

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
export type FieldType = "text" | "tel" | "email" | "password" | "date" | "datetime"
  | "money" | "select" | "multiselect" | "checkbox" | "textarea" | "reference";

export interface Option {
  value: string;
  label: string;
}

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  requiredOnCreate?: boolean;
  options?: readonly Option[];
  reference?: ResourceName;
  defaultValue?: string | number | boolean | string[];
  writeOnly?: boolean;
  maxLength?: number;
}

export interface ResourceDefinition {
  title: string;
  singular: string;
  description: string;
  section: string;
  columns: readonly string[];
  fields: readonly Field[];
  labelField: string;
  congregationField?: string;
  exportable?: boolean;
}

function ref(key: string, label: string, reference: ResourceName, required = false): Field {
  return { key, label, type: "reference", reference, required };
}

const congregation = ref("congregacaoId", "Congregação", "congregacoes", true);
const active: Field = { key: "ativo", label: "Ativo", type: "checkbox", defaultValue: true };
const description: Field = { key: "descricao", label: "Descrição", type: "textarea" };
const notes: Field = { key: "observacoes", label: "Observações", type: "textarea" };
const owner = ref("responsavelId", "Responsável", "pessoas");
const member = ref("pessoaId", "Pessoa", "pessoas", true);
const ministry = ref("ministerioId", "Ministério", "ministerios");
const event = ref("eventoId", "Atividade", "eventos");
const name: Field = { key: "nome", label: "Nome", type: "text", required: true };
const title: Field = { key: "titulo", label: "Título", type: "text", required: true };

function select(
  key: string,
  label: string,
  entries: Record<string, string>,
  defaultValue?: string,
): Field {
  const options = Object.entries(entries).map(([value, label]) => ({ value, label }));
  return { key, label, type: "select", options, required: true, defaultValue };
}

const financeType = select("tipo", "Tipo", { receita: "Receita", despesa: "Despesa" });

export const resources: Record<ResourceName, ResourceDefinition> = {
  congregacoes: {
    title: "Congregações",
    singular: "Congregação",
    description: "Administre as congregações e suas lideranças.",
    section: "Comunidade",
    labelField: "nome",
    columns: ["nome", "cidade", "pastorId", "ativo"],
    fields: [
      name,
      { key: "cnpj", label: "CNPJ", type: "text", maxLength: 24 },
      { key: "endereco", label: "Endereço", type: "text" },
      { key: "cidade", label: "Cidade", type: "text" },
      { key: "telefone", label: "Telefone", type: "tel" },
      { key: "email", label: "E-mail", type: "email" },
      ref("pastorId", "Pastor", "pessoas"),
      owner,
      active,
    ],
  },
  pessoas: {
    title: "Pessoas",
    singular: "Pessoa",
    description: "Centralize os registros de membros, visitantes, lideranças e voluntários.",
    section: "Comunidade",
    labelField: "nome",
    congregationField: "congregacaoId",
    columns: ["nome", "tipo", "congregacaoId", "ativo"],
    exportable: true,
    fields: [
      name,
      select("tipo", "Vínculo principal", {
        membro: "Membro",
        visitante: "Visitante",
        lideranca: "Pastor ou liderança",
        voluntario: "Voluntário",
      }, "membro"),
      congregation,
      { key: "nascimento", label: "Data de nascimento", type: "date" },
      { key: "telefone", label: "Telefone", type: "tel" },
      { key: "email", label: "E-mail", type: "email" },
      { key: "responsavelLegal", label: "Responsável legal", type: "text" },
      {
        key: "autorizacaoResponsavel",
        label: "Autorização do responsável registrada",
        type: "checkbox",
        defaultValue: false,
      },
      {
        key: "autorizacaoImagem",
        label: "Autorização de imagem registrada",
        type: "checkbox",
        defaultValue: false,
      },
      notes,
      active,
    ],
  },
  ministerios: {
    title: "Ministérios e departamentos",
    singular: "Ministério ou departamento",
    description: "Cadastre os ministérios da congregação e defina suas lideranças.",
    section: "Comunidade",
    labelField: "nome",
    congregationField: "congregacaoId",
    columns: ["nome", "tipo", "congregacaoId", "liderId", "ativo"],
    fields: [
      name,
      select("tipo", "Tipo", { ministerio: "Ministério", departamento: "Departamento" }, "ministerio"),
      congregation,
      ref("liderId", "Liderança", "pessoas"),
      description,
      active,
    ],
  },
  equipes: {
    title: "Equipes",
    singular: "Vínculo de equipe",
    description: "Vincule pessoas a ministérios e acompanhe a composição das equipes.",
    section: "Comunidade",
    labelField: "pessoaId",
    congregationField: "congregacaoId",
    columns: ["pessoaId", "ministerioId", "funcao", "ativo"],
    fields: [
      congregation,
      { ...ministry, required: true },
      member,
      { key: "funcao", label: "Função", type: "text" },
      active,
    ],
  },
  eventos: {
    title: "Agenda e eventos",
    singular: "Atividade",
    description: "Organize cultos, reuniões e eventos por congregação e ministério.",
    section: "Atividades",
    labelField: "titulo",
    congregationField: "congregacaoId",
    columns: ["titulo", "tipo", "inicio", "congregacaoId", "status"],
    fields: [
      title,
      select("tipo", "Tipo", { culto: "Culto", reuniao: "Reunião", evento: "Evento" }),
      congregation,
      ministry,
      { key: "inicio", label: "Início", type: "datetime", required: true },
      { key: "fim", label: "Fim", type: "datetime", required: true },
      { key: "local", label: "Local", type: "text" },
      owner,
      select("status", "Situação", {
        agendado: "Agendado",
        realizado: "Realizado",
        cancelado: "Cancelado",
      }, "agendado"),
      select("recorrencia", "Repetição", {
        nenhuma: "Sem repetição",
        semanal: "Semanal",
        quinzenal: "Quinzenal",
        mensal: "Mensal",
      }, "nenhuma"),
      { key: "recorrenciaAte", label: "Repetir até", type: "date" },
      description,
    ],
  },
  inscricoes: {
    title: "Inscrições e presenças",
    singular: "Inscrição",
    description: "Acompanhe os participantes e registre as presenças nas atividades.",
    section: "Atividades",
    labelField: "pessoaId",
    congregationField: "congregacaoId",
    columns: ["pessoaId", "eventoId", "congregacaoId", "status"],
    fields: [
      congregation,
      { ...event, required: true },
      member,
      select("status", "Situação", {
        inscrito: "Inscrito",
        confirmado: "Confirmado",
        presente: "Presente",
        ausente: "Ausente",
        cancelado: "Cancelado",
      }, "inscrito"),
    ],
  },
  servicos: {
    title: "Tipos de serviço",
    singular: "Tipo de serviço",
    description: "Defina as funções de voluntariado que podem compor as escalas.",
    section: "Atividades",
    labelField: "nome",
    congregationField: "congregacaoId",
    columns: ["nome", "congregacaoId", "ministerioId", "ativo"],
    fields: [name, congregation, ministry, description, active],
  },
  escalas: {
    title: "Escalas de serviço",
    singular: "Escala",
    description: "Organize as escalas, confirme participações e acompanhe substituições.",
    section: "Atividades",
    labelField: "pessoaId",
    congregationField: "congregacaoId",
    columns: ["eventoId", "pessoaId", "servicoId", "ministerioId", "status"],
    fields: [
      congregation,
      { ...event, required: true },
      { ...ministry, required: true },
      ref("servicoId", "Tipo de serviço", "servicos", true),
      { ...member, label: "Voluntário" },
      select("status", "Situação", {
        pendente: "Pendente",
        confirmada: "Confirmada",
        recusada: "Recusada",
        substituida: "Substituída",
      }, "pendente"),
      notes,
    ],
  },
  categorias: {
    title: "Categorias financeiras",
    singular: "Categoria financeira",
    description: "Organize receitas e despesas por categoria e congregação.",
    section: "Financeiro",
    labelField: "nome",
    congregationField: "congregacaoId",
    columns: ["nome", "tipo", "congregacaoId", "ativo"],
    fields: [name, financeType, congregation, active],
  },
  movimentacoes: {
    title: "Movimentações",
    singular: "Movimentação",
    description: "Registre receitas, despesas e comprovantes administrativos.",
    section: "Financeiro",
    labelField: "descricao",
    congregationField: "congregacaoId",
    columns: ["data", "descricao", "tipo", "valor", "congregacaoId"],
    exportable: true,
    fields: [
      congregation,
      financeType,
      ref("categoriaId", "Categoria", "categorias", true),
      event,
      { ...description, required: true },
      { key: "valor", label: "Valor em R$", type: "money", required: true },
      { key: "data", label: "Data", type: "date", required: true },
      { key: "comprovante", label: "Identificação do comprovante", type: "text", maxLength: 500 },
    ],
  },
  projetos: {
    title: "Projetos",
    singular: "Projeto",
    description: "Acompanhe projetos, responsáveis, prazos e vínculos com atividades.",
    section: "Planejamento",
    labelField: "nome",
    congregationField: "congregacaoId",
    columns: ["nome", "congregacaoId", "responsavelId", "prazo", "status"],
    fields: [
      name,
      congregation,
      ministry,
      event,
      owner,
      description,
      { key: "prazo", label: "Prazo", type: "date" },
      select("status", "Situação", {
        planejado: "Planejado",
        em_andamento: "Em andamento",
        concluido: "Concluído",
        cancelado: "Cancelado",
      }, "planejado"),
    ],
  },
  tarefas: {
    title: "Tarefas",
    singular: "Tarefa",
    description: "Controle as atividades dos projetos e acompanhe suas pendências.",
    section: "Planejamento",
    labelField: "titulo",
    congregationField: "congregacaoId",
    columns: ["titulo", "projetoId", "responsavelId", "prazo", "status"],
    fields: [
      congregation,
      ref("projetoId", "Projeto", "projetos", true),
      title,
      owner,
      description,
      { key: "prazo", label: "Prazo", type: "date" },
      select("status", "Situação", {
        pendente: "Pendente",
        em_andamento: "Em andamento",
        concluida: "Concluída",
        cancelada: "Cancelada",
      }, "pendente"),
    ],
  },
  perfis: {
    title: "Perfis de acesso",
    singular: "Perfil de acesso",
    description: "Configure permissões e limite o acesso ao campo ou à congregação.",
    section: "Administração",
    labelField: "nome",
    columns: ["nome", "escopo", "ativo"],
    get fields(): readonly Field[] {
      return [
        name,
        description,
        select("escopo", "Escopo", { campo: "Campo", congregacao: "Congregação" }, "congregacao"),
        {
          key: "permissoes",
          label: "Permissões",
          type: "multiselect",
          options: permissionOptions,
          defaultValue: [],
        },
        active,
      ];
    },
  },
  usuarios: {
    title: "Usuários",
    singular: "Usuário",
    description: "Administre as contas de acesso e suas associações a congregações.",
    section: "Administração",
    labelField: "nome",
    congregationField: "congregacaoId",
    columns: ["nome", "email", "perfilId", "congregacaoId", "ativo"],
    fields: [
      name,
      { key: "email", label: "E-mail", type: "email", required: true },
      { key: "senha", label: "Senha", type: "password", requiredOnCreate: true, writeOnly: true },
      ref("perfilId", "Perfil de acesso", "perfis", true),
      { ...congregation, required: false },
      active,
    ],
  },
};

export const permissionOptions: readonly Option[] = [
  { value: "dashboard:read", label: "Consultar painel" },
  { value: "reports:read", label: "Consultar relatórios" },
  ...resourceNames.flatMap((resource) => [
    { value: `${resource}:read`, label: `Consultar ${resources[resource].title.toLowerCase()}` },
    { value: `${resource}:write`, label: `Gerenciar ${resources[resource].title.toLowerCase()}` },
  ]),
];

export function isResourceName(name: string): name is ResourceName {
  return Object.hasOwn(resources, name);
}

export function getResource(name: string): ResourceDefinition | undefined {
  return isResourceName(name) ? resources[name] : undefined;
}

const date = z.iso.date("Informe uma data válida.");
const dateTime = z.iso.datetime({ offset: true, local: true, error: "Informe uma data e hora válidas." });
const money = z.number("Informe um valor numérico.").positive("O valor deve ser maior que zero.")
  .max(999_999_999.99, "O valor ultrapassa o limite permitido.")
  .refine((value) => Number(value.toFixed(2)) === value, "Use até duas casas decimais.");

function textLimit(field: Field, fallback: number) {
  return z.string("Informe um texto.").trim().min(1, "Preencha este campo.")
    .max(field.maxLength ?? fallback, "O texto ultrapassa o tamanho permitido.");
}

function fieldValueSchema(field: Field): z.ZodType {
  const options = field.options?.map(({ value }) => value) ?? [];
  switch (field.type) {
    case "reference":
      return z.uuid("Selecione um registro válido.");
    case "date":
      return date;
    case "datetime":
      return dateTime;
    case "money":
      return money;
    case "checkbox":
      return z.boolean("Informe sim ou não.");
    case "email":
      return textLimit(field, 254).toLowerCase().pipe(z.email("Informe um e-mail válido."));
    case "password":
      return z.string("Informe uma senha.").min(8, "A senha deve ter ao menos 8 caracteres.")
        .max(128, "A senha deve ter no máximo 128 caracteres.");
    case "select":
      return z.enum(options, "Selecione uma opção válida.");
    case "multiselect":
      return z.array(z.enum(options, "Selecione permissões válidas.")).max(options.length)
        .transform((values) => [...new Set(values)]);
    case "tel":
      return textLimit(field, 40);
    case "textarea":
      return textLimit(field, 4_000);
    default:
      return textLimit(field, 200);
  }
}

type SchemaMode = "create" | "patch" | "record";

export function getResourceSchema(name: ResourceName, mode: SchemaMode = "create") {
  const fields = resources[name].fields.map((field) => {
    const base = fieldValueSchema(field);
    const required = field.required || (mode === "create" && field.requiredOnCreate);

    if (mode === "patch") {
      return [field.key, field.required || field.writeOnly ? base.optional() : base.nullish()] as const;
    }
    if (field.defaultValue !== undefined) {
      return [field.key, base.default(field.defaultValue)] as const;
    }
    if (required) return [field.key, base] as const;
    return [field.key, field.writeOnly ? base.optional() : base.nullish()] as const;
  });

  const schema = z.strictObject(Object.fromEntries(fields));
  if (mode === "patch") return schema;

  return schema.superRefine((record, context) => {
    if (name === "eventos") {
      const { inicio, fim, recorrencia, recorrenciaAte } = record;
      if (typeof inicio === "string" && typeof fim === "string" && eventTime(fim) <= eventTime(inicio)) {
        context.addIssue({ code: "custom", path: ["fim"], message: "O fim deve ocorrer após o início." });
      }
      if (recorrencia !== "nenhuma" && !recorrenciaAte) {
        context.addIssue({
          code: "custom",
          path: ["recorrenciaAte"],
          message: "Informe a data limite para a repetição.",
        });
      }
      if (typeof recorrenciaAte === "string" && typeof inicio === "string" && recorrenciaAte < inicio.slice(0, 10)) {
        context.addIssue({
          code: "custom",
          path: ["recorrenciaAte"],
          message: "A data limite deve ser igual ou posterior à data inicial.",
        });
      }
    }

    if (name === "pessoas" && record.autorizacaoResponsavel === true && !record.responsavelLegal) {
      context.addIssue({
        code: "custom",
        path: ["responsavelLegal"],
        message: "Identifique o responsável que concedeu a autorização.",
      });
    }

    if (name === "pessoas" && typeof record.nascimento === "string"
      && record.nascimento > new Date().toISOString().slice(0, 10)) {
      context.addIssue({ code: "custom", path: ["nascimento"], message: "A data de nascimento deve estar no passado." });
    }
  });
}

import { describe, expect, it } from "vitest";
import { getResourceSchema } from "@/lib/domain/resources";

const id = "44444444-4444-4444-8444-444444444444";

describe("validação de cadastros", () => {
  it("aceita congregação sem CNPJ e ativa por padrão", () => {
    const schema = getResourceSchema("congregacoes");
    expect(schema.parse({ nome: " Congregação de teste " })).toEqual({
      nome: "Congregação de teste",
      ativo: true,
    });
  });

  it("permite editar um campo sem sobrescrever os demais", () => {
    const schema = getResourceSchema("pessoas", "patch");
    expect(schema.parse({ nome: "Pessoa de teste" })).toEqual({ nome: "Pessoa de teste" });
    expect(schema.safeParse({ id }).success).toBe(false);
  });

  it("exige identificar o responsável quando a autorização foi registrada", () => {
    const schema = getResourceSchema("pessoas");
    const pessoa = { nome: "Pessoa de teste", congregacaoId: id, autorizacaoResponsavel: true };
    const falha = schema.safeParse(pessoa);
    expect(falha.error?.issues).toEqual([expect.objectContaining({ path: ["responsavelLegal"] })]);
    expect(schema.safeParse({ ...pessoa, responsavelLegal: "Responsável de teste" }).success).toBe(true);
  });

  it("normaliza e-mail e exige senha inicial de conta administrativa", () => {
    const schema = getResourceSchema("usuarios");
    const usuario = { nome: "Usuário de teste", email: " QA@ICSV.EXAMPLE ", perfilId: id };
    expect(schema.safeParse(usuario).success).toBe(false);
    expect(schema.parse({ ...usuario, senha: "Senha-de-teste!" }).email).toBe("qa@icsv.example");
  });
});

describe("validação de datas e valores", () => {
  const evento = {
    titulo: "Culto de teste",
    tipo: "culto",
    congregacaoId: id,
    inicio: "2030-04-10T18:00:00-03:00",
    fim: "2030-04-10T20:00:00-03:00",
  };

  it("aceita atividade com horário válido", () => {
    expect(getResourceSchema("eventos").parse(evento)).toMatchObject({
      status: "agendado", recorrencia: "nenhuma",
    });
  });

  it("recusa fim anterior ao início", () => {
    const falha = getResourceSchema("eventos").safeParse({ ...evento, fim: evento.inicio });
    expect(falha.error?.issues).toEqual([expect.objectContaining({ path: ["fim"] })]);
  });

  it("exige data final válida para recorrência", () => {
    const schema = getResourceSchema("eventos");
    expect(schema.safeParse({ ...evento, recorrencia: "semanal" }).success).toBe(false);
    expect(schema.safeParse({ ...evento, recorrencia: "semanal", recorrenciaAte: "2030-04-09" }).success).toBe(false);
    expect(schema.safeParse({ ...evento, recorrencia: "semanal", recorrenciaAte: "2030-04-30" }).success).toBe(true);
  });

  it("recusa valores monetários não positivos ou com mais de duas casas", () => {
    const schema = getResourceSchema("movimentacoes");
    const despesa = {
      tipo: "despesa", congregacaoId: id, categoriaId: id,
      descricao: "Despesa de teste", data: "2030-04-10",
    };
    expect(schema.safeParse({ ...despesa, valor: 0 }).success).toBe(false);
    expect(schema.safeParse({ ...despesa, valor: -1 }).success).toBe(false);
    expect(schema.safeParse({ ...despesa, valor: 12.345 }).success).toBe(false);
    expect(schema.parse({ ...despesa, valor: 12.34 }).valor).toBe(12.34);
  });
});

import { expect, test } from "@playwright/test";
import { create, label, list, login } from "./support";

test("registra equipe e presença e rejeita conflito com escala recorrente", async ({ request }) => {
  await login(request);
  const congregacao = await create(request, "congregacoes", { nome: label("Congregação agenda") });
  const pessoa = await create(request, "pessoas", {
    nome: label("Voluntário"), tipo: "voluntario", congregacaoId: congregacao.id,
  });
  const ministerio = await create(request, "ministerios", {
    nome: label("Ministério de teste"), congregacaoId: congregacao.id, liderId: pessoa.id,
  });
  const equipe = await create(request, "equipes", {
    congregacaoId: congregacao.id, pessoaId: pessoa.id, ministerioId: ministerio.id,
  });
  expect(await list(request, "equipes")).toContainEqual(expect.objectContaining({
    id: equipe.id, pessoaId: pessoa.id, ministerioId: ministerio.id,
  }));

  const eventoData = {
    congregacaoId: congregacao.id,
    ministerioId: ministerio.id,
    tipo: "culto",
    inicio: "2030-04-10T18:00:00-03:00",
    fim: "2030-04-10T20:00:00-03:00",
  };
  const evento = await create(request, "eventos", {
    ...eventoData,
    titulo: label("Culto"),
    responsavelId: pessoa.id,
    recorrencia: "semanal",
    recorrenciaAte: "2030-04-24",
  });
  const simultaneo = await create(request, "eventos", {
    ...eventoData,
    titulo: label("Outra atividade"),
    inicio: "2030-04-17T19:30:00-03:00",
    fim: "2030-04-17T21:30:00-03:00",
  });
  const inscricaoData = { congregacaoId: congregacao.id, eventoId: evento.id, pessoaId: pessoa.id };
  const inscricao = await create(request, "inscricoes", inscricaoData);
  expect((await request.post("/api/inscricoes", { data: inscricaoData })).status()).toBe(409);
  await expect(await request.patch(`/api/inscricoes/${inscricao.id}`, { data: { status: "presente" } })).toBeOK();
  expect(await list(request, "inscricoes")).toContainEqual(expect.objectContaining({
    id: inscricao.id, eventoId: evento.id, pessoaId: pessoa.id, status: "presente",
  }));

  const servico = await create(request, "servicos", {
    nome: label("Recepção"), congregacaoId: congregacao.id, ministerioId: ministerio.id,
  });
  const escalaData = {
    congregacaoId: congregacao.id, pessoaId: pessoa.id, ministerioId: ministerio.id, servicoId: servico.id,
  };
  const escala = await create(request, "escalas", { ...escalaData, eventoId: evento.id });
  await expect(await request.patch(`/api/escalas/${escala.id}`, { data: { status: "confirmada" } })).toBeOK();
  expect(await list(request, "escalas")).toContainEqual(expect.objectContaining({
    id: escala.id, eventoId: evento.id, pessoaId: pessoa.id, status: "confirmada",
  }));
  expect((await request.post("/api/escalas", {
    data: { ...escalaData, eventoId: simultaneo.id },
  })).status()).toBe(409);

  const voluntario = await create(request, "pessoas", {
    nome: label("Voluntário substituto"), tipo: "voluntario", congregacaoId: congregacao.id,
  });
  const troca = await request.post(`/api/escalas/${escala.id}/substituir`, {
    data: { pessoaId: voluntario.id },
  });
  await expect(troca).toBeOK();
  const substituicao = (await troca.json()).item;
  expect(await list(request, "escalas")).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: escala.id, pessoaId: pessoa.id, status: "substituida" }),
    expect.objectContaining({
      id: substituicao.id, pessoaId: voluntario.id, eventoId: evento.id, status: "pendente",
    }),
  ]));
});

test("persiste movimentações e tarefas e consolida relatórios com dados reais", async ({ request }) => {
  await login(request);
  const congregacao = await create(request, "congregacoes", { nome: label("Congregação relatórios") });
  const congregacaoId = congregacao.id;
  await create(request, "pessoas", { nome: label("Membro"), congregacaoId, tipo: "membro" });
  const evento = await create(request, "eventos", {
    congregacaoId,
    titulo: label("Reunião"),
    tipo: "reuniao",
    status: "realizado",
    inicio: "2030-04-10T18:00:00-03:00",
    fim: "2030-04-10T20:00:00-03:00",
  });
  const categoria = await create(request, "categorias", {
    nome: label("Material"), congregacaoId, tipo: "despesa",
  });
  const comprovante = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2ZkAAAAASUVORK5CYII=",
    "base64",
  );
  const envio = await request.post("/api/comprovantes", { multipart: {
    congregacaoId,
    file: { name: "comprovante-ficticio.png", mimeType: "image/png", buffer: comprovante },
  } });
  await expect(envio).toBeOK();
  const { url: comprovanteUrl } = await envio.json();
  expect(comprovanteUrl).toMatch(/^\/api\/comprovantes\/[0-9a-f-]+$/);

  const descricao = label("Compra material");
  const movimento = await create(request, "movimentacoes", {
    congregacaoId, categoriaId: categoria.id, tipo: "despesa", eventoId: evento.id,
    descricao, valor: 12.34, data: "2030-04-10", comprovante: comprovanteUrl,
  });
  expect(await list(request, "movimentacoes")).toContainEqual(expect.objectContaining({
    id: movimento.id, congregacaoId, eventoId: evento.id, valor: 12.34, comprovante: comprovanteUrl,
  }));
  const download = await request.get(comprovanteUrl);
  await expect(download).toBeOK();
  expect(download.headers()["content-disposition"]).toContain("attachment;");
  expect(await download.body()).toEqual(comprovante);

  const projeto = await create(request, "projetos", {
    nome: label("Projeto"), congregacaoId, eventoId: evento.id,
  });
  const tarefa = await create(request, "tarefas", {
    titulo: label("Tarefa"), congregacaoId, projetoId: projeto.id,
  });
  const filtros = { congregacaoId, de: "2030-04-01", ate: "2030-04-30" };

  const reports = await request.get("/api/reports", { params: filtros });
  await expect(reports).toBeOK();
  expect((await reports.json()).summary).toMatchObject({
    congregacoes: 1, membros: 1, membrosAtivos: 1, eventosRealizados: 1,
    despesas: 12.34, receitas: 0, saldo: -12.34, projetos: 1, tarefasPendentes: 1,
  });

  await expect(await request.patch(`/api/tarefas/${tarefa.id}`, { data: { status: "concluida" } })).toBeOK();
  expect(await list(request, "tarefas")).toContainEqual(expect.objectContaining({
    id: tarefa.id, projetoId: projeto.id, status: "concluida",
  }));

  const dashboard = await request.get("/api/dashboard", { params: filtros });
  await expect(dashboard).toBeOK();
  expect((await dashboard.json()).summary).toMatchObject({
    membros: 1, eventosRealizados: 1, despesas: 12.34, tarefasPendentes: 0,
  });

  await request.post("/api/auth/logout");
  expect((await request.get(comprovanteUrl)).status()).toBe(401);
});

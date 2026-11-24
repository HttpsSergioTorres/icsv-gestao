import { expect, test, type APIRequestContext } from "@playwright/test";
import { create, label, login, secretaryEmail } from "./support";

function chamada(eventoId: string) {
  return `/api/eventos/${eventoId}/presencas`;
}

async function atividade(request: APIRequestContext, congregacaoId: string, prefixo: string) {
  return create(request, "eventos", {
    titulo: label(prefixo),
    tipo: "evento",
    congregacaoId,
    inicio: "2030-05-10T18:00:00-03:00",
    fim: "2030-05-10T20:00:00-03:00",
  });
}

async function participante(
  request: APIRequestContext,
  congregacaoId: string,
  eventoId: string,
  status = "inscrito",
) {
  const pessoa = await create(request, "pessoas", {
    nome: label("Participante"), congregacaoId, tipo: "membro",
  });
  const inscricao = await create(request, "inscricoes", {
    congregacaoId, eventoId, pessoaId: pessoa.id, status,
  });
  return { id: inscricao.id, nome: String(pessoa.nome) };
}

async function expectStatus(request: APIRequestContext, eventoId: string, id: string, status: string) {
  const response = await request.get(chamada(eventoId));
  await expect(response).toBeOK();
  expect((await response.json()).participantes).toContainEqual(
    expect.objectContaining({ id, status }),
  );
}

test("salva o lote inteiro ou preserva as inscrições e respeita o escopo", async ({ request, playwright, baseURL }) => {
  await login(request);
  const secretaria = await playwright.request.newContext({ baseURL });
  try {
    const { congregacaoId } = await login(secretaria, secretaryEmail);
    if (!congregacaoId) throw new Error("Seed da Secretaria sem congregação.");

    const evento = await atividade(request, congregacaoId, "Chamada em lote");
    const outroEvento = await atividade(request, congregacaoId, "Outra atividade");
    const outroLocal = await create(request, "congregacoes", { nome: label("Congregação para escopo") });
    const eventoFora = await atividade(request, outroLocal.id, "Atividade de outra congregação");

    const inscrito = await participante(request, congregacaoId, evento.id);
    const confirmado = await participante(request, congregacaoId, evento.id, "confirmado");
    const cancelado = await participante(request, congregacaoId, evento.id, "cancelado");
    const outroInscrito = await participante(request, congregacaoId, outroEvento.id);
    const inscritoFora = await participante(request, outroLocal.id, eventoFora.id);

    const lista = await secretaria.get(chamada(evento.id));
    await expect(lista).toBeOK();
    expect((await lista.json()).participantes).toEqual(expect.arrayContaining([
      { id: inscrito.id, pessoa: inscrito.nome, status: "inscrito" },
      { id: confirmado.id, pessoa: confirmado.nome, status: "confirmado" },
      { id: cancelado.id, pessoa: cancelado.nome, status: "cancelado" },
    ]));

    expect((await secretaria.get(chamada(eventoFora.id))).status()).toBe(404);
    expect((await secretaria.patch(chamada(eventoFora.id), {
      data: { alteracoes: [{ id: inscritoFora.id, statusAnterior: "inscrito", status: "presente" }] },
    })).status()).toBe(404);
    await expectStatus(request, eventoFora.id, inscritoFora.id, "inscrito");

    const valid = { id: inscrito.id, statusAnterior: "inscrito", status: "presente" };
    const rejeicoes = [
      { id: outroInscrito.id, statusAnterior: "inscrito", statusCode: 404 },
      { id: cancelado.id, statusAnterior: "cancelado", statusCode: 409 },
      { id: confirmado.id, statusAnterior: "inscrito", statusCode: 409 },
      { id: inscrito.id, statusAnterior: "inscrito", statusCode: 400 },
    ];
    for (const { id, statusAnterior, statusCode } of rejeicoes) {
      const response = await secretaria.patch(chamada(evento.id), {
        data: { alteracoes: [valid, { id, statusAnterior, status: "ausente" }] },
      });
      expect(response.status()).toBe(statusCode);
      await expectStatus(secretaria, evento.id, inscrito.id, "inscrito");
    }
    await expectStatus(secretaria, outroEvento.id, outroInscrito.id, "inscrito");
    await expectStatus(secretaria, evento.id, confirmado.id, "confirmado");

    const salvo = await secretaria.patch(chamada(evento.id), {
      data: { alteracoes: [
        valid,
        { id: confirmado.id, statusAnterior: "confirmado", status: "ausente" },
      ] },
    });
    expect(salvo.status()).toBe(204);
    await expectStatus(request, evento.id, inscrito.id, "presente");
    await expectStatus(request, evento.id, confirmado.id, "ausente");
    await expectStatus(request, evento.id, cancelado.id, "cancelado");

    await expect(await request.patch(`/api/eventos/${evento.id}`, {
      data: { status: "cancelado" },
    })).toBeOK();
    expect((await secretaria.patch(chamada(evento.id), {
      data: { alteracoes: [{ id: inscrito.id, statusAnterior: "presente", status: "ausente" }] },
    })).status()).toBe(409);
    await expectStatus(request, evento.id, inscrito.id, "presente");
  } finally {
    await secretaria.dispose();
  }
});

test("revisa a chamada na interface móvel e exibe as presenças após recarregar", async ({ page }) => {
  await login(page.request);
  const congregacao = await create(page.request, "congregacoes", { nome: label("Congregação chamada UI") });
  const evento = await atividade(page.request, congregacao.id, "Atividade para chamada");
  const inscrito = await participante(page.request, congregacao.id, evento.id);
  const confirmado = await participante(page.request, congregacao.id, evento.id, "confirmado");
  const cancelado = await participante(page.request, congregacao.id, evento.id, "cancelado");

  await page.goto("/eventos");
  await page.getByRole("row").filter({ hasText: String(evento.titulo) })
    .getByRole("link", { name: "Registrar presenças" }).click();
  await expect(page.getByRole("heading", { name: "Chamada interna" })).toBeVisible();
  const presenca = (nome: string) => page.getByRole("combobox", { name: `Presença de ${nome}` });
  const revisar = page.getByRole("button", { name: "Revisar alterações" });
  await expect(revisar).toBeDisabled();
  await expect(presenca(cancelado.nome)).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await presenca(inscrito.nome).selectOption("presente");
  await presenca(confirmado.nome).selectOption("ausente");
  await revisar.click();

  const dialogo = page.getByRole("dialog", { name: "Confirmar presença" });
  await expect(dialogo.getByText(inscrito.nome, { exact: true })).toBeVisible();
  await expect(dialogo.getByText(confirmado.nome, { exact: true })).toBeVisible();
  await expectStatus(page.request, evento.id, inscrito.id, "inscrito");
  await expectStatus(page.request, evento.id, confirmado.id, "confirmado");

  await expect(await page.request.patch(`/api/inscricoes/${confirmado.id}`, {
    data: { status: "presente" },
  })).toBeOK();
  await dialogo.getByRole("button", { name: "Salvar chamada" }).click();
  await expect(dialogo.getByRole("alert")).toContainText("A chamada foi alterada.");
  await expectStatus(page.request, evento.id, inscrito.id, "inscrito");
  await dialogo.getByRole("button", { name: "Recarregar chamada" }).click();

  await expect(presenca(inscrito.nome)).toHaveValue("");
  await expect(presenca(confirmado.nome)).toHaveValue("presente");
  await presenca(inscrito.nome).selectOption("presente");
  await presenca(confirmado.nome).selectOption("ausente");
  await revisar.click();
  await dialogo.getByRole("button", { name: "Salvar chamada" }).click();
  await expect(page.getByText("Chamada salva.", { exact: true })).toBeVisible();
  await page.reload();

  await expect(presenca(inscrito.nome)).toHaveValue("presente");
  await expect(presenca(confirmado.nome)).toHaveValue("ausente");
  await expect(page.getByRole("row").filter({ hasText: cancelado.nome }))
    .toContainText("Inscrição cancelada");
});

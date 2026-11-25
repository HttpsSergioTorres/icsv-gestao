import { expect, test, type APIRequestContext } from "@playwright/test";
import { demoPassword, label } from "./support";

async function selectProfile(request: APIRequestContext, email: string, profileName: string) {
  const login = await request.post("/api/auth/login", { data: { email, password: demoPassword } });
  await expect(login).toBeOK();
  const available = await request.get("/api/auth/profile");
  await expect(available).toBeOK();
  const { profiles } = await available.json() as { profiles: { id: string; nome: string }[] };
  const profile = profiles.find(({ nome }) => nome === profileName);
  expect(profile).toBeDefined();
  await expect(await request.post("/api/auth/profile", { data: { assignmentId: profile?.id } })).toBeOK();
}

type Prayer = { id: string; texto: string; status?: string; autor?: string | null };
async function readFeed(request: APIRequestContext) {
  const response = await request.get("/api/comunicacao");
  await expect(response).toBeOK();
  return await response.json() as {
    pedidos: Prayer[];
    meusPedidos: Prayer[];
    avisos: { titulo: string; publico: string }[];
  };
}

test("preserva a privacidade do pedido durante a moderação e ao publicar como Anônimo", async ({ page, request, playwright, baseURL }) => {
  const text = label("Pedido anônimo");
  const rejectedText = label("Pedido rejeitado");
  const reader = await playwright.request.newContext({ baseURL });
  try {
    await selectProfile(page.request, "comum@icsv.example", "Usuário comum");
    await selectProfile(reader, "voluntario@icsv.example", "Voluntário");
    await selectProfile(request, "moderador@icsv.example", "Moderação");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Novo pedido" }).click();
    const form = page.getByRole("dialog", { name: "Enviar pedido de oração" });
    await form.getByLabel("Seu pedido").fill(text);
    await form.getByRole("radio", { name: "Anônimo" }).check();
    await expect(form.getByText(/A moderação autorizada pode consultar quem enviou/)).toBeVisible();
    await form.getByRole("button", { name: "Enviar pedido", exact: true }).click();
    await expect(page.getByText("Pedido enviado para moderação.")).toBeVisible();

    const rejection = await page.request.post("/api/comunicacao/pedidos", {
      data: { texto: rejectedText, anonimo: false },
    });
    expect(rejection.status()).toBe(201);
    const { item: rejected } = await rejection.json() as { item: Prayer };
    const ownFeed = await readFeed(page.request);
    const submitted = ownFeed.meusPedidos.find(({ texto }) => texto === text);
    expect(submitted).toMatchObject({ status: "pendente" });
    expect(ownFeed.pedidos).not.toContainEqual(expect.objectContaining({ texto: text }));

    const readerBefore = await readFeed(reader);
    expect([...readerBefore.pedidos, ...readerBefore.meusPedidos])
      .not.toContainEqual(expect.objectContaining({ texto: text }));
    expect((await reader.get("/api/comunicacao/moderacao")).status()).toBe(403);
    expect((await reader.patch(`/api/comunicacao/moderacao/${submitted?.id}`, {
      data: { status: "aprovado" },
    })).status()).toBe(403);

    const moderation = await request.get("/api/comunicacao/moderacao");
    await expect(moderation).toBeOK();
    expect((await moderation.json()).pedidos).toContainEqual(expect.objectContaining({
      id: submitted?.id, autor: expect.any(String), status: "pendente",
    }));

    expect((await request.patch(`/api/comunicacao/moderacao/${submitted?.id}`, {
      data: { status: "aprovado" },
    })).status()).toBe(204);
    expect((await request.patch(`/api/comunicacao/moderacao/${rejected.id}`, {
      data: { status: "rejeitado" },
    })).status()).toBe(204);

    const { pedidos } = await readFeed(reader);
    const published = pedidos.find(({ texto }) => texto === text);
    expect(published).toStrictEqual({
      id: submitted?.id,
      autor: null,
      anonimo: true,
      texto: text,
      criadoEm: expect.any(String),
    });
    expect(pedidos).not.toContainEqual(expect.objectContaining({ id: rejected.id }));
    expect((await readFeed(page.request)).meusPedidos).toContainEqual(expect.objectContaining({
      id: rejected.id, status: "rejeitado",
    }));

    await page.reload();
    const approvedList = page.getByRole("list", { name: "Pedidos aprovados" });
    await expect(approvedList.getByRole("listitem").filter({ hasText: text }).getByText("Anônimo", { exact: true })).toBeVisible();
    await expect(approvedList.getByText(rejectedText)).toHaveCount(0);
  } finally {
    await reader.dispose();
  }
});

test("isola avisos e pedidos do Kids e mantém a comunicação no Tutorial", async ({ page, request }) => {
  await selectProfile(request, "moderador@icsv.example", "Moderação");
  const geral = label("Aviso geral");
  const infantil = label("Aviso Kids");
  const todos = label("Aviso da igreja");
  for (const [titulo, publico] of [[geral, "geral"], [infantil, "kids"], [todos, "todos"]]) {
    const published = await request.post("/api/comunicacao/avisos", {
      data: { titulo, texto: "Aviso fictício para conferir as permissões do mural.", publico },
    });
    expect(published.status()).toBe(201);
  }

  await selectProfile(page.request, "comum@icsv.example", "Usuário comum");
  const feedGeral = await readFeed(page.request);
  expect(feedGeral.avisos.map(({ titulo }) => titulo)).toEqual(expect.arrayContaining([geral, todos]));
  expect(feedGeral.avisos.map(({ titulo }) => titulo)).not.toContain(infantil);
  expect(feedGeral.pedidos).not.toContainEqual(expect.objectContaining({
    texto: "Pelas crianças que estão começando em uma nova escola.",
  }));

  await selectProfile(page.request, "comum@icsv.example", "Kids");
  const feedKids = await readFeed(page.request);
  expect(feedKids.avisos.map(({ titulo }) => titulo)).toEqual(expect.arrayContaining([infantil, todos]));
  expect(feedKids.avisos.map(({ titulo }) => titulo)).not.toContain(geral);
  expect(feedKids.pedidos).toContainEqual(expect.objectContaining({
    texto: "Pelas crianças que estão começando em uma nova escola.", autor: null,
  }));
  expect(feedKids.pedidos).not.toContainEqual(expect.objectContaining({
    texto: "Pelas famílias que estão se adaptando a uma nova cidade.",
  }));
  expect((await page.request.get("/api/comunicacao/moderacao")).status()).toBe(403);
  expect((await page.request.post("/api/comunicacao/avisos", {
    data: { titulo: infantil, texto: "Tentativa sem permissão", publico: "kids" },
  })).status()).toBe(403);

  await page.goto("/kids");
  await expect(page.getByRole("heading", { name: "Avisos do Kids" })).toBeVisible();
  await expect(page.getByRole("heading", { name: infantil })).toBeVisible();
  await expect(page.getByRole("heading", { name: geral })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Pedidos de oração" })).toBeVisible();

  await selectProfile(page.request, "comum@icsv.example", "Tutorial do Sistema");
  await page.goto("/tutorial");
  await expect(page.getByRole("heading", { name: "Mural de lembretes e avisos" })).toBeVisible();
  await expect(page.getByRole("heading", { name: geral })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pedidos de oração" })).toBeVisible();
});

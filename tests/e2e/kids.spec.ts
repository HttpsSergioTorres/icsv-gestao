import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

type Profile = { id: string; nome: string };

test("responsável externo solicita vínculo, aceita o termo e joga no perfil Kids", async ({ request, page }) => {
  const email = `familia-${randomUUID()}@icsv.example`;
  const password = "Ficticia-Kids-2026!";
  const childId = "10000000-0000-4000-8000-000000001140";
  const childName = "Lia Nuvem (fictícia)";

  await expect(await request.post("/api/auth/login", { data: {
    email: "admin@icsv.example", password: "ICSV-demo-2026!",
  } })).toBeOK();
  const { profiles: adminProfiles } = await (await request.get("/api/auth/profile")).json() as { profiles: Profile[] };
  expect(adminProfiles).toHaveLength(1);
  await expect(await request.post("/api/auth/profile", { data: { assignmentId: adminProfiles[0].id } })).toBeOK();
  const invitation = await request.post("/api/kids/convites", { data: { criancaId: childId } });
  expect(invitation.status()).toBe(201);
  const { codigo } = await invitation.json();

  await page.goto("/responsavel/cadastro");
  await page.getByLabel("Nome completo").fill("Responsável Fictício de Teste");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Criar conta de responsável" }).click();
  await expect(page.getByText("Conta criada.", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Entrar", exact: true }).click();
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/selecionar-perfil$/);
  await expect(page.getByRole("button", { name: /Responsável Kids/ })).toBeVisible();
  expect((await page.request.get("/api/kids/vinculos")).status()).toBe(401);
  await page.getByRole("button", { name: /Responsável Kids/ }).click();
  await expect(page).toHaveURL(/\/responsavel$/);
  expect((await page.request.get("/api/pessoas")).status()).toBe(403);
  expect((await page.request.get("/api/kids/administracao")).status()).toBe(403);

  await page.getByLabel("Código de vínculo").fill(codigo);
  await page.getByRole("button", { name: "Solicitar vínculo" }).click();
  await expect(page.getByText("Aguardando confirmação", { exact: true })).toBeVisible();
  await expect(page.getByText(childName, { exact: true })).toHaveCount(0);

  const pending = await (await request.get("/api/kids/administracao")).json() as {
    vinculos: { id: string; email: string; status: string }[];
  };
  const match = pending.vinculos.find((link) => link.email === email);
  expect(match?.status).toBe("pendente");
  expect((await page.request.post(`/api/kids/vinculos/${match?.id}/aceite`, {
    data: { aceite: true, versao: "demo-2026-11" },
  })).status()).toBe(409);
  expect((await page.request.patch(`/api/kids/vinculos/${match?.id}`, {
    data: { acao: "confirmar" },
  })).status()).toBe(403);

  expect((await request.patch(`/api/kids/vinculos/${match?.id}`, {
    data: { acao: "confirmar" },
  })).status()).toBe(204);
  const beforeConsent = await (await page.request.get("/api/auth/profile")).json() as { profiles: Profile[] };
  expect(beforeConsent.profiles.map(({ nome }) => nome)).toEqual(["Responsável Kids"]);
  await page.reload();
  await expect(page.getByRole("heading", { name: childName, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Termo de demonstração/ })).toBeVisible();
  const submit = page.getByRole("button", { name: "Registrar aceite" });
  await expect(submit).toBeDisabled();
  await page.getByRole("checkbox", { name: /Li e aceito/ }).check();
  await submit.click();
  await page.getByRole("link", { name: "Selecionar Kids" }).click();
  await page.getByRole("button", { name: /^Kids / }).click();

  await expect(page).toHaveURL(/\/kids$/);
  await expect(page.getByRole("heading", { name: "Mini bíblias ilustradas" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Uma arca sobre a água/ })).toBeVisible();
  await page.getByRole("button", { name: "Próxima", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Jesus acolhe as crianças" })).toBeVisible();
  const answers = ["Uma arca", "Um arco-íris", "Recebeu e abençoou as crianças", "A tempestade se acalmou"];
  for (const [index, answer] of answers.entries()) {
    await page.getByRole("button", { name: new RegExp(answer) }).click();
    await page.getByRole("button", { name: index < answers.length - 1 ? "Próxima pergunta" : "Ver resultado" }).click();
  }
  await expect(page.getByText("Você acertou 4 de 4 perguntas.")).toBeVisible();

  expect((await request.patch(`/api/kids/vinculos/${match?.id}`, {
    data: { acao: "revogar" },
  })).status()).toBe(204);
  expect((await page.request.get("/api/comunicacao")).status()).toBe(401);
  await page.goto("/kids");
  await expect(page).toHaveURL(/\/selecionar-perfil$/);
  await expect(page.getByRole("button", { name: /^Kids / })).toHaveCount(0);
});

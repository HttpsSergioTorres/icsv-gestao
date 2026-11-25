import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { create, demoPassword, label, login } from "./support";

test("administração cria conta da sede e o usuário escolhe e troca somente seus perfis", async ({ request, page }) => {
  await login(page.request);
  await page.goto("/usuarios");
  await page.getByRole("button", { name: "Novo registro" }).click();
  const editor = page.getByRole("dialog");
  const email = `perfil-qa-${randomUUID()}@icsv.example`;
  await editor.getByLabel("Nome", { exact: true }).fill(label("Conta múltipla"));
  await editor.getByLabel("E-mail", { exact: true }).fill(email);
  await editor.getByLabel("Senha", { exact: true }).fill(demoPassword);
  const access = editor.getByRole("group", { name: "Acessos em ICSV San Vale" });
  await access.getByRole("checkbox", { name: "Usuário comum", exact: true }).check();
  await access.getByRole("checkbox", { name: "Tutorial do Sistema", exact: true }).check();
  await editor.getByRole("button", { name: "Salvar" }).click();
  await expect(editor).toBeHidden();

  const response = await request.post("/api/auth/login", { data: { email, password: demoPassword } });
  await expect(response).toBeOK();
  expect((await request.get("/api/financeiro/relatorios")).status()).toBe(401);
  const { profiles } = await (await request.get("/api/auth/profile")).json();
  expect(profiles.map(({ nome }: { nome: string }) => nome).sort()).toEqual(["Tutorial do Sistema", "Usuário comum"]);
  expect(profiles.every(({ congregacao }: { congregacao: string }) => congregacao === "ICSV San Vale")).toBeTruthy();
  expect((await request.post("/api/auth/profile", { data: { assignmentId: randomUUID() } })).status()).toBe(403);

  await page.goto("/login");
  await expect(page.locator('.auth-brand img[src="/marca/icsv-icone.png"]')).toBeVisible();
  await expect(page.locator('head link[rel="icon"][href="/marca/icsv-icone.png"]')).toHaveCount(1);
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(demoPassword);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/selecionar-perfil$/);
  await page.getByRole("button", { name: /Tutorial do Sistema/ }).click();
  await expect(page).toHaveURL(/\/tutorial$/);
  await expect(page.getByRole("heading", { name: "Tutorial do Sistema", exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Mascote Farol" })).toBeVisible();
  await expect(page.locator(".sidebar")).toHaveCSS("background-color", "rgb(11, 32, 58)");
  expect((await page.request.get("/api/financeiro/relatorios")).status()).toBe(403);
  await page.getByRole("button", { name: /Menu da conta/ }).click();
  await page.getByRole("link", { name: "Trocar perfil" }).click();
  await page.getByRole("button", { name: /Usuário comum/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(await page.request.get("/api/financeiro/relatorios")).toBeOK();
  expect((await page.request.get("/api/financeiro/painel")).status()).toBe(403);
});

test("conta sem atribuição vigente recebe orientação e não abre os módulos", async ({ request, page }) => {
  await login(request);
  const settings = await request.get("/api/auth/access");
  await expect(settings).toBeOK();
  const { congregation } = await settings.json();
  const profile = await create(request, "perfis", {
    nome: label("Perfil depois revogado"),
    escopo: "congregacao",
    permissoes: [],
  });
  const email = `sem-acesso-${randomUUID()}@icsv.example`;
  await create(request, "usuarios", {
    nome: label("Conta depois revogada"), email, senha: demoPassword,
    congregacaoId: congregation.id, acessos: [profile.id],
  });
  await expect(await request.patch(`/api/perfis/${profile.id}`, { data: { ativo: false } })).toBeOK();
  await expect(await page.request.post("/api/auth/login", {
    data: { email, password: demoPassword },
  })).toBeOK();
  await page.goto("/selecionar-perfil");
  await expect(page.getByText("Sua conta ainda não tem um acesso disponível.", { exact: false })).toBeVisible();
  expect((await page.request.get("/api/pessoas")).status()).toBe(401);
});

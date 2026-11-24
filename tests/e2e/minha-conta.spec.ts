import { expect, test } from "@playwright/test";
import { create, label, login } from "./support";

test("altera a própria senha e encerra as sessões da conta", async ({ request, page, playwright, baseURL }) => {
  await login(request);
  const perfil = await create(request, "perfis", {
    nome: label("Perfil minha conta"),
    escopo: "campo",
    permissoes: ["dashboard:read", "pessoas:read", "usuarios:read", "usuarios:write"],
  });
  const nome = label("Usuário temporário");
  const email = `${label("minha-conta").replaceAll(" ", "-").toLowerCase()}@icsv.example`;
  const senhaAtual = "Senha-atual-temporaria-QA!";
  const novaSenha = "Nova-senha-temporaria-QA!";
  const usuario = await create(request, "usuarios", { nome, email, senha: senhaAtual, perfilId: perfil.id });
  const recuperacao = await request.post("/api/auth/recovery", { data: { email } });
  await expect(recuperacao).toBeOK();
  const { token } = await recuperacao.json();

  const outraSessao = await playwright.request.newContext({ baseURL });
  try {
    for (const context of [page.request, outraSessao]) {
      await expect(await context.post("/api/auth/login", {
        data: { email, password: senhaAtual },
      })).toBeOK();
    }

    const alteracaoAdministrativa = await outraSessao.patch(`/api/usuarios/${usuario.id}`, { data: { senha: novaSenha } });
    expect(alteracaoAdministrativa.status()).toBe(400);

    const falha = await outraSessao.post("/api/auth/password", {
      data: { currentPassword: "Senha-errada-QA!", newPassword: novaSenha },
    });
    expect(falha.status()).toBe(400);
    await expect(await outraSessao.get("/api/pessoas")).toBeOK();

    await page.goto("/");
    await page.getByRole("button", { name: new RegExp(nome) }).click();
    await page.getByRole("link", { name: "Minha conta" }).click();
    await expect(page).toHaveURL(/\/minha-conta$/);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel("Senha atual", { exact: true }).fill(senhaAtual);
    await page.getByLabel("Nova senha", { exact: true }).fill(novaSenha);
    await page.getByLabel("Confirmar nova senha", { exact: true }).fill(novaSenha);
    await page.getByRole("button", { name: "Alterar senha" }).click();

    await expect(page).toHaveURL(/\/login\?senha=alterada$/);
    await expect(page.getByRole("status")).toHaveText("Senha alterada. Entre novamente com a nova senha.");
    expect((await page.request.get("/api/pessoas")).status()).toBe(401);
    expect((await outraSessao.get("/api/pessoas")).status()).toBe(401);
    expect((await outraSessao.post("/api/auth/password", {
      data: { currentPassword: novaSenha, newPassword: senhaAtual },
    })).status()).toBe(401);
    expect((await outraSessao.post("/api/auth/reset", {
      data: { token, password: "Recuperacao-temporaria-QA!" },
    })).status()).toBe(400);

    expect((await outraSessao.post("/api/auth/login", {
      data: { email, password: senhaAtual },
    })).status()).toBe(401);
    await expect(await outraSessao.post("/api/auth/login", {
      data: { email, password: novaSenha },
    })).toBeOK();
  } finally {
    await outraSessao.dispose();
  }
});

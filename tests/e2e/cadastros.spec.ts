import { expect, test } from "@playwright/test";
import { adminEmail, create, demoPassword, label, list, login, secretaryEmail } from "./support";

test("protege a API, permite login e encerra a sessão", async ({ request }) => {
  expect((await request.get("/api/congregacoes")).status()).toBe(401);

  const wrongPassword = await request.post("/api/auth/login", {
    data: { email: adminEmail, password: `${demoPassword}incorreta` },
  });
  expect(wrongPassword.status()).toBe(401);

  const user = await login(request);
  expect(user.email).toBe(adminEmail);
  const response = await request.get("/api/auth/session");
  await expect(response).toBeOK();
  expect((await response.json()).user.id).toBe(user.id);

  expect((await request.post("/api/auth/logout")).status()).toBe(204);
  expect((await request.get("/api/congregacoes")).status()).toBe(401);
});

test("persiste congregação sem CNPJ, pessoa e ministério vinculados", async ({ request }) => {
  await login(request);
  const congregacao = await create(request, "congregacoes", { nome: label("Congregação"), ativo: true });
  const pessoa = await create(request, "pessoas", {
    nome: label("Pessoa"),
    tipo: "membro",
    congregacaoId: congregacao.id,
    ativo: true,
  });
  const ministerio = await create(request, "ministerios", {
    nome: label("Ministério"),
    tipo: "ministerio",
    congregacaoId: congregacao.id,
    ativo: true,
  });

  const nome = label("Pessoa atualizada");
  const edit = await request.patch(`/api/pessoas/${pessoa.id}`, { data: { nome } });
  await expect(edit).toBeOK();

  await request.post("/api/auth/logout");
  await login(request);
  expect(await list(request, "congregacoes")).toContainEqual(expect.objectContaining({
    id: congregacao.id, nome: congregacao.nome, ativo: true,
  }));
  expect(await list(request, "pessoas")).toContainEqual(expect.objectContaining({
    id: pessoa.id, nome, congregacaoId: congregacao.id,
  }));
  expect(await list(request, "ministerios")).toContainEqual(expect.objectContaining({
    id: ministerio.id, congregacaoId: congregacao.id,
  }));
  const historico = await request.get(`/api/pessoas/${pessoa.id}/historico`);
  await expect(historico).toBeOK();
  expect((await historico.json()).items).toContainEqual(expect.objectContaining({
    action: "update", fields: expect.arrayContaining(["nome"]),
  }));

  expect((await request.delete(`/api/congregacoes/${congregacao.id}`)).status()).toBe(204);
  expect(await list(request, "congregacoes")).toContainEqual(expect.objectContaining({
    id: congregacao.id, ativo: false,
  }));
});

test("aplica escopo por congregação e impede acesso indevido ao financeiro", async ({ request, playwright, baseURL }) => {
  await login(request);
  const outraCongregacao = await create(request, "congregacoes", { nome: label("Outra congregação"), ativo: true });
  const pessoaExterna = await create(request, "pessoas", {
    nome: label("Pessoa externa"),
    tipo: "membro",
    congregacaoId: outraCongregacao.id,
    ativo: true,
  });

  const secretaria = await playwright.request.newContext({ baseURL });
  try {
    const user = await login(secretaria, secretaryEmail);
    expect(user.congregacaoId).toBeTruthy();
    expect(await list(secretaria, "congregacoes")).toEqual([
      expect.objectContaining({ id: user.congregacaoId }),
    ]);
    expect(await list(secretaria, "pessoas")).not.toContainEqual(expect.objectContaining({ id: pessoaExterna.id }));

    expect((await secretaria.get(`/api/pessoas/${pessoaExterna.id}`)).status()).toBe(404);
    expect((await secretaria.patch(`/api/pessoas/${pessoaExterna.id}`, {
      data: { nome: "Alteração fora do escopo" },
    })).status()).toBe(404);
    expect((await secretaria.delete(`/api/pessoas/${pessoaExterna.id}`)).status()).toBe(404);
    expect((await secretaria.post("/api/pessoas", {
      data: { nome: label("Pessoa"), tipo: "membro", congregacaoId: outraCongregacao.id, ativo: true },
    })).status()).toBe(404);

    expect((await secretaria.get("/api/movimentacoes")).status()).toBe(403);
    expect((await secretaria.get("/api/usuarios")).status()).toBe(403);
  } finally {
    await secretaria.dispose();
  }
});

test("redefine senha por código administrativo de uso único e revoga a sessão anterior", async ({ request, playwright, baseURL }) => {
  await login(request);
  const congregacao = await create(request, "congregacoes", { nome: label("Congregação recuperação") });
  const perfil = await create(request, "perfis", {
    nome: label("Perfil recuperação"),
    escopo: "congregacao",
    permissoes: ["pessoas:read"],
  });
  const email = `${label("recuperacao").replaceAll(" ", "-").toLowerCase()}@icsv.example`;
  const senha = "Senha-inicial-QA!";
  const novaSenha = "Senha-redefinida-QA!";
  const usuario = await create(request, "usuarios", {
    nome: label("Usuário recuperação"),
    email,
    senha,
    perfilId: perfil.id,
    congregacaoId: congregacao.id,
  });
  expect(usuario).not.toHaveProperty("senha");

  const conta = await playwright.request.newContext({ baseURL });
  try {
    await login(conta, email, senha);
    await expect(await conta.get("/api/pessoas")).toBeOK();
    expect((await conta.post("/api/pessoas", {
      data: { nome: "Cadastro sem permissão", congregacaoId: congregacao.id },
    })).status()).toBe(403);
    expect((await conta.post("/api/auth/recovery", { data: { email } })).status()).toBe(403);

    const recovery = await request.post("/api/auth/recovery", { data: { email } });
    await expect(recovery).toBeOK();
    const { token } = await recovery.json();
    expect(typeof token).toBe("string");

    const resetData = { data: { token, password: novaSenha } };
    expect((await conta.post("/api/auth/reset", resetData)).status()).toBe(204);
    expect((await conta.get("/api/pessoas")).status()).toBe(401);
    expect((await conta.post("/api/auth/reset", resetData)).status()).toBe(400);
    expect((await conta.post("/api/auth/login", { data: { email, password: senha } })).status()).toBe(401);
    await login(conta, email, novaSenha);
  } finally {
    await conta.dispose();
  }
});

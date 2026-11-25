import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { financeSections } from "../../src/lib/domain/finance";
import { create, demoPassword, label } from "./support";

async function financeLogin(request: APIRequestContext, email: string, profileName: string) {
  await expect(await request.post("/api/auth/login", { data: { email, password: demoPassword } })).toBeOK();
  const response = await request.get("/api/auth/profile");
  await expect(response).toBeOK();
  const { profiles } = await response.json() as { profiles: { id: string; nome: string; congregacaoId: string }[] };
  const profile = profiles.find(({ nome }) => nome === profileName);
  if (!profile) throw new Error(`Perfil de demonstração indisponível: ${profileName}`);
  await expect(await request.post("/api/auth/profile", { data: { assignmentId: profile.id } })).toBeOK();
  return profile.congregacaoId;
}

test("perfil comum consulta só o relatório financeiro da sua congregação", async ({ page }) => {
  await financeLogin(page.request, "comum@icsv.example", "Usuário comum");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/financeiro/relatorios");
  await expect(page.getByRole("heading", { name: "Resultado mensal" })).toBeVisible();
  await page.getByRole("button", { name: "Abrir menu" }).click();
  const menu = page.getByRole("navigation", { name: "Navegação principal" });
  const section = menu.locator("section").filter({ has: page.getByRole("heading", { name: "Financeiro", exact: true }) });
  await expect(section.getByRole("link")).toHaveCount(1);
  await expect(section.getByRole("link", { name: "Relatórios" })).toHaveAttribute("href", "/financeiro/relatorios");

  const report = await page.request.get("/api/financeiro/relatorios");
  await expect(report).toBeOK();
  const result = await report.json();
  expect(result.secao).toBe("relatorios");
  expect(result.relatorio.totais.registros).toBeGreaterThan(0);
  expect(result).not.toHaveProperty("contas");
  expect(result).not.toHaveProperty("movimentos");
  expect(result).not.toHaveProperty("extratos");
  expect((await page.request.get("/api/financeiro/relatorios", {
    params: { congregacaoId: randomUUID() },
  })).status()).toBe(403);

  for (const { slug } of financeSections.filter(({ slug }) => slug !== "relatorios")) {
    expect((await page.request.get(`/api/financeiro/${slug}`)).status()).toBe(403);
  }
  expect((await page.request.get("/api/movimentacoes")).status()).toBe(403);
  expect((await page.request.post("/api/financeiro/extratos-e-saldos", {
    data: { nome: "Conta bloqueada", referencia: "BLOQUEADA", saldoInicial: 0 },
  })).status()).toBe(403);
  expect((await page.request.patch("/api/financeiro/prestacao-de-contas", {
    data: { movimentoId: randomUUID(), segmento: "campo", contaId: null },
  })).status()).toBe(403);
  await page.goto("/financeiro/painel");
  await expect(page.getByRole("heading", { name: "Acesso restrito" })).toBeVisible();
});

test("administrador financeiro vê as oito seções e concilia lançamentos no extrato", async ({ page }) => {
  const request = page.request;
  const congregacaoId = await financeLogin(request, "financeiro@icsv.example", "Financeiro");
  await page.goto("/financeiro/painel");
  await expect(page.getByRole("heading", { name: "Resultado por segmento" })).toBeVisible();
  const menu = page.getByRole("navigation", { name: "Navegação principal" });
  const section = menu.locator("section").filter({ has: page.getByRole("heading", { name: "Financeiro", exact: true }) });
  await expect(section.getByRole("link")).toHaveCount(8);

  for (const { slug } of financeSections) {
    await expect(await request.get(`/api/financeiro/${slug}`)).toBeOK();
    await expect(section.locator(`a[href="/financeiro/${slug}"]`)).toHaveCount(1);
  }

  const conta = await request.post("/api/financeiro/extratos-e-saldos", {
    data: { nome: label("Conta simulada"), referencia: `FIC-${randomUUID().slice(0, 8)}`, saldoInicial: 50 },
  });
  expect(conta.status()).toBe(201);
  const { id: contaId } = await conta.json();
  const receita = await create(request, "categorias", { nome: label("Receita"), congregacaoId, tipo: "receita" });
  const despesa = await create(request, "categorias", { nome: label("Despesa"), congregacaoId, tipo: "despesa" });
  const entrada = await create(request, "movimentacoes", {
    congregacaoId, descricao: label("Crédito simulado"), categoriaId: receita.id, tipo: "receita", valor: 210.45, data: "2048-06-05",
  });
  const saida = await create(request, "movimentacoes", {
    congregacaoId, descricao: label("Débito simulado"), categoriaId: despesa.id, tipo: "despesa", valor: 40.19, data: "2048-06-06",
  });

  for (const { id: movimentoId } of [entrada, saida]) {
    await expect(await request.patch("/api/financeiro/prestacao-de-contas", {
      data: { movimentoId, segmento: "caeb", contaId },
    })).toBeOK();
  }
  const response = await request.get("/api/financeiro/extratos-e-saldos", { params: { de: "2048-06-06", ate: "2048-06-30" } });
  await expect(response).toBeOK();
  const { extratos } = await response.json() as { extratos: { id: string }[] };
  expect(extratos.find(({ id }) => id === contaId)).toMatchObject({
    saldoAnterior: 260.45,
    totais: { receitas: 0, despesas: 40.19, saldo: -40.19, registros: 1 },
    saldoFinal: 220.26,
    lancamentos: [{ id: saida.id, saldo: 220.26 }],
  });

  const caeb = await request.get("/api/financeiro/caeb");
  await expect(caeb).toBeOK();
  expect((await caeb.json()).movimentos).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: entrada.id, segmento: "caeb" }),
    expect.objectContaining({ id: saida.id, segmento: "caeb" }),
  ]));
});

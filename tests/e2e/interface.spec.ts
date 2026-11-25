import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { adminEmail, create, demoPassword, label, list, login, secretaryEmail } from "./support";

test("autentica pela interface e mantém cadastro após recarregar", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("E-mail").fill(adminEmail);
  await page.getByLabel("Senha", { exact: true }).fill(demoPassword);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/selecionar-perfil$/);
  await page.getByRole("button", { name: /Administrador geral do campo/ }).click();

  const menu = page.getByRole("navigation", { name: "Navegação principal" });
  await expect(menu.getByRole("link", { name: "Painel geral" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Indicadores" })).toBeVisible();
  await expect(page.locator(".metric-card").filter({ hasText: "Membros ativos" })).toBeVisible();
  await menu.getByRole("link", { name: "Congregações" }).click();
  await expect(page).toHaveURL(/\/congregacoes$/);

  const nome = label("Congregação pela interface");
  await page.getByRole("button", { name: "Novo registro" }).click();
  const formulario = page.getByRole("dialog");
  await formulario.getByLabel(/nome/i).fill(nome);
  await formulario.getByRole("button", { name: "Salvar" }).click();
  await expect(formulario).toBeHidden();

  await page.reload();
  await expect(page.getByRole("row").filter({ hasText: nome })).toBeVisible();
});

test("oferece navegação móvel e oculta módulos fora do perfil", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(secretaryEmail);
  await page.getByLabel("Senha", { exact: true }).fill(demoPassword);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/selecionar-perfil$/);
  await page.getByRole("button", { name: /Secretaria/ }).click();

  await page.getByRole("button", { name: "Abrir menu" }).click();
  const menu = page.getByRole("navigation", { name: "Navegação principal" });
  await expect(menu.getByRole("link", { name: "Pessoas" })).toBeVisible();
  const financeiro = menu.locator("section").filter({ has: page.getByRole("heading", { name: "Financeiro", exact: true }) });
  await expect(financeiro.getByRole("link")).toHaveText(["Relatórios"]);
  await menu.getByRole("link", { name: "Pessoas" }).click();

  await expect(page).toHaveURL(/\/pessoas$/);
  await expect(page.getByRole("button", { name: "Abrir menu" })).toHaveAttribute("aria-expanded", "false");
  await page.goto("/movimentacoes");
  await expect(page.getByRole("heading", { name: "Acesso restrito" })).toBeVisible();
});

test("filtra relatório por congregação e baixa CSV com os dados selecionados", async ({ page }) => {
  await login(page.request);
  const congregacao = await create(page.request, "congregacoes", { nome: label("Congregação CSV") });
  const outraCongregacao = await create(page.request, "congregacoes", { nome: label("Congregação fora do filtro") });
  await create(page.request, "pessoas", { nome: label("Membro"), tipo: "membro", congregacaoId: congregacao.id });

  await page.goto("/relatorios");
  await page.getByRole("combobox", { name: "Congregação", exact: true }).selectOption(congregacao.id);
  await expect(page.getByRole("rowheader", { name: String(congregacao.nome) })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: String(outraCongregacao.nome) })).toHaveCount(0);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("icsv-relatorios.csv");
  const csv = await readFile(await download.path(), "utf8");
  expect(csv).toContain("Membros ativos");
  expect(csv).toContain(String(congregacao.nome));
  expect(csv).not.toContain(String(outraCongregacao.nome));
});

test("exibe atividade recorrente nos calendários mensal e semanal", async ({ page }) => {
  await login(page.request);
  const congregacao = await create(page.request, "congregacoes", { nome: label("Congregação agenda") });
  const outraCongregacao = await create(page.request, "congregacoes", { nome: label("Congregação sem atividade") });
  const mes = new Intl.DateTimeFormat("sv-SE", {
    year: "numeric", month: "2-digit", timeZone: "America/Sao_Paulo",
  }).format(new Date());
  const titulo = label("Atividade recorrente");
  await create(page.request, "eventos", {
    congregacaoId: congregacao.id,
    titulo,
    tipo: "reuniao",
    inicio: `${mes}-01T18:00:00-03:00`,
    fim: `${mes}-01T19:00:00-03:00`,
    recorrencia: "semanal",
    recorrenciaAte: `${mes}-22`,
  });

  await page.goto("/agenda");
  await expect(page.getByRole("heading", { name: "Agenda", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Congregação", exact: true }).selectOption(congregacao.id);
  const calendario = page.getByRole("region", { name: "Calendário de atividades" });
  const ocorrencias = calendario.getByRole("button").filter({ hasText: titulo });
  await expect(ocorrencias).toHaveCount(4);
  await ocorrencias.first().click();

  const detalhes = page.getByRole("region", { name: "Atividades do dia selecionado" });
  await expect(detalhes.getByText(titulo, { exact: true })).toBeVisible();

  await calendario.getByRole("button", { name: "Semana" }).click();
  await expect(calendario.getByRole("button", { name: "Semana" })).toHaveAttribute("aria-pressed", "true");
  await expect(ocorrencias).toHaveCount(1);

  await page.getByRole("combobox", { name: "Congregação", exact: true }).selectOption(outraCongregacao.id);
  await expect(ocorrencias).toHaveCount(0);
});


test("mantém pessoa ativa ao cadastrar com filtro e preserva campo editado em paralelo", async ({ page }) => {
  await login(page.request);
  const congregacao = await create(page.request, "congregacoes", { nome: label("Congregação para cadastro") });
  const nome = label("Pessoa com filtro");
  await page.goto("/pessoas");
  await page.getByRole("combobox", { name: "Ativo", exact: true }).selectOption("true");
  await page.getByRole("button", { name: "Novo registro" }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByRole("checkbox", { name: "Ativo", exact: true })).toBeChecked();
  await dialogo.getByLabel("Nome", { exact: true }).fill(nome);
  await dialogo.getByRole("combobox", { name: "Congregação", exact: true }).selectOption(congregacao.id);
  await dialogo.getByRole("button", { name: "Salvar" }).click();
  await expect(dialogo).toBeHidden();

  const linha = page.getByRole("row").filter({ hasText: nome });
  await expect(linha).toBeVisible();
  const pessoa = (await list(page.request, "pessoas")).find((item) => item.nome === nome);
  if (!pessoa) throw new Error("Cadastro de teste não encontrado.");
  expect(pessoa.ativo).toBe(true);

  await linha.getByRole("button", { name: "Editar", exact: true }).click();
  const novoNome = label("Pessoa editada");
  await dialogo.getByLabel("Nome", { exact: true }).fill(novoNome);
  const telefone = "(00) 90000-0000";
  await expect(await page.request.patch(`/api/pessoas/${pessoa.id}`, {
    data: { telefone },
  })).toBeOK();
  await dialogo.getByRole("button", { name: "Salvar" }).click();
  await expect(dialogo).toBeHidden();

  const atualizada = page.getByRole("row").filter({ hasText: novoNome });
  await atualizada.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(dialogo.getByLabel("Telefone", { exact: true })).toHaveValue(telefone);
});

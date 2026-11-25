import { expect, test } from "@playwright/test";
import { login } from "./support";

test("mantém os controles do menu móvel ocultos no desktop, inclusive ao passar o mouse", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page.request);
  await page.goto("/");

  const navegacao = page.getByRole("navigation", { name: "Navegação principal" });
  const marca = page.getByRole("link", { name: "ICSV Gestão, painel geral" });
  const painel = navegacao.getByRole("link", { name: "Painel geral", exact: true });
  await expect(painel).toBeVisible();
  for (const alvo of [marca, painel]) {
    await alvo.hover();
    await expect(painel).toBeVisible();
    await expect(page.locator(".sidebar-close")).toBeHidden();
    await expect(page.locator(".sidebar-overlay")).toBeHidden();
    await expect(page.getByRole("button", { name: "Abrir menu" })).toBeHidden();
  }
});

test("abre e fecha o menu móvel pelo teclado, pelo botão, pelo fundo e ao navegar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page.request);
  await page.goto("/");

  const abrir = page.locator('button[aria-controls="menu-principal"]');
  const menu = page.getByRole("dialog", { name: "Menu principal" });
  const fechar = menu.getByRole("button", { name: "Fechar menu" });
  const fundo = page.locator(".sidebar-overlay");
  const navegacao = page.getByRole("navigation", { name: "Navegação principal" });
  await expect(abrir).toHaveAttribute("aria-expanded", "false");
  await expect(navegacao).toBeHidden();
  await expect(fundo).toBeHidden();

  await abrir.click();
  await expect(abrir).toHaveAttribute("aria-expanded", "true");
  await expect(menu).toBeVisible();
  await expect(fechar).toBeFocused();
  await expect(fundo).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(menu.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(navegacao).toBeHidden();
  await expect(abrir).toBeFocused();

  await abrir.click();
  await fechar.click();
  await expect(menu).toBeHidden();
  await expect(abrir).toBeFocused();

  await abrir.click();
  await expect(fundo).toBeVisible();
  await fundo.click({ position: { x: 380, y: 560 } });
  await expect(menu).toBeHidden();
  await expect(fundo).toBeHidden();
  await expect(abrir).toBeFocused();

  await abrir.click();
  await menu.getByRole("link", { name: "Pessoas", exact: true }).click();
  await expect(page).toHaveURL(/\/pessoas$/);
  await expect(menu).toBeHidden();
  await expect(abrir).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("main")).toBeFocused();

  await abrir.click();
  await expect(fechar).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(menu).toBeHidden();
  await expect(navegacao).toBeVisible();
  await expect(page.locator(".sidebar-close")).toBeHidden();
  await expect(page.getByRole("link", { name: "ICSV Gestão, painel geral" })).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(navegacao).toBeHidden();
  await expect(abrir).toHaveAttribute("aria-expanded", "false");
});

test("carrega pela navegação os cadastros, a agenda e os relatórios", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page.request);
  await page.goto("/");

  const navegacao = page.getByRole("navigation", { name: "Navegação principal" });
  const conteudo = page.getByRole("main");
  const destinos = [
    ["Congregações", "Congregações"],
    ["Pessoas", "Pessoas"],
    ["Ministérios", "Ministérios e departamentos"],
    ["Equipes", "Equipes"],
    ["Inscrições", "Inscrições e presenças"],
    ["Tipos de serviço", "Tipos de serviço"],
    ["Escalas", "Escalas de serviço"],
    ["Projetos", "Projetos"],
    ["Tarefas", "Tarefas"],
    ["Usuários", "Usuários"],
    ["Perfis de acesso", "Perfis de acesso"],
  ];

  for (const [link, titulo] of destinos) {
    await navegacao.getByRole("link", { name: link, exact: true }).click();
    await expect(conteudo.getByRole("heading", { name: titulo, level: 1, exact: true })).toBeVisible();
    await expect(conteudo.getByRole("searchbox", { name: "Buscar registros" })).toBeVisible();
  }

  await navegacao.getByRole("link", { name: "Agenda e eventos", exact: true }).click();
  await expect(conteudo.getByRole("region", { name: "Calendário de atividades" })).toBeVisible();
  await conteudo.getByRole("link", { name: "Gerenciar atividades" }).click();
  await expect(conteudo.getByRole("heading", { name: "Atividades", level: 1 })).toBeVisible();
  await expect(conteudo.getByRole("searchbox", { name: "Buscar registros" })).toBeVisible();

  await navegacao.getByRole("link", { name: "Prestação de contas", exact: true }).click();
  await expect(conteudo.getByRole("heading", { name: "Prestação de contas", level: 1 })).toBeVisible();
  await navegacao.getByRole("link", { name: "Cadastros", exact: true }).click();
  await expect(conteudo.getByRole("heading", { name: "Cadastros", level: 1 })).toBeVisible();

  await navegacao.locator('a[href="/relatorios"]').click();
  await expect(conteudo.getByRole("heading", { name: "Resumo", exact: true })).toBeVisible();
  await navegacao.getByRole("link", { name: "Painel geral", exact: true }).click();
  await expect(conteudo.getByRole("heading", { name: "Painel geral", level: 1 })).toBeVisible();
  await expect(conteudo.locator(".metric-card").filter({ hasText: "Membros ativos" })).toBeVisible();
});

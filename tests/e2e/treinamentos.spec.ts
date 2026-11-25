import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import type { TrainingDetail, TrainingProgress } from "../../src/lib/server/training-types";
import { create, demoPassword, label, login } from "./support";

const headquartersId = "10000000-0000-4000-8000-000000000100";
const ministryId = "10000000-0000-4000-8000-000000000300";
const volunteerProfileId = "10000000-0000-4000-8000-000000000007";

async function chooseProfile(request: APIRequestContext, email: string, profileName: string) {
  await expect(await request.post("/api/auth/login", { data: { email, password: demoPassword } })).toBeOK();
  const choices = await request.get("/api/auth/profile");
  await expect(choices).toBeOK();
  const { profiles } = await choices.json() as { profiles: { id: string; nome: string }[] };
  const assignment = profiles.find(({ nome }) => nome === profileName);
  expect(assignment).toBeDefined();
  await expect(await request.post("/api/auth/profile", { data: { assignmentId: assignment!.id } })).toBeOK();
}

async function makeCourse(admin: APIRequestContext, prefix: string) {
  const title = label(prefix);
  const response = await admin.post("/api/treinamentos", { data: {
    ministerioId: ministryId,
    titulo: title,
    notaMinima: 70,
    publicado: true,
    aulas: [{ titulo: "Preparação", conteudo: "Leia as orientações de atendimento." }],
    questoes: [{ enunciado: "Qual é a primeira ação?", opcoes: ["Consultar as orientações", "Ignorar as orientações"], gabarito: 0 }],
  } });
  expect(response.status()).toBe(201);
  const { id } = await response.json() as { id: string };
  return { id, title };
}

async function getCourse(request: APIRequestContext, id: string) {
  const response = await request.get(`/api/treinamentos/${id}`);
  await expect(response).toBeOK();
  const detail = await response.json() as TrainingDetail;
  for (const question of detail.course.questoes) {
    expect(Object.keys(question).sort()).toEqual(["enunciado", "id", "opcoes"]);
  }
  return detail;
}

test("restringe os cursos ao ministério, mantém o gabarito no servidor e bloqueia a quarta tentativa", async ({
  request, playwright, baseURL,
}) => {
  await login(request);
  const { id } = await makeCourse(request, "Limite de tentativas");
  await getCourse(request, id);
  const volunteer = await playwright.request.newContext({ baseURL });
  const outsider = await playwright.request.newContext({ baseURL });
  try {
    await chooseProfile(volunteer, "voluntario@icsv.example", "Voluntário");
    const detail = await getCourse(volunteer, id);
    expect(detail.progresso?.tentativasRestantes).toBe(3);

    const outsiderEmail = `treinamento-sem-equipe-${randomUUID()}@icsv.example`;
    await create(request, "usuarios", {
      nome: label("Conta sem equipe"), email: outsiderEmail, senha: demoPassword,
      congregacaoId: headquartersId, acessos: [volunteerProfileId],
    });
    await chooseProfile(outsider, outsiderEmail, "Voluntário");
    const outsiderCatalog = await outsider.get("/api/treinamentos");
    await expect(outsiderCatalog).toBeOK();
    expect((await outsiderCatalog.json()).courses).toEqual([]);
    expect((await outsider.get(`/api/treinamentos/${id}`)).status()).toBe(404);
    expect((await volunteer.patch(`/api/treinamentos/${id}`, { data: { titulo: "Tentativa de edição" } })).status()).toBe(403);

    const wrongAnswer = { questaoId: detail.course.questoes[0].id, opcao: 1 };
    const invalid = await volunteer.post(`/api/treinamentos/${id}`, { data: {
      acao: "enviar-questionario", envioId: randomUUID(), respostas: [wrongAnswer, wrongAnswer],
    } });
    expect(invalid.status()).toBe(400);
    expect((await getCourse(volunteer, id)).progresso?.tentativasRestantes).toBe(3);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const submission = { acao: "enviar-questionario", envioId: randomUUID(), respostas: [wrongAnswer] };
      const response = await volunteer.post(`/api/treinamentos/${id}`, { data: submission });
      await expect(response).toBeOK();
      const { progresso } = await response.json() as { progresso: TrainingProgress };
      expect(progresso.tentativasRestantes).toBe(3 - attempt);
      expect(progresso.tentativas).toHaveLength(attempt);
      expect(progresso.tentativas.at(-1)).toMatchObject({ ordem: attempt, nota: 0, aprovada: false });
      expect(progresso.certificado).toBeNull();
      if (attempt === 1) {
        const retried = await volunteer.post(`/api/treinamentos/${id}`, { data: submission });
        await expect(retried).toBeOK();
        expect((await retried.json()).progresso.tentativas).toHaveLength(1);
      }
    }

    const fourth = await volunteer.post(`/api/treinamentos/${id}`, { data: {
      acao: "enviar-questionario", envioId: randomUUID(), respostas: [wrongAnswer],
    } });
    expect(fourth.status()).toBe(409);
    expect((await getCourse(volunteer, id)).progresso).toMatchObject({
      status: "nao_concluido", tentativasRestantes: 0, certificado: null,
    });
  } finally {
    await volunteer.dispose();
    await outsider.dispose();
  }
});

test("libera o certificado individual após aprovação e conclusão das aulas obrigatórias", async ({ request, page }) => {
  await login(request);
  const { id, title } = await makeCourse(request, "Conclusão do voluntariado");
  const name = label("Voluntária para certificar");
  const person = await create(request, "pessoas", { nome: name, tipo: "voluntario", congregacaoId: headquartersId });
  await create(request, "equipes", { pessoaId: person.id, ministerioId: ministryId, congregacaoId: headquartersId });
  const email = `certificado-${randomUUID()}@icsv.example`;
  await create(request, "usuarios", {
    nome: name, email, senha: demoPassword, congregacaoId: headquartersId, pessoaId: person.id,
    acessos: [volunteerProfileId],
  });
  await chooseProfile(page.request, email, "Voluntário");

  await page.goto(`/treinamentos/${id}`);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("radio", { name: "Consultar as orientações" }).check();
  await page.getByRole("button", { name: "Entregar questionário" }).click();
  await expect(page.getByText("Questionário aprovado", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Certificado de conclusão" })).toHaveCount(0);
  const approved = await getCourse(page.request, id);
  expect(approved.progresso).toMatchObject({ status: "aprovado", tentativasRestantes: 0, certificado: null });
  expect(approved.progresso?.tentativas).toMatchObject([{ ordem: 1, nota: 100, aprovada: true }]);

  const resubmit = await page.request.post(`/api/treinamentos/${id}`, { data: {
    acao: "enviar-questionario", envioId: randomUUID(), respostas: [{ questaoId: approved.course.questoes[0].id, opcao: 0 }],
  } });
  expect(resubmit.status()).toBe(409);
  await page.getByRole("button", { name: "Concluir aula" }).click();
  await expect(page.getByRole("heading", { name: "Certificado de conclusão" })).toBeVisible();
  await page.reload();
  const certificate = page.getByRole("article", { name: "Certificado de conclusão" });
  await expect(certificate).toContainText(name);
  await expect(certificate).toContainText(title);
  await expect(certificate).toContainText("Recepção");
  await expect(certificate).toContainText("Data de conclusão");
  const completed = await getCourse(page.request, id);
  expect(completed.progresso).toMatchObject({ status: "concluido", certificado: { nome: name, curso: title } });
});

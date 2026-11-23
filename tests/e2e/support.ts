import { randomUUID } from "node:crypto";
import { expect, type APIRequestContext } from "@playwright/test";

// Contas fictícias criadas pelo seed de desenvolvimento.
export const adminEmail = "admin@icsv.example";
export const secretaryEmail = "secretaria@icsv.example";
export const demoPassword = "ICSV-demo-2026!";

export function label(prefix: string) {
  return `${prefix} QA ${randomUUID().slice(0, 8)}`;
}

type SessionUser = {
  id: string;
  email: string;
  congregacaoId: string | null;
};

export async function login(request: APIRequestContext, email = adminEmail) {
  const response = await request.post("/api/auth/login", {
    data: { email, password: demoPassword },
  });
  await expect(response).toBeOK();
  return (await response.json()).user as SessionUser;
}

type Item = Record<string, unknown> & { id: string };

export async function list(request: APIRequestContext, resource: string) {
  const response = await request.get(`/api/${resource}`);
  await expect(response).toBeOK();
  return (await response.json()).items as Item[];
}

export async function create(request: APIRequestContext, resource: string, data: Record<string, unknown>) {
  const response = await request.post(`/api/${resource}`, { data });
  await expect(response).toBeOK();
  return (await response.json()).item as Item;
}

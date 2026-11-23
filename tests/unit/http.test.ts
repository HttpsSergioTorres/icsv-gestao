import { describe, expect, it } from "vitest";
import { ApiError, api, guardOrigin, json } from "@/lib/server/http";

describe("segurança das operações HTTP", () => {
  const url = "https://icsv.example/api/pessoas";

  it("aceita origem correspondente ao aplicativo", () => {
    const request = new Request(url, {
      method: "POST",
      headers: { origin: "https://icsv.example", "sec-fetch-site": "same-origin" },
    });
    expect(() => guardOrigin(request)).not.toThrow();
  });

  it("recusa origem externa com erro 403", async () => {
    const request = new Request(url, {
      method: "POST",
      headers: { origin: "https://externo.example", "sec-fetch-site": "cross-site" },
    });
    const response = await api(async () => {
      guardOrigin(request);
      return new Response(null, { status: 204 });
    });
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: "A origem da requisição não é permitida.",
    });
  });

  it("recusa corpo JSON incompleto com erro 400", async () => {
    const request = new Request(url, { method: "POST", body: "{" });
    await expect(json(request.clone())).rejects.toBeInstanceOf(ApiError);
    const response = await api(async () => {
      await json(request);
      return new Response(null, { status: 204 });
    });
    expect(response.status).toBe(400);
  });
});

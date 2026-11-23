import { describe, expect, it } from "vitest";
import { expandOccurrences } from "@/lib/domain/occurrences";

const weekly = {
  titulo: "Culto de teste",
  inicio: "2030-04-10T18:00:00-03:00",
  fim: "2030-04-10T20:00:00-03:00",
  recorrencia: "semanal",
  recorrenciaAte: "2030-04-24",
};

describe("ocorrências recorrentes", () => {
  it("inclui a ocorrência na data limite e preserva os demais dados", () => {
    const events = expandOccurrences(weekly);
    expect(events.map(({ inicio }) => inicio)).toEqual([
      "2030-04-10T21:00:00.000Z",
      "2030-04-17T21:00:00.000Z",
      "2030-04-24T21:00:00.000Z",
    ]);
    expect(events[1]).toMatchObject({
      titulo: weekly.titulo,
      fim: "2030-04-17T23:00:00.000Z",
    });
  });

  it("retorna somente interseções com a janela solicitada", () => {
    const events = expandOccurrences(
      weekly,
      new Date("2030-04-10T23:00:00Z"),
      new Date("2030-04-24T21:00:00Z"),
    );
    expect(events).toHaveLength(1);
    expect(events[0].inicio).toBe("2030-04-17T21:00:00.000Z");
  });

  it("limita o dia do mês quando necessário e recupera o dia original no mês seguinte", () => {
    const events = expandOccurrences({
      inicio: "2030-01-31T20:30:00-03:00",
      fim: "2030-01-31T22:30:00-03:00",
      recorrencia: "mensal",
      recorrenciaAte: "2030-03-31",
    });
    expect(events.map(({ inicio, fim }) => [inicio, fim])).toEqual([
      ["2030-01-31T23:30:00.000Z", "2030-02-01T01:30:00.000Z"],
      ["2030-02-28T23:30:00.000Z", "2030-03-01T01:30:00.000Z"],
      ["2030-03-31T23:30:00.000Z", "2030-04-01T01:30:00.000Z"],
    ]);
  });

  it("interpreta horários locais em UTC−03:00 e aplica intervalos quinzenais", () => {
    const events = expandOccurrences({
      inicio: "2030-03-06T18:00",
      fim: "2030-03-06T20:00",
      recorrencia: "quinzenal",
      recorrenciaAte: "2030-04-02",
    });
    expect(events.map(({ inicio }) => inicio)).toEqual([
      "2030-03-06T21:00:00.000Z",
      "2030-03-20T21:00:00.000Z",
    ]);
  });
});

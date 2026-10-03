import { describe, expect, it } from "vitest";
import { apiErrorMessage, listResults } from "./axios";

describe("listResults", () => {
  it("supports paginated and plain responses", () => {
    expect(listResults({ results: [1, 2] })).toEqual([1, 2]);
    expect(listResults([3])).toEqual([3]);
    expect(listResults(undefined)).toEqual([]);
  });
});

describe("apiErrorMessage", () => {
  it("prefers detail, then joins field errors, then falls back", () => {
    expect(apiErrorMessage({ response: { data: { detail: "Vietato" } } }, "x")).toBe("Vietato");
    expect(
      apiErrorMessage({ response: { data: { name: ["Duplicato."], amount: ["Troppo basso."] } } }, "x")
    ).toBe("Duplicato. Troppo basso.");
    expect(apiErrorMessage(new Error("network"), "Errore generico")).toBe("Errore generico");
  });
});

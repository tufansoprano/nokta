import { describe, expect, it } from "vitest";
import { createFsaApi } from "@/services/foodHygieneRefreshService";

function fakeFetch(statuses: number[]) {
  const calls: Array<{ url: string; at: number }> = [];
  const fetchFn = (async (input: string | URL | Request) => {
    calls.push({ url: String(input), at: Date.now() });
    const status = statuses[Math.min(calls.length - 1, statuses.length - 1)];
    return new Response(status === 200 ? JSON.stringify({ establishments: [] }) : "", { status });
  }) as typeof fetch;
  return { calls, fetchFn };
}

describe("createFsaApi", () => {
  it("spaces requests out so the ratings API does not block the refresh", async () => {
    const { calls, fetchFn } = fakeFetch([200]);
    const fsa = createFsaApi({ fetchFn, minIntervalMs: 40 });

    await Promise.all([fsa.searchEstablishments({ address: "W1T 5EE" }), fsa.searchEstablishments({ address: "W1T 5EE" }), fsa.searchEstablishments({ address: "W1T 5EE" })]);

    expect(calls).toHaveLength(3);
    expect(calls[1].at - calls[0].at).toBeGreaterThanOrEqual(35);
    expect(calls[2].at - calls[1].at).toBeGreaterThanOrEqual(35);
  });

  it("sends the search by name and postcode", async () => {
    const { calls, fetchFn } = fakeFetch([200]);
    await createFsaApi({ fetchFn, minIntervalMs: 0 }).searchEstablishments({ name: "Broski Lounge", address: "W1T 5EE" });
    expect(calls[0].url).toBe("https://api.ratings.food.gov.uk/Establishments?address=W1T+5EE&pageSize=100&name=Broski+Lounge");
  });

  it("treats a missing record as no record", async () => {
    const { fetchFn } = fakeFetch([404]);
    await expect(createFsaApi({ fetchFn, minIntervalMs: 0 }).getEstablishment(1)).resolves.toBeNull();
  });

  it("does not retry a refusal", async () => {
    const { calls, fetchFn } = fakeFetch([403]);
    await expect(createFsaApi({ fetchFn, minIntervalMs: 0 }).getEstablishment(1)).rejects.toThrow("Could not load food hygiene record 1: the ratings API answered 403");
    expect(calls).toHaveLength(1);
  });
});

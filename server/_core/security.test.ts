import { describe, expect, it } from "vitest";
import { validateEnv, type ENV } from "./env";
import { isCrossOriginRequest, originGuard } from "./originGuard";

function makeEnv(overrides: Partial<typeof ENV> = {}): typeof ENV {
  return {
    appId: "test-app",
    cookieSecret: "a-sufficiently-long-secret",
    databaseUrl: "mysql://localhost/test",
    oAuthServerUrl: "https://oauth.example.com",
    ownerOpenId: "owner-open-id",
    isProduction: false,
    forgeApiUrl: "",
    forgeApiKey: "",
    ...overrides,
  };
}

describe("validateEnv", () => {
  it("accepts a complete development configuration", () => {
    expect(() => validateEnv(makeEnv())).not.toThrow();
  });

  it("throws when the JWT secret is missing", () => {
    expect(() => validateEnv(makeEnv({ cookieSecret: "" }))).toThrow(/JWT_SECRET/);
  });

  it("throws when the JWT secret is too short to be safe", () => {
    expect(() => validateEnv(makeEnv({ cookieSecret: "short" }))).toThrow(
      /at least 16 characters/
    );
  });

  it("requires a database URL and OAuth server URL in production", () => {
    expect(() =>
      validateEnv(makeEnv({ isProduction: true, databaseUrl: "" }))
    ).toThrow(/DATABASE_URL/);
    expect(() =>
      validateEnv(makeEnv({ isProduction: true, oAuthServerUrl: "" }))
    ).toThrow(/OAUTH_SERVER_URL/);
  });
});

function makeRequest(headers: Record<string, string | undefined>) {
  const defined = Object.fromEntries(
    Object.entries(headers).filter(([, value]) => value !== undefined)
  ) as Record<string, string>;
  return { method: "POST", headers: defined } as never;
}

describe("originGuard", () => {
  it("blocks POST requests with a mismatching Origin header", () => {
    expect(
      isCrossOriginRequest(
        makeRequest({ origin: "https://evil.example", host: "app.example.com" })
      )
    ).toBe(true);
  });

  it("allows POST requests with a matching Origin header", () => {
    expect(
      isCrossOriginRequest(
        makeRequest({ origin: "https://app.example.com", host: "app.example.com" })
      )
    ).toBe(false);
  });

  it("allows requests without an Origin header (same-origin/curl)", () => {
    expect(isCrossOriginRequest(makeRequest({ host: "app.example.com" }))).toBe(
      false
    );
  });

  it("treats a malformed Origin header as cross-origin", () => {
    expect(
      isCrossOriginRequest(makeRequest({ origin: "not-a-url", host: "app.example.com" }))
    ).toBe(true);
  });

  it("responds with 403 and does not call next for cross-origin mutations", () => {
    const res = makeResponseRecorder();
    let nextCalled = false;
    originGuard(
      makeRequest({ origin: "https://evil.example", host: "app.example.com" }),
      res as never,
      () => {
        nextCalled = true;
      }
    );
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "Cross-origin requests are not allowed" });
  });

  it("calls next for same-origin mutations", () => {
    const res = makeResponseRecorder();
    let nextCalled = false;
    originGuard(
      makeRequest({ origin: "https://app.example.com", host: "app.example.com" }),
      res as never,
      () => {
        nextCalled = true;
      }
    );
    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBeUndefined();
  });
});

function makeResponseRecorder() {
  const recorder = {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    status(code: number) {
      recorder.statusCode = code;
      return recorder;
    },
    json(body: unknown) {
      recorder.body = body;
      return recorder;
    },
  };
  return recorder;
}

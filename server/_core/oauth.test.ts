import type { Express, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { COOKIE_NAME, encodeOAuthState, ONE_YEAR_MS, OAUTH_STATE_COOKIE } from "@shared/const";

const mocks = vi.hoisted(() => ({
  exchangeCodeForToken: vi.fn(),
  getUserInfo: vi.fn(),
  createSessionToken: vi.fn(),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
}));

vi.mock("./sdk", () => ({
  sdk: {
    exchangeCodeForToken: mocks.exchangeCodeForToken,
    getUserInfo: mocks.getUserInfo,
    createSessionToken: mocks.createSessionToken,
  },
}));

vi.mock("../db", () => ({
  upsertUser: mocks.upsertUser,
  getUserByOpenId: mocks.getUserByOpenId,
}));

import { registerOAuthRoutes } from "./oauth";

type CallbackHandler = (req: Request, res: Response) => void | Promise<void>;

type ResponseRecorder = {
  statusCode?: number;
  body?: unknown;
  clearCookie: ReturnType<typeof vi.fn>;
  cookie: ReturnType<typeof vi.fn>;
  redirect: ReturnType<typeof vi.fn>;
  status: (code: number) => ResponseRecorder;
  json: (body: unknown) => ResponseRecorder;
};

function captureCallback(): CallbackHandler {
  let callback: CallbackHandler | undefined;
  const app = {
    get(path: string, handler: CallbackHandler) {
      if (path === "/api/oauth/callback") callback = handler;
    },
  } as unknown as Express;

  registerOAuthRoutes(app);
  if (!callback) throw new Error("OAuth callback route was not registered");
  return callback;
}

function makeResponse(): ResponseRecorder {
  const recorder: ResponseRecorder = {
    clearCookie: vi.fn(),
    cookie: vi.fn(),
    redirect: vi.fn(),
    status(code) {
      recorder.statusCode = code;
      return recorder;
    },
    json(body) {
      recorder.body = body;
      return recorder;
    },
  };
  return recorder;
}

describe("OAuth callback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.exchangeCodeForToken.mockResolvedValue({ accessToken: "access-token" });
    mocks.getUserInfo.mockResolvedValue({
      openId: "oauth-user",
      name: "Test Player",
      email: "player@example.com",
      loginMethod: "manus",
    });
    mocks.upsertUser.mockResolvedValue(undefined);
    mocks.getUserByOpenId.mockResolvedValue({ status: "active" });
    mocks.createSessionToken.mockResolvedValue("session-token");
  });

  it("persists the OAuth user and redirects with a fresh session", async () => {
    const nonce = "nonce-123";
    const state = encodeOAuthState({ redirectUri: "https://pickleplay.example/api/oauth/callback", nonce });
    const request = {
      query: { code: "authorization-code", state },
      headers: { cookie: `${OAUTH_STATE_COOKIE}=${nonce}` },
      protocol: "https",
    } as unknown as Request;
    const response = makeResponse();

    await captureCallback()(request, response as unknown as Response);

    expect(mocks.upsertUser).toHaveBeenCalledWith(expect.objectContaining({
      openId: "oauth-user",
      name: "Test Player",
      email: "player@example.com",
      loginMethod: "manus",
    }));
    expect(mocks.createSessionToken).toHaveBeenCalledWith("oauth-user", {
      name: "Test Player",
      expiresInMs: ONE_YEAR_MS,
    });
    expect(response.cookie).toHaveBeenCalledWith(
      COOKIE_NAME,
      "session-token",
      expect.objectContaining({ maxAge: ONE_YEAR_MS, secure: true, sameSite: "none" }),
    );
    expect(response.redirect).toHaveBeenCalledWith(302, "/");
    expect(response.statusCode).toBeUndefined();
  });
});

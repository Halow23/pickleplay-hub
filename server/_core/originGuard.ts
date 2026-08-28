import type { NextFunction, Request, Response } from "express";

// The session cookie uses SameSite=None (required for iframe/preview login),
// which means browsers attach it to cross-site POSTs. tRPC mutations all live
// under /api/trpc and carry no CSRF token, so we reject state-changing
// cross-origin requests by comparing the Origin (or Referer fallback) host
// against the request host. Requests without an Origin header (same-origin
// fetches, curl, server-to-server) are allowed through.
export function isCrossOriginRequest(req: Request): boolean {
  const originHeader = req.headers.origin;
  if (!originHeader) return false;

  let originHost: string;
  try {
    originHost = new URL(originHeader).host;
  } catch {
    return true;
  }

  const hostHeader = req.headers.host;
  return Boolean(hostHeader) && originHost !== hostHeader;
}

export function originGuard(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== "GET" && req.method !== "HEAD" && isCrossOriginRequest(req)) {
    res.status(403).json({ error: "Cross-origin requests are not allowed" });
    return;
  }
  next();
}

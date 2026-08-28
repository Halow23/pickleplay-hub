import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { ENV, validateEnv } from "./env";
import { originGuard } from "./originGuard";
import { buildCalendar } from "@shared/ics";
import { listCalendarFeedGames } from "../db";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  validateEnv(ENV);

  const app = express();
  const server = createServer(app);

  // Behind a reverse proxy the client protocol/protocol is only visible in
  // X-Forwarded-* headers; trust one hop so req.protocol and cookie
  // secure-flag detection work.
  app.set("trust proxy", 1);

  // Security headers (CSP disabled: Vite dev injection and the preview iframe
  // runtime would otherwise break; revisit for a strict production CSP).
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );
  // Reject state-changing cross-origin requests (session cookie is
  // SameSite=None for iframe login, so browsers send it cross-site too).
  app.use("/api", originGuard);

  const apiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  });
  const mutationLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 60,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  });
  app.use("/api", (req, res, next) => {
    if (req.method === "POST") {
      mutationLimiter(req, res, next);
      return;
    }
    apiLimiter(req, res, next);
  });

  // Configure body parser with a size limit comfortably above any tRPC
  // payload this app sends (there is no upload endpoint).
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // Liveness endpoint for uptime checks and container orchestrators; must
  // stay before the tRPC mount and not touch the database.
  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok", uptime: process.uptime() });
  });
  // Personal ICS calendar feed; the unguessable token in the URL is the only
  // credential (calendars subscribe without cookies), so no session required.
  app.get("/api/calendar/:token/feed.ics", async (req, res) => {
    try {
      const games = await listCalendarFeedGames(String(req.params.token));
      if (!games) {
        res.status(404).set("Content-Type", "text/plain").send("Unknown calendar feed.");
        return;
      }
      res
        .set("Content-Type", "text/calendar; charset=utf-8")
        .set("Content-Disposition", 'inline; filename="pickleplay.ics"')
        .set("Cache-Control", "no-store")
        .send(buildCalendar(games));
    } catch (error) {
      console.error("[Calendar] Feed failed", error);
      res.status(500).set("Content-Type", "text/plain").send("Calendar feed is temporarily unavailable.");
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  // Finish in-flight requests before the process exits so a rolling restart
  // doesn't cut off tRPC mutations mid-transaction.
  const shutdown = (signal: string) => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    server.close(() => {
      console.log("Server closed.");
      process.exit(0);
    });
    setTimeout(() => {
      console.warn("Forced shutdown after timeout with connections pending.");
      process.exit(1);
    }, 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

startServer().catch(console.error);

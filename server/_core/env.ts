export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Optional: when unset, email notifications are suppressed (in-app only).
  smtpUrl: process.env.SMTP_URL ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "",
};

// An empty JWT secret lets anyone forge signed session tokens (including
// admin), and an empty database URL leaves the app silently serving a broken
// experience — both must be caught at boot, not at first failed request.
export function validateEnv(env: typeof ENV = ENV): void {
  const missing: string[] = [];
  if (!env.cookieSecret) missing.push("JWT_SECRET");
  if (env.isProduction && !env.databaseUrl) missing.push("DATABASE_URL");
  if (env.isProduction && !env.oAuthServerUrl) missing.push("OAUTH_SERVER_URL");
  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        "Set them in .env (see .env.example) before starting the server."
    );
  }
  if (env.cookieSecret.length < 16) {
    throw new Error(
      "JWT_SECRET must be at least 16 characters long to be safe to sign sessions with."
    );
  }
}

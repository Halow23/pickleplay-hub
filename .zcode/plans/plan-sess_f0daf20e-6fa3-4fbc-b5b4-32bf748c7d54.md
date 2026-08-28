# PicklePlay Hub — Phased Remediation Plan

Full remediation of the gap-analysis findings in 6 phases. Each phase is one or more logical commits on `main`, verified with `pnpm check` + `pnpm test` (+ `pnpm build` where relevant), then pushed to the fork (`rafael-fu2025/pickleplay-hub`) and delivered as a PR to `Halow23/pickleplay-hub`. New tests follow the two existing conventions: in-memory repository fakes (rsvpService.test.ts style) and `appRouter.createCaller(fabricatedContext)` (routers.authorization.test.ts style).

---

## Phase 1 — Security hardening (no schema changes)

**1.1 Fail fast on missing secrets** — `server/_core/env.ts`: add a `validateEnv()` that throws at startup when `JWT_SECRET` (or `DATABASE_URL`) is empty in production; call it first in `startServer()` (`server/_core/index.ts:31`). Empty-secret JWTs currently allow forged admin tokens.

**1.2 Security headers** — add `helmet` dependency; register `app.use(helmet({ contentSecurityPolicy: false }))` (CSP off to avoid breaking Vite dev/Manus runtime; enables nosniff, frame options defaults, etc.) as the first middleware in `server/_core/index.ts`, before `express.json` (line 35).

**1.3 Rate limiting** — add `express-rate-limit`; apply two limiters in `index.ts` before tRPC mounting: a general `/api/trpc` limiter (e.g. 300 req/5min/IP) and a stricter limiter for mutation-heavy paths. tRPC doesn't distinguish mutation URLs cleanly, so implement as one middleware at `/api/trpc` checking `req.method === "POST"` for the stricter bucket (~60/5min).

**1.4 CSRF mitigation** — `sameSite: "none"` must stay (iframe/preview login depends on it), so add an Origin-check middleware for non-GET `/api/*` requests: allow requests whose `Origin` (or `Referer` fallback) host matches the request host; no-Origin requests (same-origin/curl) allowed. Small module `server/_core/originGuard.ts` + unit test with fabricated req/res.

**1.5 Cookie/trust-proxy fixes** — `server/_core/cookies.ts`: `sameSite: "none"` only when the request is secure; otherwise `"lax"` (fixes the invalid none-without-secure combo that Chrome rejects). In `index.ts`, set `app.set("trust proxy", 1)` so `x-forwarded-proto` handling is explicit.

**1.6 Body limit + stack leak** — reduce `express.json` limit from 50mb to 1mb (`index.ts:35`, no upload endpoint exists). `client/src/components/ErrorBoundary.tsx:38`: drop the `error.stack` `<pre>` from the production UI (keep message only).

**Tests:** originGuard unit test; env validation test (mock process.env, expect throw). Run `pnpm check && pnpm test`.

---

## Phase 2 — Data-integrity bug fixes

**2.1 Timezone round-trip fix** — `client/src/pages/OrganizerGameSettings.tsx:13`: replace `toISOString().slice(0,16)` with a local-time formatter that pads `getFullYear/getMonth/getDate/getHours/getMinutes`. The save path (`new Date(deadline).getTime()`, line 32) already parses as local, so in/out become consistent and values stop shifting by the UTC offset on every save.

**2.2 Check-then-insert races** — `server/db.ts:157-165` (`getOrCreatePlayerProfile`) and `server/notificationPreferences.ts:19-26`: switch to insert with `onDuplicateKeyUpdate` (no-op set) then re-select, so concurrent first requests can't blow up on the unique constraint.

**2.3 Idempotency-key race** — `server/rsvpService.ts`: catch duplicate-key on `create` and treat as idempotent replay (re-read the existing row and return it) instead of surfacing a raw MySQL error.

**2.4 Moderator status bypass** — `server/moderationService.ts:44-48` (`setReportReviewStatus`) and its caller `server/db.ts:364-368` (`reviewCommunityReport`): load the report, run it through `assertReportAvailableForTransition` before updating, and write an audit event (`report_reviewed`) so no transition happens unaudited. Add a `getReport(reportId)` repository method.

**2.5 Capacity-change transaction** — `server/organizerService.ts:105-108`: move the capacity count check + update into one transaction with the count re-validated inside.

**2.6 Shared cutoff constant** — add `RSVP_CUTOFF_MS = 2 * 60 * 60 * 1000` to `shared/const.ts`; use it in `rsvpService.ts:34`, `organizerService.ts:37`, and the three client sites (`Home.tsx:109,114,284`).

**2.7 Strong invite tokens** — `server/communityService.ts:126`: replace `Math.random()+Date.now()` token with `nanoid(21)` (already a dependency).

**Tests:** moderator transition-bypass regression test (closed report → expect throw, audit written on legit transition); rsvp duplicate-key replay test; capacity-change race test via fakes. Run `pnpm check && pnpm test`.

---

## Phase 3 — Enforce bans/suspensions (schema change)

**3.1 Schema** — `drizzle/schema.ts` `users` table: add `status` mysqlEnum(`active`,`suspended`,`banned`) default `active`. `reports` table: add nullable `subjectUserId` FK → users (the sanctioned user). Run `pnpm db:push` to generate + apply migration 0009.

**3.2 Apply sanctions on resolve** — `moderationService.prepareReportResolution` accepts optional `subjectUserId`; `resolveCommunityReport` (`server/db.ts:387-393`) writes it and updates the target user's `status` (`suspension`→`suspended`, `ban`→`banned`, `warning`/`none`→unchanged). Admins can lift status via a new `admin.setUserStatus` procedure (with audit event + ownership-style guard: cannot target self or the owner account).

**3.3 Enforce status** — in `server/_core/trpc.ts` add a check inside `requireUser` middleware (and `adminProcedure`'s check): throw `FORBIDDEN` "Your account is suspended/banned" when `user.status !== "active"`. This covers every protected procedure at one chokepoint. Also block at login: `server/_core/oauth.ts` around L38-49 — reject session issuance for banned users with a redirect to `/` + query flag. Moderator console UI gains a target-user field on resolve and the admin console a status control.

**Tests:** caller-level tests — suspended user blocked from `community.rsvp`, banned user blocked from `admin.*`; resolve-with-sanction applies status; admin cannot ban self. Run `pnpm check && pnpm test`.

---

## Phase 4 — Performance

**4.1 Query defaults** — `client/src/main.tsx:11`: `new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } })`. This alone stops the full dashboard refetch on every mount/focus.

**4.2 Kill the duplicate Admin query** — `client/src/pages/Admin.tsx:25` uses the whole dashboard just for a role check; replace with the existing `useAuth()` hook (`client/src/_core/hooks/useAuth.ts`), deleting the second call.

**4.3 Route code-splitting** — `client/src/App.tsx`: convert all 10 page imports to `React.lazy(() => import(...))` wrapped in one `<Suspense fallback={page skeleton}>`. Admin/moderator/organizer chunks stop shipping to anonymous visitors.

**4.4 Server-side limits** — `server/communityService.ts:188` (game thread posts): add `limit(100)`; `server/organizerService.ts:155` (organizer games): `limit(50)`; `server/db.ts:173-206` (dashboard games): `limit(60)` on future games. (Full cursor pagination deferred — noted in docs.)

**4.5 Dead code & dependency removal** — delete `client/src/pages/ComponentShowcase.tsx` (1437 lines, unrouted), `client/src/components/DashboardLayout.tsx` + `DashboardLayoutSkeleton.tsx` (unimported), `AIChatBox.tsx`/`ManusDialog.tsx` if confirmed unreferenced. Remove `framer-motion`, `recharts`, `recharts-dependent ui/chart.tsx`, `embla-carousel-react`, `react-day-picker`, `input-otp`, `react-resizable-panels`, `vaul`, `next-themes` from package.json if a repo-wide import grep confirms zero usage (verify each before removing; pnpm install after).

**4.6 Font loading** — `client/src/index.css:1`: add `<link rel="preconnect">` + `&display=swap` to the Google Fonts URL (or move the import to `index.html` with preload) to unblock rendering.

**Verify:** `pnpm check && pnpm test && pnpm build`; confirm `dist` chunk count and that admin code is not in the entry chunk.

---

## Phase 5 — UX & accessibility polish

**5.1 Brand basics** — add favicon (`client/public/favicon.svg`, paddle/ball mark in the brand green) + `<link rel="icon">` in `index.html`; add OG/Twitter meta tags; remove `maximum-scale=1` from the viewport meta (line 5); guard the analytics script so it's only injected when `VITE_ANALYTICS_ENDPOINT` is defined (move from index.html into a conditional in `main.tsx` or vite html transform).

**5.2 Per-route titles** — small `usePageTitle(title)` hook; set on each page ("Organizer · PicklePlay", "Moderation console · PicklePlay", …).

**5.3 404 redesign** — `NotFound.tsx`: restyle to the green/cream palette, add links to Explore/Groups/Venues, proper `role="status"`.

**5.4 Mobile escape hatch on sub-pages** — shared lightweight `SubPageHeader` component (brand link + "Community home") used by Organizer, Admin, Moderator, Venues, GameThread, NotificationSettings, replacing the inconsistent bare text links.

**5.5 Loading states** — extract Home's pulse-skeleton pattern into a small `CardSkeleton` and use in Organizer, Admin, ModeratorConsole, Venues (currently renders empty grid while loading); distinguish empty vs loading in Admin user list and Moderator audit list.

**5.6 Report/block reasons** — `Home.tsx:302-310`: replace the instant hardcoded-reason mutations with small dialogs (Textarea for the reason, maxLength 120, cancel button). This is user-facing trust&safety input, worth doing properly.

**5.7 Accessibility fixes** — darken the eyebrow/label hexes to pass 4.5:1 (`#74857a`→`#5f6f66`, `#668176`→`#55685e`, `#718078`→`#5b6b62`; verify each against `#fffef9`/`#f5f3eb`); add skip-link in App; `role="progressbar"` + `aria-valuenow` on the capacity meter (`Home.tsx:92-104`) plus divide-by-zero guard; expose unread-notification count in the bell's `aria-label`; `aria-expanded` on the mobile menu trigger; `htmlFor`/`id` association for the profile-form Selects.

**5.8 Dark mode decision** — do NOT wire up dark mode (every page hardcodes hex; the refactor is out of scope). Instead delete the dead `switchable` scaffolding comment in App.tsx to stop implying it works. Noted as future work in docs.

**Verify:** `pnpm check && pnpm test`; browser smoke of Home, 404, and one sub-page at mobile width (existing pattern from prior checkpoints).

---

## Phase 6 — Engineering hygiene

**6.1 CI** — `.github/workflows/ci.yml`: on push/PR, `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm check`, `pnpm test`, `pnpm build` (Node 20, MySQL service container not needed — tests use fakes).

**6.2 ESLint** — add `eslint` + `typescript-eslint` + `eslint-plugin-react-hooks` with a minimal flat config; `lint` script; fix auto-fixable violations, keep rule set conservative (no type-checked rules initially).

**6.3 Windows-safe scripts** — add `cross-env` devDep; `dev`/`start` become `cross-env NODE_ENV=development tsx watch …` / `cross-env NODE_ENV=production node dist/index.js`.

**6.4 Ops basics** — `/health` plain HTTP route in `index.ts` that pings MySQL (`SELECT 1`) and returns `{ ok }` / 503; graceful shutdown handler (SIGTERM/SIGINT → `server.close` + pool end); fail-fast on busy port when `NODE_ENV=production` (skip the 20-port fallback).

**6.5 `.env.example`** — document all env vars (DATABASE_URL, JWT_SECRET, OAUTH_SERVER_URL, OWNER_OPEN_ID, VITE_APP_ID, VITE_OAUTH_PORTAL_URL, VITE_ANALYTICS_*, BUILT_IN_FORGE_*) with comments; update `docs/` with the deferred items (cursor pagination, dark mode, email delivery worker, full dashboard split).

**Verify:** full gate `pnpm lint && pnpm check && pnpm test && pnpm build` locally before the CI push.

---

## Delivery & commit strategy

Six phase commits on local `main` (some phases may split into 2 commits where tests and code are separable), each gated on `pnpm check && pnpm test` passing. Final delivery: `git push fork main` and one PR to `Halow23/pickleplay-hub` with the phase-by-phase commit history (easier for the owner to review commit-by-commit than six stacked PRs; can split into per-phase PRs on request). `todo.md` gets updated as phases land, per repo convention.

## Deferred (explicitly out of scope, documented in Phase 6.5)

Full dashboard endpoint split into focused procedures; cursor pagination; email delivery worker for the outbox; dark-mode palette refactor; `system.health` replacement beyond `/health`; production SSO/CSP hardening.
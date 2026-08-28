Add four missing features to PicklePlay, built and committed one at a time. Each feature gets its own commit after passing the full gate (tsc, eslint, vitest, build).

## Feature 1 — Game discovery + calendar feed

**Search & filtering (server + client):**
- New `community.searchGames` tRPC query in `server/routers.ts` with inputs: `q` (matches title/description/venue name), `dateFrom`/`dateTo`, `skillBand`, `venueId`. Service in `server/communityService.ts` reusing the existing dashboard games select (same joins) with additional where clauses; limit 60.
- Home "play" view: add a search input and filter row (date, skill, venue select fed from `dashboard.venues`) next to the existing 4 chips. Filtering runs client-side against fetched games for chips, server-side via `searchGames` when text/date/venue filters are active.

**Calendar month view:**
- Client-only month grid component in Home's play view (toggle between list and calendar). Days render game count; clicking a day filters the list. No server changes.

**Subscribable ICS feed:**
- Schema: add `calendarFeedToken varchar(64)` to `player_profiles` (migration `0010`), generated with nanoid on profile upsert.
- New unauthenticated Express route `GET /api/calendar/:token/feed.ics` in `server/_core/index.ts` (registered before auth-dependent middleware) that looks up the profile by token and returns a VCALENDAR of that user's confirmed/waitlisted upcoming games (join rsvps → games → venues), reusing the existing ICS field formatting from `client/src/pages/Home.tsx` (move that helper to `shared/ics.ts`).
- Client: "Subscribe to calendar" link (copies feed URL) in the profile view.

## Feature 2 — Recurring games

- Schema: add to `games`: `recurrence varchar(16)` (`none|weekly|biweekly`, default `none`) and `parentGameId int` self-reference (migration `0011`).
- `server/organizerService.ts`: when creating a game with recurrence ≠ none, materialize the next 8 occurrences (each +7/+14 days, linked via `parentGameId` to the first, drafts). On publish of a series member, only that session publishes. New `organizer.extendSeries` mutation that appends the next batch when the organizer wants more.
- Organizer UI: recurrence select in the create-game form; series badge + "extend series" action on series games in the games list.
- Tests: series creation count, spacing, parent linkage, extend behavior.

## Feature 3 — Direct messaging + venue map

**Messaging:**
- Schema: `directMessages` table (id, senderId, recipientId, body, readAt, createdAt) with indexes on (senderId, recipientId, createdAt) (migration `0012`, combined with map columns below in one migration if built together — keep one migration per feature instead: `0012` messaging, `0013` map).
- Services: `sendDirectMessage` (blocked users cannot send to blocker; 2000-char cap; rate-limited by existing mutation limiter), `listConversations` (grouped by counterpart with last message + unread count), `listDirectMessages(counterpartId)` (marks read), reusing the block-check guard from community access code.
- Router: `community.sendDirectMessage`, `community.conversations`, `community.directThread`.
- Client: new "Messages" view in Home (badge with unread count), conversation list + thread panel, composed in the existing visual style.

**Venue map:**
- Schema: add `lat decimal(10,7)` + `lng decimal(10,7)` (nullable) to `venues` (migration `0013`).
- Admin venue review UI gains optional lat/lng inputs (manual entry; no geocoding dependency to start). Venue cards show "view on map".
- New Venues page toggle (list ↔ map) rendering the existing `client/src/components/Map.tsx` with markers per geocoded venue. **Constraint:** Google Maps requires `VITE_GOOGLE_MAPS_API_KEY`; when absent, the map toggle is hidden and the list remains. Key documented in `.env.example`.

## Feature 4 — Email notifications (last: needs external credentials)

- Env: `SMTP_URL` (nodemailer connection string) + `EMAIL_FROM`, validated as optional in `server/_core/env.ts`, documented in `.env.example`.
- New `server/emailService.ts` using nodemailer (added dependency): `sendEmail(to, subject, text)` with a null-transporter when SMTP_URL is unset (delivery skipped, outbox marked `suppressed` — matches existing enum).
- Extend `server/notificationService.ts`: when a notification is persisted and the user's preferences allow email for that type, insert an email outbox row and attempt send; record delivery state in `notificationDeliveryRecords` (channel `email`). Applies to game_confirmed, waitlist_promoted, organizer_update.
- Client: un-force `emailEnabled` in NotificationSettings (currently hardcoded `false`); show a note that email requires the server to have SMTP configured.
- Tests: preference gating, outbox states (delivered/failed/suppressed) with a mocked transporter.

## Notes
- Each feature: implement → new tests → full gate (`pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build`) → separate commit. No pushes until you say so (Manus is active on upstream).
- Migrations numbered 0010–0013; generated via drizzle-kit with placeholder DATABASE_URL as before.
- Sequencing deviates slightly from the order you picked only for email: it moves last because it's blocked on SMTP credentials being available; if you have them now, it can swap with Feature 3.
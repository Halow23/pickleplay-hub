# OAuth callback verification findings

During the authenticated browser test, the Manus login page displayed the user’s selected account and the redirect target was the PicklePlay OAuth callback at `/api/oauth/callback`. After the user confirmed, selecting the account returned the browser to `https://pickleplay-fnwpxejp.manus.space/` with the PicklePlay homepage rendered and no visible OAuth error. The original server log showed the callback failed because the live `users` table lacked the `status` column expected by the synced Drizzle schema. The missing column was added with the schema’s enum values and default, and the TypeScript check reported zero errors before this browser test.


# Authentication

RepoRush supports GitHub OAuth and username/password sign-in through Auth.js JWT sessions. `/signup` creates a username account and signs it in; `/login` accepts that username or GitHub. Signed-in users are redirected away from `/login`.

GitHub users can open **Add password sign-in** from their account menu. Registration then attaches the credential to the authenticated account ID. Usernames and emails never trigger automatic account merging. Existing GitHub users and progress retain their original IDs. Signing up anonymously with a username creates a separate account; it does not claim a matching GitHub identity.

Usernames are case-insensitive, 3–30 ASCII letters/digits/underscores/hyphens, beginning with a letter or digit. Passwords are 8–128 characters, permit spaces and Unicode, and are never trimmed. They are stored as versioned salted scrypt hashes (`N=131072, r=8, p=1`), with a random 16-byte salt and 64-byte digest. Verification uses a timing-safe comparison. Missing users still incur a dummy hash verification. Hashes never enter JWTs, API responses, client bundles or application logs.

`passwordAccounts` uses its normalized username as the unique `_id` and a unique `userId` index. The public Auth.js user record and its credential are created in a MongoDB transaction, avoiding half-created accounts. This requires a replica set such as the existing MongoDB Atlas deployment. Credential profiles are written into the same default database used by the existing MongoDBAdapter; challenge data continues to use the app's configured database. The adapter database has not been moved.

MongoDB counters enforce signup and login limits across serverless instances. Counter identities are HMAC fingerprints rather than raw usernames/IPs and expire through a TTL index. Login uses both per-IP and per-username limits. Vercel replaces the forwarded-IP header; self-hosted deployments must configure a trusted proxy rather than trusting arbitrary client headers. Registration requires same-origin requests, bounds JSON size, validates inputs, and derives linked identity exclusively from the authenticated session. Auth.js provides CSRF protection for credential login.

No additional API key is required. Existing `MONGODB_URI`, `AUTH_SECRET` and GitHub OAuth settings remain in use. Password recovery/email verification are not implemented in this release; the interface does not advertise those actions.

Browser drafts and Monaco file models are now scoped by user ID as well as challenge ID. Cloud-saved workspaces continue to restore for their existing owner. Old unscoped browser drafts are not automatically assigned to another account because their ownership cannot be verified.

Run `npm run verify:auth` for real scrypt verification and mocked-database checks covering uniqueness, rollback, throttling, request guards and preservation of linked GitHub IDs/progress. Live tests use a dedicated synthetic account, never another user's credentials or progress.

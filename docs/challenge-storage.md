# Challenge storage and rollout

`CHALLENGE_CATALOG_SOURCE` defaults to `legacy`. It selects the bundled challenge definitions. `database` selects published MongoDB records and their immutable objects. `CHALLENGE_STORAGE_PROVIDER` separately selects `local` (default) or `r2` for snapshot reads and administrative uploads. The legacy catalog works with either storage setting and needs no R2 credentials. Database or object failures in database mode are shown to the learner and logged on the server.

## Local verification

Use Node.js 22.19 or newer. Configure Auth.js and a development MongoDB replica set or Atlas database in `.env.local` using `.env.example`. Keep `CHALLENGE_CATALOG_SOURCE=legacy` during setup. Set `CHALLENGE_STORAGE_PROVIDER=local` and use a private writable `CHALLENGE_STORAGE_DIR` outside the public folder. The default directory, `.challenge-storage`, is ignored by Git.

```sh
npm ci
npm run migrate:challenges -- --dry-run
npm run verify:storage
```

The dry run prepares and validates all 40 original repositories, metadata records, checksums and grading plans without connecting to providers. When you intend to publish to the configured development database and storage directory, run:

```sh
npm run migrate:challenges -- --publish
```

Set `CHALLENGE_CATALOG_SOURCE=database` and run `npm run dev`. Sign in, check the library and progress counts, then open a challenge twice. The first open requests the snapshot. Subsequent opens verify and use the matching IndexedDB entry. Resetting an editor uses the original snapshot for its pinned version. The catalog still needs authentication and server metadata, and verified tests need E2B connectivity.

The browser cache defaults to 16 MiB and 80 entries, expires entries after 30 days of inactivity, and evicts older entries first. Adjust the public byte setting at build time if needed. Local workspace drafts contain user changes and deletions, scoped to the account and snapshot. MongoDB stores the saved workspace separately.

The explorer restores saved preferences after the active catalog loads. Missing language, difficulty, or skill values revert to their defaults. Reset Filters and the empty-state Clear filters action both preserve sorting.

## Metadata and object layout

`challengeVersions` has one immutable document per `challengeId:version`. It stores title, summary, language, difficulty, skills, estimated minutes and catalog position. It also stores issue details, attribution, optional GitHub repository and commit, optional owner, category, publication status and timestamps, plus the two SHA-256 digests. Its publication index retrieves the latest published version of each challenge. The catalog list projects only display fields and the snapshot identity.

```text
challenges/<official|community>/<id>/<workspace-sha256>/workspace.json
challenges/<official|community>/<id>/<grading-sha256>/grading.json
```

The workspace format is a canonical UTF-8 JSON text-file map with bounded paths, file count and content size. It represents regular files only. There is no archive extraction step. Published artifacts are capped at 4 MiB so snapshots fit within the [Vercel Function response limit](https://vercel.com/docs/functions/limitations#request-body-size). Existing public regressions are taken from the verified original snapshot and protected against edits in the fresh grading sandbox. This import contains public regression files only. Review future contributor files and grading plans before publishing, and keep private tests outside the learner snapshot.

- `GET /api/challenges` returns the active catalog source and lightweight list. It never reads a snapshot.
- `GET /api/challenges/<id>` resolves the learner's version and returns issue details and their own saved workspace. Legacy opens return the corresponding bundled learner files through this route.
- In database mode, `GET /api/challenges/<id>?version=...&snapshot=...` retrieves the verified learner files on a cache miss. Grading plans stay on the server. All three requests require an authenticated session.

The publisher writes and verifies both immutable objects before inserting a version. A retry reuses identical artifacts and version documents; changed content requires a new version. An interrupted publish can leave unreferenced objects, but the affected version stays unpublished until both objects are present. The unique `challengeProgress(userId, challengeId)` index prevents competing first saves from pinning two versions. If existing duplicates prevent index creation, publishing stops. Review and back up the conflicting records before resolving them.

Persisted workspaces, submissions and test runs reference the version and its hash when using the database catalog. Existing unversioned progress uses the imported `1.0.0` snapshot. The publisher accepts reviewed content and provenance separately from delivery. Browsing, opening, and grading a published challenge make no GitHub repository requests.

## R2 deployment

1. Create a **private** R2 bucket using **Standard** storage and the default jurisdiction. Keep public access disabled. Create a bucket-scoped Object Read & Write token for publishing and a separate Object Read token for application deployment.
2. With the publishing credentials on the administrative workstation, configure `CHALLENGE_STORAGE_PROVIDER=r2` plus `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET_NAME`. Confirm the target MongoDB database. Run the dry run and then explicitly run `--publish` for the intended environment.
3. Configure the server-only R2 and MongoDB credentials in a Vercel preview with `CHALLENGE_STORAGE_PROVIDER=r2`. Enable `CHALLENGE_CATALOG_SOURCE=database` on that preview to verify loading, existing workspaces and grading. Use a separate preview database and bucket where possible.
4. Deploy with the legacy default during rollout. After validation, set `CHALLENGE_CATALOG_SOURCE=database` for the intended environment and redeploy. Monitor catalog/API errors and R2 and E2B usage. R2 operations and E2B runs can consume billable quota. See [R2 pricing](https://developers.cloudflare.com/r2/pricing/) and [bucket-scoped API tokens](https://developers.cloudflare.com/r2/api/tokens/).

## Rollback

Set `CHALLENGE_CATALOG_SOURCE=legacy` and restart or redeploy. This switches which catalog the application reads. Keep MongoDB metadata, R2 objects and progress in place. Imported workspaces whose snapshot exactly matches the bundled version can still open and save. Workspaces on later versions are preserved and show an explicit message if opened in legacy mode. Restore `CHALLENGE_CATALOG_SOURCE=database` after fixing the infrastructure to access those workspaces and community challenges again.

## Implementation files

- Catalog and publication — `lib/challenge-model.ts`, `lib/challenge-catalog.ts`, `lib/challenge-publishing.ts`, `lib/challenge-storage.ts`, `app/api/challenges/route.ts`, `app/api/challenges/[challengeId]/route.ts`.
- Browser and editor — `lib/challenge-cache.ts`, `lib/challenge-client.ts`, `app/page.tsx`, `app/globals.css`, `app/file-tree.tsx`, `app/login/login-panel.tsx`, `app/ai-coach.tsx`, `app/linux-terminal.tsx`.
- Workspace and grading consumers — `app/api/progress/[challengeId]/route.ts`, `app/api/submissions/route.ts`, `app/api/linux/route.ts`, `app/api/linux/[challengeId]/stream/route.ts`, `app/api/coach/route.ts`, `lib/linux-sandbox.ts`, `lib/coach.ts`, `lib/supermemory.ts`, `lib/mongodb.ts`.
- Commands and verification — `scripts/migrate-challenges.mjs`, `scripts/verify-challenge-storage.mjs`, `scripts/test-catalog-loader.mjs`, `scripts/verify-coach.mjs`, `scripts/verify-interview-challenges.mjs`, `scripts/verify-linux.mjs`.
- Setup — `.env.example`, `.gitignore`, `package.json`, `package-lock.json`, `README.md`, and this guide.

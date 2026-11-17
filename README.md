# RepoRush

RepoRush is a debugging practice app for JavaScript, Python, and Java. Learners investigate issue tickets, edit repositories in Monaco, and submit fixes that run against server-controlled regressions.

Next.js and React provide the UI and API. Auth.js handles sign-in. MongoDB stores accounts, progress, workspaces, submissions, and published challenge metadata. A challenge's immutable files live on disk or in Cloudflare R2. The browser loads the catalog first and downloads a repository when a learner opens it. In database mode, IndexedDB reuses verified snapshots by version and hash. E2B runs tests and Linux workspaces, Gemini powers coaching, and Supermemory provides learning recall.

## Local development

Use Node.js 22.19 or newer. Copy `.env.example` to `.env.local`, then set `MONGODB_URI` for a development MongoDB replica set or Atlas database, `AUTH_SECRET`, and `AUTH_URL` (usually `http://localhost:3000`). Set `MONGODB_DB` if your development database uses a different name.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000) and use username/password sign-up, or configure `GITHUB_ID` and `GITHUB_SECRET` for [GitHub sign-in](docs/authentication.md). Set `E2B_API_KEY` for grading and Linux, `GEMINI_API_KEY` for coaching, and `SUPERMEMORY_API_KEY` for learning recall. The R2 provider uses the four `R2_*` settings in the template.

| Catalog source | Snapshot provider | Use |
| --- | --- | --- |
| `legacy` | `local` | Default. Serve the bundled catalog. |
| `legacy` | `r2` | Serve the bundled catalog independently of R2. |
| `database` | `local` | Read published metadata from MongoDB and snapshots from a private local directory. |
| `database` | `r2` | Read published metadata from MongoDB and snapshots from a private R2 bucket. |

Set the modes with `CHALLENGE_CATALOG_SOURCE` and `CHALLENGE_STORAGE_PROVIDER`. The Challenges page remembers search, filters, and sorting on this browser. Reset Filters clears the filters and keeps the sort order.

## Verification and publishing

```sh
npm run typecheck
npm run build
npm run verify:storage
npm run verify:linux
npm run verify:results
npm run verify:interviews
npm run verify:coach
npm run verify:auth
npm run verify:progress-reset
npm run migrate:challenges -- --dry-run
```

Use a separate development database and local snapshot directory for feature work. Keep credentials in ignored environment files. The dry run validates the bundled challenges without connecting to MongoDB or R2. Use the [challenge storage guide](docs/challenge-storage.md) for publishing, preview deployment, and rollback.

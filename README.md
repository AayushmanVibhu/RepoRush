# RepoRush

A production-minded debugging practice interface built with Next.js, TypeScript, Monaco Editor, MongoDB, Auth.js, Supermemory, and Lucide.
https://youtu.be/F_L8Opdw8kQ

## Architecture

- Next.js App Router hosted on Vercel
- GitHub OAuth and username/password sign-in through Auth.js
- MongoDB Atlas for users, workspaces, progress, and submissions
- Supermemory v5 for user-isolated learning events
- Monaco Editor for repository workspaces

GitHub Pages is not used because authenticated API routes require a server runtime.

## Local development

```bash
npm install
npm run typecheck
npm run dev
```

Create an ignored `.env.local` with `MONGODB_URI`, `AUTH_SECRET`, `AUTH_URL`,
`GITHUB_ID`, and `GITHUB_SECRET`. Configure `SUPERMEMORY_API_KEY`, `GEMINI_API_KEY`
and `E2B_API_KEY` for learning memory, coaching and Linux. Challenge edits are saved
to MongoDB after login and retained in user-scoped browser storage as an offline fallback.
See [authentication setup](docs/authentication.md) for signup, password sign-in and linking an existing GitHub profile.

## Vercel deployment

1. Import `AayushmanVibhu/RepoRush` into Vercel.
2. Add the server environment variables listed above to the Vercel project.
3. Set `AUTH_URL` to the production Vercel URL.
4. Configure the GitHub OAuth callback as
   `https://YOUR_DOMAIN/api/auth/callback/github`.
5. Deploy, then verify login, saving, refresh recovery, and submission history.

The challenge catalog contains 40 JavaScript, Python, and Java debugging challenges.

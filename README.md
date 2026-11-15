# RepoRush

A production-minded debugging practice interface built with Next.js, TypeScript, Monaco Editor, MongoDB, Auth.js, Supermemory, and Lucide.
https://youtu.be/F_L8Opdw8kQ

## Architecture

- Next.js App Router hosted on Vercel
- GitHub OAuth through Auth.js
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

Copy `.env.example` to `.env.local`, then configure MongoDB Atlas, a GitHub OAuth app,
and Supermemory. Challenge edits are saved to MongoDB after login and retained in
browser local storage as an offline fallback.

## Vercel deployment

1. Import `AayushmanVibhu/RepoRush` into Vercel.
2. Add every variable listed in `.env.example` to the Vercel project.
3. Set `AUTH_URL` to the production Vercel URL.
4. Configure the GitHub OAuth callback as
   `https://YOUR_DOMAIN/api/auth/callback/github`.
5. Deploy, then verify login, saving, refresh recovery, and submission history.

The challenge catalog contains 29 JavaScript, Python, and Java debugging repositories.

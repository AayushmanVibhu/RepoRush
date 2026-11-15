# Real repository challenges: milestone one

Five distinct MIT-licensed upstream repositories are bundled as pinned source snapshots. These are real library repositories (11–23 text files each), rather than invented services or large application monorepos. All tracked text files are retained, including upstream tests, types, documentation, configuration, and license. Images are excluded and listed in each snapshot's `omitted` field.

| Challenge  | Upstream                          | Version | Difficulty | Injected regression                                 |
| ---------- | --------------------------------- | ------- | ---------- | --------------------------------------------------- |
| RR-OSS-001 | sindresorhus/escape-string-regexp | v5.0.0  | Easy       | Missing global regex flag                           |
| RR-OSS-002 | vercel/ms                         | 2.1.3   | Easy       | Incorrect minute conversion constant                |
| RR-OSS-003 | epoberezkin/fast-deep-equal       | v3.1.3  | Medium     | Reference comparison replaces recursion             |
| RR-OSS-004 | sindresorhus/p-map                | v7.0.3  | Medium     | Completion-order insertion replaces indexed storage |
| RR-OSS-005 | sindresorhus/p-limit              | v6.2.0  | Hard       | Early return bypasses cleanup after rejection       |

Each fork lives under `AayushmanVibhu/<repository>`, with training changes on `codex/reporush-challenge`. The upstream default branches remain clean. Full upstream commit SHAs are recorded in `app/oss-data/*.json` and the in-workspace `REPORUSH.md` file. The supplied bugs are synthetic training mutations, not claims about upstream defects.

## Rebuild and verify

Clone the five repositories into `.oss-work/<repository>` at the versions above (include their tags). Run:

```powershell
node scripts/build-oss-challenges.mjs
npm install --prefix .oss-work/runtime --no-save --ignore-scripts yocto-queue@1.1.1 dot@1.1.3
node scripts/verify-oss-challenges.mjs
npm run typecheck
npm run build
```

The generator reads Git objects at the pinned revisions; dirty worktrees and training branches do not change its inputs. The verifier uses Node's test runner against all five upstream implementations, all five broken implementations, and all five reference repairs. It compiles the default fast-deep-equal template using its upstream doT engine and resolves p-limit's pinned queue dependency locally. Every upstream/repair must pass, and every mutant must fail. This verifies the added regressions, not every upstream test suite or generated variant.

Inside each training fork, run `npm install --ignore-scripts` (Node 20+), then `node --test reporush/regression.test.mjs`. For fast-deep-equal first run `node build.js`. `npm test` runs each upstream suite with development dependencies installed.

Browser Run/Submit continues to use the existing static evaluator. New challenge rows and notes identify these as static patch checks. They cannot establish behavioral correctness for arbitrary alternative solutions; the included Node regressions provide actual execution. A sandboxed execution service remains future work.

## Publishing

`scripts/fork-oss.mjs` creates forks through GitHub using the configured Git credential manager. It never prints or persists the token. `scripts/publish-oss-forks.mjs` creates and pushes only the training branches. Those scripts are explicit maintenance operations, not application build steps.

The application loads committed snapshots offline; deployments need neither Git credentials nor live GitHub calls. This branch adds content without changing layout, styles, authentication, or existing challenge IDs.

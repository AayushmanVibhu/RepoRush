# Linux workspaces

The workspace bottom panel now contains a real xterm.js terminal connected to a persistent E2B Linux PTY. Vercel hosts the authenticated HTTP endpoints, not the user's shell process. No commands are executed on the Vercel host.

## Enable

Set `E2B_API_KEY` in Vercel for Production and Preview, then deploy. Keep it server-side; never use a `NEXT_PUBLIC_` variable. MongoDB and GitHub sign-in must already work. Use a Node runtime compatible with the installed E2B SDK (Node 22.19+). Optional `E2B_DAILY_LIMIT` defaults to 60 new sandboxes per signed-in user per UTC day, including regression runs, and is capped at 200. Creating a sandbox consumes provider credits; accounts with no available capacity receive provider errors.

The default E2B `base` template is used when `E2B_TEMPLATE` is unset. Startup probes the selected language toolchain; missing runtimes are installed inside that VM with apt, within a 65-second limit. If that install fails or your template lacks apt/root access, the operation fails visibly rather than claiming tests passed. For consistent Java/Node/Python availability and faster startup, build the optional template:

```powershell
# E2B_API_KEY must be present in your local environment or ignored .env.local.
node --env-file=.env.local scripts/build-linux-template.mjs
```

Then set `E2B_TEMPLATE=reporush-linux` in Vercel and redeploy. This uses a Node 22 Debian image with Python 3, JDK 17, git and shell tools. The browser never receives the account API key or an E2B access token.

## Workflow

Open a challenge → Linux terminal → Start Linux. A workspace is created only on that click, and the current editor buffers are uploaded. Press Enter for the prompt. Commands, shell history and working directory persist across input requests and SSE reconnects. Use `ls`, `git`, `python3`, `node`, `javac`, editors, and package managers inside the VM. An active SSE connection is renewed about every 45 seconds to fit serverless request lifetimes.

Editor changes push after a short debounce. Linux text files are polled every five seconds and can be loaded manually. Three-way merging preserves independent edits; if the same file changes on both sides, syncing pauses until the user chooses Use Linux files or Use editor files. Avoid editing the same file simultaneously in both editors: remote filesystem writes are not transactional. New text files appear in the explorer and persist through the existing MongoDB/local storage workflow. Generated dependency/build directories, symlinks, binaries and oversized files are excluded from loading.

Closing the panel disconnects the display, not the VM. Start Linux reconnects to an existing matching session, asking which file version to retain if buffers differ. Stop Linux first loads outstanding text changes and refuses to discard an unresolved conflict. There is one interactive sandbox per user; opening another challenge's Linux workspace replaces the old VM. Sessions expire after five minutes without terminal input or file writes and have a 30-minute maximum. Passive display/file polling does not extend their lifetime. Creation has a 30-second cooldown; per-user operation leases prevent overlapping starts, syncs and grading runs.

## Grading

`Run tests` and `Submit fix` execute actual regression commands for the five RR-OSS challenges and six RR-INT challenges. Every run creates a fresh isolated sandbox with the server's original tests, configuration and supporting repository files plus the submitted source changes. Terminal modifications to tests, installed hooks and prior shell state cannot carry over to this grader. Only source files are overlaid; use the terminal for experiments with dependency/configuration changes. The VM is killed in a finally block, with an additional provider timeout as a backstop. This is functional regression grading, not a hardened anti-cheating/proctoring system for hostile submissions.

Run output reports the actual command exit status and captured output. Runtime/dependency setup errors are distinct from regression failures and do not award completion. Submit results are computed on the server and saved only after that computation; client-provided PASS rows are ignored. Completion cannot be set via the workspace autosave endpoint.

The original 29 practice challenges still have structural evaluators and their toolbar says Static checks. They have real terminal access, but their browser checks are not represented as executed suites. Full company/upstream suites may require additional services or packages and are not implied by passing a targeted regression.

## Limits and verification

Workspace upload paths cannot traverse directories. Text is limited to 100 files, 250 KB per file and 1.5 MB total. Streams and input require the signed-in owner and matching challenge; sandbox IDs are looked up server-side rather than accepted from the browser. New sessions and grade runs share a bounded daily quota. Platform credentials are never uploaded into the VM.

```powershell
npm run verify:linux
npm run smoke:linux
npm run typecheck
npm run build
```

Policy/adapter checks mock the provider to cover path validation, conflict merging, ownership, server-owned tests/configuration, grading cleanup and operation locks. They do not prove live E2B connectivity. The optional `smoke:linux` command reads the ignored local E2B key, creates a temporary real VM, checks PTY reconnect and shared files, runs failing/repaired JavaScript, Python and Java regressions, then terminates the VM. It consumes a small amount of E2B usage. Live UI acceptance additionally requires a signed-in user to start the terminal, check file syncing, run a regression and stop the sandbox. Capture provider/setup failures separately from application defects.

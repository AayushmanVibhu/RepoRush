# Coding coach

Gemini generates contextual explanations, progressive hints, debugging guidance and reviews. Supermemory retrieves relevant prior practice and explicit learning notes from a namespace derived from the authenticated user ID. MongoDB stores conversations, opt-in settings, usage counters and a durable memory outbox. E2B regression results provide historical server-verified evidence. Client output is explicitly marked unverified.

Configure server-only `GEMINI_API_KEY`, optional `GEMINI_MODEL` (default `gemini-3.5-flash-lite`), `SUPERMEMORY_API_KEY` and the existing MongoDB/auth variables in Vercel and ignored `.env.local`. Redeploy after changing environment variables. Never use `NEXT_PUBLIC_` for credentials. Model availability and free-tier quotas depend on your Google project. Flash-Lite was verified with a real streamed response; the larger Flash model was temporarily overloaded during testing.

The workspace's **AI coach** tab requires sign-in and explicit code-sharing consent. It shares at most three files, 24,000 code characters total, the highlighted selection, challenge contract and recent output. Common credentials are redacted and sensitive filenames excluded. Redaction is best effort, not a guarantee; do not submit confidential code. Gemini free-tier content may be used to improve Google's products.

Learning memory defaults off. Enable it to remember trusted practice events and notes you explicitly save. Inspect memories shows actual Supermemory search/profile results; an empty or failed retrieval never gets replaced by fabricated history. Memory errors do not prevent current-code coaching. Notes are limited to 20 per UTC day; coaching to four requests per minute and 40 per UTC day per authenticated account, with one concurrent response. Google project quotas apply in addition.

Durable outbox jobs retry on subsequent coach/memory requests using exponential backoff. There is no scheduled worker: inactive accounts' pending jobs wait for their next visit. Provider delivery can be repeated after a timeout; stable event IDs help correlate records but do not promise exactly-once provider writes. Forget immediately disables recall and advances the user's namespace generation. Provider deletion is queued and may remain pending; active writes are allowed to finish before deletion. Chat history is separate: **New chat** clears that challenge's saved conversation.

Suggested edits are exact-snippet replacements restricted to shared source files, with a SHA-256 base-version check and a second state check before applying. Hint mode has no patch tool. The assistant cannot run commands or automatically apply edits. A suggestion is not proof of correctness: run the actual regressions.

## Demo

1. Sign in, open a challenge, then select AI coach and approve code sharing.
2. Enable learning memory and save “I prefer tiny examples before explanations of recursion.”
3. Inspect memories; allow indexing time, then ask for a relevant explanation.
4. Open another challenge/session and ask a related question. Expand recalled context to show the real retrieved records used by Gemini.
5. Run a regression, ask Debug to investigate it, preview a suggested change and explicitly apply it. Run tests again.
6. Forget learning memory and verify recalled context clears. Another account must never retrieve these records.

## Verification

`npm run verify:coach` checks context boundaries, redaction, namespace separation, patch validation, empty/failing retrieval and the absence of patch tools in Hint mode. `npm run smoke:coach` uses local keys to create/retrieve a temporary Supermemory record and send that actual recall to Gemini; it removes its temporary namespace afterward. `npm run typecheck` and `npm run build` validate the app. Signed-in UI and deployment credentials still require a deployed walkthrough.

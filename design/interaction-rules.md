# Interaction rules

Challenge rows open that challenge's own repository, issue ticket, and evaluator. Repository edits persist under a challenge-specific storage key so files never leak between tasks. Every file opens in its own editable Monaco model with syntax selected from its extension; switching files preserves each buffer independently. `Ctrl/Cmd + Enter` runs the active repository's tests and `Ctrl/Cmd + S` saves all current file buffers. Run and submit are disabled during evaluation. Results open automatically and preserve source. Rejected patches return to the preserved editor; accepted patches return to the catalog.

Hints unlock in three steps: directional, diagnostic, then near-solution. The interface records and displays the number revealed for the active attempt. Repository metadata must include a license/source label when adapted from external material.

In the AI coach prompt, Enter submits through the same form as Ask coach; Shift+Enter inserts a new line. Submission requires a nonempty prompt and an idle coach. Enter used to compose text with an input method does not submit.

Progress offers Delete progress with a dialog requiring the exact phrase DELETE MY PROGRESS before removing the signed-in account's challenge records, submissions, regression history and local drafts. It stops an active Linux workspace, updates shared completion metrics, and leaves account identity and AI learning memory intact. Cancellation performs no deletion; errors remain visible and allow retry.

Horizontal workspace handles resize the explorer and ticket panels within safe bounds. On narrow layouts, both secondary panels collapse to prioritize the editor. Errors must explain the failed behavior without exposing hidden tests or a reference solution.

The file explorer scrolls independently of the editor. Clicking a folder row or its arrow toggles its children; the repository row toggles the entire file list. Native buttons support Enter and Space. Collapse preserves the selected file and unsaved edits; navigation to another file reveals that file's ancestor folders.

Login and signup support Enter submission, password managers and password visibility toggling. Successful signup signs the user in. Wrong username/password errors do not reveal whether the account exists. Signed-in users can add password access to the same profile from the account menu; account linking never relies on a supplied user ID, matching name or email. Browser drafts stay scoped to the signed-in account.

Drag the divider above the bottom-panel tabs up to enlarge the panel or down to give space back to the editor. The divider also supports Up/Down arrows and Home/End when focused. Its height persists on this device across tabs and reopening; double-click resets the default. Resizing retains editor and terminal minimum space and responds to window size changes.

The Linux tab starts an authenticated isolated workspace only on request. Editor changes sync with conflict checks; terminal changes load without overwriting independent editor edits. Same-file conflicts pause syncing until explicitly resolved. Ctrl shortcuts in the terminal are owned by the shell. Run/Submit execute server-owned regressions in fresh sandboxes for configured challenges; other challenges identify their checks as static. See `docs/linux-workspaces.md` for lifecycle and limits.

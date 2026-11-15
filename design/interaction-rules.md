# Interaction rules

Challenge rows open that challenge's own repository, issue ticket, and evaluator. Repository edits persist under a challenge-specific storage key so files never leak between tasks. Every file opens in its own editable Monaco model with syntax selected from its extension; switching files preserves each buffer independently. `Ctrl/Cmd + Enter` runs the active repository's tests and `Ctrl/Cmd + S` saves all current file buffers. Run and submit are disabled during evaluation. Results open automatically and preserve source. Rejected patches return to the preserved editor; accepted patches return to the catalog.

Hints unlock in three steps: directional, diagnostic, then near-solution. The interface records and displays the number revealed for the active attempt. Repository metadata must include a license/source label when adapted from external material.

Horizontal workspace handles resize the explorer and ticket panels within safe bounds. On narrow layouts, both secondary panels collapse to prioritize the editor. Errors must explain the failed behavior without exposing hidden tests or a reference solution.

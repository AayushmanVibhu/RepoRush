# Component specifications

- `AppSidebar`: 220px desktop rail; 58px icon rail below 800px. Disabled destinations are visibly unavailable.
- `ChallengeTable`: compact rows with challenge hierarchy first, followed by language, skills, difficulty, time, and status.
- `ChallengeDefinition`: one self-contained repository contract containing language, difficulty, ticket content, file map, entry file, and evaluator. Never reuse another challenge's repository or ticket.
- `ProgressiveHints`: three ordered hints revealed one at a time. Hints guide investigation without inserting code or exposing hidden checks.
- `DifficultyBadge`: dot plus readable label; never color alone.
- `WorkspaceToolbar`: fixed 50px row containing context and the run/submit workflow.
- `FileExplorer`: path-driven folders, extension icons, selected-file edge, and per-file unsaved dots. It renders the active challenge's repository rather than a global file list.
- `EditorTabs`: active file and dirty state. Each repository file has an independent editable Monaco model identified by its file path.
- `IssuePanel`: issue metadata followed by description, expected behavior, reproduction, and constraints.
- `TestResultsPanel`: idle, running, pass, and fail states; diagnostics use actual local evaluation results.
- `SubmissionResult`: accepted and rejected variants share one data-driven component.

Reuse these patterns before adding new surface, badge, toolbar, or status variants.

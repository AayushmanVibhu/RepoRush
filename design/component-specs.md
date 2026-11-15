# Component specifications

- `AppSidebar`: 220px desktop rail; 58px icon rail below 800px. Every visible destination opens a real product view. The profile opens an account menu; sign-out is never the profile row's primary action.
- `SkillTracks`: language-level practice tracks with completion, covered skills, and a real next-challenge action.
- `ProgressOverview`: MongoDB-backed completion metrics, language progress, recent activity, and a continue action.
- `AccountMenu`: identity, email, completion count, progress navigation, and an explicit sign-out action.
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

- `LinuxTerminal`: a third bottom-panel tab using xterm.js and the existing surface/text tokens. Start/stop are explicit, provisioning has a busy state, connection status is readable, and file conflicts require a clear choice between editor and Linux contents. Interactive commands stay in E2B. The panel grows to 340px on desktop and 300px on narrow screens.

Brand identity uses the icon-only parchment-and-green R in `public/logo.svg`, rendered through `BrandLogo`. Use it in the sidebar, workspace header, submission header, login header and login card without an adjacent wordmark or a colored tile. Functional Git branch icons remain Lucide icons. The browser favicon uses the same SVG asset.
# AI coach panel

The workspace results area includes an AI coach tab using the existing dark panel, parchment text, green action and monospace file-label tokens. Mode selection, scrollable conversation and a pinned consent/question form share the panel. Learning memory controls expand inline; recall shows actual records and provider state. Suggested edits use collapsible before/after code and an explicit Apply action with stale-version validation. Loading, stop, quota, unavailable-memory and signed-out states remain visible. Narrow screens wrap toolbar actions and keep the editor and conversation independently scrollable.

`ResizableResults` provides a shared, focusable horizontal divider above all bottom-panel tabs. Pointer capture supports mouse, pen and touch dragging. Heights are bounded against the available editor space and remembered locally across challenges; double-click restores each tab's default height. Linux terminal fitting and Monaco layout react to container resizing.

# RepoRush contributor instructions

## UI development rules
Before frontend changes, read `design/design-system.md`, `design/component-specs.md`, `design/interaction-rules.md`, and `design/screen-layouts.md`, then inspect existing components. Use established semantic tokens and reuse components. Do not add arbitrary colors, fonts, spacing, or disconnected patterns. Document genuinely new patterns. Preserve working workflows and never replace real behavior with mock interactions or fabricated results.

For significant UI changes, verify representative viewport widths, text overflow, panel alignment, typography, responsive behavior, and relevant functionality. Use screenshot comparison when available. Avoid unrelated visual changes.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# RepoRush design system

## Philosophy
RepoRush is a calm, compact developer tool. Structure, legibility, and system feedback take priority over decoration. Linear informs the discipline; the identity, content, and component composition remain original.

## Tokens
- Background: `--bg` (`#0D0F12`)
- Panel: `--panel` (`#15181D`)
- Elevated: `--elevated` (`#1D2229`)
- Border: `--border` (`#2B313A`)
- Text: warm parchment `--text` (`#D7C5A4`); secondary sage-gray `--muted` (`#9DA49D`)
- Accent: `--accent` (`#7399FF`); success `--success` (`#5FAD83`); error `--error` (`#E57373`)

The warm parchment ink is the product-wide primary text color across authentication, catalog, tracks, progress, workspace chrome, and results. Monaco retains its native editor theme so syntax contrast is not affected. Green is reserved for successful states and the GitHub authentication action.

Use Geist for interface text and JetBrains Mono for code and technical metadata. The spacing scale is 4, 8, 12, 16, 24, 32, and 48px. Controls use 6px radii, small containers 8px, and workspace panels square edges. Icons come only from Lucide at 13–18px.

## States and accessibility
Hover changes surface color, focus uses a 2px accent outline, and disabled controls retain readable contrast. Success and error are always paired with text or icons. Controls have labels or titles. Motion stays within 120–200ms and reduced-motion preferences are respected. Desktop is primary; narrow layouts hide secondary panels and retain editor actions.

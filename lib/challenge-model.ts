import type { Challenge } from "../app/challenges";
import { validateFiles } from "./sandbox-policy";

export type ChallengeRevision = { version: string; snapshotHash: string };
export type ChallengeCard = Pick<
  Challenge,
  "id" | "title" | "summary" | "language" | "difficulty" | "skills" | "time"
> & { number: number; revision?: ChallengeRevision };
export type WorkspaceDetails = Pick<
  Challenge,
  | "repoName"
  | "entryFile"
  | "problem"
  | "expected"
  | "reproduction"
  | "constraints"
  | "note"
  | "hints"
  | "source"
>;
export type WorkspaceChallenge = ChallengeCard &
  WorkspaceDetails & {
    files: Challenge["files"];
    gradingMode: "sandbox" | "static";
  };
export type ChallengeDetails = Omit<WorkspaceChallenge, "files">;
export type CatalogSource = "legacy" | "database";
export const IMPORTED_CHALLENGE_VERSION = "1.0.0";
export const MAX_ARTIFACT_BYTES = 4 * 1024 * 1024;
const TEXT_FILES =
  /\.(?:cjs|css|html|ini|java|js|json|jst|lock|md|mjs|properties|py|sh|sql|toml|ts|tsx|txt|xml|ya?ml)$/i;
const TEXT_NAMES =
  /^(?:LICENSE|Makefile|Dockerfile|pre-commit|\.editorconfig|\.eslintignore|\.gitattributes|\.gitignore|\.npmrc|\.nvmrc|\.pylintrc|\.swcrc)$/i;

export function isChallengeId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z0-9][A-Z0-9-]{0,79}$/.test(value);
}

export function isRevision(value: unknown): value is ChallengeRevision {
  if (!value || typeof value !== "object") return false;
  const revision = value as Partial<ChallengeRevision>;
  return (
    typeof revision.version === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9.+-]{0,63}$/.test(revision.version) &&
    typeof revision.snapshotHash === "string" &&
    /^[a-f0-9]{64}$/.test(revision.snapshotHash)
  );
}

export function sameRevision(a: ChallengeRevision, b: ChallengeRevision) {
  return a.version === b.version && a.snapshotHash === b.snapshotHash;
}

export function canonicalSnapshot(value: unknown): string {
  const files = validateFiles(value);
  for (const [path, content] of Object.entries(files)) {
    const name = path.split("/").at(-1)!;
    if (
      path.split("/").some((part) => /^(?:\.git|node_modules)$/i.test(part)) ||
      (!TEXT_FILES.test(name) && !TEXT_NAMES.test(name)) ||
      /[\u0000]/.test(content)
    ) {
      throw new Error("Challenge snapshots support regular text files only.");
    }
  }
  return JSON.stringify(
    Object.fromEntries(
      Object.keys(files)
        .sort()
        .map((path) => [path, files[path]]),
    ),
  );
}

export function languageForPath(path: string) {
  if (path.endsWith(".java")) return "java";
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".md")) return "markdown";
  if (path.endsWith(".xml")) return "xml";
  if (path.endsWith(".toml")) return "ini";
  return "javascript";
}

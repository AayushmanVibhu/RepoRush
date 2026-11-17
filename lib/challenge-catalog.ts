import { challenges, type Challenge } from "../app/challenges";
import {
  canonicalSnapshot,
  IMPORTED_CHALLENGE_VERSION,
  isChallengeId,
  isRevision,
  sameRevision,
  type CatalogSource,
  type ChallengeCard,
  type ChallengeDetails,
  type ChallengeRevision,
  type WorkspaceChallenge,
  type WorkspaceDetails,
} from "./challenge-model";
import { artifactHash, artifactKey, readArtifact } from "./challenge-storage";
import { getDatabase } from "./mongodb";
import type { ClientSession, Filter, UpdateFilter } from "mongodb";
import {
  executionPlan,
  SandboxProblem,
  type ExecutionPlan,
  type WorkspaceFiles,
} from "./sandbox-policy";

export type ChallengePublication = Omit<
  ChallengeCard,
  "id" | "revision" | "time"
> & {
  _id: string;
  challengeId: string;
  version: string;
  snapshotHash: string;
  gradingHash: string;
  estimatedMinutes: number;
  category: "official" | "community";
  owner?: string;
  origin?: {
    provider: "github";
    repository: string;
    commit: string;
    url?: string;
  };
  details: WorkspaceDetails;
  published: boolean;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date;
};

type ChallengeProgress = {
  userId: string;
  challengeId: string;
  challengeRevision?: ChallengeRevision;
  files?: WorkspaceFiles;
  status?: string;
  updatedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  revealedHints?: number;
  attempts?: number;
};
type ResolvedChallenge = {
  details: ChallengeDetails;
  publication?: ChallengePublication;
  legacy?: Challenge;
};
const latestOrder = { publishedAt: -1, version: -1 } as const;
const legacyById = new Map(
  challenges.map((challenge, index) => [
    challenge.id,
    { challenge, number: index + 1 },
  ]),
);

export function challengeCatalogSource(
  value = process.env.CHALLENGE_CATALOG_SOURCE,
): CatalogSource {
  if (value === undefined || value === "legacy") return "legacy";
  if (value === "database") return "database";
  throw new SandboxProblem(
    "CHALLENGE_CATALOG_SOURCE must be legacy or database.",
    503,
  );
}

export function publicationId(id: string, version: string) {
  return `${id}:${version}`;
}

function requireId(id: unknown) {
  if (!isChallengeId(id))
    throw new SandboxProblem("Invalid challenge ID.", 400);
  return id;
}

function strings(value: unknown, max = 40) {
  return (
    Array.isArray(value) &&
    value.length <= max &&
    value.every((item) => typeof item === "string" && item.length <= 5000)
  );
}

function validCard(value: Partial<ChallengePublication>) {
  return (
    isChallengeId(value.challengeId) &&
    isRevision({ version: value.version, snapshotHash: value.snapshotHash }) &&
    typeof value.title === "string" &&
    value.title.length > 0 &&
    value.title.length <= 240 &&
    typeof value.summary === "string" &&
    value.summary.length <= 1200 &&
    ["Java", "Python", "JavaScript"].includes(value.language ?? "") &&
    ["Easy", "Medium", "Hard"].includes(value.difficulty ?? "") &&
    strings(value.skills) &&
    Number.isSafeInteger(value.number) &&
    value.number! > 0 &&
    Number.isSafeInteger(value.estimatedMinutes) &&
    value.estimatedMinutes! > 0
  );
}

export function publicationCard(value: ChallengePublication): ChallengeCard {
  if (!validCard(value))
    throw new SandboxProblem("Published challenge metadata is invalid.", 503);
  return {
    id: value.challengeId,
    number: value.number,
    title: value.title,
    summary: value.summary,
    language: value.language,
    difficulty: value.difficulty,
    skills: value.skills,
    time: `${value.estimatedMinutes} min`,
    revision: revisionOf(value),
  };
}

export function workspaceDetails(
  challenge: WorkspaceDetails,
): WorkspaceDetails {
  const {
    repoName,
    entryFile,
    problem,
    expected,
    reproduction,
    constraints,
    note,
    hints,
    source,
  } = challenge;
  return {
    repoName,
    entryFile,
    problem,
    expected,
    reproduction,
    constraints,
    note,
    ...(hints ? { hints } : {}),
    ...(source
      ? {
          source: {
            label: source.label,
            license: source.license,
            ...(source.url ? { url: source.url } : {}),
          },
        }
      : {}),
  };
}

export function validatePublication(value: ChallengePublication) {
  publicationCard(value);
  const d = value.details;
  if (
    value._id !== publicationId(value.challengeId, value.version) ||
    !["official", "community"].includes(value.category) ||
    !/^[a-f0-9]{64}$/.test(value.gradingHash) ||
    !d ||
    ![d.repoName, d.entryFile, d.problem, d.expected, d.note].every(
      (field) => typeof field === "string" && field.length <= 10000,
    ) ||
    !d.repoName ||
    !d.entryFile ||
    !strings(d.reproduction) ||
    !strings(d.constraints) ||
    (d.hints !== undefined && (!strings(d.hints, 3) || d.hints.length !== 3)) ||
    (d.source !== undefined &&
      (!d.source ||
        typeof d.source.label !== "string" ||
        typeof d.source.license !== "string" ||
        (d.source.url !== undefined &&
          (typeof d.source.url !== "string" ||
            !/^https:\/\//.test(d.source.url))))) ||
    typeof value.published !== "boolean" ||
    ![value.createdAt, value.updatedAt, value.publishedAt].every(
      (field) => field instanceof Date && Number.isFinite(field.getTime()),
    )
  ) {
    throw new SandboxProblem("Published challenge version is invalid.", 503);
  }
  return value;
}

function revisionOf(value: ChallengePublication): ChallengeRevision {
  return { version: value.version, snapshotHash: value.snapshotHash };
}

function legacyCard(challenge: Challenge, number: number): ChallengeCard {
  const { id, title, summary, language, difficulty, skills, time } = challenge;
  return { id, title, summary, language, difficulty, skills, time, number };
}

export async function publications() {
  return (await getDatabase()).collection<ChallengePublication>(
    "challengeVersions",
  );
}

async function catalogQuery<T>(query: () => Promise<T>): Promise<T> {
  try {
    return await query();
  } catch (error) {
    if (error instanceof SandboxProblem) throw error;
    console.error(
      "[challenge-catalog] MongoDB",
      error instanceof Error ? error.name : "QueryError",
    );
    throw new SandboxProblem(
      "The MongoDB challenge catalog is unavailable. Retry or contact the administrator.",
      503,
    );
  }
}

export async function listChallengeCards(): Promise<ChallengeCard[]> {
  if (challengeCatalogSource() === "legacy") {
    return [...legacyById.values()].map(({ challenge, number }) =>
      legacyCard(challenge, number),
    );
  }
  return catalogQuery(async () => {
    const versions = await publications();
    const latest = await versions
      .aggregate<ChallengePublication>(
        [
          { $match: { published: true } },
          { $sort: { challengeId: 1, ...latestOrder } },
          { $group: { _id: "$challengeId", version: { $first: "$$ROOT" } } },
          { $replaceWith: "$version" },
          { $project: { details: 0, gradingHash: 0, origin: 0, owner: 0 } },
          { $sort: { number: 1, challengeId: 1 } },
        ],
        { maxTimeMS: 5000 },
      )
      .toArray();
    if (!latest.length)
      throw new SandboxProblem(
        "The MongoDB challenge catalog has no published challenges. Run the challenge migration first.",
        503,
      );
    return latest.map(publicationCard);
  });
}

async function findPublication(id: string, version?: string) {
  return catalogQuery(async () => {
    const versions = await publications();
    const publication = await versions.findOne(
      version
        ? { _id: publicationId(id, version), published: true }
        : { challengeId: id, published: true },
      { sort: latestOrder, maxTimeMS: 5000 },
    );
    if (!publication) {
      throw new SandboxProblem(
        version
          ? "The saved challenge version is unavailable. Your workspace has been preserved."
          : "Unknown published challenge.",
        version ? 503 : 404,
      );
    }
    return validatePublication(publication);
  });
}

function fromPublication(publication: ChallengePublication): ResolvedChallenge {
  return {
    publication,
    details: {
      ...publicationCard(publication),
      ...workspaceDetails(publication.details),
      gradingMode: "sandbox",
    },
  };
}

function fromLegacy(id: string): ResolvedChallenge {
  const found = legacyById.get(id);
  if (!found) throw new SandboxProblem("Unknown challenge.", 404);
  const { challenge, number } = found;
  return {
    legacy: challenge,
    details: {
      ...legacyCard(challenge, number),
      ...workspaceDetails(challenge),
      gradingMode: executionPlan(challenge.id) ? "sandbox" : "static",
    },
  };
}

export async function getChallengeDetails(
  id: unknown,
): Promise<ChallengeDetails> {
  const key = requireId(id);
  return challengeCatalogSource() === "legacy"
    ? fromLegacy(key).details
    : fromPublication(await findPublication(key)).details;
}

export async function progressCollection() {
  return (await getDatabase()).collection<ChallengeProgress>(
    "challengeProgress",
  );
}

export async function readWorkspaceProgress(userId: string, id: string) {
  requireId(id);
  return catalogQuery(async () =>
    (await progressCollection()).findOne(
      { userId, challengeId: id },
      { maxTimeMS: 5000 },
    ),
  );
}

export async function saveWorkspaceProgress(
  userId: string,
  target: Awaited<ReturnType<typeof resolveWorkspace>>,
  files: WorkspaceFiles,
  submission?: { passed: boolean },
  expectedUpdatedAt?: string | null,
  session?: ClientSession,
) {
  const { details, progress } = target;
  const revision = details.revision;
  const saved = progress?.challengeRevision;
  const currentTimestamp = progress?.updatedAt?.toISOString() ?? null;
  if (
    expectedUpdatedAt !== undefined &&
    currentTimestamp !== expectedUpdatedAt
  ) {
    throw new SandboxProblem(
      "The workspace was updated elsewhere. Reopen it before saving again.",
      409,
    );
  }
  const now = new Date(
    Math.max(Date.now(), (progress?.updatedAt?.getTime() ?? 0) + 1),
  );
  const filter: Filter<ChallengeProgress> = {
    userId,
    challengeId: details.id,
    ...(progress ? { _id: progress._id } : {}),
    ...(saved
      ? {
          "challengeRevision.version": saved.version,
          "challengeRevision.snapshotHash": saved.snapshotHash,
        }
      : { challengeRevision: { $exists: false } }),
    ...(expectedUpdatedAt !== undefined
      ? { updatedAt: progress?.updatedAt ?? { $exists: false } }
      : {}),
  };
  const status = submission?.passed
    ? "completed"
    : (progress?.status ?? "in-progress");
  const update: UpdateFilter<ChallengeProgress> = {
    $set: {
      files,
      updatedAt: now,
      ...(revision ? { challengeRevision: revision } : {}),
      ...(submission
        ? { status, ...(submission.passed ? { completedAt: now } : {}) }
        : {}),
    },
    $setOnInsert: {
      userId,
      challengeId: details.id,
      startedAt: now,
      revealedHints: 0,
      ...(submission ? {} : { status: "in-progress", attempts: 0 }),
    },
    ...(submission ? { $inc: { attempts: 1 } } : {}),
  };
  try {
    const result = await (
      await progressCollection()
    ).updateOne(filter, update, { upsert: !progress, session });
    if (result.matchedCount || result.upsertedCount) return now;
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
  throw new SandboxProblem(
    "The saved workspace changed. Reopen the challenge before continuing.",
    409,
  );
}

export function checkLegacyRevision(legacy: Challenge, revision: unknown) {
  if (revision === undefined) return;
  if (
    !isRevision(revision) ||
    revision.version !== IMPORTED_CHALLENGE_VERSION ||
    artifactHash(canonicalSnapshot(legacy.files)) !== revision.snapshotHash
  ) {
    throw new SandboxProblem(
      "This workspace uses a published version unavailable in the legacy catalog. Your saved work has been preserved.",
      409,
    );
  }
}

export async function resolveWorkspace(
  id: unknown,
  userId: string,
  requested?: unknown,
  browsingDraft?: { imported: boolean },
): Promise<
  ResolvedChallenge & {
    progress: Awaited<ReturnType<typeof readWorkspaceProgress>>;
  }
> {
  const key = requireId(id);
  if (requested !== undefined && !isRevision(requested)) {
    throw new SandboxProblem("Invalid challenge version.", 400);
  }
  const source = challengeCatalogSource();
  const progress = await readWorkspaceProgress(userId, key);
  const saved = progress?.challengeRevision;
  if (saved !== undefined && !isRevision(saved)) {
    throw new SandboxProblem(
      "The saved challenge version is invalid. Your workspace has been preserved.",
      409,
    );
  }
  if (source === "legacy") {
    const resolved = fromLegacy(key);
    checkLegacyRevision(resolved.legacy!, saved);
    checkLegacyRevision(resolved.legacy!, requested);
    return { ...resolved, progress };
  }
  const version =
    saved?.version ??
    (progress || browsingDraft?.imported
      ? IMPORTED_CHALLENGE_VERSION
      : requested?.version);
  const publication = await findPublication(key, version);
  const actual = revisionOf(publication);
  if (
    (saved && !sameRevision(saved, actual)) ||
    (requested &&
      !(browsingDraft && progress) &&
      !sameRevision(requested, actual))
  ) {
    throw new SandboxProblem(
      "The workspace version changed. Reopen the challenge before continuing.",
      409,
    );
  }
  return { ...fromPublication(publication), progress };
}

export function legacyWorkspace(id: unknown) {
  return fromLegacy(requireId(id));
}

export function legacyDraftRevision(challenge: Challenge): ChallengeRevision {
  return {
    version: IMPORTED_CHALLENGE_VERSION,
    snapshotHash: artifactHash(canonicalSnapshot(challenge.files)),
  };
}

export async function publishedSnapshot(id: unknown, revision: unknown) {
  const key = requireId(id);
  if (!isRevision(revision))
    throw new SandboxProblem("Invalid challenge version.", 400);
  const resolved = fromPublication(
    await findPublication(key, revision.version),
  );
  if (!sameRevision(resolved.details.revision!, revision)) {
    throw new SandboxProblem(
      "The requested snapshot hash does not match the published version.",
      409,
    );
  }
  return { revision, files: await learnerFiles(resolved) };
}

export async function learnerFiles(
  resolved: ResolvedChallenge,
): Promise<WorkspaceFiles> {
  if (resolved.legacy) return resolved.legacy.files;
  const { category, challengeId, snapshotHash } = resolved.publication!;
  const key = artifactKey(category, challengeId, snapshotHash, "workspace");
  const artifact = await readArtifact(key, snapshotHash);
  try {
    const canonical = canonicalSnapshot(artifact);
    const files = JSON.parse(canonical) as WorkspaceChallenge["files"];
    if (
      artifactHash(canonical) !== snapshotHash ||
      !Object.hasOwn(files, resolved.details.entryFile)
    ) {
      throw new Error("Invalid file map.");
    }
    return files;
  } catch {
    throw new SandboxProblem("The published workspace failed validation.", 503);
  }
}

export function parseGradingPlan(value: unknown): ExecutionPlan {
  const plan = value as Partial<ExecutionPlan> | null;
  if (
    !plan ||
    typeof plan.command !== "string" ||
    !plan.command.trim() ||
    plan.command.length > 4000 ||
    (plan.prepare !== undefined &&
      (typeof plan.prepare !== "string" || plan.prepare.length > 4000))
  ) {
    throw new SandboxProblem(
      "The published grading configuration is invalid.",
      503,
    );
  }
  return {
    command: plan.command,
    ...(plan.prepare ? { prepare: plan.prepare } : {}),
  };
}

export async function loadGradingChallenge(resolved: ResolvedChallenge) {
  if (resolved.legacy) {
    return {
      challenge: { ...resolved.details, files: resolved.legacy.files },
      legacy: resolved.legacy,
      plan: executionPlan(resolved.details.id),
    };
  }
  const { category, challengeId, gradingHash } = resolved.publication!;
  const [files, grading] = await Promise.all([
    learnerFiles(resolved),
    readArtifact(
      artifactKey(category, challengeId, gradingHash, "grading"),
      gradingHash,
    ),
  ]);
  return {
    challenge: { ...resolved.details, files },
    plan: parseGradingPlan(grading),
    legacy: undefined,
  };
}

export function challengeError(error: unknown) {
  if (!(error instanceof SandboxProblem))
    console.error(
      "[challenge-catalog]",
      error instanceof Error ? error.name : "Error",
    );
  return Response.json(
    {
      error:
        error instanceof SandboxProblem
          ? error.message
          : "The challenge service is unavailable. Please retry.",
    },
    { status: error instanceof SandboxProblem ? error.status : 503 },
  );
}

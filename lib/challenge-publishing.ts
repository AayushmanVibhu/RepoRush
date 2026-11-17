import { challenges, type Challenge } from "../app/challenges";
import {
  parseGradingPlan,
  publicationId,
  publications,
  validatePublication,
  workspaceDetails,
  type ChallengePublication,
} from "./challenge-catalog";
import {
  canonicalSnapshot,
  IMPORTED_CHALLENGE_VERSION,
  MAX_ARTIFACT_BYTES,
} from "./challenge-model";
import {
  artifactHash,
  artifactKey,
  type ChallengeStorage,
} from "./challenge-storage";
import { getDatabase } from "./mongodb";
import { executionPlan, type ExecutionPlan } from "./sandbox-policy";

type PublicationInput = Pick<
  ChallengePublication,
  "category" | "owner" | "origin" | "version" | "number"
>;
export function prepareChallengePublication(
  challenge: Omit<Challenge, "evaluate" | "status">,
  input: PublicationInput,
  plan: ExecutionPlan,
  now = new Date(),
) {
  const workspace = Buffer.from(canonicalSnapshot(challenge.files));
  const grading = Buffer.from(JSON.stringify(parseGradingPlan(plan)));
  if (
    workspace.length > MAX_ARTIFACT_BYTES ||
    !Object.hasOwn(challenge.files, challenge.entryFile)
  ) {
    throw new Error(`Invalid workspace for ${challenge.id}.`);
  }
  const publication = validatePublication({
    ...input,
    _id: publicationId(challenge.id, input.version),
    challengeId: challenge.id,
    title: challenge.title,
    summary: challenge.summary,
    language: challenge.language,
    difficulty: challenge.difficulty,
    skills: challenge.skills,
    estimatedMinutes: Number.parseInt(challenge.time, 10),
    details: workspaceDetails(challenge),
    snapshotHash: artifactHash(workspace),
    gradingHash: artifactHash(grading),
    published: true,
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
  });
  return {
    publication,
    artifacts: [
      {
        key: artifactKey(
          input.category,
          challenge.id,
          publication.snapshotHash,
          "workspace",
        ),
        bytes: workspace,
      },
      {
        key: artifactKey(
          input.category,
          challenge.id,
          publication.gradingHash,
          "grading",
        ),
        bytes: grading,
      },
    ],
  };
}

export function prepareLegacyPublications(now: Date) {
  return challenges.map((challenge, index) => {
    const plan = executionPlan(challenge.id);
    if (!plan)
      throw new Error(`Missing runtime grading plan for ${challenge.id}.`);
    const github = challenge.source?.url?.match(
      /^https:\/\/github\.com\/([^/]+\/[^/]+)\/tree\/([a-f0-9]{7,64})$/i,
    );
    return prepareChallengePublication(
      challenge,
      {
        category: "official",
        number: index + 1,
        version: IMPORTED_CHALLENGE_VERSION,
        ...(github
          ? {
              origin: {
                provider: "github",
                repository: github[1],
                commit: github[2],
                url: github[0],
              },
            }
          : {}),
      },
      plan,
      now,
    );
  });
}

export async function createChallengeIndexes() {
  const db = await getDatabase();
  await db
    .collection("challengeProgress")
    .createIndex(
      { userId: 1, challengeId: 1 },
      { unique: true, name: "user_challenge" },
    );
  await (
    await publications()
  ).createIndex(
    { published: 1, challengeId: 1, publishedAt: -1, version: -1 },
    { name: "published_challenge_versions" },
  );
}

function publicationContent(publication: ChallengePublication) {
  const { createdAt, updatedAt, publishedAt, ...content } = publication;
  return JSON.stringify(content, (_, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, value[key]]),
        )
      : value,
  );
}

export async function publishChallenge(
  prepared: ReturnType<typeof prepareChallengePublication>,
  storage: ChallengeStorage,
) {
  const { publication, artifacts } = prepared;
  const versions = await publications();
  const existing = await versions.findOne({ _id: publication._id });
  const compare = (saved: ChallengePublication) => {
    // BSON and JSON can omit optional undefined fields from the original object.
    if (publicationContent(saved) !== publicationContent(publication)) {
      throw new Error(
        `Version ${publication._id} already exists with different content. Publish a new version.`,
      );
    }
  };
  if (existing) compare(existing);
  let uploaded = 0;
  for (const { key, bytes } of artifacts) {
    if (existing) {
      const saved = await storage.read(key).catch((error) => {
        if (
          (error as NodeJS.ErrnoException).code === "ENOENT" ||
          (error as { $metadata?: { httpStatusCode?: number } }).$metadata
            ?.httpStatusCode === 404
        )
          return null;
        throw error;
      });
      if (saved) {
        if (!saved.equals(bytes))
          throw new Error(`Immutable artifact differs: ${key}.`);
        continue;
      }
    }
    if (await storage.create(key, bytes)) uploaded += bytes.length;
    else if (!(await storage.read(key)).equals(bytes)) {
      throw new Error(`Immutable artifact differs: ${key}.`);
    }
  }
  if (existing) return { inserted: false, uploaded };
  try {
    await versions.insertOne(publication);
    return { inserted: true, uploaded };
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    const concurrent = await versions.findOne({ _id: publication._id });
    if (!concurrent) throw error;
    compare(concurrent);
    return { inserted: false, uploaded };
  }
}

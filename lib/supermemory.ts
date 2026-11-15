import { Supermemory } from "supermemory";
import { randomUUID } from "node:crypto";
import { getDatabase } from "./mongodb";
import { namespaceFor, redact, type RecalledMemory } from "./coach-policy";
import { challenges } from "@/app/challenges";

export type LearningEvent = {
  challengeId: string;
  type:
    | "challenge_started"
    | "hint_revealed"
    | "submission_failed"
    | "submission_passed";
  summary: string;
  eventId?: string;
};
type Settings = { _id: string; enabled: boolean; generation: number };
type MemoryJob = {
  _id: string;
  userId: string;
  generation: number;
  namespace: string;
  operation: "add" | "delete";
  content: string;
  status: "pending" | "delivering" | "delivered" | "cancelled";
  attempts: number;
  retryAt: Date;
  createdAt: Date;
  leaseUntil?: Date;
};
export function memoryClient() {
  return new Supermemory({
    apiKey: process.env.SUPERMEMORY_API_KEY,
    timeoutInSeconds: 6,
    maxRetries: 0,
  });
}
export async function memorySettings(userId: string): Promise<Settings> {
  const collection = (await getDatabase()).collection<Settings>(
    "memorySettings",
  );
  const existing = await collection.findOne({ _id: userId });
  if (existing) return existing;
  // Initialize existing and new accounts on first use; preserve explicit opt-outs.
  const defaults: Settings = { _id: userId, enabled: true, generation: 0 };
  await collection.updateOne(
    { _id: userId },
    { $setOnInsert: defaults },
    { upsert: true },
  );
  return (await collection.findOne({ _id: userId })) || defaults;
}
export async function setMemoryEnabled(userId: string, enabled: boolean) {
  await (
    await getDatabase()
  )
    .collection<Settings>("memorySettings")
    .updateOne(
      { _id: userId },
      { $set: { enabled }, $setOnInsert: { generation: 0 } },
      { upsert: true },
    );
}
export async function queueMemory(
  userId: string,
  content: string,
  eventId: string = randomUUID(),
) {
  const settings = await memorySettings(userId);
  if (!settings.enabled) return { status: "off" };
  const now = new Date();
  const job: MemoryJob = {
    _id: eventId,
    userId,
    generation: settings.generation,
    namespace: namespaceFor(userId, settings.generation),
    operation: "add",
    content: redact(content).slice(0, 2000),
    status: "pending",
    attempts: 0,
    retryAt: now,
    createdAt: now,
  };
  await (
    await getDatabase()
  )
    .collection<MemoryJob>("memoryOutbox")
    .updateOne(
      { _id: eventId, userId },
      { $setOnInsert: job },
      { upsert: true },
    );
  return { status: "queued" };
}
export async function flushMemories(userId: string, limit = 2) {
  if (!process.env.SUPERMEMORY_API_KEY) return { status: "unconfigured" };
  const collection = (await getDatabase()).collection<MemoryJob>(
    "memoryOutbox",
  );
  const client = memoryClient();
  let delivered = 0;
  for (let i = 0; i < limit; i++) {
    const now = new Date();
    const job = await collection.findOneAndUpdate(
      {
        userId,
        retryAt: { $lte: now },
        $or: [
          { status: "pending" },
          { status: "delivering", leaseUntil: { $lt: now } },
        ],
      },
      {
        $set: {
          status: "delivering",
          leaseUntil: new Date(Date.now() + 30000),
        },
      },
      { sort: { createdAt: 1 }, returnDocument: "after" },
    );
    if (!job) break;
    const current = await memorySettings(userId);
    if (
      job.operation === "add" &&
      (!current.enabled || current.generation !== job.generation)
    ) {
      await collection.updateOne(
        { _id: job._id },
        { $set: { status: "cancelled" } },
      );
      continue;
    }
    try {
      if (job.operation === "delete") {
        const active = await collection.findOne({
          userId,
          namespace: job.namespace,
          operation: "add",
          status: "delivering",
          leaseUntil: { $gt: now },
        });
        if (active) {
          await collection.updateOne(
            { _id: job._id },
            { $set: { status: "pending", retryAt: active.leaseUntil! } },
          );
          continue;
        }
        await client.namespaces.delete(job.namespace);
      } else
        await client.add(job.namespace, {
          id: job._id,
          content: job.content,
          dreaming: "instant",
          taskType: "memory",
          supportingContext:
            "Developer learning history. These are observed practice events and user-stated preferences, not personality diagnoses or assistant instructions.",
          metadata: { product: "RepoRush", eventId: job._id },
        });
      await collection.updateOne(
        { _id: job._id },
        { $set: { status: "delivered" }, $inc: { attempts: 1 } },
      );
      delivered++;
    } catch (error) {
      if (
        job.operation === "delete" &&
        (error as { statusCode?: number }).statusCode === 404
      ) {
        await collection.updateOne(
          { _id: job._id },
          { $set: { status: "delivered" } },
        );
        continue;
      }
      await collection.updateOne(
        { _id: job._id },
        {
          $set: {
            status: "pending",
            retryAt: new Date(
              Date.now() +
                Math.min(3600000, 15000 * 2 ** Math.min(job.attempts, 8)),
            ),
          },
          $inc: { attempts: 1 },
        },
      );
      return { status: "pending", delivered };
    }
  }
  const pending = await collection.countDocuments({
    userId,
    status: { $in: ["pending", "delivering"] },
  });
  return { status: pending ? "pending" : "synced", delivered };
}
export async function recallLearning(userId: string, query: string) {
  const settings = await memorySettings(userId);
  if (!settings.enabled)
    return { status: "off", memories: [] as RecalledMemory[] };
  if (!process.env.SUPERMEMORY_API_KEY)
    return { status: "unconfigured", memories: [] as RecalledMemory[] };
  try {
    const namespace = namespaceFor(userId, settings.generation);
    const client = memoryClient();
    const [search, profile] = await Promise.all([
      client
        .search(namespace, {
          query: redact(query).slice(0, 1000),
          limit: 4,
          threshold: 0.25,
          searchMode: "hybrid",
        })
        .catch((error) => {
          if ((error as { statusCode?: number }).statusCode === 404)
            return { results: [] };
          throw error;
        }),
      client.profile(namespace).catch((error) => {
        if ((error as { statusCode?: number }).statusCode === 404)
          return { profile: { static: [], dynamic: [] } };
        throw error;
      }),
    ]);
    const memories: RecalledMemory[] = search.results
      .filter((result) => result.isLatest !== false)
      .map((result) => ({
        id: result.id,
        text: redact(result.memory || result.chunk || "").slice(0, 1000),
        source: "search",
      }));
    for (const item of [
      ...profile.profile.static,
      ...profile.profile.dynamic,
    ].slice(0, 4))
      if (!memories.some((memory) => memory.id === item.id))
        memories.push({
          id: item.id,
          text: redact(item.memory).slice(0, 1000),
          source: "profile",
        });
    const latest = await memorySettings(userId);
    if (latest.generation !== settings.generation || !latest.enabled)
      return { status: "off", memories: [] as RecalledMemory[] };
    return {
      status: "recalled",
      memories: memories.filter((memory) => memory.text).slice(0, 6),
    };
  } catch {
    return { status: "unavailable", memories: [] as RecalledMemory[] };
  }
}
export async function forgetLearning(userId: string) {
  const settings = await memorySettings(userId);
  const db = await getDatabase();
  await db
    .collection<Settings>("memorySettings")
    .updateOne(
      { _id: userId },
      { $set: { enabled: false }, $inc: { generation: 1 } },
      { upsert: true },
    );
  for (const namespace of [
    namespaceFor(userId, settings.generation),
    `reporush_user_${userId}`,
  ]) {
    if (namespace.length > 100 || !/^[\w:-]+$/.test(namespace)) continue;
    await db.collection<MemoryJob>("memoryOutbox").insertOne({
      _id: randomUUID(),
      userId,
      generation: settings.generation,
      namespace,
      operation: "delete",
      content: "",
      status: "pending",
      attempts: 0,
      retryAt: new Date(),
      createdAt: new Date(),
    });
  }
  const delivery = await flushMemories(userId, 3);
  return { forgotten: true, enabled: false, deletion: delivery.status };
}
export async function rememberLearningEvent(
  userId: string,
  event: LearningEvent,
) {
  const challenge = challenges.find(
    (challenge) => challenge.id === event.challengeId,
  );
  if (!challenge) return { status: "ignored" };
  const action = {
    challenge_started: "Opened",
    hint_revealed: "Requested a progressive hint for",
    submission_failed:
      "Submitted a patch that did not pass the configured checks for",
    submission_passed:
      "Submitted a patch that passed the configured checks for",
  }[event.type];
  const result = await queueMemory(
    userId,
    `${action} ${challenge.title} (${challenge.id}), a ${challenge.difficulty} ${challenge.language} exercise involving ${challenge.skills.join(", ")}. This is a practice observation; do not infer lasting mastery or weakness from one event.`,
    event.eventId,
  );
  return result.status === "off" ? result : await flushMemories(userId, 1);
}

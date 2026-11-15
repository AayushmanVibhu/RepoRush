import { Supermemory } from "supermemory";

export type LearningEvent = {
  challengeId: string;
  type:
    | "challenge_started"
    | "hint_revealed"
    | "submission_failed"
    | "submission_passed";
  summary: string;
};

export async function rememberLearningEvent(
  userId: string,
  event: LearningEvent,
) {
  if (!process.env.SUPERMEMORY_API_KEY) return { configured: false };
  const client = new Supermemory({ apiKey: process.env.SUPERMEMORY_API_KEY });
  const namespace = `reporush_user_${userId}`;
  await client.add(namespace, {
    id: `${event.challengeId}-${Date.now()}`,
    content: `[${event.type}] ${event.challengeId}: ${event.summary}`,
    metadata: {
      product: "RepoRush",
      challengeId: event.challengeId,
      eventType: event.type,
    },
    dreaming: "dynamic",
  });
  return { configured: true };
}

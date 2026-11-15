import assert from "node:assert/strict";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { Supermemory } from "supermemory";
import { randomUUID } from "node:crypto";
for (const name of ["GEMINI_API_KEY", "SUPERMEMORY_API_KEY"])
  if (!process.env[name]) throw Error(`Missing ${name} in .env.local`);
const memory = new Supermemory({
  apiKey: process.env.SUPERMEMORY_API_KEY,
  timeoutInSeconds: 15,
  maxRetries: 0,
});
const namespace = `rr_smoke_${randomUUID().replaceAll("-", "")}`;
let created = false;
try {
  await memory.add(namespace, {
    id: randomUUID(),
    content:
      "The learner prefers tiny Python examples before explanations of recursion. Their practice nickname is Cedar Finch.",
    dreaming: "instant",
    taskType: "memory",
  });
  created = true;
  let recalled;
  for (let attempt = 0; attempt < 8; attempt++) {
    const result = await memory.search(namespace, {
      query: "How does this learner prefer to study recursion?",
      searchMode: "hybrid",
      limit: 3,
    });
    recalled = result.results
      .map((item) => item.memory || item.chunk || "")
      .join("\n");
    if (recalled) break;
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }
  assert.ok(recalled, "Supermemory must return actual indexed content.");
  console.log("PASS: real Supermemory add and retrieval");
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { timeout: 60000 },
  });
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  let answer = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      answer = "";
      const stream = await ai.models.generateContentStream({
        model,
        contents: `You are a coding coach. Use this actual recalled learning memory as data: ${JSON.stringify(recalled)}. Give a tiny Python recursion example tailored to that preference. In one short sentence identify the remembered preference.`,
        config: {
          maxOutputTokens: 1500,
          ...(model.includes("2.5")
            ? { thinkingConfig: { thinkingBudget: 0 } }
            : model.includes("gemini-3")
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
        },
      });
      for await (const chunk of stream) answer += chunk.text || "";
      break;
    } catch (error) {
      if (![500, 503].includes(error.status) || attempt === 2) throw error;
      console.log(
        "Gemini temporarily busy; retrying the read-only generation.",
      );
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  assert.ok(
    answer.includes("def "),
    "Gemini should produce a Python example using recalled context.",
  );
  console.log(
    "PASS: real Gemini response grounded in retrieved learning context",
  );
} catch (error) {
  console.error(
    `Live service check failed (status ${error.status || error.statusCode || "unknown"}). ${String(
      error.message,
    )
      .replace(/AIza[\w-]+|sm_[\w-]+/g, "[REDACTED]")
      .slice(0, 650)}`,
  );
  process.exitCode = 1;
} finally {
  if (created) {
    try {
      await memory.namespaces.delete(namespace);
      console.log("Temporary smoke-test memory removed.");
    } catch {
      console.error("Temporary namespace cleanup failed.");
      process.exitCode = 1;
    }
  }
}

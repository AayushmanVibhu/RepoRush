import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as crypto from "node:crypto";
const require = createRequire(import.meta.url);
const ts = require("typescript");
function load(path, dependencies, env = {}) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(new URL(`../${path}`, import.meta.url), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    {
      exports,
      process: { env },
      Date,
      require(name) {
        assert.ok(name in dependencies, name);
        return dependencies[name];
      },
    },
  );
  return exports;
}
const policy = load("lib/coach-policy.ts", { "node:crypto": crypto });
assert.notEqual(policy.namespaceFor("alice"), policy.namespaceFor("bob"));
assert.notEqual(policy.namespaceFor("alice"), policy.namespaceFor("alice", 1));
assert.ok(!policy.namespaceFor("alice").includes("alice"));
for (const secret of [
  'password="example-secret"',
  `AIza${"a".repeat(35)}`,
  "mongodb+srv://" + "fixture-user:fixture-password@" + "catalog.invalid",
  "Bearer abcdefghijklmnop",
])
  assert.ok(policy.redact(secret).includes("REDACTED"));
for (const path of [
  ".env.local",
  "a/.git/config",
  "secrets.json",
  "server.key",
])
  assert.equal(policy.shareablePath(path), false);
const files = { "src/a.py": "return 1\n" };
const patch = policy.patchFrom(
  { path: "src/a.py", original: "return 1", replacement: "return 2" },
  files,
);
assert.equal(
  patch.baseHash,
  crypto.createHash("sha256").update(files["src/a.py"]).digest("hex"),
);
assert.equal(
  policy.patchFrom(
    { path: "tests/a.py", original: "x", replacement: "y" },
    { "tests/a.py": "x" },
  ),
  undefined,
);
assert.equal(
  policy.patchFrom(
    { path: "src/a.py", original: "x", replacement: "y" },
    { "src/a.py": "xx" },
  ),
  undefined,
);
assert.equal(
  policy.patchFrom(
    { path: "src/a.py", original: "missing", replacement: "y" },
    files,
  ),
  undefined,
);
const context = policy.buildCoachContext({
  mode: "hint",
  question: "Help",
  challenge: { id: "a" },
  selected: "a",
  files: {
    a: "x".repeat(14000),
    b: "y".repeat(14000),
    c: "z",
    ".env": "SECRET",
  },
  output: "student output",
  memories: [],
});
assert.equal(Object.values(context.shared).join("").length, 24000);
assert.ok(!context.prompt.includes("SECRET"));
assert.match(context.prompt, /studentSuppliedOutput/);
assert.match(context.prompt, /No server-verified/);
let configuration;
class AI {
  models = {
    generateContentStream: async (args) => {
      configuration = args;
      return (async function* () {
        yield { text: "A hint" };
      })();
    },
  };
}
const coach = load(
  "lib/coach.ts",
  {
    "@google/genai": {
      GoogleGenAI: AI,
      ThinkingLevel: { LOW: "LOW" },
      Type: { OBJECT: "OBJECT", STRING: "STRING" },
    },
    "node:crypto": crypto,
    "./mongodb": {},
    "./coach-policy": policy,
    "./supermemory": {},
  },
  { GEMINI_API_KEY: "test" },
);
for await (const chunk of coach.geminiAnswer("prompt", [], "hint"))
  assert.equal(chunk.text, "A hint");
assert.equal(configuration.config.tools, undefined);
for await (const chunk of coach.geminiAnswer("prompt", [], "debug")) {
}
assert.equal(
  configuration.config.tools[0].functionDeclarations[0].name,
  "proposePatch",
);
const db = {
  collection: () => ({
    findOne: async () => ({ enabled: true, generation: 0 }),
  }),
};
class BrokenMemory {
  search = async () => {
    throw Error("outage");
  };
  profile = async () => {
    throw Error("outage");
  };
}
const dependencies = {
  supermemory: { Supermemory: BrokenMemory },
  "node:crypto": crypto,
  "./mongodb": { getDatabase: async () => db },
  "./coach-policy": policy,
  "./challenge-catalog": { getChallengeDetails: async () => null },
  "./sandbox-policy": { SandboxProblem: class SandboxProblem extends Error {} },
};
const memory = load("lib/supermemory.ts", dependencies, {
  SUPERMEMORY_API_KEY: "test",
});
const recall = await memory.recallLearning("alice", "help");
assert.equal(recall.status, "unavailable");
assert.equal(recall.memories.length, 0);
class EmptyMemory {
  search = async () => ({ results: [] });
  profile = async () => ({ profile: { static: [], dynamic: [] } });
}
const empty = load(
  "lib/supermemory.ts",
  { ...dependencies, supermemory: { Supermemory: EmptyMemory } },
  { SUPERMEMORY_API_KEY: "test" },
);
assert.equal((await empty.recallLearning("alice", "help")).memories.length, 0);
console.log(
  "PASS: namespace isolation, redaction, context limits, exact patch validation, mode tools and honest retrieval failures",
);

let profile = null;
let profileWrites = 0;
const settingsCollection = {
  findOne: async () => profile,
  updateOne: async (_filter, update) => {profileWrites++; profile ||= update.$setOnInsert;},
};
const defaultMemory = load('lib/supermemory.ts', {...dependencies, './mongodb': {getDatabase: async () => ({collection: () => settingsCollection})}}, {SUPERMEMORY_API_KEY: 'test'});
assert.equal((await defaultMemory.memorySettings('new-user')).enabled, true);
assert.equal(profile._id, 'new-user');
assert.equal(profileWrites, 1);
profile.enabled = false;
assert.equal((await defaultMemory.memorySettings('new-user')).enabled, false);
assert.equal(profileWrites, 1, 'Reading a profile must preserve explicit opt-outs');

let rememberedExchange;
const conversationDB = {collection: () => ({findOne: async () => null, updateOne: async () => ({matchedCount: 1})})};
const exchangeCoach = load('lib/coach.ts', {'@google/genai': {GoogleGenAI: AI, ThinkingLevel: {LOW: 'LOW'}, Type: {}}, 'node:crypto': crypto, './mongodb': {getDatabase: async () => conversationDB}, './coach-policy': policy, './supermemory': {queueMemory: async (userId, content) => {rememberedExchange = {userId, content};}}});
const savedChat = await exchangeCoach.completeCoach('alice', 'challenge-a', 'Explain recursion', 'Start small.\n```python\nprint("source-code")\n```', [], undefined);
assert.equal(savedChat.length, 2);
assert.equal(rememberedExchange.userId, 'alice');
assert.match(rememberedExchange.content, /Explain recursion/);
assert.match(rememberedExchange.content, /not verified mastery/);
assert.ok(!rememberedExchange.content.includes('source-code'));
console.log('PASS: default-on profiles persist, explicit opt-outs survive, and coaching context omits fenced source code');

import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = resolve(import.meta.dirname, "..");
function load(file, dependencies, extra = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(resolve(root, file), "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  vm.runInNewContext(source, {
    exports,
    require(name) {
      if (name in dependencies) return dependencies[name];
      throw Error(`Unexpected dependency: ${name}`);
    },
    process: { env: { E2B_API_KEY: "test-only-server-key" } },
    ...extra,
  });
  return exports;
}
const policy = load("lib/sandbox-policy.ts", {});
const reports = load("lib/test-results.ts", {});
for (const path of [
  "../secret",
  "/etc/passwd",
  "src/../../x",
  "a\\b",
  "a//b",
  "./x",
  "a\0b",
  "C:/x",
]) {
  assert.throws(() => policy.validateFiles({ [path]: "x" }));
}
assert.throws(() => policy.validateFiles({ valid: 2 }));
assert.throws(() => policy.validateFiles({ valid: "x".repeat(250001) }));
assert.throws(() =>
  policy.validateFiles(
    Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`a${i}`, "x"])),
  ),
);
assert.equal(
  policy.validateFiles({ "src/code.py": "print(1)" })["src/code.py"],
  "print(1)",
);
assert.ok(policy.executionPlan("RR-104").command.includes("node --test"));
assert.equal(
  policy.executionPlan("RR-INT-JAVA-001").command.includes("javac"),
  true,
);
const merged = policy.mergeFiles(
  { a: "editor", b: "old" },
  { a: "old", b: "old" },
  { a: "old", b: "terminal", c: "new" },
);
assert.equal(merged.files.a, "editor");
assert.equal(merged.files.b, "terminal");
assert.equal(merged.files.c, "new");
assert.equal(
  policy.mergeFiles({ a: "left" }, { a: "base" }, { a: "right" }).conflicts[0],
  "a",
);
assert.equal(
  "a" in policy.mergeFiles({ a: "base" }, { a: "base" }, {}).files,
  false,
);

let row = {
  _id: "owner",
  challengeId: "RR-INT-JS-002",
  sandboxId: "owned-vm",
  pid: 123,
  startedAt: new Date(),
  expiresAt: new Date(Date.now() + 300000),
};
let locked = false;
const store = {
  async updateOne() {},
  async findOne(query) {
    return row &&
      row._id === query._id &&
      (!query.challengeId || row.challengeId === query.challengeId) &&
      row.expiresAt > new Date()
      ? row
      : null;
  },
  async findOneAndUpdate() {
    return locked ? null : { count: 0 };
  },
};
let uploaded;
let destroyed = 0;
let failTests = false;
let options;
class CommandExitError extends Error {
  stdout = "failing test";
  stderr = "";
  exitCode = 1;
}
const fakeSandbox = {
  sandboxId: "fresh-grading-vm",
  async kill() {
    destroyed++;
  },
  async setTimeout() {},
  files: {
    async makeDir() {},
    async write(files) {
      uploaded = files;
    },
    async read() {
      return "changed in terminal";
    },
  },
  commands: {
    async run(command, options) {
      if (command.startsWith("node --test") && failTests)
        throw new CommandExitError();
      options?.onStdout?.("TAP version 13\nok 1 - produces the expected result\n1..1\n");
      return { stdout: "test output", stderr: "", exitCode: 0 };
    },
  },
};
const sandbox = load("lib/linux-sandbox.ts", {
  "./challenge-model": load("lib/challenge-model.ts", { "./sandbox-policy": policy }),
  e2b: {
    CommandExitError,
    Sandbox: {
      async create(_template, opts) {
        options = opts;
        return fakeSandbox;
      },
      async connect(id) {
        assert.equal(id, "owned-vm");
        return fakeSandbox;
      },
    },
  },
  "node:crypto": { randomUUID },
  "./mongodb": {
    async getDatabase() {
      return {
        collection() {
          return store;
        },
      };
    },
  },
  "@/app/challenges": { challenges: [] },
  "./sandbox-policy": policy,
  "./test-results": reports,
});
await assert.rejects(
  sandbox.ownedSandbox("attacker", "RR-INT-JS-002"),
  (error) => error.status === 410,
);
await assert.rejects(
  sandbox.ownedSandbox("owner", "other-challenge"),
  (error) => error.status === 410,
);
await sandbox.ownedSandbox("owner", "RR-INT-JS-002");
await assert.rejects(
  sandbox.syncEditor(
    "owner",
    "RR-INT-JS-002",
    { "index.js": "editor" },
    { "index.js": "base" },
  ),
  (error) => error.status === 409,
);
const challenge = {
  id: "RR-INT-JS-002",
  language: "JavaScript",
  entryFile: "src/index.js",
  files: {
    "src/index.js": "starter",
    "reporush/regression.test.cjs": "trusted test",
    "package.json": "trusted config",
  },
};
const clientFiles = {
  "src/index.js": "fixed",
  "src/helper.js": "new helper",
  "reporush/regression.test.cjs": "tampered test",
  "package.json": "tampered config",
};
const success = await sandbox.runVerifiedTests("owner", challenge, clientFiles);
assert.equal(success.results[0].pass, true);
assert.equal(
  uploaded.find((file) => file.path.endsWith("/src/index.js")).data,
  "fixed",
);
assert.equal(
  uploaded.find((file) => file.path.endsWith("/src/helper.js")).data,
  "new helper",
);
assert.equal(
  uploaded.find((file) => file.path.endsWith("/reporush/regression.test.cjs"))
    .data,
  "trusted test",
);
assert.equal(
  uploaded.find((file) => file.path.endsWith("/package.json")).data,
  "trusted config",
);
assert.equal(options.envs, undefined); // Application keys are never placed in VM environment variables.
assert.equal(destroyed, 1);
failTests = true;
const failed = await sandbox.runVerifiedTests("owner", challenge, clientFiles);
assert.equal(failed.results[0].pass, false);
assert.equal(destroyed, 2);
locked = true;
await assert.rejects(
  sandbox.runVerifiedTests("owner", challenge, clientFiles),
  (error) => error.status === 409,
);
console.log(
  "Linux policy and adapter checks passed: path limits, file merges, ownership, conflict detection, trusted tests/config, fresh grading and cleanup. Provider calls are mocked; live smoke verification is separate.",
);

import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
let actor = null;
let queries = [];
let stopped = [];
const rows = Object.fromEntries(
  ["challengeProgress", "submissions", "testRuns"].map((name) => [
    name,
    [{ userId: "alice" }, { userId: "bob" }],
  ]),
);
const db = {
  collection(name) {
    return {
      findOne: async (query) => {
        queries.push({ name, query });
        return { challengeId: "challenge-a" };
      },
      deleteMany: async (query) => {
        queries.push({ name, query });
        rows[name] = rows[name].filter((row) => row.userId !== query.userId);
      },
    };
  },
};
const dependencies = {
  "next/server": {
    NextResponse: {
      json: (body, options = {}) => ({ body, status: options.status || 200 }),
    },
  },
  "@/lib/auth": { auth: async () => actor },
  "@/lib/mongodb": { getDatabase: async () => db },
  "@/lib/linux-sandbox": { stopSession: async (...args) => stopped.push(args) },
};
const exports = {};
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(
      new URL("../app/api/progress/route.ts", import.meta.url),
      "utf8",
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText,
  {
    exports,
    require(name) {
      assert.ok(name in dependencies);
      return dependencies[name];
    },
  },
);
const request = (
  body = { confirmation: "delete-my-progress" },
  origin = "https://reporush.test",
) => ({
  headers: { get: () => origin },
  nextUrl: { origin: "https://reporush.test" },
  json: async () => body,
});
assert.equal((await exports.DELETE(request())).status, 401);
assert.equal(queries.length, 0);
actor = { user: { id: "alice" } };
assert.equal(
  (await exports.DELETE(request({}, "https://other.test"))).status,
  403,
);
assert.equal((await exports.DELETE(request({}))).status, 400);
assert.equal(queries.length, 0, "No database deletion before confirmation");
const result = await exports.DELETE(request());
assert.equal(result.status, 200);
assert.equal(result.body.deleted, true);
for (const items of Object.values(rows)) {
  assert.equal(items.length, 1);
  assert.equal(items[0].userId, "bob");
}
assert.deepEqual(stopped, [["alice", "challenge-a"]]);
assert.ok(
  queries.every(
    ({ query }) => query.userId === "alice" || query._id === "alice",
  ),
);
console.log(
  "PASS: authentication, same-origin confirmation, own-account deletion, Linux cleanup and preservation of other users",
);

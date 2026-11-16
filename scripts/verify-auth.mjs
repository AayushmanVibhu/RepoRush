import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as crypto from "node:crypto";
import { ObjectId } from "mongodb";
const require = createRequire(import.meta.url);
const ts = require("typescript");
function load(path, dependencies) {
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
      Buffer,
      Date,
      console,
      process: { env: { AUTH_SECRET: "fixture-auth-secret-for-tests" } },
      require(name) {
        assert.ok(name in dependencies, name);
        return dependencies[name];
      },
    },
  );
  return exports;
}
const passwords = load("lib/passwords.ts", { "node:crypto": crypto });
assert.equal(passwords.normalizeUsername("  Test_User  "), "test_user");
for (const input of [
  null,
  { $ne: "" },
  "ab",
  "a b",
  "../admin",
  "a".repeat(31),
  "école",
])
  assert.equal(passwords.normalizeUsername(input), null);
assert.equal(passwords.validNewPassword(" ".repeat(20)), false);
assert.equal(passwords.validNewPassword("short"), false);
assert.equal(passwords.validNewPassword("x".repeat(7)), false);
assert.equal(passwords.validNewPassword("x".repeat(8)), true);
const minimumHash = await passwords.hashPassword("x".repeat(8));
assert.equal(await passwords.verifyPassword("x".repeat(8), minimumHash), true);
assert.equal(passwords.validNewPassword("x".repeat(129)), false);
const phrase = "fixture-passphrase-with-spaces  ";
const first = await passwords.hashPassword(phrase),
  second = await passwords.hashPassword(phrase);
assert.notEqual(first, second);
assert.ok(!first.includes(phrase));
assert.equal(await passwords.verifyPassword(phrase, first), true);
assert.equal(await passwords.verifyPassword(phrase.trim(), first), false);
assert.equal(
  await passwords.verifyPassword("fixture-wrong-password", first),
  false,
);
assert.equal(
  await passwords.verifyPassword(phrase, first.replace("131072", "999999999")),
  false,
);
assert.equal(await passwords.verifyPassword(phrase, "corrupt"), false);

const stores = new Map();
const indexes = [];
let failInsert = false;
function equal(a, b) {
  return String(a) === String(b);
}
function matches(row, query) {
  return Object.entries(query).every(([key, value]) =>
    value && typeof value === "object" && "$lt" in value
      ? row[key] < value.$lt
      : equal(row[key], value),
  );
}
function store(name) {
  if (!stores.has(name)) stores.set(name, new Map());
  return stores.get(name);
}
function collection(name) {
  return {
    createIndex: async (keys, options) => {
      indexes.push({ name, keys, options });
    },
    findOne: async (query) =>
      [...store(name).values()].find((row) => matches(row, query)) || null,
    updateOne: async (query, update, options) => {
      let row = [...store(name).values()].find((row) => matches(row, query));
      if (!row && options?.upsert) {
        row = { ...query, ...update.$setOnInsert };
        store(name).set(String(row._id), row);
      }
      return { matchedCount: row ? 1 : 0 };
    },
    findOneAndUpdate: async (query, update) => {
      const row = [...store(name).values()].find((row) => matches(row, query));
      if (!row) return null;
      const previous = { ...row };
      for (const [key, value] of Object.entries(update.$inc || {}))
        row[key] = (row[key] || 0) + value;
      return previous;
    },
    insertOne: async (row) => {
      if (failInsert && name === "app:passwordAccounts") {
        failInsert = false;
        throw Error("fixture-database-failure");
      }
      if (
        store(name).has(String(row._id)) ||
        (name === "app:passwordAccounts" &&
          [...store(name).values()].some(
            (value) => value.userId === row.userId,
          ))
      )
        throw Object.assign(Error("fixture-duplicate"), { code: 11000 });
      store(name).set(String(row._id), { ...row });
      return { insertedId: row._id };
    },
  };
}
const client = {
  db: () => ({ collection: (name) => collection(`auth:${name}`) }),
  startSession: () => ({
    withTransaction: async (callback) => {
      const snapshot = new Map(
        [...stores].map(([name, rows]) => [
          name,
          new Map([...rows].map(([key, row]) => [key, { ...row }])),
        ]),
      );
      try {
        return await callback();
      } catch (error) {
        stores.clear();
        for (const [name, rows] of snapshot) stores.set(name, rows);
        throw error;
      }
    },
    endSession: async () => {},
  }),
};
const verifyHashes = [];
const service = load("lib/password-accounts.ts", {
  "node:crypto": crypto,
  mongodb: { ObjectId },
  "./mongodb": {
    getDatabase: async () => ({
      collection: (name) => collection(`app:${name}`),
    }),
    getMongoClient: async () => client,
  },
  "./passwords": {
    ...passwords,
    verifyPassword: async (password, hash) => {
      verifyHashes.push(hash);
      return passwords.verifyPassword(password, hash);
    },
  },
});
const request = (ip) =>
  new Request("https://reporush.test/api/register", {
    headers: { "x-forwarded-for": ip },
  });
const input = (username, password = phrase) => ({
  username,
  password,
  confirmPassword: password,
});
await service.registerPasswordAccount(
  { ...input("Alice_01"), userId: "forged-owner" },
  null,
  request("192.0.2.1"),
);
const alice = store("app:passwordAccounts").get("alice_01");
assert.ok(ObjectId.isValid(alice.userId));
assert.notEqual(alice.userId, "forged-owner");
assert.ok(
  !JSON.stringify(
    [...stores].map(([name, rows]) => [name, [...rows.values()]]),
  ).includes(phrase),
);
assert.ok(
  !(
    "passwordHash" in
    (await service.registerPasswordAccount(
      input("Charlie_01"),
      null,
      request("192.0.2.2"),
    ))
  ),
);
const signedIn = await service.authenticatePassword(
  "ALICE_01",
  phrase,
  request("192.0.2.1"),
);
assert.equal(signedIn.id, alice.userId);
assert.equal(signedIn.username, "Alice_01");
assert.ok(!("passwordHash" in signedIn));
assert.equal(
  await service.authenticatePassword(
    "Alice_01",
    "fixture-wrong-password",
    request("192.0.2.1"),
  ),
  null,
);
assert.equal(
  await service.authenticatePassword(
    "Missing_User",
    phrase,
    request("192.0.2.1"),
  ),
  null,
);
assert.equal(verifyHashes.at(-1), passwords.DUMMY_PASSWORD_HASH);
const count = store("auth:users").size;
await assert.rejects(
  service.registerPasswordAccount(
    input("alice_01"),
    null,
    request("192.0.2.3"),
  ),
  (error) => error.status === 409,
);
assert.equal(store("auth:users").size, count);
await assert.rejects(
  service.registerPasswordAccount(
    { ...input("Mismatch"), confirmPassword: "different" },
    null,
    request("192.0.2.3"),
  ),
  (error) => error.status === 400,
);

const githubId = new ObjectId();
await collection("auth:users").insertOne({
  _id: githubId,
  name: "Existing GitHub Developer",
  email: "fixture@example.test",
  image: null,
});
await collection("app:challengeProgress").insertOne({
  _id: "fixture-progress",
  userId: githubId.toHexString(),
  status: "completed",
});
await service.registerPasswordAccount(
  input("Github_User"),
  { id: githubId.toHexString() },
  request("192.0.2.4"),
);
const linked = await service.authenticatePassword(
  "github_user",
  phrase,
  request("192.0.2.4"),
);
assert.equal(linked.id, githubId.toHexString());
assert.equal(linked.name, "Existing GitHub Developer");
assert.equal(
  store("app:challengeProgress").get("fixture-progress").status,
  "completed",
);
await assert.rejects(
  service.registerPasswordAccount(
    input("Second_Username"),
    { id: githubId.toHexString() },
    request("192.0.2.4"),
  ),
  (error) => error.status === 409,
);
const beforeFailure = store("auth:users").size;
failInsert = true;
await assert.rejects(
  service.registerPasswordAccount(
    input("Rollback_User"),
    null,
    request("192.0.2.5"),
  ),
);
assert.equal(store("auth:users").size, beforeFailure);
assert.ok(!store("app:passwordAccounts").has("rollback_user"));
for (let i = 0; i < 10; i++)
  await service.accountPermit(request("192.0.2.6"), "login", "rate_test");
await assert.rejects(
  service.accountPermit(request("192.0.2.6"), "login", "rate_test"),
  (error) => error.status === 429,
);
assert.ok(
  [...store("app:authRateLimits").keys()].every(
    (key) => !key.includes("192.0.2.") && !key.includes("alice"),
  ),
);
assert.ok(
  indexes.some(
    (item) => item.name === "app:passwordAccounts" && item.options.unique,
  ),
);
assert.ok(
  indexes.some(
    (item) =>
      item.name === "app:authRateLimits" &&
      item.options.expireAfterSeconds === 0,
  ),
);

let accountCalls = 0;
let requestActor = null;
const route = load("app/api/register/route.ts", {
  "next/server": {
    NextResponse: {
      json: (body, options = {}) => ({ body, status: options.status || 200 }),
    },
  },
  "@/lib/auth": { auth: async () => requestActor },
  "@/lib/password-accounts": {
    AccountError: service.AccountError,
    registerPasswordAccount: async (_input, existing) => {
      accountCalls++;
      assert.equal(existing, requestActor?.user || null);
      return { created: true };
    },
  },
});
const routeRequest = (origin, raw) => ({
  headers: { get: () => origin },
  nextUrl: { origin: "https://reporush.test" },
  text: async () => raw,
});
assert.equal(
  (await route.POST(routeRequest("https://attacker.test", "{}"))).status,
  403,
);
assert.equal(
  (await route.POST(routeRequest("https://reporush.test", "x".repeat(4097))))
    .status,
  413,
);
assert.equal(
  (await route.POST(routeRequest("https://reporush.test", "invalid json")))
    .status,
  400,
);
assert.equal(accountCalls, 0);
assert.equal(
  (
    await route.POST(
      routeRequest("https://reporush.test", '{"userId":"forged-owner"}'),
    )
  ).status,
  201,
);
assert.equal(accountCalls, 1);
assert.equal(
  (await route.POST(routeRequest("https://reporush.test", '{"intent":"link"}')))
    .status,
  401,
);
requestActor = { user: { id: githubId.toHexString() } };
assert.equal(
  (
    await route.POST(
      routeRequest("https://reporush.test", '{"intent":"create"}'),
    )
  ).status,
  409,
);
assert.equal(
  accountCalls,
  1,
  "A stale registration page must not silently link another account",
);
assert.equal(
  (
    await route.POST(
      routeRequest(
        "https://reporush.test",
        '{"intent":"link","userId":"forged-owner"}',
      ),
    )
  ).status,
  201,
);
assert.equal(accountCalls, 2);
console.log(
  "PASS: salted scrypt, exact password verification, username normalization, generic failures, dummy verification, atomic signup, uniqueness, throttling, authenticated linking, existing progress and registration request guards",
);

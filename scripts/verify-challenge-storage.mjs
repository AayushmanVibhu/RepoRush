import assert from "node:assert/strict";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { mock } from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { MongoClient } from "mongodb";
import { loadTypeScript, mockTypeScript } from "./test-catalog-loader.mjs";

// Use the real driver and script loader before replacing the database for the other tests.
const originalMongoUri = process.env.MONGODB_URI;
const connectionError = new Error("Simulated MongoDB connection failure");
const connect = mock.method(MongoClient.prototype, "connect", async function () {
  assert.ok(this instanceof MongoClient);
  throw connectionError;
});
const close = mock.method(MongoClient.prototype, "close", async () => {});
try {
  process.env.MONGODB_URI = "mongodb://127.0.0.1:1";
  const { getMongoClient } = loadTypeScript("lib/mongodb.ts");
  await assert.rejects(
    async () => getMongoClient(),
    (error) => error === connectionError,
  );
  assert.equal(connect.mock.callCount(), 1);
  assert.equal(close.mock.callCount(), 1);
} finally {
  mock.restoreAll();
  if (originalMongoUri === undefined) delete process.env.MONGODB_URI;
  else process.env.MONGODB_URI = originalMongoUri;
}
console.log(
  "PASS: script loader imports the real MongoDB constructor and propagates connection failures.",
);

const tempRoot = await realpath(tmpdir());
const root = await mkdtemp(join(tempRoot, "reporush-storage-verify-"));
process.env.CHALLENGE_STORAGE_DIR = root;
process.env.CHALLENGE_STORAGE_PROVIDER = "local";
delete process.env.CHALLENGE_CATALOG_SOURCE;
globalThis.indexedDB = new IDBFactory();
const browserStorage = new Map();
const storageApi = {
  getItem: (key) => browserStorage.get(key) ?? null,
  setItem: (key, value) => browserStorage.set(key, value),
  removeItem: (key) => browserStorage.delete(key),
};
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: new Proxy(storageApi, {
    ownKeys: () => [...browserStorage.keys()],
    getOwnPropertyDescriptor: () => ({ configurable: true, enumerable: true }),
  }),
});

let authenticated = true;
let catalogDown = false;
let databaseUnavailable = false;
const versionRows = new Map();
const workspaceRows = new Map();
const submissions = [];
let failSubmissionWrite = false;
const indexes = [];
const versions = {
  async findOne({ _id, challengeId, published }) {
    if (catalogDown) throw new Error("Mock MongoDB failure");
    const row = _id
      ? versionRows.get(_id)
      : [...versionRows.values()]
          .filter(
            (row) =>
              row.challengeId === challengeId && row.published === published,
          )
          .sort(
            (a, b) =>
              b.publishedAt - a.publishedAt ||
              b.version.localeCompare(a.version),
          )[0];
    return row && (published === undefined || row.published === published)
      ? row
      : null;
  },
  aggregate(pipeline) {
    return {
      async toArray() {
        if (catalogDown) throw new Error("Mock MongoDB failure");
        assert.deepEqual(JSON.parse(JSON.stringify(pipeline[0])), {
          $match: { published: true },
        });
        assert.equal(
          pipeline.find((step) => step.$project).$project.details,
          0,
        );
        const latest = new Map();
        for (const row of [...versionRows.values()].sort(
          (a, b) => a.publishedAt - b.publishedAt,
        )) {
          if (row.published) latest.set(row.challengeId, row);
        }
        return [...latest.values()].sort((a, b) => a.number - b.number);
      },
    };
  },
  async insertOne(row) {
    if (versionRows.has(row._id))
      throw Object.assign(new Error("Duplicate"), { code: 11000 });
    versionRows.set(row._id, structuredClone(row));
  },
  async createIndex(key, opts) {
    indexes.push({ key, opts });
  },
};
const workspaces = {
  async findOne({ userId, challengeId }) {
    return workspaceRows.get(`${userId}:${challengeId}`) ?? null;
  },
  async createIndex(key, opts) {
    indexes.push({ key, opts });
  },
  async updateOne(filter, update, options) {
    const key = `${filter.userId}:${filter.challengeId}`;
    const row = workspaceRows.get(key);
    if (!row && options.upsert) {
      workspaceRows.set(key, {
        _id: key,
        ...update.$setOnInsert,
        ...update.$set,
        ...update.$inc,
      });
      return { matchedCount: 0, upsertedCount: 1 };
    }
    if (
      !row ||
      (filter._id && row._id !== filter._id) ||
      (filter.challengeRevision?.$exists === false && row.challengeRevision) ||
      (filter["challengeRevision.version"] &&
        filter["challengeRevision.version"] !==
          row.challengeRevision?.version) ||
      (filter["challengeRevision.snapshotHash"] &&
        filter["challengeRevision.snapshotHash"] !==
          row.challengeRevision?.snapshotHash) ||
      (filter.updatedAt instanceof Date &&
        filter.updatedAt.getTime() !== row.updatedAt?.getTime())
    ) {
      return { matchedCount: 0, upsertedCount: 0 };
    }
    workspaceRows.set(key, { ...row, ...update.$set, ...update.$inc });
    return { matchedCount: 1, upsertedCount: 0 };
  },
};
const submissionRows = {
  async insertOne(row) {
    if (failSubmissionWrite)
      throw new Error("Injected submission write failure");
    submissions.push(row);
  },
};
mockTypeScript("lib/mongodb.ts", {
  getDatabase: async () => {
    if (databaseUnavailable) throw connectionError;
    return {
      collection: (name) =>
        name === "challengeVersions"
          ? versions
          : name === "submissions"
            ? submissionRows
            : workspaces,
    };
  },
  getMongoClient: async () => ({
    withSession: (run) =>
      run({
        async withTransaction(write) {
          const before = new Map(workspaceRows);
          try {
            return await write();
          } catch (error) {
            workspaceRows.clear();
            for (const [key, value] of before) workspaceRows.set(key, value);
            throw error;
          }
        },
      }),
  }),
});
mockTypeScript("lib/auth.ts", {
  auth: async () => (authenticated ? { user: { id: "learner" } } : null),
});
mockTypeScript("lib/supermemory.ts", {
  rememberLearningEvent: async () => undefined,
});
let lastRun;
mockTypeScript("lib/linux-sandbox.ts", {
  async runVerifiedTests(_user, challenge, files, plan) {
    lastRun = { challenge, files, plan };
    return {
      results: [{ name: "Server failure", pass: false }],
      durationMs: 20,
      output: "Server output",
    };
  },
});

const catalog = loadTypeScript("lib/challenge-catalog.ts");
const publisher = loadTypeScript("lib/challenge-publishing.ts");
const storageLib = loadTypeScript("lib/challenge-storage.ts");
const client = loadTypeScript("lib/challenge-client.ts");
const cache = loadTypeScript("lib/challenge-cache.ts");
const { canonicalSnapshot } = loadTypeScript("lib/challenge-model.ts");
const { executionPlan } = loadTypeScript("lib/sandbox-policy.ts");
const { challenges } = loadTypeScript("app/challenges.ts");
const list = loadTypeScript("app/api/challenges/route.ts");
const detail = loadTypeScript("app/api/challenges/[challengeId]/route.ts");
const progress = loadTypeScript("app/api/progress/[challengeId]/route.ts");
const submit = loadTypeScript("app/api/submissions/route.ts");
const call = (url, id) =>
  detail.GET(new Request(`http://localhost${url}`), {
    params: Promise.resolve({ challengeId: id }),
  });

try {
  const prepared = publisher.prepareLegacyPublications(new Date(0));
  const repeat = publisher.prepareLegacyPublications(new Date(1000));
  assert.equal(prepared.length, 40);
  assert.equal(
    new Set(prepared.map(({ publication }) => publication.challengeId)).size,
    40,
  );
  for (const [index, row] of prepared.entries()) {
    const original = challenges[index];
    assert.equal(row.publication.challengeId, original.id);
    assert.equal(row.publication.number, index + 1);
    assert.equal(row.publication.title, original.title);
    assert.equal(
      row.publication.details.source?.license,
      original.source?.license,
    );
    assert.equal(
      row.publication.snapshotHash,
      repeat[index].publication.snapshotHash,
    );
    assert.equal(
      row.publication.gradingHash,
      repeat[index].publication.gradingHash,
    );
    assert.equal(
      row.artifacts[0].bytes.toString(),
      canonicalSnapshot(original.files),
    );
    assert.equal(
      JSON.parse(row.artifacts[1].bytes.toString()).command,
      executionPlan(original.id).command,
    );
  }
  assert.equal(versionRows.size, 0);
  assert.throws(() => canonicalSnapshot({ "../outside.js": "x" }));
  assert.throws(() => canonicalSnapshot({ ".git/config": "x" }));
  assert.throws(() => canonicalSnapshot({ "binary.js": "binary\0" }));
  assert.throws(() => canonicalSnapshot({ "binary.exe": "text" }));

  const original = process.env.CHALLENGE_STORAGE_PROVIDER;
  process.env.CHALLENGE_STORAGE_PROVIDER = "r2";
  assert.equal(catalog.challengeCatalogSource(), "legacy");
  const legacyList = await (await list.GET()).json();
  assert.equal(legacyList.source, "legacy");
  assert.equal(legacyList.challenges.length, 40);
  assert.equal((await call("/api/challenges/RR-104", "RR-104")).status, 200);
  process.env.CHALLENGE_STORAGE_PROVIDER = original;
  authenticated = false;
  assert.equal((await list.GET()).status, 401);
  assert.equal((await call("/api/challenges/RR-104", "RR-104")).status, 401);
  authenticated = true;

  process.env.CHALLENGE_CATALOG_SOURCE = "database";
  assert.equal((await list.GET()).status, 503);
  const first = prepared[0];
  databaseUnavailable = true;
  await assert.rejects(
    publisher.createChallengeIndexes(),
    (error) => error === connectionError,
  );
  const unavailableStorage = {
    read: mock.fn(),
    create: mock.fn(),
  };
  await assert.rejects(
    publisher.publishChallenge(first, unavailableStorage),
    (error) => error === connectionError,
  );
  assert.equal(indexes.length, 0);
  assert.equal(versionRows.size, 0);
  assert.equal(unavailableStorage.read.mock.callCount(), 0);
  assert.equal(unavailableStorage.create.mock.callCount(), 0);
  databaseUnavailable = false;
  await publisher.createChallengeIndexes();
  assert.equal(indexes.length, 2);
  assert.equal(indexes[0].opts.unique, true);
  const disk = storageLib.localChallengeStorage(root);
  await assert.rejects(
    publisher.publishChallenge(first, {
      read: disk.read,
      async create(key, bytes) {
        if (key.endsWith("grading.json")) throw Error("Injected write failure");
        return disk.create(key, bytes);
      },
    }),
    /Injected write failure/,
  );
  assert.equal(versionRows.size, 0, "incomplete version stays unpublished");
  assert.ok((await disk.read(first.artifacts[0].key)).equals(first.artifacts[0].bytes));
  await assert.rejects(disk.read(first.artifacts[1].key), { code: "ENOENT" });
  for (const row of prepared)
    assert.equal((await publisher.publishChallenge(row, disk)).inserted, true);
  for (const row of repeat) {
    const result = await publisher.publishChallenge(row, disk);
    assert.equal(result.inserted, false);
    assert.equal(result.uploaded, 0);
  }
  assert.equal(versionRows.size, 40);

  const id = first.publication.challengeId;
  const path = `/api/challenges/${id}`;
  let snapshotRequests = 0;
  globalThis.fetch = async (url) => {
    if (url.includes("?snapshot=") || url.includes("&snapshot="))
      snapshotRequests++;
    return call(url, id);
  };
  const detailBody = await (await call(path, id)).json();
  assert.equal(detailBody.source, "database");
  assert(!("files" in detailBody));
  assert(!("gradingHash" in detailBody.challenge));
  assert(!("evaluate" in detailBody.challenge));
  const cardPayload = await (await list.GET()).json();
  assert.deepEqual(
    cardPayload.challenges.map((row) => row.id),
    legacyList.challenges.map((row) => row.id),
  );
  for (const card of cardPayload.challenges) {
    assert(!("files" in card));
    assert(!("details" in card));
    assert(!("command" in card));
  }
  const firstVersion = versionRows.get(first.publication._id);
  versionRows.set(first.publication._id, { ...firstVersion, difficulty: "invalid" });
  assert.equal((await list.GET()).status, 503);
  versionRows.set(first.publication._id, firstVersion);
  assert.equal((await call("/api/challenges/bad-id", "bad-id")).status, 400);
  assert.equal(
    (await call("/api/challenges/RR-UNKNOWN", "RR-UNKNOWN")).status,
    404,
  );
  assert.equal(
    (await call(`${path}?version=1.0.0&snapshot=${"0".repeat(64)}`, id)).status,
    409,
  );

  const opened = await client.openPublishedChallenge(
    id,
    "learner",
    new AbortController().signal,
  );
  assert.equal(snapshotRequests, 1);
  const secondOpen = await client.openPublishedChallenge(
    id,
    "learner",
    new AbortController().signal,
  );
  assert.equal(
    snapshotRequests,
    1,
    "cached revision bypasses the snapshot fetch",
  );
  assert.equal(
    canonicalSnapshot(opened.challenge.files),
    canonicalSnapshot(secondOpen.challenge.files),
  );
  const editedFiles = {
    ...opened.initialFiles,
    [opened.challenge.entryFile]: "// local edit",
  };
  client.storeWorkspaceDraft(opened, "learner", editedFiles, null, true);
  assert.equal(browserStorage.size, 1);
  assert.equal(
    Object.keys(JSON.parse([...browserStorage.values()][0]).changed).length,
    1,
  );
  const recovered = await client.openPublishedChallenge(
    id,
    "learner",
    new AbortController().signal,
  );
  assert.equal(
    recovered.initialFiles[opened.challenge.entryFile],
    "// local edit",
  );
  assert.notEqual(
    recovered.challenge.files[opened.challenge.entryFile],
    "// local edit",
  );
  const reset = client.recoverWorkspace(
    opened.challenge,
    opened.draftRevision,
    null,
    "other-user",
  );
  assert.equal(
    canonicalSnapshot(reset.initialFiles),
    canonicalSnapshot(opened.challenge.files),
  );

  const legacyProgress = {
    _id: "original-workspace",
    userId: "learner",
    challengeId: id,
    files: editedFiles,
    status: "completed",
    updatedAt: new Date(2000),
  };
  workspaceRows.set(`learner:${id}`, legacyProgress);
  const newer = publisher.prepareChallengePublication(
    {
      ...challenges[0],
      files: {
        ...challenges[0].files,
        [opened.challenge.entryFile]: "// new published source",
      },
    },
    { category: "official", version: "1.1.0", number: 1 },
    { command: "different published plan" },
    new Date(3000),
  );
  await publisher.publishChallenge(newer, disk);
  const current = await catalog.resolveWorkspace(id, "new-user");
  assert.equal(current.details.revision.version, "1.1.0");
  const old = await catalog.resolveWorkspace(id, "learner");
  assert.equal(old.details.revision.version, "1.0.0");
  assert.equal(
    (await catalog.loadGradingChallenge(old)).plan.command,
    executionPlan(id).command,
  );
  assert.equal(
    (await catalog.loadGradingChallenge(current)).plan.command,
    "different published plan",
  );
  await catalog.saveWorkspaceProgress("learner", old, editedFiles);
  assert.equal(workspaceRows.get(`learner:${id}`).status, "completed");
  assert.equal(
    workspaceRows.get(`learner:${id}`).challengeRevision.version,
    "1.0.0",
  );
  await assert.rejects(
    catalog.resolveWorkspace(id, "learner", current.details.revision),
    /workspace version changed/i,
  );
  await assert.rejects(
    catalog.saveWorkspaceProgress(
      "learner",
      old,
      editedFiles,
      undefined,
      new Date(1200).toISOString(),
    ),
    /updated elsewhere/i,
  );
  const request = () =>
    new Request("http://localhost/api/submissions", {
      method: "POST",
      body: JSON.stringify({
        challengeId: id,
        revision: old.details.revision,
        files: editedFiles,
        results: [{ pass: true }],
      }),
    });
  assert.equal((await (await submit.POST(request())).json()).passed, false);
  assert.equal(lastRun.plan.command, executionPlan(id).command);
  assert.equal(
    lastRun.challenge.files[opened.challenge.entryFile],
    opened.challenge.files[opened.challenge.entryFile],
  );
  assert.equal(lastRun.files[opened.challenge.entryFile], "// local edit");
  assert.equal(submissions[0].challengeRevision.version, "1.0.0");
  const recordedProgress = workspaceRows.get(`learner:${id}`);
  failSubmissionWrite = true;
  assert.equal((await submit.POST(request())).status, 502);
  assert.equal(workspaceRows.get(`learner:${id}`), recordedProgress);
  assert.equal(submissions.length, 1);
  {
    client.storeWorkspaceDraft(opened, "local-only", editedFiles, null, true);
    // No server row exists for this device-only draft after a new version is published.
    const params = new URLSearchParams({
      draftVersion: opened.draftRevision.version,
      draftHash: opened.draftRevision.snapshotHash,
    });
    const local = await catalog.resolveWorkspace(
      id,
      "local-only",
      {
        version: params.get("draftVersion"),
        snapshotHash: params.get("draftHash"),
      },
      { imported: false },
    );
    assert.equal(local.details.revision.version, "1.0.0");
  }
  await catalog.saveWorkspaceProgress("new-user", current, {
    [opened.challenge.entryFile]: "// pinned work",
  });
  const currentFiles = await catalog.learnerFiles(current);
  await cache.cacheSnapshot(id, current.details.revision, currentFiles);
  assert(await cache.readCachedSnapshot(id, old.details.revision));
  assert(await cache.readCachedSnapshot(id, current.details.revision));
  await assert.rejects(
    cache.cacheSnapshot(id, current.details.revision, { "x.js": "corrupt" }),
    /integrity/,
  );
  assert.equal(
    cache
      .pruneSnapshots(
        [
          { key: "old", bytes: 15, lastAccessedAt: 0 },
          { key: "new", bytes: 7, lastAccessedAt: 100 },
        ],
        100,
        10,
      )
      .join(","),
    "old",
  );

  const realIndexedDB = globalThis.indexedDB;
  globalThis.indexedDB = undefined;
  const uncached = await client.openPublishedChallenge(
    id,
    "learner",
    new AbortController().signal,
  );
  assert.equal(uncached.challenge.revision.version, "1.0.0");
  assert.equal(snapshotRequests, 2);
  globalThis.indexedDB = realIndexedDB;

  await new Promise((resolve, reject) => {
    const opening = realIndexedDB.open("reporush-challenges", 1);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const transaction = db.transaction("snapshots", "readwrite");
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
      const store = transaction.objectStore("snapshots");
      const key = JSON.stringify([id, old.details.revision.version, old.details.revision.snapshotHash]);
      const read = store.get(key);
      read.onsuccess = () => store.put({ ...read.result, files: { "x.js": "corrupt cache" } });
    };
  });
  assert.equal(await cache.readCachedSnapshot(id, old.details.revision), null);
  await client.openPublishedChallenge(id, "learner", new AbortController().signal);
  assert.equal(snapshotRequests, 3, "corrupt IndexedDB data forces a verified download");

  const workspaceArtifact = first.artifacts[0];
  await writeFile(join(root, workspaceArtifact.key), "{}");
  const missing = await call(
    `${path}?version=1.0.0&snapshot=${first.publication.snapshotHash}`,
    id,
  );
  assert.equal(missing.status, 503);
  assert.match((await missing.json()).error, /local storage/);
  await rm(join(root, workspaceArtifact.key));
  globalThis.indexedDB = new IDBFactory();
  await assert.rejects(
    client.openPublishedChallenge(id, "learner", new AbortController().signal),
    /local storage/,
  );
  assert.equal(await cache.readCachedSnapshot(id, old.details.revision), null);
  assert.equal(
    (await list.GET()).status,
    200,
    "catalog succeeds without reading snapshots",
  );
  catalogDown = true;
  const databaseFailure = await list.GET();
  assert.equal(
    databaseFailure.status,
    503,
    "database errors never return legacy rows",
  );
  assert.match((await databaseFailure.json()).error, /MongoDB/);
  catalogDown = false;

  process.env.CHALLENGE_CATALOG_SOURCE = "legacy";
  assert.equal((await list.GET()).status, 200);
  assert.equal(
    (await call(path, id)).status,
    200,
    "legacy works without the migrated artifact",
  );
  await assert.rejects(catalog.resolveWorkspace(id, "new-user"), /preserved/);
  assert.equal(
    workspaceRows.get(`new-user:${id}`).challengeRevision.version,
    "1.1.0",
  );
  assert.equal(versionRows.size, 41);
  assert.equal(
    (
      await progress.GET(new Request(`http://localhost${path}`), {
        params: Promise.resolve({ challengeId: id }),
      })
    ).status,
    200,
    "rollback can still read original-version progress",
  );
  console.log(
    "PASS: 40 stable imports, immutable artifacts, retry and partial-write protection, metadata-only catalog, versions, draft recovery, snapshot cache, failure handling and rollback.",
  );
} finally {
  if (dirname(await realpath(root)) !== tempRoot)
    throw new Error("Unexpected temporary directory.");
  await rm(root, { recursive: true, force: true });
}

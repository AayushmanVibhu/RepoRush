import { Sandbox, CommandExitError } from "e2b";
import { randomUUID } from "node:crypto";
import { getDatabase } from "./mongodb";
import { challenges, type Challenge, type TestRow } from "@/app/challenges";
import {
  executionPlan,
  SandboxProblem,
  validateFiles,
  type WorkspaceFiles,
} from "./sandbox-policy";

export const REPO = "/home/user/repo";
const IDLE_MS = 5 * 60 * 1000;
const MAX_MS = 30 * 60 * 1000;
type LinuxSession = {
  _id: string;
  challengeId?: string;
  sandboxId?: string;
  pid?: number;
  startedAt?: Date;
  expiresAt?: Date;
  lockUntil?: Date;
  lease?: string;
  lastStartedAt?: Date;
};
async function sessions() {
  return (await getDatabase()).collection<LinuxSession>("linuxSessions");
}
export function sandboxConfigured() {
  return Boolean(process.env.E2B_API_KEY);
}
export function getChallenge(id: unknown) {
  const challenge = challenges.find((challenge) => challenge.id === id);
  if (!challenge) throw new SandboxProblem("Unknown challenge.", 404);
  return challenge;
}
function options() {
  if (!sandboxConfigured())
    throw new SandboxProblem(
      "Linux workspaces are not configured yet. Ask the administrator to set E2B_API_KEY.",
      503,
    );
  return { apiKey: process.env.E2B_API_KEY!, requestTimeoutMs: 15000 };
}
export async function withUserLease<T>(
  userId: string,
  task: () => Promise<T>,
): Promise<T> {
  const collection = await sessions();
  await collection.updateOne(
    { _id: userId },
    { $setOnInsert: { _id: userId } },
    { upsert: true },
  );
  const lease = randomUUID();
  const now = new Date();
  const row = await collection.findOneAndUpdate(
    {
      _id: userId,
      $or: [{ lockUntil: { $lt: now } }, { lockUntil: { $exists: false } }],
    },
    { $set: { lease, lockUntil: new Date(Date.now() + 120000) } },
  );
  if (!row)
    throw new SandboxProblem(
      "A workspace operation is already running. Try again shortly.",
      409,
    );
  try {
    return await task();
  } finally {
    await collection.updateOne(
      { _id: userId, lease },
      { $unset: { lease: "", lockUntil: "" } },
    );
  }
}
export async function ownedSandbox(
  userId: string,
  challengeId: string,
  extend = false,
) {
  options();
  const collection = await sessions();
  const row = await collection.findOne({
    _id: userId,
    challengeId,
    expiresAt: { $gt: new Date() },
  });
  if (!row?.sandboxId || !row.pid || !row.startedAt)
    throw new SandboxProblem(
      "The Linux session ended. Start a new session to continue.",
      410,
    );
  const remainingLease =
    Math.min(row.expiresAt!.getTime(), row.startedAt.getTime() + MAX_MS) -
    Date.now();
  if (remainingLease <= 0)
    throw new SandboxProblem("This Linux session has expired.", 410);
  const sandbox = await Sandbox.connect(row.sandboxId, {
    ...options(),
    timeoutMs: remainingLease,
  });
  if (extend) {
    const remaining = Math.min(
      IDLE_MS,
      row.startedAt.getTime() + MAX_MS - Date.now(),
    );
    if (remaining <= 0)
      throw new SandboxProblem(
        "This session reached its 30-minute limit. Start a new session.",
        410,
      );
    await sandbox.setTimeout(remaining);
    await collection.updateOne(
      { _id: userId, sandboxId: row.sandboxId },
      { $set: { expiresAt: new Date(Date.now() + remaining) } },
    );
  }
  return { sandbox, row };
}
export async function createSandbox(timeoutMs = IDLE_MS) {
  return Sandbox.create(process.env.E2B_TEMPLATE || "base", {
    ...options(),
    timeoutMs,
    allowInternetAccess: true,
    lifecycle: { onTimeout: "kill", autoResume: false },
    metadata: { application: "reporush" },
  });
}
async function consumeQuota(userId: string) {
  const collection = (await getDatabase()).collection<{
    _id: string;
    count: number;
  }>("linuxDailyUsage");
  const _id = `${userId}:${new Date().toISOString().slice(0, 10)}`;
  await collection.updateOne(
    { _id },
    { $setOnInsert: { count: 0 } },
    { upsert: true },
  );
  const maximum = Math.max(
    1,
    Math.min(200, Number(process.env.E2B_DAILY_LIMIT) || 60),
  );
  const row = await collection.findOneAndUpdate(
    { _id, count: { $lt: maximum } },
    { $inc: { count: 1 } },
  );
  if (!row)
    throw new SandboxProblem(
      "Daily Linux workspace limit reached. Try again tomorrow.",
      429,
    );
}
export async function ensureRuntime(
  sandbox: Sandbox,
  language: Challenge["language"],
) {
  // Runs only in E2B, never on the application host. A custom template avoids cold installs.
  const probe =
    language === "Java" ? "javac" : language === "Python" ? "python3" : "node";
  try {
    await sandbox.commands.run(`command -v ${probe}`, { timeoutMs: 10000 });
  } catch {
    const packages =
      language === "Java"
        ? "openjdk-17-jdk-headless"
        : language === "Python"
          ? "python3"
          : "nodejs npm";
    await sandbox.commands.run(
      `apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ${packages}`,
      { user: "root", timeoutMs: 65000 },
    );
  }
}
export async function seedFiles(sandbox: Sandbox, files: WorkspaceFiles) {
  validateFiles(files);
  await sandbox.files.makeDir(REPO);
  await sandbox.files.write(
    Object.entries(files).map(([path, data]) => ({
      path: `${REPO}/${path}`,
      data,
    })),
  );
}
export async function startSession(
  userId: string,
  challenge: Challenge,
  files: WorkspaceFiles,
) {
  options();
  return withUserLease(userId, async () => {
    const collection = await sessions();
    const old = await collection.findOne({ _id: userId });
    if (old?.sandboxId && old.expiresAt && old.expiresAt > new Date()) {
      if (old.challengeId === challenge.id) {
        try {
          const existing = await Sandbox.connect(old.sandboxId, {
            ...options(),
            timeoutMs: Math.max(1000, old.expiresAt.getTime() - Date.now()),
          });
          const processes = await existing.commands.list();
          if (processes.some((process) => process.pid === old.pid))
            return { connected: true, reused: true };
        } catch {}
      }
      await Sandbox.kill(old.sandboxId, options()).catch(() => undefined);
    }
    if (old?.lastStartedAt && Date.now() - old.lastStartedAt.getTime() < 30000)
      throw new SandboxProblem(
        "Please wait 30 seconds between creating Linux sessions.",
        429,
      );
    await collection.updateOne(
      { _id: userId },
      { $set: { lastStartedAt: new Date() } },
    );
    await consumeQuota(userId);
    const sandbox = await createSandbox();
    try {
      await ensureRuntime(sandbox, challenge.language);
      await seedFiles(sandbox, files);
      const pty = await sandbox.pty.create({
        cols: 100,
        rows: 20,
        cwd: REPO,
        user: "user",
        timeoutMs: 0,
        envs: {
          TERM: "xterm-256color",
          PS1: "\\u@reporush:\\w\\$ ",
          PROMPT_COMMAND: "printf '\\033]133;A\\007'",
        },
        onData: () => {},
      });
      await collection.updateOne(
        { _id: userId },
        {
          $set: {
            challengeId: challenge.id,
            sandboxId: sandbox.sandboxId,
            pid: pty.pid,
            startedAt: new Date(),
            expiresAt: new Date(Date.now() + IDLE_MS),
          },
        },
      );
      await pty.disconnect();
      return { connected: true, reused: false };
    } catch (error) {
      await sandbox.kill().catch(() => undefined);
      throw error;
    }
  });
}
export async function stopSession(userId: string, challengeId: string) {
  return withUserLease(userId, async () => {
    const collection = await sessions();
    const row = await collection.findOne({ _id: userId, challengeId });
    if (row?.sandboxId)
      await Sandbox.kill(row.sandboxId, options()).catch(() => undefined);
    await collection.updateOne(
      { _id: userId, challengeId },
      { $unset: { sandboxId: "", pid: "", expiresAt: "", startedAt: "" } },
    );
  });
}
export async function syncEditor(
  userId: string,
  challengeId: string,
  files: WorkspaceFiles,
  base: WorkspaceFiles,
) {
  return withUserLease(userId, async () => {
    const { sandbox } = await ownedSandbox(userId, challengeId, true);
    const changed = Object.keys(files).filter(
      (path) => files[path] !== base[path],
    );
    for (const path of changed) {
      let current: string | undefined;
      try {
        current = await sandbox.files.read(`${REPO}/${path}`);
      } catch (error) {
        if ((error as { name?: string }).name !== "FileNotFoundError")
          throw error;
      }
      if (current !== base[path])
        throw new SandboxProblem(
          `Linux also changed ${path}. Load Linux files before sending editor changes.`,
          409,
        );
    }
    // Deletions come from the terminal; avoid shell-based path interpolation here.
    if (changed.length)
      await sandbox.files.write(
        changed.map((path) => ({ path: `${REPO}/${path}`, data: files[path] })),
      );
    return { synced: true };
  });
}
export async function pullFiles(userId: string, challengeId: string) {
  const { sandbox } = await ownedSandbox(userId, challengeId);
  const script = `import os,json\nroot=${JSON.stringify(REPO)}\nresult={}\nfor current,dirs,names in os.walk(root,followlinks=False):\n dirs[:]=[d for d in dirs if d not in ('node_modules','.git','build','target','.next','.venv','venv','__pycache__') and not os.path.islink(os.path.join(current,d))]\n for name in names:\n  path=os.path.join(current,name)\n  if os.path.islink(path) or os.path.getsize(path)>250000: continue\n  try:\n   text=open(path,encoding='utf-8').read()\n   if '\\0' in text: continue\n   result[os.path.relpath(path,root)]=text\n  except (UnicodeError,OSError): continue\nprint(json.dumps(result))`;
  const result = await sandbox.commands.run(
    `python3 -c ${shellQuote(script)}`,
    { timeoutMs: 15000 },
  );
  return validateFiles(JSON.parse(result.stdout));
}
function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
export async function runVerifiedTests(
  userId: string,
  challenge: Challenge,
  files: WorkspaceFiles,
) {
  options();
  const plan = executionPlan(challenge.id);
  if (!plan)
    throw new SandboxProblem(
      "This challenge has static checks only. Use the Linux terminal to run its tools manually.",
      422,
    );
  return withUserLease(userId, async () => {
    // Fresh VM for every run. Terminal state, edited tests, config and installed hooks are never trusted.
    const source = { ...challenge.files };
    const editable = (path: string) => /\.(js|py|java|jst)$/.test(path) && !/(^|\/)(tests?|spec|reporush)(\/|\.)|test\.|\.test\.|build\.js$/i.test(path);
    for (const path of Object.keys(source)) {
      if (editable(path) && !(path in files)) delete source[path];
    }
    for (const path of Object.keys(files)) {
      if (
        editable(path) &&
        typeof files[path] === "string"
      )
        source[path] = files[path];
    }
    if (challenge.entryFile in files)
      source[challenge.entryFile] = files[challenge.entryFile];
    await consumeQuota(userId);
    const sandbox = await createSandbox(110000);
    const started = Date.now();
    let output = "";
    const capture = (chunk: string) => {
      output = (output + chunk).slice(-50000);
    };
    let phase = "runtime";
    try {
      await ensureRuntime(sandbox, challenge.language);
      await seedFiles(sandbox, source);
      if (plan.prepare) {
        phase = "dependencies";
        await sandbox.commands.run(plan.prepare, {
          cwd: REPO,
          timeoutMs: 40000,
          retainOutput: false,
          onStdout: capture,
          onStderr: capture,
        });
      }
      phase = "tests";
      await sandbox.commands.run(plan.command, {
        cwd: REPO,
        timeoutMs: 25000,
        retainOutput: false,
        onStdout: capture,
        onStderr: capture,
      });
      return {
        results: [
          {
            name: "Sandbox regression suite",
            pass: true,
            detail:
              "The server-owned regression command completed with exit code 0.",
          },
        ] as TestRow[],
        output: output.slice(-50000),
        durationMs: Date.now() - started,
      };
    } catch (error) {
      if (phase !== "tests" || !(error instanceof CommandExitError))
        throw new SandboxProblem(
          `Could not run tests (${phase}). Check the sandbox runtime or retry.`,
          502,
        );
      if (!output) output = (error.stdout || "") + (error.stderr || "");
      return {
        results: [
          {
            name: "Sandbox regression suite",
            pass: false,
            detail: `Regression command exited with code ${error.exitCode}. See Output.`,
          },
        ] as TestRow[],
        output: output.slice(-50000),
        durationMs: Date.now() - started,
      };
    } finally {
      await sandbox.kill().catch(() => undefined);
    }
  });
}

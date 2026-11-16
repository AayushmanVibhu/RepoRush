import assert from "node:assert/strict";
import { Sandbox, CommandExitError } from "e2b";
import { loadTypeScript } from "./test-catalog-loader.mjs";
import { practiceReferences } from "./practice-references.mjs";
import { interviews } from "./interview-specs.mjs";
import { specs as openSource } from "./oss-specs.mjs";
import { readFileSync } from "node:fs";
const { challenges } = loadTypeScript("app/challenges.ts");
const { executionPlan } = loadTypeScript("lib/sandbox-policy.ts");
const { parseTestResults } = loadTypeScript("lib/test-results.ts");
const references = { ...practiceReferences };
for (const challenge of challenges) {
  const oss = openSource.find((spec) => spec.id === challenge.id);
  const interview = interviews.find((spec) => spec.id === challenge.id);
  if (oss)
    references[challenge.id] = challenge.files[challenge.entryFile].replace(
      oss.broken,
      () => oss.original,
    );
  if (interview?.original)
    references[challenge.id] = challenge.files[challenge.entryFile].replace(
      interview.broken,
      () => interview.original,
    );
  else if (interview?.reference === "auth-parser")
    references[challenge.id] = challenge.files[challenge.entryFile].replace(
      /function parseAuthToken\(req\) \{[\s\S]*?\n\}/,
      () => String.raw`function parseAuthToken(req) {
  const match = /^\s*Bearer\s+(\S+)\s*$/i.exec(req.headers.authorization || '');
  return match ? match[1] : '';
}`,
    );
  else if (interview?.reference)
    references[challenge.id] = readFileSync(
      new URL(`./interview-references/${interview.reference}`, import.meta.url),
      "utf8",
    );
}
if (!process.env.E2B_API_KEY)
  throw new Error(
    "E2B_API_KEY is required in the ignored local environment file.",
  );
let sandbox;
try {
  sandbox = await Sandbox.create(process.env.E2B_TEMPLATE || "base", {
    apiKey: process.env.E2B_API_KEY,
    timeoutMs: 300000,
  });
  const probe = await sandbox.commands
    .run("command -v node && command -v python3 && command -v javac", {
      timeoutMs: 10000,
    })
    .catch(() => null);
  if (!probe)
    await sandbox.commands.run(
      "apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq openjdk-17-jdk-headless nodejs python3",
      { user: "root", timeoutMs: 90000 },
    );
  const requested = process.argv.slice(2);
  for (const challenge of challenges.filter(
    (c) => references[c.id] && (!requested.length || requested.includes(c.id)),
  )) {
    await sandbox.setTimeout(300000);
    await sandbox.commands.run(
      "rm -rf /home/user/repo && mkdir -p /home/user/repo",
      { timeoutMs: 10000 },
    );
    await sandbox.files.write(
      Object.entries(challenge.files).map(([path, data]) => ({
        path: `/home/user/repo/${path}`,
        data,
      })),
    );
    const plan = executionPlan(challenge.id);
    if (plan.prepare)
      await sandbox.commands.run(plan.prepare, {
        cwd: "/home/user/repo",
        timeoutMs: 40000,
      });
    const run = async () => {
      try {
        const result = await sandbox.commands.run(
          executionPlan(challenge.id).command,
          { cwd: "/home/user/repo", timeoutMs: 25000 },
        );
        return { output: result.stdout + result.stderr, code: 0 };
      } catch (error) {
        if (!(error instanceof CommandExitError)) throw error;
        return { output: error.stdout + error.stderr, code: error.exitCode };
      }
    };
    const starter = await run();
    const broken = parseTestResults(
      starter.output,
      starter.code,
      challenge.files,
    );
    assert.ok(
      broken.some((row) => !row.pass),
      `${challenge.id}: starter should fail`,
    );
    assert.ok(
      !broken.some((row) => row.kind === "error"),
      `${challenge.id}: starter must reach actual tests: ${starter.output}`,
    );
    await sandbox.files.write(
      `/home/user/repo/${challenge.entryFile}`,
      references[challenge.id],
    );
    const repaired = await run();
    const passed = parseTestResults(
      repaired.output,
      repaired.code,
      challenge.files,
    );
    assert.ok(
      passed.length >= 1 && passed.every((row) => row.pass),
      `${challenge.id}: repaired solution should pass all cases: ${repaired.output}`,
    );
    console.log(
      `${challenge.id}: ${broken.filter((row) => !row.pass).length} starter failures, ${passed.length} repaired test cases passed`,
    );
  }
  console.log(
    "PASS: selected repositories execute real cases, reject the buggy starter and accept the repaired implementation.",
  );
} catch (error) {
  console.error(
    String(error.message).replaceAll(process.env.E2B_API_KEY, "[redacted]"),
  );
  process.exitCode = 1;
} finally {
  await sandbox?.kill();
}

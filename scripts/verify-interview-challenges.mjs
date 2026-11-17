import assert from "node:assert/strict";
import vm from "node:vm";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  existsSync,
} from "node:fs";
import { resolve, join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { interviews } from "./interview-specs.mjs";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const snapshots = JSON.parse(
  readFileSync(join(root, "app/interview-data/challenges.json"), "utf8"),
);
const workRoot = join(root, ".oss-work");
mkdirSync(workRoot, { recursive: true });
const work = mkdtempSync(join(workRoot, "interview-verify-"));
const ts = require("typescript");
const catalog = {};
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(join(root, "app/interview-challenges.ts"), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    },
  ).outputText,
  {
    exports: catalog,
    require: createRequire(join(root, "app/interview-challenges.ts")),
  },
);
assert.equal(snapshots.length, 6);
assert.equal(new Set(snapshots.map((snapshot) => snapshot.id)).size, 6);
for (const language of ["Java", "Python", "JavaScript"]) {
  assert.equal(
    snapshots.filter((snapshot) => snapshot.language === language).length,
    2,
  );
}

let javaBin = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, "bin") : "";
const javaDirectory = join(
  process.env.ProgramFiles || "C:/Program Files",
  "Java",
);
if (!javaBin && existsSync(javaDirectory)) {
  const jdk = readdirSync(javaDirectory).find(
    (name) =>
      name.startsWith("jdk-") &&
      existsSync(join(javaDirectory, name, "bin/javac.exe")),
  );
  if (jdk) javaBin = join(javaDirectory, jdk, "bin");
}
const javac = javaBin
  ? join(javaBin, process.platform === "win32" ? "javac.exe" : "javac")
  : "javac";
const java = javaBin
  ? join(javaBin, process.platform === "win32" ? "java.exe" : "java")
  : "java";

for (const snapshot of snapshots) {
  const spec = interviews.find((item) => item.id === snapshot.id);
  const challenge = catalog.interviewChallenges.find(
    (item) => item.id === snapshot.id,
  );
  assert.equal(
    challenge.evaluate(snapshot.files)[0].pass,
    false,
    `${spec.slug}: starter should fail static checks`,
  );
  for (const mode of ["starter", "reference"]) {
    const files = { ...snapshot.files };
    if (mode === "reference") {
      if (spec.original)
        files[spec.entryFile] = files[spec.entryFile].replace(
          spec.broken,
          () => spec.original,
        );
      else if (spec.reference === "auth-parser") {
        files[spec.entryFile] = files[spec.entryFile].replace(
          /function parseAuthToken\(req\) \{[\s\S]*?\n\}/,
          () =>
            `function parseAuthToken(req) {\n  const match = /^\\s*Bearer\\s+(\\S+)\\s*$/i.exec(req.headers.authorization || '');\n  return match ? match[1] : '';\n}`,
        );
      } else
        files[spec.entryFile] = readFileSync(
          join(root, "scripts/interview-references", spec.reference),
          "utf8",
        );
      assert.ok(
        challenge.evaluate(files).every((row) => row.pass),
        `${spec.slug}: reference static check`,
      );
    }
    const cwd = join(work, spec.slug, mode);
    for (const [path, source] of Object.entries(files)) {
      const target = resolve(cwd, path);
      assert.ok(
        target.startsWith(
          cwd + "/".replace("/", process.platform === "win32" ? "\\" : "/"),
        ),
      );
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, source);
    }
    let run;
    const options = { cwd, encoding: "utf8", timeout: 30000 };
    if (spec.language === "Java") {
      const sources = ["src", "tests"].flatMap((folder) =>
        readdirSync(join(cwd, folder))
          .filter((file) => file.endsWith(".java"))
          .map((file) => join(folder, file)),
      );
      const compile = spawnSync(
        javac,
        ["--release", "17", "-d", "build", ...sources],
        options,
      );
      assert.equal(
        compile.status,
        0,
        `${spec.slug}: compilation failed\n${compile.stderr}`,
      );
      const testClass =
        spec.slug === "payment-gateway"
          ? "PaymentServiceTest"
          : "PopulationServiceTest";
      run = spawnSync(java, ["-cp", "build", `practice.${testClass}`], options);
    } else if (spec.language === "Python") {
      run = spawnSync(
        process.env.PYTHON || "python",
        [
          "-m",
          "unittest",
          "discover",
          "-s",
          "reporush",
          "-p",
          "test_regression.py",
        ],
        options,
      );
    } else
      run = spawnSync(
        process.execPath,
        ["--test", "reporush/regression.test.cjs"],
        options,
      );
    assert.equal(
      run.status === 0,
      mode === "reference",
      `${spec.slug} ${mode}: unexpected test outcome\n${run.stdout}\n${run.stderr}`,
    );
    if (mode === "starter")
      assert.ok(
        !run.error && run.status !== null,
        `${spec.slug}: starter must fail a regression, not fail to launch`,
      );
    console.log(
      `${spec.id} ${mode}: ${mode === "reference" ? "PASS" : "expected FAIL"}`,
    );
  }
}
console.log(
  "Six interview challenges verified, two per language. Starter failures and reference passes checked using actual runtimes.",
);

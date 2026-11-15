import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import vm from "node:vm";
import { specs } from "./oss-specs.mjs";

const root = resolve(import.meta.dirname, "..");
const work = mkdtempSync(join(root, ".oss-work/verify-"));
const require = createRequire(join(root, ".oss-work/runtime/package.json"));
const dot = require("dot");
dot.templateSettings.strip = false;
const queueUrl = pathToFileURL(require.resolve("yocto-queue")).href;
const ts = require("typescript");
const catalogExports = {};
const compiled = ts.transpileModule(
  readFileSync(join(root, "app/oss-challenges.ts"), "utf8"),
  {compilerOptions: {module: ts.ModuleKind.CommonJS, esModuleInterop: true}},
).outputText;
vm.runInNewContext(compiled, {
  exports: catalogExports,
  require: createRequire(join(root, "app/oss-challenges.ts")),
});
assert.equal(catalogExports.ossChallenges.length, 5);
assert.deepEqual(
  Array.from(catalogExports.ossChallenges, challenge => challenge.difficulty),
  ["Easy", "Easy", "Medium", "Medium", "Hard"],
);
for (const challenge of catalogExports.ossChallenges) {
  const spec = specs.find(spec => spec.id === challenge.id);
  assert.equal(challenge.evaluate(challenge.files)[0].pass, false, `${challenge.id}: broken static check`);
  const repaired = {...challenge.files, [spec.entry]: challenge.files[spec.entry].replace(spec.broken, () => spec.original)};
  assert.ok(challenge.evaluate(repaired).every(row => row.pass), `${challenge.id}: repaired static checks`);
}
console.log("Catalog: five unique challenges, 2 Easy / 2 Medium / 1 Hard; static checks reject mutations and accept repairs");
for (const spec of specs) {
  const name = spec.repo.split("/")[1];
  const snapshot = JSON.parse(
    readFileSync(join(root, `app/oss-data/${name}.json`), "utf8"),
  );
  const original = execFileSync(
    "git",
    ["show", `${snapshot.commit}:${spec.entry}`],
    { cwd: join(root, ".oss-work", name), encoding: "utf8" },
  ).replaceAll("\r\n", "\n");
  assert.equal(
    snapshot.files[spec.entry],
    original.replace(spec.original, () => spec.broken),
  );
  for (const mode of ["upstream", "bug", "fixed"]) {
    const directory = join(work, name, mode);
    mkdirSync(join(directory, "reporush"), { recursive: true });
    let source = mode === "upstream" ? original : snapshot.files[spec.entry];
    if (mode === "fixed")
      source = source.replace(spec.broken, () => spec.original);
    if (name === "fast-deep-equal")
      source = dot.compile(source)({ es6: false });
    if (name === "p-limit")
      source = source.replace("'yocto-queue'", JSON.stringify(queueUrl));
    writeFileSync(
      join(directory, "package.json"),
      JSON.stringify({
        type: ["ms", "fast-deep-equal"].includes(name) ? "commonjs" : "module",
      }),
    );
    writeFileSync(join(directory, "index.js"), source);
    writeFileSync(
      join(directory, "reporush/regression.test.mjs"),
      snapshot.files["reporush/regression.test.mjs"],
    );
    const run = spawnSync(
      process.execPath,
      ["--test", "reporush/regression.test.mjs"],
      { cwd: directory, encoding: "utf8", timeout: 6000 },
    );
    const passed = run.status === 0;
    assert.equal(
      passed,
      mode !== "bug",
      `${name} ${mode}:\n${run.stdout}\n${run.stderr}`,
    );
    console.log(`${name} ${mode}: ${passed ? "PASS" : "expected FAIL"}`);
  }
}

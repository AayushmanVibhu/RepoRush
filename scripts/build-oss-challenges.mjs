import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { specs } from "./oss-specs.mjs";

const root = resolve(import.meta.dirname, "..");
const output = join(root, "app/oss-data");
mkdirSync(output, { recursive: true });
for (const spec of specs) {
  const name = spec.repo.split("/")[1];
  const directory = join(root, ".oss-work", name);
  const commit = execFileSync("git", ["rev-parse", `${spec.tag}^{commit}`], {
    cwd: directory,
    encoding: "utf8",
  }).trim();
  const paths = execFileSync("git", ["ls-tree", "-r", "--name-only", commit], {
    cwd: directory,
    encoding: "utf8",
  })
    .trim()
    .split("\n");
  const files = {};
  const omitted = [];
  for (const path of paths) {
    const buffer = execFileSync("git", ["show", `${commit}:${path}`], {
      cwd: directory,
      maxBuffer: 5 * 1024 * 1024,
    });
    if (buffer.includes(0) || buffer.length > 250000) {
      omitted.push(path);
      continue;
    }
    files[path] = buffer.toString("utf8").replaceAll("\r\n", "\n");
  }
  if (!Object.keys(files).some((path) => /licen[sc]e/i.test(path)))
    throw new Error(`${name}: missing license`);
  const source = files[spec.entry];
  if (source.split(spec.original).length !== 2)
    throw new Error(`${name}: mutation must match exactly once`);
  files[spec.entry] = source.replace(spec.original, () => spec.broken);
  const testPath = "reporush/regression.test.mjs";
  const importPath =
    name === "fast-deep-equal" ? "../index.js" : `../${spec.entry}`;
  files[testPath] =
    `import assert from 'node:assert/strict';\nimport test from 'node:test';\nimport * as module from '${importPath}';\nconst fn = module.default;\n\n${spec.checks.map((check, index) => `test('regression ${index + 1}', {timeout: 1500}, async () => {\n  ${check}\n});`).join("\n\n")}\n`;
  files["REPORUSH.md"] =
    `# RepoRush training fork\n\nUpstream: https://github.com/${spec.repo}\nRevision: ${commit} (${spec.tag})\nFork: https://github.com/AayushmanVibhu/${name}\n\n${spec.problem}\n\n## Expected behavior\n${spec.expected}\n\n## Run the regression\nUse Node.js 20 or newer. Run npm install --ignore-scripts.\n${name === "fast-deep-equal" ? "Then run node build.js to generate the JavaScript variants from src/index.jst.\n" : ""}Run node --test reporush/regression.test.mjs. Run npm test for the upstream suite.\n\nUpstream source, documentation and licenses are retained. One intentional source mutation and this regression test were added for training.\nBinary/oversized files omitted: ${omitted.join(", ") || "none"}.\n\nThe browser Run/Submit buttons perform static patch checks; run the Node regression for behavioral verification.\n`;
  files["REPORUSH.md"] = files["REPORUSH.md"].replace(
    "The browser Run/Submit buttons perform static patch checks; run the Node regression for behavioral verification.",
    "Run tests and Submit execute this regression in a fresh Linux sandbox. Use the Linux terminal for manual commands; the complete upstream suite remains separate.",
  );
  writeFileSync(
    join(output, `${name}.json`),
    JSON.stringify(
      {
        id: spec.id,
        repository: spec.repo,
        tag: spec.tag,
        commit,
        fork: `https://github.com/AayushmanVibhu/${name}`,
        omitted,
        files,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`${name}: ${Object.keys(files).length} files at ${commit}`);
}

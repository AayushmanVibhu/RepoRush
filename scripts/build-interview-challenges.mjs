import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { interviews } from "./interview-specs.mjs";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(path, "utf8").replaceAll("\r\n", "\n");
const ownLicense = `MIT License\n\nCopyright (c) 2026 RepoRush contributors\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n`;
const snapshots = [];
for (const spec of interviews) {
  const files = {};
  const omitted = [];
  if (spec.checkout) {
    const cwd = join(root, ".oss-work", spec.checkout);
    const paths = execFileSync(
      "git",
      ["ls-tree", "-r", "--name-only", spec.revision],
      { cwd, encoding: "utf8" },
    )
      .trim()
      .split("\n");
    for (const path of paths) {
      const buffer = execFileSync("git", ["show", `${spec.revision}:${path}`], {
        cwd,
        maxBuffer: 10 * 1024 * 1024,
      });
      if (
        buffer.includes(0) ||
        buffer.length > 250000 ||
        /(^|\/)\.env($|\.)/.test(path)
      ) {
        omitted.push(path);
        continue;
      }
      files[path] = buffer.toString("utf8").replaceAll("\r\n", "\n");
    }
  }
  const directory = join(root, "content/interviews", spec.slug);
  function addContent(folder) {
    for (const item of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, item.name);
      if (item.isDirectory()) addContent(path);
      else files[relative(directory, path).replaceAll("\\", "/")] = read(path);
    }
  }
  addContent(directory);
  if (spec.original) {
    const source = files[spec.entryFile];
    if (source.split(spec.original).length !== 2)
      throw new Error(`${spec.slug}: mutation must match once`);
    files[spec.entryFile] = source.replace(spec.original, () => spec.broken);
  }
  if (spec.language === "Java") {
    files["LICENSE"] = ownLicense;
    files["pom.xml"] =
      `<project xmlns="http://maven.apache.org/POM/4.0.0">\n  <modelVersion>4.0.0</modelVersion>\n  <groupId>dev.reporush.practice</groupId>\n  <artifactId>${spec.slug}</artifactId>\n  <version>1.0.0</version>\n  <properties><maven.compiler.source>17</maven.compiler.source><maven.compiler.target>17</maven.compiler.target></properties>\n  <build><sourceDirectory>src</sourceDirectory><testSourceDirectory>tests</testSourceDirectory></build>\n</project>\n`;
  }
  if (spec.language === "Python")
    files["pyproject.toml"] =
      `[project]\nname = "reporush-${spec.slug}"\nversion = "1.0.0"\nrequires-python = ">=3.10"\n\n[tool.pytest.ini_options]\npythonpath = ["."]\n`;
  const link = `https://github.com/${spec.repository}/tree/${spec.revision}`;
  files["ATTRIBUTION.md"] =
    `# Provenance\n\nCompany: ${spec.company}\nSource: ${link}\nMode: ${spec.mode}\nLicense: ${spec.license}\n\n${spec.checkout ? "Upstream text files and copyright notices are retained. RepoRush added the focused task, helper code and regression tests. These are training additions, not claims about the company’s exact interview grading or present-day hiring process." : "The linked company assessment is the source of the high-level practice task. No source code or original brief from that repository is redistributed. All starter code, tests and reference implementation in this practice project were authored for RepoRush; the MIT license applies only to that implementation. This is a scoped practice adaptation, not the full company assignment."}\n\nNo company endorsement or affiliation is implied.\nOmitted upstream files (binary, oversized, or environment configuration): ${omitted.join(", ") || "none"}.\n`;
  files["REPORUSH.md"] =
    `# ${spec.title}\n\n${spec.problem}\n\n## Contract\n${spec.expected}\n\n## Run\nRequirements: ${spec.language === "Java" ? "JDK 17 or newer" : spec.language === "Python" ? "Python 3.10 or newer, no third-party packages for this regression" : "Node.js 20 or newer, no third-party packages for this regression"}.\nFrom the repository root run:\n\n\`\`\`\n${spec.command}\n\`\`\`\n\nJava tests are executable regression classes, not JUnit tests; run the command above rather than relying on mvn test.\n\nBrowser Run/Submit checks patch structure only; it does not execute these regressions. Actual behavioral grading requires the runtime command above. Alternative correct implementations may not match the browser’s structural heuristic.\n\nSee ATTRIBUTION.md for the source, adaptation scope, and license. Reference implementations are maintained outside the learner workspace.\n`;
  files["REPORUSH.md"] = files["REPORUSH.md"].replace(
    "Browser Run/Submit checks patch structure only; it does not execute these regressions. Actual behavioral grading requires the runtime command above. Alternative correct implementations may not match the browser’s structural heuristic.",
    "Run tests and Submit execute the supplied regression in a fresh Linux sandbox with server-owned tests and configuration. The terminal supports manual commands and shares source files with the editor. The full company assignment or complete upstream suite is not graded by this focused regression.",
  );
  snapshots.push({ ...spec, files, omitted });
  console.log(`${spec.id}: ${Object.keys(files).length} files`);
}
mkdirSync(join(root, "app/interview-data"), { recursive: true });
writeFileSync(
  join(root, "app/interview-data/challenges.json"),
  JSON.stringify(
    snapshots.map(
      ({ original, broken, reference, checkout, ...snapshot }) => snapshot,
    ),
    null,
    2,
  ) + "\n",
);

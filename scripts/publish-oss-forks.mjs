import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { specs } from "./oss-specs.mjs";

const root = resolve(import.meta.dirname, "..");
for (const spec of specs) {
  const name = spec.repo.split("/")[1];
  const cwd = join(root, ".oss-work", name);
  const snapshot = JSON.parse(
    readFileSync(join(root, `app/oss-data/${name}.json`), "utf8"),
  );
  const git = (args) =>
    execFileSync("git", args, { cwd, stdio: "pipe" }).toString();
  git(["switch", "-c", "codex/reporush-challenge"]);
  for (const path of [
    spec.entry,
    "REPORUSH.md",
    "reporush/regression.test.mjs",
  ]) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), snapshot.files[path]);
  }
  git(["add", spec.entry, "REPORUSH.md", "reporush/regression.test.mjs"]);
  git([
    "commit",
    "-m",
    `Add intentional RepoRush training regression: ${spec.id}`,
  ]);
  git([
    "push",
    `https://github.com/AayushmanVibhu/${name}.git`,
    "HEAD:refs/heads/codex/reporush-challenge",
  ]);
  console.log(`${snapshot.fork}/tree/codex/reporush-challenge`);
}

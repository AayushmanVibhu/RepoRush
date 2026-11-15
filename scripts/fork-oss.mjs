import { execFileSync } from "node:child_process";

// Use the configured credential manager without printing credentials or persisting them.
const credential = execFileSync("git", ["credential", "fill"], {
  input: "protocol=https\nhost=github.com\n\n",
  encoding: "utf8",
  env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
});
const token = credential
  .split("\n")
  .find((line) => line.startsWith("password="))
  ?.slice(9);
if (!token) throw new Error("No GitHub credential is available");
const repositories = [
  "sindresorhus/escape-string-regexp",
  "vercel/ms",
  "epoberezkin/fast-deep-equal",
  "sindresorhus/p-limit",
  "sindresorhus/p-map",
];
for (const repository of repositories) {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/forks`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ default_branch_only: true }),
    },
  );
  if (!response.ok)
    throw new Error(`${repository}: GitHub returned ${response.status}`);
  const fork = await response.json();
  console.log(`${repository} -> ${fork.html_url}`);
}

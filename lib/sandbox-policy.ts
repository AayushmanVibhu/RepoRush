export type WorkspaceFiles = Record<string, string>;
export class SandboxProblem extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function validateFiles(value: unknown): WorkspaceFiles {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new SandboxProblem("A file map is required.");
  const entries = Object.entries(value);
  if (entries.length > 100)
    throw new SandboxProblem("Workspaces support up to 100 text files.", 413);
  let total = 0;
  for (const [path, text] of entries) {
    if (
      !path ||
      path.length > 300 ||
      path.startsWith("/") ||
      path.includes("\\") ||
      /[\x00-\x1f:]/.test(path) ||
      path.split("/").some((part) => !part || part === "." || part === "..")
    )
      throw new SandboxProblem("Invalid workspace path.");
    if (typeof text !== "string" || text.length > 250000)
      throw new SandboxProblem(
        "A workspace file exceeds the text size limit.",
        413,
      );
    total += text.length;
  }
  if (total > 1500000)
    throw new SandboxProblem("Workspace exceeds 1.5 MB.", 413);
  return Object.fromEntries(entries) as WorkspaceFiles;
}
export function mergeFiles(
  local: WorkspaceFiles,
  base: WorkspaceFiles,
  remote: WorkspaceFiles,
) {
  const files: WorkspaceFiles = {};
  const conflicts: string[] = [];
  for (const path of new Set([
    ...Object.keys(local),
    ...Object.keys(base),
    ...Object.keys(remote),
  ])) {
    const localChanged = local[path] !== base[path];
    const remoteChanged = remote[path] !== base[path];
    if (localChanged && remoteChanged && local[path] !== remote[path])
      conflicts.push(path);
    const value = localChanged ? local[path] : remote[path];
    if (typeof value === "string") files[path] = value;
  }
  return { files, conflicts };
}
export type ExecutionPlan = { command: string; prepare?: string };
export function executionPlan(id: string): ExecutionPlan | undefined {
  if (["RR-104", "RR-091"].includes(id) || /^RR-JS-00[3-9]$/.test(id))
    return { command: "node --test --test-reporter=tap reporush/regression.test.mjs" };
  if (["RR-306", "RR-076"].includes(id) || /^RR-PY-(00[3-9]|010)$/.test(id))
    return { command: "PYTHONPATH=src python3 -m unittest discover -v -s reporush -p test_regression.py" };
  if (["RR-203", "RR-218"].includes(id) || /^RR-JAVA-(00[3-9]|010)$/.test(id))
    return { command: "mkdir -p build && javac -d build src/main/java/dev/reporush/*.java reporush/RegressionTest.java && java -cp build dev.reporush.RegressionTest" };
  if (id === "RR-INT-JAVA-001")
    return {
      command:
        "mkdir -p build && javac -d build src/*.java tests/*.java && java -cp build practice.PaymentServiceTest",
    };
  if (id === "RR-INT-JAVA-002")
    return {
      command:
        "mkdir -p build && javac -d build src/*.java tests/*.java && java -cp build practice.PopulationServiceTest",
    };
  if (/^RR-INT-PY-00[12]$/.test(id))
    return {
      command: "python3 -m unittest discover -v -s reporush -p test_regression.py",
    };
  if (/^RR-INT-JS-00[12]$/.test(id))
    return { command: "node --test --test-reporter=tap reporush/regression.test.cjs" };
  if (["RR-OSS-001", "RR-OSS-002", "RR-OSS-004"].includes(id))
    return { command: "node --test --test-reporter=tap reporush/regression.test.mjs" };
  if (id === "RR-OSS-003")
    return {
      prepare:
        "npm install --prefix /home/user/test-tools --ignore-scripts --omit=dev --no-save --no-package-lock --no-audit --no-fund dot@1.1.3",
      command: "NODE_PATH=/home/user/test-tools/node_modules node build.js && node --test --test-reporter=tap reporush/regression.test.mjs",
    };
  if (id === "RR-OSS-005")
    return {
      prepare: "npm install --ignore-scripts --omit=dev --no-audit --no-fund",
      command: "node --test --test-reporter=tap reporush/regression.test.mjs",
    };
}

import type { TestRow } from "@/app/challenges";

function assertionValues(diagnostic = "") {
  const field = (key: string) => {
    const lines = diagnostic.split("\n");
    const index = lines.findIndex((line) =>
      new RegExp(`^\\s*${key}:`).test(line),
    );
    if (index < 0) return undefined;
    const value = lines[index].replace(new RegExp(`^\\s*${key}:\\s*`), "");
    if (value && !/^[|>][-+]?$/.test(value)) return value;
    const indent = lines[index].match(/^\s*/)?.[0].length || 0;
    let end = index + 1;
    while (
      end < lines.length &&
      (/^\s*$/.test(lines[end]) ||
        (lines[end].match(/^\s*/)?.[0].length || 0) > indent)
    )
      end++;
    return lines
      .slice(index + 1, end)
      .map((line) => line.slice(indent + 2))
      .join("\n")
      .trim();
  };
  const python = diagnostic.match(/AssertionError: (.+?) != (.+)/);
  return {
    expected:
      field("expected") ??
      diagnostic.match(/Expected: ([^\n]+)/)?.[1] ??
      python?.[2],
    actual:
      field("actual") ??
      diagnostic.match(/Actual: ([^\n]+)/)?.[1] ??
      python?.[1],
  };
}

function publicTestCase(files: Record<string, string>, name: string) {
  for (const [path, source] of Object.entries(files)) {
    if (!/(test|spec)/i.test(path) || !/\.(c?m?js|py|java)$/.test(path))
      continue;
    const lines = source.split("\n");
    const index = lines.findIndex(
      (line) =>
        (/\b(?:test|run)\s*\(/.test(line) &&
          (line.includes(`"${name}"`) || line.includes(`'${name}'`))) ||
        (/^\s*def\s+test_/.test(line) &&
          line.includes(name.split(" ")[0] + "(")),
    );
    if (index < 0) continue;
    let end = index + 1;
    while (
      end < lines.length &&
      !/^\s*(?:test\s*\(|run\s*\(|def\s+test_|if __name__|private static)/.test(
        lines[end],
      )
    )
      end++;
    return `${path}\n${lines.slice(index, end).join("\n").trim().slice(0, 6000)}`;
  }
}

/** Interpret actual runner output, never infer runtime success from source text. */
export function parseTestResults(
  raw: string,
  exitCode: number,
  files: Record<string, string> = {},
): TestRow[] {
  const output = raw.replace(/\x1b\[[0-9;]*m/g, "").slice(-50000);
  const lines = output.split(/\r?\n/);
  const rows: TestRow[] = [];
  // Node's explicit TAP reporter: each completed case followed by its diagnostics.
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(not ok|ok)\s+\d+\s+-\s+(.+)$/);
    if (!match) continue;
    const skipped = /\s+# (SKIP|TODO)\b/i.test(match[2]);
    const name = match[2].replace(/\s+# (SKIP|TODO).*$/i, "");
    let end = i + 1;
    while (
      end < lines.length &&
      !/^(?:not ok|ok)\s+\d+\s+-|^# Subtest:|^1\.\./.test(lines[end])
    )
      end++;
    const block = lines.slice(i + 1, end).join("\n");
    const diagnostic = block.match(/  ---\n([\s\S]*?)\n  \.\.\./)?.[1];
    const error = block
      .match(/error:\s*['"]?([^\n]+)/)?.[1]
      ?.replace(/['"]$/, "");
    rows.push({
      name,
      pass: match[1] === "ok" && !skipped,
      skipped,
      kind: "test",
      detail: skipped
        ? "This test was not executed."
        : match[1] === "ok"
          ? "Passed"
          : error && !/^[|>][-+]?$/.test(error) ? error : "The result did not match the expected behavior.",
      diagnostic: match[1] === "not ok" ? diagnostic?.trim() : undefined,
      ...assertionValues(diagnostic),
      testCode: publicTestCase(files, name),
    });
  }
  // Python unittest -v emits names and a separate traceback for each failure.
  for (const line of lines) {
    const match = line.match(
      /^(test_\S+)\s+\(([^)]+)\)\s+\.\.\.\s+(ok|FAIL|ERROR|skipped.*)$/,
    );
    if (!match) continue;
    const name = match[1];
    const marker = new RegExp(
      `(?:FAIL|ERROR): ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
    );
    const start = lines.findIndex((value) => marker.test(value));
    let end = start + 1;
    while (
      end < lines.length &&
      !/^={10,}|^-{10,}|^Ran \d+ test/.test(lines[end])
    )
      end++;
    // Skip the dashed separator directly following the failure header.
    if (start >= 0 && /^-{10,}/.test(lines[end] || "")) {
      end++;
      while (
        end < lines.length &&
        !/^={10,}|^-{10,}|^Ran \d+ test/.test(lines[end])
      )
        end++;
    }
    const diagnostic =
      start < 0
        ? undefined
        : lines
            .slice(start + 1, end)
            .join("\n")
            .replace(/^-+\n/, "")
            .trim();
    rows.push({
      name,
      pass: match[3] === "ok",
      skipped: match[3].startsWith("skipped"),
      kind: "test",
      detail:
        match[3] === "ok"
          ? "Passed"
          : match[3] === "FAIL"
            ? "Assertion failed. Compare the expected and actual values below."
            : match[3] === "ERROR"
              ? "The test raised an error."
              : "This test was not executed.",
      diagnostic,
      ...assertionValues(diagnostic),
      testCode: publicTestCase(files, name),
    });
  }
  // Small Java harnesses emit one JSON record per independently executed case.
  for (const line of lines) {
    if (!line.startsWith("REP0_TEST ")) continue;
    try {
      const value = JSON.parse(line.slice(10));
      if (typeof value.name === "string" && typeof value.pass === "boolean")
        rows.push({
          name: value.name.slice(0, 300),
          pass: value.pass,
          kind: "test",
          detail: value.pass ? "Passed" : "The test raised an error.",
          diagnostic:
            typeof value.diagnostic === "string"
              ? value.diagnostic.slice(0, 6000)
              : undefined,
          ...assertionValues(
            typeof value.diagnostic === "string" ? value.diagnostic : "",
          ),
          testCode: publicTestCase(files, value.name),
        });
    } catch {
      /* Malformed output cannot establish a passing test. */
    }
  }
  const syntaxError =
    /SyntaxError:|IndentationError:|TabError:|\.java:\d+: error:/.test(output);
  if (syntaxError)
    return [
      {
        name: "Syntax or compilation error",
        pass: false,
        kind: "error",
        detail: "Fix the error below, then run the tests again.",
        diagnostic: output,
      },
    ];
  // Exit status remains authoritative even if output is partial, truncated or malformed.
  if (!rows.length || (exitCode !== 0 && rows.every((row) => row.pass))) {
    rows.push({
      name: exitCode === 0 ? "Test report unavailable" : "Execution error",
      pass: false,
      kind: "error",
      detail:
        exitCode === 0
          ? "The runner did not report any test cases. Run again to verify this solution."
          : `The program exited with code ${exitCode}.`,
      diagnostic: output || "No diagnostic output was returned.",
    });
  }
  return rows;
}

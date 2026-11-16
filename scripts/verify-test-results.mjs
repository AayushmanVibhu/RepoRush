import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { loadTypeScript } from "./test-catalog-loader.mjs";
const { parseTestResults } = loadTypeScript("lib/test-results.ts");
const { challenges, challengeLabel } = loadTypeScript("app/challenges.ts");
const { executionPlan } = loadTypeScript("lib/sandbox-policy.ts");
assert.equal(challenges.length, 40);
for (const [i, challenge] of challenges.entries()) {
  assert.ok(
    executionPlan(challenge.id),
    `${challenge.id} needs runtime grading`,
  );
  assert.equal(challengeLabel(challenge.id), `Challenge ${i + 1}`);
}
// Test real Node TAP output, not a fabricated result format.
const sample = `const test=require('node:test');const assert=require('node:assert/strict');test('accepts correct output',()=>assert.equal(2+2,4));test('reports wrong output',()=>assert.equal(3,4));`;
// --test cannot be combined with -e. Use stdin as a regular node:test program.
const actual = spawnSync(process.execPath, ["--test-reporter=tap"], {
  input: sample,
  encoding: "utf8",
});
const rows = parseTestResults(actual.stdout + actual.stderr, actual.status, {
  "tests/example.test.js": sample,
});
assert.equal(rows.length, 2);
assert.equal(rows[0].pass, true);
assert.equal(rows[1].pass, false);
assert.match(rows[1].diagnostic, /expected: 4/);
assert.match(rows[1].diagnostic, /actual: 3/);
assert.equal(rows[1].expected, "4");
assert.equal(rows[1].actual, "3");
assert.equal(parseTestResults("ok 1 - completed\n", 1).at(-1).kind, "error");
assert.equal(parseTestResults("no tests", 0)[0].pass, false);
assert.equal(
  parseTestResults("ok 1 - skipped # SKIP unavailable", 0)[0].pass,
  false,
);
assert.equal(
  parseTestResults("x.js:1\nSyntaxError: Unexpected token", 1)[0].kind,
  "error",
);
assert.equal(
  parseTestResults("src/Thing.java:4: error: ';' expected", 1)[0].kind,
  "error",
);
const python = `test_output (test_regression.RegressionTests.test_output) ... FAIL\ntest_other (test_regression.RegressionTests.test_other) ... ok\n\n======================================================================\nFAIL: test_output (test_regression.RegressionTests.test_output)\n----------------------------------------------------------------------\nTraceback (most recent call last):\n  File "test_regression.py", line 5, in test_output\nAssertionError: 3 != 4\n\n----------------------------------------------------------------------\nRan 2 tests\nFAILED (failures=1)`;
const py = parseTestResults(python, 1);
assert.equal(py.length, 2);
assert.match(py[0].diagnostic, /AssertionError: 3 != 4/);
assert.equal(py[0].expected, "4");
assert.equal(py[0].actual, "3");
assert.equal(py[1].pass, true);
const java = parseTestResults(
  'REP0_TEST {"name":"Correct total","pass":true,"diagnostic":""}\nREP0_TEST {"name":"Rejects invalid input","pass":false,"diagnostic":"Expected: rejected\\nActual: accepted"}',
  1,
);
assert.equal(java.length, 2);
assert.equal(java[0].pass, true);
assert.match(java[1].diagnostic, /Actual: accepted/);
assert.equal(java[1].expected, "rejected");
assert.equal(java[1].actual, "accepted");
console.log(
  "PASS: all 40 challenges have runtime plans; sequential labels, real Node TAP assertions, Python tracebacks, Java case reports, skipped cases, syntax errors and fail-closed grading.",
);

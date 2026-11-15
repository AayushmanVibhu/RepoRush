// Each mutation applies exactly once to a pinned upstream revision.
export const specs = [
  {
    id: "RR-OSS-001",
    repo: "sindresorhus/escape-string-regexp",
    tag: "v5.0.0",
    difficulty: "Easy",
    time: "25 min",
    entry: "index.js",
    title: "Only the first regex metacharacter is escaped",
    skills: ["Regex", "Input handling"],
    original: String.raw`.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')`,
    broken: String.raw`.replace(/[|\\{}()[\]^$+*?.]/, '\\$&')`,
    problem:
      "An intentionally introduced regression causes a literal search containing multiple special characters to behave like a regular expression. Trace the escaping pipeline and restore literal matching for every character.",
    expected:
      "Every regex metacharacter is escaped, while Unicode-safe hyphen escaping and the input type guard remain intact.",
    hints: [
      "Reproduce with a string containing two dots.",
      "Compare the two replace calls.",
      "The first character-class expression needs global matching.",
    ],
    checks: [
      String.raw`assert.equal(fn('a.b+c?'), String.raw\`a\.b\+c\?\`);`.replaceAll(
        "\\`",
        "`",
      ),
      "assert.equal(new RegExp(fn('a.b+c?'), 'u').test('aXbbc'), false);",
      "assert.throws(() => fn(3), TypeError);",
    ],
  },
  {
    id: "RR-OSS-002",
    repo: "vercel/ms",
    tag: "2.1.3",
    difficulty: "Easy",
    time: "25 min",
    entry: "index.js",
    title: "Minute durations are half their expected value",
    skills: ["Numbers", "Parsing"],
    original: "var m = s * 60;",
    broken: "var m = s * 30;",
    problem:
      "An intentionally introduced unit-conversion regression shortens minute-based timeouts. Hour and day conversions also drift. Follow the shared constants through parsing and formatting.",
    expected:
      "One minute is 60,000 milliseconds; hours, days, negative durations, and formatting retain their documented behavior.",
    hints: [
      "Compare seconds and minutes.",
      "Several units derive from one shared constant.",
      "Inspect the multiplier used to define m.",
    ],
    checks: [
      "assert.equal(fn('2m'), 120000);",
      "assert.equal(fn('1h'), 3600000);",
      "assert.equal(fn(-60000), '-1m');",
    ],
  },
  {
    id: "RR-OSS-003",
    repo: "epoberezkin/fast-deep-equal",
    tag: "v3.1.3",
    difficulty: "Medium",
    time: "45 min",
    entry: "src/index.jst",
    title: "Nested object equality uses reference identity",
    skills: ["Recursion", "Equality"],
    original: "if (!equal(a[key], b[key])) return false;",
    broken: "if (a[key] !== b[key]) return false;",
    problem:
      "An intentionally introduced regression rejects separately allocated objects with identical nested values. Arrays still recurse, making the failure dependent on the shape of the data. This repository generates its JavaScript variants from src/index.jst.",
    expected:
      "Object properties are compared recursively. Unequal nested values remain unequal, and missing keys and NaN retain their existing behavior.",
    hints: [
      "Compare arrays of objects with objects containing objects.",
      "The source template generates the published variants.",
      "Use the recursive equal function for object property values.",
    ],
    checks: [
      "assert.equal(fn({a: {b: 1}}, {a: {b: 1}}), true);",
      "assert.equal(fn({a: {b: 1}}, {a: {b: 2}}), false);",
      "assert.equal(fn({a: undefined}, {b: undefined}), false);",
      "assert.equal(fn(NaN, NaN), true);",
    ],
  },
  {
    id: "RR-OSS-004",
    repo: "sindresorhus/p-map",
    tag: "v7.0.3",
    difficulty: "Medium",
    time: "50 min",
    entry: "index.js",
    title: "Concurrent mapping returns completion order",
    skills: ["Async", "Ordering"],
    original: "result[index] = value;",
    broken: "result.push(value);",
    problem:
      "An intentionally introduced regression changes the ordering of concurrently mapped results. Slow early inputs move behind later inputs. Trace index assignment, result storage, and skipped-result filtering in the full implementation.",
    expected:
      "Results follow input order even when mapper promises complete in a different order; skipped results remain omitted.",
    hints: [
      "Use different delays for each mapper invocation.",
      "Completion time must not determine the result position.",
      "Store each value using its captured input index.",
    ],
    checks: [
      "assert.deepEqual(await fn([30, 1, 10], async (delay, index) => { await new Promise(resolve => setTimeout(resolve, delay)); return index; }, {concurrency: 3}), [0, 1, 2]);",
      "assert.deepEqual(await fn([1, 2, 3], value => value === 2 ? module.pMapSkip : value, {concurrency: 2}), [1, 3]);",
    ],
  },
  {
    id: "RR-OSS-005",
    repo: "sindresorhus/p-limit",
    tag: "v6.2.0",
    difficulty: "Hard",
    time: "75 min",
    entry: "index.js",
    title: "Rejected jobs permanently consume worker capacity",
    skills: ["Concurrency", "Queues", "Exceptions"],
    original: "catch {}",
    broken: "catch {\n\t\t\treturn;\n\t\t}",
    problem:
      "An intentionally introduced regression makes a rejected task consume its concurrency slot forever. Subsequent queued jobs stall, while callers still receive the original rejection. Trace promise settlement, activeCount, queue draining, and dynamic concurrency.",
    expected:
      "Fulfilled and rejected jobs release exactly one slot; queued jobs continue, the concurrency ceiling is respected, and the original rejection reaches its caller.",
    hints: [
      "Queue a second job behind a rejecting job with concurrency 1.",
      "Follow both paths through the awaited result.",
      "Cleanup must reach next() after a rejection without swallowing the caller-facing result.",
    ],
    checks: [
      "const limit = fn(1); const failure = limit(async () => { throw new Error('expected'); }); const following = limit(async () => 42); await assert.rejects(failure, /expected/); assert.equal(await following, 42); assert.equal(limit.activeCount, 0);",
      "const bounded = fn(2); let active = 0; let peak = 0; await Promise.all(Array.from({length: 8}, () => bounded(async () => { peak = Math.max(peak, ++active); await new Promise(resolve => setTimeout(resolve, 2)); active--; }))); assert.equal(peak, 2);",
    ],
  },
];

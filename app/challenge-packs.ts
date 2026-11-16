import type { Challenge, Difficulty, TestRow } from "./challenges";

type Spec = {
  id: string;
  repo: string;
  title: string;
  summary: string;
  language: "JavaScript" | "Python" | "Java";
  difficulty: Difficulty;
  time: string;
  skills: string[];
  problem: string;
  expected: string;
  starter: string;
  test: string;
  fix: RegExp;
  fixLabel: string;
  hints: [string, string, string];
};
const row = (name: string, pass: boolean, detail: string): TestRow => ({
  name,
  pass,
  detail: pass ? `${detail} verified` : `Expected ${detail}`,
});

function formatPython(source: string) {
  return source
    .split("\n")
    .flatMap((line) => {
      const oneLineBlock = line.match(
        /^(\s*)((?:async\s+)?def\s+.+:|(?:if|for|while|with|try|except|else|elif)\b.+:)\s+(.+)$/,
      );
      if (oneLineBlock) {
        const [, indent, declaration, body] = oneLineBlock;
        return [
          `${indent}${declaration}`,
          ...body
            .split(/;\s*/)
            .map((statement) => `${indent}    ${statement.trim()}`),
        ];
      }
      if (line.length > 88 && line.includes(";")) {
        const indent = line.match(/^\s*/)?.[0] ?? "";
        return line
          .split(/;\s*/)
          .map((statement) => `${indent}${statement.trim()}`);
      }
      return [line];
    })
    .join("\n");
}

function formatBraceLanguage(source: string) {
  if (!source.split("\n").some((line) => line.length > 88)) return source;

  const lines: string[] = [];
  let current = "";
  let indent = 0;
  let parenDepth = 0;
  let quote = "";
  let escaped = false;

  const flush = () => {
    const value = current.trim();
    if (value) lines.push(`${"  ".repeat(indent)}${value}`);
    current = "";
  };

  for (const character of source) {
    if (quote) {
      current += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      current += character;
    } else if (character === "(") {
      parenDepth += 1;
      current += character;
    } else if (character === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      current += character;
    } else if (character === "{") {
      current += " {";
      flush();
      indent += 1;
    } else if (character === "}") {
      flush();
      indent = Math.max(0, indent - 1);
      current = "}";
    } else if (character === ";" && parenDepth === 0) {
      current += ";";
      flush();
    } else if (character === "\n") {
      flush();
    } else {
      current += character;
    }
  }
  flush();
  return lines.join("\n");
}

export function readableCode(source: string, language: Spec["language"]) {
  return language === "Python"
    ? formatPython(source)
    : formatBraceLanguage(source);
}

const common = (
  s: Spec,
  files: Record<string, string>,
  entryFile: string,
): Challenge => ({
  id: s.id,
  title: s.title,
  summary: s.summary,
  language: s.language,
  skills: s.skills,
  difficulty: s.difficulty,
  time: s.time,
  status: "Not started",
  repoName: s.repo,
  entryFile,
  files,
  problem: s.problem,
  expected: s.expected,
  reproduction: [
    "Run the repository's public test suite.",
    "Observe the failing behavior described in the ticket.",
    "Trace the failure from the test into the implementation.",
  ],
  constraints: [
    "Keep the public API stable.",
    "Do not remove or weaken tests.",
    "Make the smallest behaviorally correct change.",
  ],
  note: "This curated practice repository is self-contained and safe to edit.",
  hints: s.hints,
  source: { label: "RepoRush curated OSS-style snapshot", license: "MIT" },
  evaluate: (f) => {
    const code = f[entryFile] || "";
    const fixed = s.fix.test(code);
    return [
      row("public regression test", fixed, s.fixLabel),
      row(
        "public API remains available",
        code.length > 40,
        "the original public API",
      ),
      row(
        "test coverage remains present",
        Object.keys(f).some((p) => p.includes("test")),
        "the repository test file",
      ),
    ];
  },
});

function js(s: Spec): Challenge {
  const entry = "src/index.js";
  return common(
    s,
    {
      [entry]: readableCode(s.starter, s.language),
      "src/errors.js": readableCode(
        `export class DomainError extends Error {\n  constructor(message) { super(message); this.name = "DomainError"; }\n}`,
        s.language,
      ),
      [`tests/${s.repo}.test.js`]: readableCode(s.test, s.language),
      "package.json": JSON.stringify(
        {
          name: s.repo,
          private: true,
          type: "module",
          scripts: { test: "vitest run" },
          devDependencies: { vitest: "^2.1.0" },
        },
        null,
        2,
      ),
      "README.md": `# ${s.repo}\n\n${s.summary}\n\nRun with \`npm test\`.`,
    },
    entry,
  );
}
function py(s: Spec): Challenge {
  const module = s.repo.replaceAll("-", "_");
  const entry = `src/${module}/service.py`;
  return common(
    s,
    {
      [entry]: readableCode(s.starter, s.language),
      [`src/${module}/__init__.py`]: `from .service import *\n`,
      [`tests/test_${module}.py`]: readableCode(s.test, s.language),
      "pyproject.toml": `[project]\nname = "${s.repo}"\nversion = "1.0.0"\nrequires-python = ">=3.11"\n\n[tool.pytest.ini_options]\npythonpath = ["src"]\n`,
      "README.md": `# ${s.repo}\n\n${s.summary}\n\nRun with \`pytest\`.`,
    },
    entry,
  );
}
function java(s: Spec): Challenge {
  const cls =
    (s.starter.match(/public (?:final )?class (\w+)/) || [])[1] || "Service";
  const entry = `src/main/java/dev/reporush/${cls}.java`;
  return common(
    s,
    {
      [entry]: readableCode(s.starter, s.language),
      [`src/main/java/dev/reporush/DomainException.java`]: readableCode(
        `package dev.reporush;\npublic final class DomainException extends RuntimeException { public DomainException(String m) { super(m); } }\n`,
        s.language,
      ),
      [`src/test/java/dev/reporush/${cls}Test.java`]: readableCode(
        s.test,
        s.language,
      ),
      "pom.xml": `<project><modelVersion>4.0.0</modelVersion><groupId>dev.reporush</groupId><artifactId>${s.repo}</artifactId><version>1.0.0</version><properties><maven.compiler.release>21</maven.compiler.release></properties></project>`,
      "README.md": `# ${s.repo}\n\n${s.summary}\n\nRun with \`mvn test\`.`,
    },
    entry,
  );
}

const specs: Spec[] = [
  {
    id: "RR-JS-003",
    repo: "session-guard",
    title: "Expired sessions remain authorized",
    summary: "Repair an inverted expiry check in an authentication guard.",
    language: "JavaScript",
    difficulty: "Easy",
    time: "15 min",
    skills: ["Auth", "Dates"],
    problem:
      "Expired access sessions are accepted while fresh sessions are rejected.",
    expected:
      "A session is valid only when its expiry is later than the current time.",
    starter: `export function isSessionValid(session, now = Date.now()) {\n  if (!session?.userId) return false;\n  return session.expiresAt < now;\n}\n`,
    test: `import { expect,test } from "vitest";\nimport { isSessionValid } from "../src/index.js";\ntest("fresh session is valid",()=>expect(isSessionValid({userId:"u1",expiresAt:2000},1000)).toBe(true));\n`,
    fix: /expiresAt\s*>\s*now/,
    fixLabel: "future expirations are accepted",
    hints: [
      "Compare the two timestamps.",
      "Which side of now represents the future?",
      "The comparison operator is reversed.",
    ],
  },
  {
    id: "RR-JS-004",
    repo: "order-summary",
    title: "Zero-value discounts disappear",
    summary: "Preserve legitimate zero values in order totals.",
    language: "JavaScript",
    difficulty: "Easy",
    time: "15 min",
    skills: ["Nullish values", "Billing"],
    problem:
      "A configured zero discount is replaced by the default discount rate.",
    expected: "Only null or undefined should trigger the default.",
    starter: `export function discountFor(order) {\n  return order.discount || 0.1;\n}\n`,
    test: `import {expect,test} from "vitest"; import {discountFor} from "../src/index.js";\ntest("keeps zero",()=>expect(discountFor({discount:0})).toBe(0));\n`,
    fix: /discount\s*\?\?\s*0\.1/,
    fixLabel: "nullish fallback preserves zero",
    hints: [
      "Zero is falsy but meaningful.",
      "Review JavaScript fallback operators.",
      "Use nullish coalescing instead of logical OR.",
    ],
  },
  {
    id: "RR-JS-005",
    repo: "event-hub",
    title: "Listeners multiply after reconnect",
    summary: "Stop duplicate event subscriptions in a realtime client.",
    language: "JavaScript",
    difficulty: "Medium",
    time: "35 min",
    skills: ["Events", "Lifecycle"],
    problem:
      "Each reconnect adds another message listener, causing duplicate notifications.",
    expected: "Reconnect replaces or reuses the existing listener.",
    starter: `export function connect(socket, onMessage) {\n  socket.addEventListener("message", onMessage);\n  return () => socket.close();\n}\n`,
    test: `import {expect,test,vi} from "vitest"; import {connect} from "../src/index.js";\ntest("cleanup removes listener",()=>{const s={addEventListener:vi.fn(),removeEventListener:vi.fn(),close:vi.fn()};connect(s,()=>{})();expect(s.removeEventListener).toHaveBeenCalled()});\n`,
    fix: /removeEventListener\s*\(\s*["']message["']\s*,\s*onMessage/,
    fixLabel: "cleanup removes the exact listener",
    hints: [
      "Inspect what cleanup currently reverses.",
      "Closing a transport does not unregister callbacks.",
      "Remove the same message handler during cleanup.",
    ],
  },
  {
    id: "RR-JS-006",
    repo: "retry-client",
    title: "Retry delay never increases",
    summary: "Correct exponential backoff in an HTTP client.",
    language: "JavaScript",
    difficulty: "Medium",
    time: "35 min",
    skills: ["Retries", "Algorithms"],
    problem:
      "Every retry waits the same duration, creating traffic spikes during outages.",
    expected: "Delay doubles for each retry attempt.",
    starter: `export function retryDelay(baseMs, attempt) {\n  return baseMs * attempt;\n}\n`,
    test: `import {expect,test} from "vitest";import {retryDelay} from "../src/index.js";\ntest("backs off exponentially",()=>expect(retryDelay(100,3)).toBe(800));\n`,
    fix: /baseMs\s*\*\s*(?:Math\.pow\(2\s*,\s*attempt\)|2\s*\*\*\s*attempt)/,
    fixLabel: "delay grows exponentially",
    hints: [
      "List the expected delays for attempts 0–3.",
      "Linear multiplication cannot double repeatedly.",
      "Multiply the base by two raised to the attempt.",
    ],
  },
  {
    id: "RR-JS-007",
    repo: "webhook-verifier",
    title: "Webhook signatures accept altered payloads",
    summary: "Fix timing-safe signature verification.",
    language: "JavaScript",
    difficulty: "Hard",
    time: "60 min",
    skills: ["Security", "Crypto"],
    problem:
      "The verifier compares the provided signature to itself, allowing modified payloads.",
    expected:
      "Compute an HMAC from the raw payload and compare it using a timing-safe method.",
    starter: `import crypto from "node:crypto";\nexport function verify(payload, signature, secret) {\n  return signature === signature;\n}\n`,
    test: `import {expect,test} from "vitest";import {verify} from "../src/index.js";\ntest("rejects altered payload",()=>expect(verify("changed","bad","secret")).toBe(false));\n`,
    fix: /timingSafeEqual/,
    fixLabel: "signatures use a timing-safe comparison",
    hints: [
      "Trace where the expected signature comes from.",
      "The raw payload and secret must affect the comparison.",
      "Compute an HMAC and use crypto.timingSafeEqual.",
    ],
  },
  {
    id: "RR-JS-008",
    repo: "promise-pool",
    title: "Worker pool exceeds concurrency limit",
    summary: "Bound concurrent asynchronous jobs.",
    language: "JavaScript",
    difficulty: "Hard",
    time: "65 min",
    skills: ["Async", "Concurrency"],
    problem:
      "The pool launches every job immediately and overwhelms the upstream service.",
    expected: "At most limit promises run simultaneously.",
    starter: `export async function runPool(tasks, limit) {\n  return Promise.all(tasks.map(task => task()));\n}\n`,
    test: `import {expect,test} from "vitest";import {runPool} from "../src/index.js";\ntest("preserves result order",async()=>expect(await runPool([async()=>1,async()=>2],1))).toEqual([1,2]));\n`,
    fix: /(worker|cursor|nextIndex|splice\(0)/,
    fixLabel: "work is scheduled through bounded workers",
    hints: [
      "Promise.all starts every mapped task.",
      "Create only limit consumers.",
      "Have workers pull the next task from a shared index.",
    ],
  },
  {
    id: "RR-JS-009",
    repo: "config-loader",
    title: "Environment false becomes truthy",
    summary: "Parse boolean environment configuration correctly.",
    language: "JavaScript",
    difficulty: "Easy",
    time: "15 min",
    skills: ["Configuration", "Types"],
    problem: "Setting FEATURE_ENABLED=false still enables the feature.",
    expected: "Only the string true, case-insensitively, enables the flag.",
    starter: `export function featureEnabled(env) {\n  return Boolean(env.FEATURE_ENABLED);\n}\n`,
    test: `import {expect,test} from "vitest";import {featureEnabled} from "../src/index.js";test("false disables",()=>expect(featureEnabled({FEATURE_ENABLED:"false"})).toBe(false));\n`,
    fix: /\.toLowerCase\(\)\s*===\s*["']true["']|===\s*["']true["']/,
    fixLabel: "boolean text is parsed explicitly",
    hints: [
      "Non-empty strings are truthy.",
      "Configuration values arrive as strings.",
      "Compare the normalized value with the text true.",
    ],
  },
  {
    id: "RR-PY-003",
    repo: "timezone-reports",
    title: "Daily report uses server timezone",
    summary: "Make date boundaries timezone-aware.",
    language: "Python",
    difficulty: "Medium",
    time: "40 min",
    skills: ["Datetime", "Timezones"],
    problem:
      "Reports near midnight include records from the wrong customer day.",
    expected: "Construct aware boundaries in the requested timezone.",
    starter: `from datetime import datetime\n\ndef report_day(now: datetime) -> str:\n    return datetime.now().date().isoformat()\n`,
    test: `from datetime import datetime,timezone\nfrom timezone_reports.service import report_day\ndef test_uses_supplied_time(): assert report_day(datetime(2025,1,2,tzinfo=timezone.utc)) == "2025-01-02"\n`,
    fix: /now\.date\(\)/,
    fixLabel: "the supplied aware time determines the day",
    hints: [
      "The function ignores one of its parameters.",
      "Server-local now is not the requested instant.",
      "Derive the date from the supplied datetime.",
    ],
  },
  {
    id: "RR-PY-004",
    repo: "csv-importer",
    title: "Blank CSV rows create customers",
    summary: "Skip structurally empty import records.",
    language: "Python",
    difficulty: "Easy",
    time: "20 min",
    skills: ["CSV", "Validation"],
    problem: "Blank and whitespace-only rows create empty customer records.",
    expected: "Rows without any non-whitespace value are ignored.",
    starter: `def valid_rows(rows):\n    return [row for row in rows if row]\n`,
    test: `from csv_importer.service import valid_rows\ndef test_skips_blank_values(): assert valid_rows([[" ",""],["A","a@x.com"]]) == [["A","a@x.com"]]\n`,
    fix: /any\s*\(.*strip\(\)/,
    fixLabel: "row values are checked for content",
    hints: [
      "A list containing empty strings is still truthy.",
      "Validate cells, not only the row object.",
      "Use any value.strip() across the row.",
    ],
  },
  {
    id: "RR-PY-005",
    repo: "job-retry",
    title: "Failed jobs retry forever",
    summary: "Enforce retry limits in a background worker.",
    language: "Python",
    difficulty: "Medium",
    time: "40 min",
    skills: ["Queues", "Reliability"],
    problem: "Permanently failing jobs are immediately requeued forever.",
    expected: "Requeue only while attempts remain, then mark the job failed.",
    starter: `def should_retry(job):\n    return job["status"] == "failed"\n`,
    test: `from job_retry.service import should_retry\ndef test_stops_at_limit(): assert not should_retry({"status":"failed","attempts":3,"max_attempts":3})\n`,
    fix: /attempts["']?\]\s*<\s*job\[["']max_attempts|\.get\(["']attempts/,
    fixLabel: "attempt count is bounded",
    hints: [
      "Status alone cannot decide whether to retry.",
      "Compare attempts with the configured maximum.",
      "Require failed status and attempts below max_attempts.",
    ],
  },
  {
    id: "RR-PY-006",
    repo: "path-sandbox",
    title: "Archive extraction escapes destination",
    summary: "Block path traversal during ZIP extraction.",
    language: "Python",
    difficulty: "Hard",
    time: "65 min",
    skills: ["Security", "Filesystem"],
    problem:
      "A crafted archive entry can write outside the extraction directory.",
    expected:
      "Resolve each target and reject paths outside the destination root.",
    starter: `from pathlib import Path\n\ndef target_path(root: Path, member: str) -> Path:\n    return root / member\n`,
    test: `from pathlib import Path\nfrom path_sandbox.service import target_path\ndef test_rejects_escape(tmp_path):\n import pytest\n with pytest.raises(ValueError): target_path(tmp_path,"../secret")\n`,
    fix: /(resolve\(\)|is_relative_to)/,
    fixLabel: "resolved paths are confined to the root",
    hints: [
      "Joining paths does not remove parent traversal.",
      "Compare canonical paths.",
      "Resolve both paths and verify target.is_relative_to(root).",
    ],
  },
  {
    id: "RR-PY-007",
    repo: "token-cache",
    title: "Cache entries never expire",
    summary: "Apply monotonic TTL expiration.",
    language: "Python",
    difficulty: "Medium",
    time: "35 min",
    skills: ["Caching", "Time"],
    problem: "Expired access tokens remain in the in-memory cache.",
    expected: "Return cached tokens only before their monotonic expiry.",
    starter: `def get_cached(entry, now):\n    return entry["token"] if entry else None\n`,
    test: `from token_cache.service import get_cached\ndef test_expired_is_missing(): assert get_cached({"token":"x","expires_at":5},10) is None\n`,
    fix: /expires_at["']?\]\s*>\s*now/,
    fixLabel: "TTL is checked before returning",
    hints: [
      "The current time parameter is unused.",
      "Compare now with expires_at.",
      "Return the token only when expires_at is greater than now.",
    ],
  },
  {
    id: "RR-PY-008",
    repo: "batch-window",
    title: "Final batch is silently dropped",
    summary: "Yield incomplete trailing batches.",
    language: "Python",
    difficulty: "Easy",
    time: "20 min",
    skills: ["Iterators", "Batching"],
    problem:
      "When item count is not divisible by batch size, trailing items disappear.",
    expected: "Yield every full batch and the final partial batch.",
    starter: `def batches(items, size):\n    for index in range(0, len(items) - size, size):\n        yield items[index:index + size]\n`,
    test: `from batch_window.service import batches\ndef test_trailing_batch(): assert list(batches([1,2,3],2)) == [[1,2],[3]]\n`,
    fix: /range\(0\s*,\s*len\(items\)\s*,\s*size\)/,
    fixLabel: "iteration reaches the final slice",
    hints: [
      "Inspect the stop value passed to range.",
      "Slicing safely handles short final ranges.",
      "Use len(items) as the range stop.",
    ],
  },
  {
    id: "RR-PY-009",
    repo: "permission-merge",
    title: "User permissions mutate role defaults",
    summary: "Prevent shared-set mutation in authorization code.",
    language: "Python",
    difficulty: "Hard",
    time: "55 min",
    skills: ["Mutation", "Authorization"],
    problem:
      "Adding a user override changes the permissions of every user with the same role.",
    expected:
      "Merge permissions into a new set without mutating role defaults.",
    starter: `def effective_permissions(role_permissions, user_permissions):\n    merged = role_permissions\n    merged.update(user_permissions)\n    return merged\n`,
    test: `from permission_merge.service import effective_permissions\ndef test_does_not_mutate_role():\n role={"read"}; effective_permissions(role,{"write"}); assert role=={"read"}\n`,
    fix: /(set\(role_permissions\)|role_permissions\s*\|\s*user_permissions|\.copy\(\))/,
    fixLabel: "permission merge copies shared state",
    hints: [
      "Both variables reference the same set.",
      "update mutates its receiver.",
      "Copy or union the role permissions before merging.",
    ],
  },
  {
    id: "RR-PY-010",
    repo: "api-rate-limit",
    title: "Rate window resets on every request",
    summary: "Stabilize a fixed-window rate limiter.",
    language: "Python",
    difficulty: "Medium",
    time: "40 min",
    skills: ["Rate limiting", "State"],
    problem:
      "The limiter updates the window start on every request, so active clients never reach the limit.",
    expected: "Reset the window only after its duration has elapsed.",
    starter: `def allow(state, now, limit=3, window=60):\n    state["started_at"] = now\n    state["count"] = state.get("count", 0) + 1\n    return state["count"] <= limit\n`,
    test: `from api_rate_limit.service import allow\ndef test_blocks_fourth():\n s={"started_at":0,"count":0}; assert [allow(s,1) for _ in range(4)] == [True,True,True,False]\n`,
    fix: /now\s*-\s*state\[["']started_at["']\]\s*>=\s*window/,
    fixLabel: "window resets only after elapsed duration",
    hints: [
      "The start time should be stable within a window.",
      "Decide whether the current window has expired.",
      "Reset only when now - started_at >= window.",
    ],
  },
  {
    id: "RR-JAVA-003",
    repo: "notification-dedupe",
    title: "Notification keys collide",
    summary: "Repair equals and hashCode consistency.",
    language: "Java",
    difficulty: "Medium",
    time: "40 min",
    skills: ["Equality", "Hashing"],
    problem:
      "Distinct notifications collapse in a HashSet because equality uses only recipient id.",
    expected: "Equality and hash code include recipient and template.",
    starter: `package dev.reporush;\nimport java.util.Objects;\npublic class NotificationKey {\n private final String recipient; private final String template;\n public NotificationKey(String r,String t){recipient=r;template=t;}\n public boolean equals(Object o){return o instanceof NotificationKey k && Objects.equals(recipient,k.recipient);}\n public int hashCode(){return Objects.hash(recipient);}\n}\n`,
    test: `package dev.reporush; import org.junit.jupiter.api.Test; import static org.junit.jupiter.api.Assertions.*;\nclass NotificationKeyTest{@Test void templatesDiffer(){assertNotEquals(new NotificationKey("u","a"),new NotificationKey("u","b"));}}\n`,
    fix: /Objects\.equals\(template\s*,\s*k\.template\)/,
    fixLabel: "template participates in equality",
    hints: [
      "Inspect which fields define identity.",
      "equals and hashCode must use the same fields.",
      "Include template in both methods.",
    ],
  },
  {
    id: "RR-JAVA-004",
    repo: "invoice-tax",
    title: "Tax calculation truncates cents",
    summary: "Prevent integer division in an invoice calculator.",
    language: "Java",
    difficulty: "Easy",
    time: "20 min",
    skills: ["Numbers", "Money"],
    problem:
      "Tax is zero for rates below 100 percent because integer division truncates the rate.",
    expected: "Calculate tax using decimal arithmetic.",
    starter: `package dev.reporush;\nimport java.math.BigDecimal;\npublic class TaxCalculator {\n public BigDecimal tax(BigDecimal subtotal,int ratePercent){return subtotal.multiply(BigDecimal.valueOf(ratePercent / 100));}\n}\n`,
    test: `package dev.reporush;import java.math.BigDecimal;import org.junit.jupiter.api.Test;import static org.junit.jupiter.api.Assertions.*;class TaxCalculatorTest{@Test void twentyPercent(){assertEquals(new BigDecimal("20.0"),new TaxCalculator().tax(new BigDecimal("100"),20));}}\n`,
    fix: /BigDecimal\.valueOf\(ratePercent\)\.divide|ratePercent\s*\/\s*100\.0/,
    fixLabel: "percentage avoids integer truncation",
    hints: [
      "Check the type of both division operands.",
      "Integer division occurs before BigDecimal construction.",
      "Convert before dividing by 100.",
    ],
  },
  {
    id: "RR-JAVA-005",
    repo: "order-state",
    title: "Cancelled orders can still ship",
    summary: "Enforce legal state transitions.",
    language: "Java",
    difficulty: "Medium",
    time: "40 min",
    skills: ["State machines", "Validation"],
    problem: "The service permits a cancelled order to transition to shipped.",
    expected: "Only paid orders may be shipped.",
    starter: `package dev.reporush;\npublic class OrderService {\n public String ship(String state){ return "SHIPPED"; }\n}\n`,
    test: `package dev.reporush;import org.junit.jupiter.api.Test;import static org.junit.jupiter.api.Assertions.*;class OrderServiceTest{@Test void rejectsCancelled(){assertThrows(DomainException.class,()->new OrderService().ship("CANCELLED"));}}\n`,
    fix: /if\s*\(\s*!?["']?PAID|equals\(["']PAID["']\)/,
    fixLabel: "shipping validates the paid state",
    hints: [
      "The current state parameter is ignored.",
      "Write down the only legal predecessor state.",
      "Reject every state other than PAID.",
    ],
  },
  {
    id: "RR-JAVA-006",
    repo: "cache-eviction",
    title: "LRU cache evicts newest item",
    summary: "Correct access-order eviction.",
    language: "Java",
    difficulty: "Hard",
    time: "60 min",
    skills: ["Collections", "Caching"],
    problem:
      "When capacity is reached, the cache removes the most recently inserted item.",
    expected: "Evict the least recently accessed entry.",
    starter: `package dev.reporush;\nimport java.util.LinkedHashMap;\npublic class LruCache<K,V> extends LinkedHashMap<K,V>{private final int capacity;public LruCache(int c){super(c,0.75f,false);capacity=c;}protected boolean removeEldestEntry(java.util.Map.Entry<K,V> e){return size()>capacity;}}\n`,
    test: `package dev.reporush;import org.junit.jupiter.api.Test;import static org.junit.jupiter.api.Assertions.*;class LruCacheTest{@Test void accessKeepsEntry(){var c=new LruCache<String,Integer>(2);c.put("a",1);c.put("b",2);c.get("a");c.put("c",3);assertTrue(c.containsKey("a"));}}\n`,
    fix: /super\(c\s*,\s*0\.75f\s*,\s*true\)/,
    fixLabel: "LinkedHashMap tracks access order",
    hints: [
      "LinkedHashMap supports two ordering modes.",
      "Insertion order does not change on get.",
      "Enable accessOrder in the superclass constructor.",
    ],
  },
  {
    id: "RR-JAVA-007",
    repo: "csv-export",
    title: "CSV export corrupts quoted values",
    summary: "Escape embedded quotes correctly.",
    language: "Java",
    difficulty: "Medium",
    time: "35 min",
    skills: ["Serialization", "Strings"],
    problem: "Customer names containing quotes produce malformed CSV rows.",
    expected: "Double embedded quotes and wrap the field in quotes.",
    starter: `package dev.reporush;\npublic class CsvWriter { public String field(String value){return "\\\""+value+"\\\"";} }\n`,
    test: `package dev.reporush;import org.junit.jupiter.api.Test;import static org.junit.jupiter.api.Assertions.*;class CsvWriterTest{@Test void doublesQuotes(){assertEquals("\\\"A \\\"\\\"B\\\"\\\"",new CsvWriter().field("A \\\"B\\\""));}}\n`,
    fix: /replace\(\s*["']\\?"["']\s*,\s*["']\\?"\\?"["']\s*\)/,
    fixLabel: "embedded quotes are doubled",
    hints: [
      "Wrapping alone is insufficient.",
      "CSV represents one quote as two quotes.",
      "Replace quotes before wrapping the value.",
    ],
  },
  {
    id: "RR-JAVA-008",
    repo: "task-scheduler",
    title: "Scheduler compares numeric priority as text",
    summary: "Restore numeric priority ordering.",
    language: "Java",
    difficulty: "Easy",
    time: "20 min",
    skills: ["Sorting", "Comparators"],
    problem:
      "Priority 10 sorts before priority 2 because values are compared as strings.",
    expected: "Higher numeric priority sorts first.",
    starter: `package dev.reporush;\nimport java.util.*;\npublic class TaskScheduler { public List<String> sort(List<String> priorities){return priorities.stream().sorted().toList();} }\n`,
    test: `package dev.reporush;import java.util.*;import org.junit.jupiter.api.Test;import static org.junit.jupiter.api.Assertions.*;class TaskSchedulerTest{@Test void numericOrder(){assertEquals(List.of("10","2"),new TaskScheduler().sort(List.of("2","10")));}}\n`,
    fix: /(Integer\.parseInt|comparingInt)/,
    fixLabel: "priorities are parsed as numbers",
    hints: [
      "String ordering is lexicographic.",
      "The domain values are numeric despite their storage type.",
      "Parse inside a reversed numeric comparator.",
    ],
  },
  {
    id: "RR-JAVA-009",
    repo: "connection-pool",
    title: "Connections leak after query failure",
    summary: "Guarantee resource release with try-finally.",
    language: "Java",
    difficulty: "Hard",
    time: "60 min",
    skills: ["Resources", "Exceptions"],
    problem:
      "A thrown query exception bypasses pool release and eventually exhausts all connections.",
    expected:
      "Every borrowed connection returns to the pool even when execution fails.",
    starter: `package dev.reporush;\npublic class QueryService { public void run(Pool pool){Connection c=pool.borrow();c.execute();pool.release(c);} interface Pool{Connection borrow();void release(Connection c);} interface Connection{void execute();} }\n`,
    test: `package dev.reporush;import org.junit.jupiter.api.Test;class QueryServiceTest{@Test void releasesOnFailure(){/* fake pool asserts release */}}\n`,
    fix: /try\s*\{[\s\S]*finally\s*\{[\s\S]*release/,
    fixLabel: "connection release runs in finally",
    hints: [
      "Follow the exception path from execute.",
      "Cleanup after the failing call is skipped.",
      "Place execution in try and release in finally.",
    ],
  },
  {
    id: "RR-JAVA-010",
    repo: "audit-log",
    title: "Audit timestamps use mutable formatter",
    summary: "Remove unsafe shared date formatting.",
    language: "Java",
    difficulty: "Hard",
    time: "55 min",
    skills: ["Concurrency", "Dates"],
    problem:
      "Concurrent audit writes occasionally contain corrupted timestamps.",
    expected: "Use an immutable, thread-safe java.time formatter.",
    starter: `package dev.reporush;\nimport java.text.SimpleDateFormat;import java.util.Date;\npublic class AuditFormatter {private static final SimpleDateFormat F=new SimpleDateFormat("yyyy-MM-dd");public String format(Date d){return F.format(d);}}\n`,
    test: `package dev.reporush;import org.junit.jupiter.api.Test;class AuditFormatterTest{@Test void concurrentFormatting(){/* stress harness */}}\n`,
    fix: /(DateTimeFormatter|synchronized)/,
    fixLabel: "timestamp formatting is thread-safe",
    hints: [
      "The formatter is shared by every thread.",
      "SimpleDateFormat is mutable.",
      "Prefer immutable DateTimeFormatter with java.time.",
    ],
  },
];

export const additionalChallenges: Challenge[] = specs.map((s) =>
  s.language === "JavaScript"
    ? js(s)
    : s.language === "Python"
      ? py(s)
      : java(s),
);

import type { Challenge } from "./challenges";
import { readableCode } from "./challenge-packs";

// Public behavioral regressions. Grading always restores these server-owned files.
const jsCases: Record<string, { imports: string; cases: [string, string][] }> =
  {
    "RR-104": {
      imports:
        'import { updateProfile } from "../src/profile.js"; import { ProfileCache } from "../src/cache.js";',
      cases: [
        [
          "Updating a profile refreshes the cached name",
          'const cache = new ProfileCache(); cache.set("u1", {name:"Alex",role:"dev"}); updateProfile(cache,"u1",{name:"Avery"}); assert.equal(cache.get("u1").name,"Avery");',
        ],
        [
          "Updating a name preserves other profile fields",
          'const cache = new ProfileCache(); cache.set("u1",{name:"Alex",role:"dev"}); const updated = updateProfile(cache,"u1",{name:"Avery"}); assert.equal(updated.role,"dev");',
        ],
        [
          "Updating one profile leaves other cached users unchanged",
          'const cache = new ProfileCache(); cache.set("u1",{name:"Alex"}); cache.set("u2",{name:"Sam"}); updateProfile(cache,"u1",{name:"Avery"}); assert.deepEqual(cache.get("u2"),{name:"Sam"});',
        ],
      ],
    },
    "RR-091": {
      imports: 'import { pageToOffset, fetchPage } from "../src/paginator.js";',
      cases: [
        [
          "Page 1 with size 20 starts at offset 0",
          "assert.equal(pageToOffset(1,20),0);",
        ],
        [
          "Page 3 with size 20 starts at offset 40",
          "assert.equal(pageToOffset(3,20),40);",
        ],
        [
          "Page 0 is rejected",
          "assert.throws(()=>pageToOffset(0,20),RangeError);",
        ],
        [
          "Fetching a page preserves the requested limit",
          "let query; await fetchPage({get:(_path,value)=>{query=value;}},2,7); assert.deepEqual(query,{offset:7,limit:7});",
        ],
      ],
    },
    "RR-JS-003": {
      imports: 'import { isSessionValid } from "../src/index.js";',
      cases: [
        [
          "A session expiring in the future is valid",
          'assert.equal(isSessionValid({userId:"u1",expiresAt:2000},1000),true);',
        ],
        [
          "Expired sessions are rejected",
          'assert.equal(isSessionValid({userId:"u1",expiresAt:500},1000),false);',
        ],
        [
          "A session expiring now is rejected",
          'assert.equal(isSessionValid({userId:"u1",expiresAt:1000},1000),false);',
        ],
        [
          "A missing user is rejected",
          "assert.equal(isSessionValid({},1000),false);",
        ],
      ],
    },
    "RR-JS-004": {
      imports: 'import { discountFor } from "../src/index.js";',
      cases: [
        [
          "An explicit zero discount stays zero",
          "assert.equal(discountFor({discount:0}),0);",
        ],
        [
          "Missing and null discounts use the default",
          "assert.equal(discountFor({}),0.1); assert.equal(discountFor({discount:null}),0.1);",
        ],
        [
          "An explicit discount is preserved",
          "assert.equal(discountFor({discount:0.25}),0.25);",
        ],
      ],
    },
    "RR-JS-005": {
      imports: 'import { connect } from "../src/index.js";',
      cases: [
        [
          "Messages reach the registered callback",
          'const socket = new EventTarget(); socket.close=()=>{}; let calls=0; const cleanup=connect(socket,()=>calls++); socket.dispatchEvent(new Event("message")); assert.equal(calls,1); cleanup();',
        ],
        [
          "Cleanup removes the exact message listener",
          'const socket = new EventTarget(); socket.close=()=>{}; let calls=0; const cleanup=connect(socket,()=>calls++); cleanup(); socket.dispatchEvent(new Event("message")); assert.equal(calls,0);',
        ],
        [
          "Cleanup closes the socket",
          "const socket = new EventTarget(); let closed=false; socket.close=()=>{closed=true;}; connect(socket,()=>{})(); assert.equal(closed,true);",
        ],
      ],
    },
    "RR-JS-006": {
      imports: 'import { retryDelay } from "../src/index.js";',
      cases: [
        [
          "Attempt 0 uses the base delay",
          "assert.equal(retryDelay(100,0),100);",
        ],
        [
          "Attempt 3 doubles the base delay three times",
          "assert.equal(retryDelay(100,3),800);",
        ],
        [
          "A different base uses the same exponential rule",
          "assert.equal(retryDelay(25,4),400);",
        ],
      ],
    },
    "RR-JS-007": {
      imports:
        'import { verify } from "../src/index.js"; import crypto from "node:crypto";',
      cases: [
        [
          "A matching SHA-256 HMAC is accepted",
          'const signature=crypto.createHmac("sha256","secret").update("hello").digest("hex"); assert.equal(verify("hello",signature,"secret"),true);',
        ],
        [
          "An altered payload is rejected",
          'const signature=crypto.createHmac("sha256","secret").update("hello").digest("hex"); assert.equal(verify("changed",signature,"secret"),false);',
        ],
        [
          "A malformed short signature is rejected without throwing",
          'assert.equal(verify("hello","bad","secret"),false);',
        ],
      ],
    },
    "RR-JS-008": {
      imports: 'import { runPool } from "../src/index.js";',
      cases: [
        [
          "The pool never exceeds its concurrency limit",
          "let active=0,peak=0; const tasks=Array.from({length:6},(_,i)=>async()=>{active++;peak=Math.max(peak,active); await new Promise(r=>setTimeout(r,5));active--;return i;}); assert.deepEqual(await runPool(tasks,2),[0,1,2,3,4,5]); assert.ok(peak<=2,`Expected peak <= 2; actual ${peak}`);",
        ],
        [
          "Results keep task order even when tasks finish out of order",
          'assert.deepEqual(await runPool([async()=>{await new Promise(r=>setTimeout(r,10));return "first";},async()=>"second"],2),["first","second"]);',
        ],
        [
          "An empty task list returns no results",
          "assert.deepEqual(await runPool([],2),[]);",
        ],
      ],
    },
    "RR-JS-009": {
      imports: 'import { featureEnabled } from "../src/index.js";',
      cases: [
        [
          "The text false disables the feature",
          'assert.equal(featureEnabled({FEATURE_ENABLED:"false"}),false);',
        ],
        [
          "True is accepted regardless of letter case",
          'assert.equal(featureEnabled({FEATURE_ENABLED:"TrUe"}),true);',
        ],
        [
          "Missing values and unrelated text are disabled",
          'assert.equal(featureEnabled({}),false); assert.equal(featureEnabled({FEATURE_ENABLED:"yes"}),false);',
        ],
      ],
    },
  };

const pyCases: Record<string, { imports: string; cases: [string, string][] }> =
  {
    "RR-306": {
      imports: "from content_utils.slug import slugify",
      cases: [
        [
          "collapses_separators",
          'self.assertEqual(slugify("  Hello,   RepoRush!  "), "hello-reporush")',
        ],
        ["punctuation_only_is_empty", 'self.assertEqual(slugify("!!!"), "")'],
        [
          "preserves_unicode_letters",
          'self.assertEqual(slugify("Café Guide"), "café-guide")',
        ],
      ],
    },
    "RR-076": {
      imports:
        "from billing.refunds import calculate_refund\nfrom decimal import Decimal",
      cases: [
        [
          "half_cent_rounds_up",
          'self.assertEqual(calculate_refund("1.005", 1, "1"), Decimal("1.01"))',
        ],
        [
          "partial_refund_uses_decimal_inputs",
          'self.assertEqual(calculate_refund("10.05", 3, "0.333333"), Decimal("10.05"))',
        ],
        [
          "rounds_only_the_final_total",
          'self.assertEqual(calculate_refund("0.335", 3, "1"), Decimal("1.01"))',
        ],
      ],
    },
    "RR-PY-003": {
      imports:
        "from timezone_reports.service import report_day\nfrom datetime import datetime, timezone, timedelta",
      cases: [
        [
          "uses_supplied_time",
          'self.assertEqual(report_day(datetime(2025,1,2,tzinfo=timezone.utc)), "2025-01-02")',
        ],
        [
          "keeps_local_day_at_timezone_boundary",
          'self.assertEqual(report_day(datetime(2025,1,2,0,30,tzinfo=timezone(timedelta(hours=14)))), "2025-01-02")',
        ],
      ],
    },
    "RR-PY-004": {
      imports: "from csv_importer.service import valid_rows",
      cases: [
        [
          "skips_whitespace_only_rows",
          'self.assertEqual(valid_rows([[" ", ""], ["A", "a@x.com"]]), [["A", "a@x.com"]])',
        ],
        [
          "skips_empty_rows",
          'self.assertEqual(valid_rows([[], ["\\t", "\\n"]]), [])',
        ],
        [
          "preserves_rows_with_any_value",
          'self.assertEqual(valid_rows([["", "B"], ["0"]]), [["", "B"], ["0"]])',
        ],
      ],
    },
    "RR-PY-005": {
      imports: "from job_retry.service import should_retry",
      cases: [
        [
          "stops_at_attempt_limit",
          'self.assertFalse(should_retry({"status":"failed", "attempts":3, "max_attempts":3}))',
        ],
        [
          "retries_while_attempts_remain",
          'self.assertTrue(should_retry({"status":"failed", "attempts":2, "max_attempts":3}))',
        ],
        [
          "does_not_retry_successful_jobs",
          'self.assertFalse(should_retry({"status":"completed", "attempts":0, "max_attempts":3}))',
        ],
      ],
    },
    "RR-PY-006": {
      imports:
        "from path_sandbox.service import target_path\nfrom pathlib import Path\nimport tempfile",
      cases: [
        [
          "rejects_parent_directory_escape",
          'with tempfile.TemporaryDirectory() as root:\n    with self.assertRaises(ValueError):\n        target_path(Path(root), "../secret")',
        ],
        [
          "accepts_nested_paths_inside_root",
          'with tempfile.TemporaryDirectory() as root:\n    self.assertEqual(target_path(Path(root), "nested/file.txt").resolve(), (Path(root) / "nested/file.txt").resolve())',
        ],
        [
          "rejects_absolute_path_outside_root",
          'with tempfile.TemporaryDirectory() as root:\n    with self.assertRaises(ValueError):\n        target_path(Path(root), "/etc/passwd")',
        ],
      ],
    },
    "RR-PY-007": {
      imports: "from token_cache.service import get_cached",
      cases: [
        [
          "expired_token_is_missing",
          'self.assertIsNone(get_cached({"token":"x", "expires_at":5}, 10))',
        ],
        [
          "fresh_token_is_returned",
          'self.assertEqual(get_cached({"token":"x", "expires_at":15}, 10), "x")',
        ],
        [
          "expiry_boundary_is_expired",
          'self.assertIsNone(get_cached({"token":"x", "expires_at":10}, 10))',
        ],
        [
          "missing_cache_entry_is_safe",
          "self.assertIsNone(get_cached(None, 10))",
        ],
      ],
    },
    "RR-PY-008": {
      imports: "from batch_window.service import batches",
      cases: [
        [
          "includes_final_partial_batch",
          "self.assertEqual(list(batches([1,2,3], 2)), [[1,2], [3]])",
        ],
        [
          "includes_final_full_batch",
          "self.assertEqual(list(batches([1,2,3,4], 2)), [[1,2], [3,4]])",
        ],
        [
          "empty_input_has_no_batches",
          "self.assertEqual(list(batches([], 2)), [])",
        ],
      ],
    },
    "RR-PY-009": {
      imports: "from permission_merge.service import effective_permissions",
      cases: [
        [
          "does_not_mutate_shared_role",
          'role={"read"}\nself.assertEqual(effective_permissions(role, {"write"}), {"read", "write"})\nself.assertEqual(role, {"read"})',
        ],
        [
          "separate_users_keep_separate_permissions",
          'role={"read"}\neffective_permissions(role, {"admin"})\nself.assertEqual(effective_permissions(role, set()), {"read"})',
        ],
      ],
    },
    "RR-PY-010": {
      imports: "from api_rate_limit.service import allow",
      cases: [
        [
          "blocks_fourth_request_in_same_window",
          'state={"started_at":0, "count":0}\nself.assertEqual([allow(state,1) for _ in range(4)], [True,True,True,False])',
        ],
        [
          "resets_after_the_window_elapses",
          'state={"started_at":0, "count":3}\nself.assertTrue(allow(state,60))\nself.assertEqual(state["count"], 1)',
        ],
        [
          "does_not_move_window_start_on_each_request",
          'state={"started_at":0, "count":0}\nallow(state,10)\nself.assertEqual(state["started_at"], 0)',
        ],
      ],
    },
  };

const javaCases: Record<string, [string, string][]> = {
  "RR-203": [
    [
      "Matches equal SKU text from a different String instance",
      'var inventory = new Inventory(java.util.List.of(new Item("SKU-104", "Keyboard", 4))); equal(true, inventory.findBySku(new String("SKU-104")).isPresent());',
    ],
    [
      "A missing SKU returns an empty Optional",
      'var inventory = new Inventory(java.util.List.of(new Item("SKU-104", "Keyboard", 4))); equal(true, inventory.findBySku("missing").isEmpty());',
    ],
    [
      "SKU lookup remains case sensitive",
      'var inventory = new Inventory(java.util.List.of(new Item("SKU-104", "Keyboard", 4))); equal(true, inventory.findBySku("sku-104").isEmpty());',
    ],
  ],
  "RR-218": [
    [
      "Transfers debit one wallet and credit the other",
      "var from=new Wallet(1,100); var to=new Wallet(2,50); new WalletService().transfer(from,to,30); equal(70L,from.balance); equal(80L,to.balance);",
    ],
    [
      "Insufficient funds leave both wallets unchanged",
      'var from=new Wallet(1,10); var to=new Wallet(2,50); try {new WalletService().transfer(from,to,30); throw new AssertionError("Expected insufficient funds to be rejected");} catch(IllegalStateException expected) {} equal(10L,from.balance); equal(50L,to.balance);',
    ],
    [
      "Opposing concurrent transfers finish without losing funds",
      "var a=new Wallet(1,1000000); var b=new Wallet(2,1000000); var service=new WalletService(); var start=new java.util.concurrent.CountDownLatch(1); var errors=new java.util.concurrent.ConcurrentLinkedQueue<Throwable>(); Runnable forward=()->{try{start.await();for(int i=0;i<20000;i++)service.transfer(a,b,1);}catch(Throwable error){errors.add(error);}}; Runnable backward=()->{try{start.await();for(int i=0;i<20000;i++)service.transfer(b,a,1);}catch(Throwable error){errors.add(error);}}; var threads=new java.util.ArrayList<Thread>(); for(int i=0;i<8;i++){var thread=new Thread(i%2==0?forward:backward);thread.setDaemon(true);threads.add(thread);thread.start();} start.countDown(); for(var thread:threads)thread.join(2000); equal(false,threads.stream().anyMatch(Thread::isAlive)); equal(true,errors.isEmpty()); equal(1000000L,a.balance); equal(1000000L,b.balance);",
    ],
  ],
  "RR-JAVA-003": [
    [
      "Different templates produce distinct notification keys",
      'equal(false,new NotificationKey("u","a").equals(new NotificationKey("u","b")));',
    ],
    [
      "Equal recipient and template can be looked up in a hash map",
      'var keys=new java.util.HashMap<NotificationKey,String>();keys.put(new NotificationKey("u","a"),"value");equal("value",keys.get(new NotificationKey("u","a")));',
    ],
    [
      "Different recipients stay distinct",
      'equal(false,new NotificationKey("u1","a").equals(new NotificationKey("u2","a")));',
    ],
  ],
  "RR-JAVA-004": [
    [
      "Twenty percent of 100 is 20",
      'decimal("20",new TaxCalculator().tax(new java.math.BigDecimal("100"),20));',
    ],
    [
      "Fractional tax is preserved",
      'decimal("1.005",new TaxCalculator().tax(new java.math.BigDecimal("10.05"),10));',
    ],
    [
      "A zero tax rate returns zero",
      'decimal("0",new TaxCalculator().tax(new java.math.BigDecimal("100"),0));',
    ],
  ],
  "RR-JAVA-005": [
    [
      "A paid order can be shipped",
      'equal("SHIPPED",new OrderService().ship("PAID"));',
    ],
    [
      "A cancelled order cannot be shipped",
      'try{new OrderService().ship("CANCELLED");throw new AssertionError("Expected DomainException for cancelled order");}catch(DomainException expected){}',
    ],
    [
      "An unpaid order cannot be shipped",
      'try{new OrderService().ship("PENDING");throw new AssertionError("Expected DomainException for unpaid order");}catch(DomainException expected){}',
    ],
  ],
  "RR-JAVA-006": [
    [
      "Reading an entry keeps it when capacity is exceeded",
      'var cache=new LruCache<String,Integer>(2);cache.put("a",1);cache.put("b",2);cache.get("a");cache.put("c",3);equal(true,cache.containsKey("a"));equal(false,cache.containsKey("b"));',
    ],
    [
      "The oldest untouched entry is evicted",
      'var cache=new LruCache<String,Integer>(2);cache.put("a",1);cache.put("b",2);cache.put("c",3);equal(false,cache.containsKey("a"));equal(2,cache.size());',
    ],
    [
      "Updating an entry marks it as recently used",
      'var cache=new LruCache<String,Integer>(2);cache.put("a",1);cache.put("b",2);cache.put("a",9);cache.put("c",3);equal(Integer.valueOf(9),cache.get("a"));',
    ],
  ],
  "RR-JAVA-007": [
    [
      "Embedded quotes are doubled inside the quoted field",
      'equal("\\\"A \\\"\\\"B\\\"\\\"\\\"",new CsvWriter().field("A \\\"B\\\""));',
    ],
    [
      "Commas stay inside a quoted field",
      'equal("\\\"a,b\\\"",new CsvWriter().field("a,b"));',
    ],
    [
      "An empty field still has enclosing quotes",
      'equal("\\\"\\\"",new CsvWriter().field(""));',
    ],
  ],
  "RR-JAVA-008": [
    [
      "Numeric priority 10 sorts ahead of priority 2",
      'equal(java.util.List.of("10","2"),new TaskScheduler().sort(java.util.List.of("2","10")));',
    ],
    [
      "Negative and zero priorities sort numerically",
      'equal(java.util.List.of("10","0","-2"),new TaskScheduler().sort(java.util.List.of("-2","10","0")));',
    ],
    [
      "An empty priority list stays empty",
      "equal(java.util.List.of(),new TaskScheduler().sort(java.util.List.of()));",
    ],
  ],
  "RR-JAVA-009": [
    [
      "A successful query releases its borrowed connection",
      "boolean[] released={false}; QueryService.Connection connection=()->{}; new QueryService().run(new QueryService.Pool(){public QueryService.Connection borrow(){return connection;}public void release(QueryService.Connection value){equal(connection,value);released[0]=true;}}); equal(true,released[0]);",
    ],
    [
      "A failed query still releases its connection and preserves the error",
      'boolean[] released={false}; var failure=new RuntimeException("database unavailable"); QueryService.Connection connection=()->{throw failure;}; try{new QueryService().run(new QueryService.Pool(){public QueryService.Connection borrow(){return connection;}public void release(QueryService.Connection value){equal(connection,value);released[0]=true;}});throw new AssertionError("Expected query failure");}catch(RuntimeException error){equal(failure,error);}equal(true,released[0]);',
    ],
  ],
  "RR-JAVA-010": [
    [
      "Formats a known date as year month and day",
      'java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("UTC"));equal("2025-01-02",new AuditFormatter().format(java.util.Date.from(java.time.Instant.parse("2025-01-02T12:00:00Z"))));',
    ],
    [
      "Concurrent calls keep each date independent",
      'java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("UTC"));var formatter=new AuditFormatter();var start=new java.util.concurrent.CountDownLatch(1);var errors=new java.util.concurrent.ConcurrentLinkedQueue<Throwable>();var threads=new java.util.ArrayList<Thread>();for(int i=0;i<8;i++){final int day=i+1;var thread=new Thread(()->{try{start.await();var date=java.util.Date.from(java.time.LocalDate.of(2025,1,day).atStartOfDay(java.time.ZoneOffset.UTC).toInstant());for(int j=0;j<3000;j++)equal(String.format("2025-01-%02d",day),formatter.format(date));}catch(Throwable error){errors.add(error);}});thread.setDaemon(true);threads.add(thread);thread.start();}start.countDown();for(var thread:threads)thread.join(2000);equal(false,threads.stream().anyMatch(Thread::isAlive));if(!errors.isEmpty())throw new AssertionError(errors.peek());',
    ],
  ],
};

export function withPracticeTests(challenge: Challenge): Challenge {
  const js = jsCases[challenge.id];
  const py = pyCases[challenge.id];
  const java = javaCases[challenge.id];
  if (!js && !py && !java) return challenge;
  const path = js
    ? "reporush/regression.test.mjs"
    : py
      ? "reporush/test_regression.py"
      : "reporush/RegressionTest.java";
  const code = js
    ? `import test from "node:test";\nimport assert from "node:assert/strict";\n${js.imports}\n\n${js.cases
        .map(
          ([name, body]) =>
            `test(${JSON.stringify(name)}, async () => {\n${body
              .split("\n")
              .map((line) => `  ${line}`)
              .join("\n")}\n});`,
        )
        .join("\n\n")}\n`
    : py
      ? `import unittest\n${py.imports}\n\n\nclass RegressionTests(unittest.TestCase):\n${py.cases
          .map(
            ([name, body]) =>
              `    def test_${name}(self):\n${body
                .split("\n")
                .map((line) => `        ${line}`)
                .join("\n")}`,
          )
          .join("\n\n")}\n`
      : javaReport(java);
  return {
    ...challenge,
    files: {
      ...challenge.files,
      [path]: readableCode(code, challenge.language),
    },
    note: "Run tests and Submit execute the public behavioral tests in a fresh Linux sandbox. Expand each result to see its test case and any assertion or program error.",
  };
}

function javaReport(cases: [string, string][]) {
  return String.raw`package dev.reporush;

public final class RegressionTest {
    private static int failed = 0;
    public static void main(String[] args) {
${cases.map(([name, body]) => `        run(${JSON.stringify(name)}, () -> {\n            ${body}\n        });`).join("\n")}
        if (failed > 0) System.exit(1);
    }
    interface Case { void run() throws Exception; }
    private static void equal(Object expected, Object actual) {
        if (!java.util.Objects.equals(expected, actual)) throw new AssertionError("Expected: " + expected + "\nActual: " + actual);
    }
    private static void decimal(String expected, java.math.BigDecimal actual) {
        if (new java.math.BigDecimal(expected).compareTo(actual) != 0) throw new AssertionError("Expected: " + expected + "\nActual: " + actual);
    }
    private static String quote(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t") + "\"";
    }
    private static void run(String name, Case test) {
        boolean pass = true;
        String diagnostic = "";
        try { test.run(); }
        catch (Throwable error) {
            pass = false;
            failed++;
            java.io.StringWriter trace = new java.io.StringWriter();
            error.printStackTrace(new java.io.PrintWriter(trace));
            diagnostic = trace.toString();
        }
        System.out.println("REP0_TEST {\"name\":" + quote(name) + ",\"pass\":" + pass + ",\"diagnostic\":" + quote(diagnostic) + "}");
    }
}
`;
}

export type Difficulty = "Easy" | "Medium" | "Hard";
export type TestRow = { name: string; pass: boolean; detail: string };
export type Challenge = {
  id: string; title: string; summary: string; language: "Java" | "Python" | "JavaScript";
  skills: string[]; difficulty: Difficulty; time: string; status: "Completed" | "In progress" | "Not started";
  repoName: string; entryFile: string; files: Record<string, string>;
  problem: string; expected: string; reproduction: string[]; constraints: string[]; note: string;
  hints?: [string,string,string];
  source?: { label:string; license:string; url?:string };
  evaluate: (files: Record<string, string>) => TestRow[];
};

const result = (name:string, pass:boolean, ok:string, fail:string):TestRow => ({name,pass,detail:pass?ok:fail});

const coreChallenges: Challenge[] = [
  {
    id:"RR-104", title:"Stale cache after profile update", summary:"Trace an invalidation bug across a JavaScript profile service.", language:"JavaScript", skills:["Caching","State"], difficulty:"Medium", time:"35 min", status:"In progress", repoName:"profile-service", entryFile:"src/profile.js",
    problem:"Customers see old profile information immediately after saving an update. The database record is correct, but downstream reads remain stale until the process restarts.",
    expected:"After updateProfile resolves, subsequent cache reads return the updated profile without another database fetch.",
    reproduction:["Seed the cache with an existing profile.","Call updateProfile with a new display name.","Read the same user from the cache."], constraints:["Preserve unrelated profile fields.","Do not clear the entire cache.","Keep the function synchronous."], note:"Public tests cover the cache contract. Hidden tests validate unrelated records.",
    files:{
      "src/profile.js":`import { database } from "./database.js";\n\nexport function updateProfile(cache, userId, changes) {\n  const current = cache.get(userId);\n  const updated = { ...current, ...changes };\n  database.save(userId, updated);\n  return updated;\n}`,
      "src/cache.js":`export class ProfileCache {\n  constructor() { this.records = new Map(); }\n  get(userId) { return this.records.get(userId); }\n  set(userId, profile) { this.records.set(userId, profile); }\n}`,
      "src/database.js":`const records = new Map();\nexport const database = {\n  save(userId, profile) { records.set(userId, profile); },\n  find(userId) { return records.get(userId); }\n};`,
      "tests/profile.test.js":`import { updateProfile } from "../src/profile.js";\nimport { ProfileCache } from "../src/cache.js";\n\ntest("refreshes cached profile", () => {\n  const cache = new ProfileCache();\n  cache.set("u1", { name: "Alex", role: "dev" });\n  updateProfile(cache, "u1", { name: "Avery" });\n  expect(cache.get("u1").name).toBe("Avery");\n});`,
      "package.json":`{"name":"profile-service","type":"module","scripts":{"test":"vitest run"},"devDependencies":{"vitest":"^2.1.0"}}`,
      "README.md":`# Profile service\n\nSmall profile persistence service used by the account API.\n\nRun tests with \`npm test\`.`
    },
    evaluate:f=>{const s=f["src/profile.js"]||"";return [result("persists merged profile",/database\.save/.test(s)&&/\.\.\.current/.test(s),"merged record is persisted","merge and persist the profile"),result("refreshes cached profile",/cache\.set\s*\(\s*userId\s*,\s*updated/.test(s),"cache contains the update","write the updated profile to the cache"),result("preserves unrelated fields",/\.\.\.current[\s\S]*\.\.\.changes/.test(s),"existing fields are preserved","merge current fields before changes"),result("returns updated object",/return\s+updated/.test(s),"updated record is returned","return the updated record")];}
  },
  {
    id:"RR-091", title:"Paginator skips the first record", summary:"Repair offset calculation in a JavaScript API client.", language:"JavaScript", skills:["APIs","Pagination"], difficulty:"Easy", time:"20 min", status:"Not started", repoName:"catalog-client", entryFile:"src/paginator.js",
    problem:"The catalog client skips the first page of records when page 1 is requested. Later pages are shifted by one full page.", expected:"Page numbers are one-based externally, while the API offset remains zero-based.", reproduction:["Request page 1 with a page size of 20.","Inspect the offset sent to the transport.","Observe that offset 20 is sent instead of 0."], constraints:["Keep the public function signature.","Reject page numbers below 1.","Do not modify the transport."], note:"The evaluator checks boundary pages and offset math.",
    files:{"src/paginator.js":`export function pageToOffset(page, pageSize) {\n  if (page < 1) throw new RangeError("page must be positive");\n  return page * pageSize;\n}\n\nexport async function fetchPage(transport, page, pageSize = 20) {\n  return transport.get("/items", { offset: pageToOffset(page, pageSize), limit: pageSize });\n}`,
      "src/transport.js":`export class Transport {\n  constructor(baseUrl) { this.baseUrl = baseUrl; }\n  get(path, query) { return { path, query }; }\n}`,
      "tests/paginator.test.js":`import { pageToOffset } from "../src/paginator.js";\n\ntest("first page starts at zero", () => {\n  expect(pageToOffset(1, 20)).toBe(0);\n});\n\ntest("third page starts at forty", () => {\n  expect(pageToOffset(3, 20)).toBe(40);\n});`,
      "package.json":`{"name":"catalog-client","type":"module","scripts":{"test":"vitest run"},"devDependencies":{"vitest":"^2.1.0"}}`,"README.md":`# Catalog client\n\nA small offset-based client for the product catalog API.`},
    evaluate:f=>{const s=f["src/paginator.js"]||"";const fixed=/\(\s*page\s*-\s*1\s*\)\s*\*\s*pageSize/.test(s);return [result("page 1 uses offset 0",fixed,"first page starts at zero","convert one-based page to zero-based offset"),result("page 3 uses offset 40",fixed,"later pages align correctly","offset math is shifted"),result("invalid pages rejected",/page\s*<\s*1[\s\S]*throw/.test(s),"invalid page guard remains","retain the page validation"),result("limit is preserved",/limit:\s*pageSize/.test(s),"page size reaches the transport","keep the page size as the limit")];}
  },
  {
    id:"RR-203", title:"Inventory lookup rejects valid SKU", summary:"Fix a Java equality bug in an inventory repository.", language:"Java", skills:["Collections","Equality"], difficulty:"Easy", time:"25 min", status:"Not started", repoName:"inventory-core", entryFile:"src/main/java/dev/reporush/Inventory.java",
    problem:"Inventory lookups intermittently return null for SKUs received from HTTP requests even though matching items exist in memory.", expected:"A lookup matches SKU values by their text content, regardless of which String instance supplied the value.", reproduction:["Insert an item with SKU SKU-104.","Construct a new String containing SKU-104.","Call findBySku with the new instance."], constraints:["Do not intern strings.","Return Optional rather than null.","Keep lookup case-sensitive."], note:"Use Java value equality. Reference identity is not a stable lookup strategy.",
    files:{"src/main/java/dev/reporush/Inventory.java":`package dev.reporush;\n\nimport java.util.List;\nimport java.util.Optional;\n\npublic final class Inventory {\n    private final List<Item> items;\n\n    public Inventory(List<Item> items) { this.items = List.copyOf(items); }\n\n    public Optional<Item> findBySku(String sku) {\n        return items.stream()\n            .filter(item -> item.sku() == sku)\n            .findFirst();\n    }\n}`,
      "src/main/java/dev/reporush/Item.java":`package dev.reporush;\n\npublic record Item(String sku, String name, int quantity) { }`,
      "src/test/java/dev/reporush/InventoryTest.java":`package dev.reporush;\n\nimport static org.junit.jupiter.api.Assertions.*;\nimport java.util.List;\nimport org.junit.jupiter.api.Test;\n\nclass InventoryTest {\n    @Test void findsEqualSkuFromDifferentStringInstance() {\n        var inventory = new Inventory(List.of(new Item("SKU-104", "Keyboard", 4)));\n        assertTrue(inventory.findBySku(new String("SKU-104")).isPresent());\n    }\n}`,
      "pom.xml":`<project><modelVersion>4.0.0</modelVersion><groupId>dev.reporush</groupId><artifactId>inventory-core</artifactId><version>1.0.0</version><properties><maven.compiler.release>21</maven.compiler.release></properties></project>`,"README.md":`# Inventory core\n\nJava 21 inventory lookup library. Run with \`mvn test\`.`},
    evaluate:f=>{const s=f["src/main/java/dev/reporush/Inventory.java"]||"";const eq=/item\.sku\(\)\.equals\(sku\)|Objects\.equals\(item\.sku\(\),\s*sku\)/.test(s);return [result("matches equal SKU values",eq,"value equality is used","compare String values, not references"),result("returns Optional",/Optional<Item>/.test(s)&&/findFirst\(\)/.test(s),"Optional contract preserved","preserve the Optional return contract"),result("remains case-sensitive",!/(equalsIgnoreCase|toLowerCase|toUpperCase)/.test(s),"case-sensitive lookup preserved","do not normalize SKU case")];}
  },
  {
    id:"RR-218", title:"Concurrent transfers lose updates", summary:"Make a Java wallet transfer atomic under contention.", language:"Java", skills:["Concurrency","Locks"], difficulty:"Hard", time:"65 min", status:"Not started", repoName:"wallet-ledger", entryFile:"src/main/java/dev/reporush/WalletService.java",
    problem:"Parallel wallet transfers occasionally lose balance updates. The total balance across wallets can change even when every transfer reports success.", expected:"Each transfer updates both wallets atomically and preserves the total balance under concurrent calls.", reproduction:["Create two wallets with 1,000 credits each.","Run opposing transfers on separate threads.","Compare the final combined balance with 2,000."], constraints:["Avoid a single global lock.","Prevent deadlocks with deterministic lock ordering.","Reject insufficient funds without partial updates."], note:"Hidden tests reverse transfer direction to expose deadlock-prone solutions.",
    files:{"src/main/java/dev/reporush/Wallet.java":`package dev.reporush;\n\nimport java.util.concurrent.locks.ReentrantLock;\n\nfinal class Wallet {\n    final long id;\n    final ReentrantLock lock = new ReentrantLock();\n    long balance;\n    Wallet(long id, long balance) { this.id = id; this.balance = balance; }\n}`,
      "src/main/java/dev/reporush/WalletService.java":`package dev.reporush;\n\npublic final class WalletService {\n    public void transfer(Wallet from, Wallet to, long amount) {\n        if (from.balance < amount) throw new IllegalStateException("insufficient funds");\n        from.balance -= amount;\n        to.balance += amount;\n    }\n}`,
      "src/test/java/dev/reporush/WalletServiceTest.java":`package dev.reporush;\n\nimport org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.*;\n\nclass WalletServiceTest {\n    @Test void preservesTotalBalance() {\n        // Test harness runs opposing transfers concurrently.\n    }\n}`,
      "pom.xml":`<project><modelVersion>4.0.0</modelVersion><groupId>dev.reporush</groupId><artifactId>wallet-ledger</artifactId><version>1.0.0</version><properties><maven.compiler.release>21</maven.compiler.release></properties></project>`,"README.md":`# Wallet ledger\n\nThread-safe in-memory transfer service for Java 21.`},
    evaluate:f=>{const s=f["src/main/java/dev/reporush/WalletService.java"]||"";const locks=(s.match(/\.lock\(\)/g)||[]).length>=2&&(s.match(/\.unlock\(\)/g)||[]).length>=2;const ordered=/(Math\.min|id\s*<|Comparator)/.test(s);const guarded=/try\s*\{[\s\S]*finally\s*\{/.test(s);return [result("locks both wallets",locks,"both records are protected","acquire both wallet locks"),result("uses deterministic lock order",ordered,"lock ordering is deterministic","order locks by wallet id"),result("releases locks safely",guarded,"locks release in finally","release locks in a finally block"),result("checks funds inside lock",locks&&/lock\(\)[\s\S]*from\.balance\s*</.test(s),"balance check is protected","move the funds check inside the critical section")];}
  },
  {
    id:"RR-306", title:"Slug builder leaves duplicate separators", summary:"Correct edge cases in a Python text utility.", language:"Python", skills:["Strings","Regex"], difficulty:"Easy", time:"20 min", status:"Not started", repoName:"content-utils", entryFile:"src/content_utils/slug.py",
    problem:"Article slugs contain repeated hyphens and trailing separators when titles include punctuation or extra whitespace.", expected:"Slugs contain lowercase alphanumeric groups separated by one hyphen, with no leading or trailing separator.", reproduction:["Pass '  Hello,   RepoRush!  ' to slugify.","Inspect the returned value.","Observe duplicate and trailing hyphens."], constraints:["Use only the Python standard library.","Return an empty string for punctuation-only input.","Keep Unicode letters where possible."], note:"Public tests cover whitespace and punctuation; hidden tests include empty titles.",
    files:{"src/content_utils/slug.py":`import re\n\n\ndef slugify(title: str) -> str:\n    \"\"\"Convert an article title into a URL-safe slug.\"\"\"\n    value = title.lower().replace(" ", "-")\n    return re.sub(r"[^\\w-]", "-", value)\n`,
      "src/content_utils/__init__.py":`from .slug import slugify\n\n__all__ = ["slugify"]\n`,
      "tests/test_slug.py":`from content_utils.slug import slugify\n\n\ndef test_collapses_separators():\n    assert slugify("  Hello,   RepoRush!  ") == "hello-reporush"\n\ndef test_empty_title():\n    assert slugify("!!!") == ""\n`,
      "pyproject.toml":`[project]\nname = "content-utils"\nversion = "1.0.0"\nrequires-python = ">=3.11"\n\n[tool.pytest.ini_options]\npythonpath = ["src"]\n`,"README.md":`# Content utils\n\nPython text utilities. Run with \`pytest\`.`},
    evaluate:f=>{const s=f["src/content_utils/slug.py"]||"";const collapse=/\+/.test(s)&&/(strip\(|\.strip\(\s*["']-)/.test(s);return [result("collapses repeated separators",collapse,"separators collapse correctly","collapse one or more separators"),result("trims edge separators",/strip\(\s*["']-/.test(s),"edges are trimmed","strip leading and trailing hyphens"),result("normalizes lowercase",/\.lower\(\)/.test(s),"lowercase normalization preserved","keep lowercase normalization"),result("uses standard library",!/import\s+(slugify|unidecode)/.test(s),"no external dependency added","use only standard-library modules")];}
  },
  {
    id:"RR-076", title:"Refund totals drift by one cent", summary:"Repair Decimal handling in a Python billing module.", language:"Python", skills:["Money","Decimal"], difficulty:"Medium", time:"40 min", status:"Not started", repoName:"billing-engine", entryFile:"src/billing/refunds.py",
    problem:"Some partial refunds differ from the expected amount by one cent. The issue appears only for values that cannot be represented exactly as binary floats.", expected:"Refund totals use decimal arithmetic throughout and round once to two places using ROUND_HALF_UP.", reproduction:["Create a line item priced at 10.05 with quantity 3.","Refund one third of the line.","Compare the computed refund with the invoice total."], constraints:["Do not convert monetary input to float.","Quantize only the final result.","Use ROUND_HALF_UP."], note:"Hidden tests include values ending in .005 and multi-item refunds.",
    files:{"src/billing/refunds.py":`from decimal import Decimal\n\n\ndef calculate_refund(unit_price: str, quantity: int, ratio: str) -> Decimal:\n    price = float(unit_price)\n    refund_ratio = float(ratio)\n    total = price * quantity * refund_ratio\n    return Decimal(str(round(total, 2)))\n`,
      "src/billing/invoice.py":`from dataclasses import dataclass\nfrom decimal import Decimal\n\n@dataclass(frozen=True)\nclass LineItem:\n    unit_price: Decimal\n    quantity: int\n`,
      "tests/test_refunds.py":`from decimal import Decimal\nfrom billing.refunds import calculate_refund\n\n\ndef test_uses_decimal_rounding():\n    assert calculate_refund("10.05", 3, "0.333333") == Decimal("10.05")\n`,
      "pyproject.toml":`[project]\nname = "billing-engine"\nversion = "1.0.0"\nrequires-python = ">=3.11"\n\n[tool.pytest.ini_options]\npythonpath = ["src"]\n`,"README.md":`# Billing engine\n\nDecimal-safe invoice and refund calculations.`},
    evaluate:f=>{const s=f["src/billing/refunds.py"]||"";const noFloat=!/float\s*\(/.test(s);const decimals=(s.match(/Decimal\s*\(/g)||[]).length>=2;const quant=/\.quantize\s*\(/.test(s);const half=/ROUND_HALF_UP/.test(s);return [result("avoids binary floats",noFloat,"calculation stays decimal","remove float conversion"),result("constructs Decimal inputs",decimals,"inputs become Decimal values","construct Decimal directly from strings"),result("quantizes final total",quant,"final result is quantized","quantize the final Decimal result"),result("uses ROUND_HALF_UP",half,"required rounding mode is explicit","pass ROUND_HALF_UP to quantize")];}
  }
];

import { additionalChallenges } from "./challenge-packs";
export const challenges: Challenge[] = [...coreChallenges,...additionalChallenges];

const catalogErrors:string[]=[];
const ids=new Set<string>();
for(const challenge of challenges){
  if(ids.has(challenge.id))catalogErrors.push(`duplicate id ${challenge.id}`);ids.add(challenge.id);
  if(!challenge.files[challenge.entryFile])catalogErrors.push(`${challenge.id}: entry file is missing`);
  if(Object.keys(challenge.files).length<4)catalogErrors.push(`${challenge.id}: repository has fewer than four files`);
  if(!Object.keys(challenge.files).some(path=>/test/i.test(path)))catalogErrors.push(`${challenge.id}: public test file is missing`);
  if(!Object.keys(challenge.files).some(path=>/(package\.json|pyproject\.toml|pom\.xml)$/.test(path)))catalogErrors.push(`${challenge.id}: build configuration is missing`);
}
if(challenges.length<25)catalogErrors.push(`catalog has only ${challenges.length} challenges`);
if(catalogErrors.length)throw new Error(`Invalid RepoRush challenge catalog:\n${catalogErrors.join("\n")}`);

export function languageForPath(path:string){if(path.endsWith(".java"))return"java";if(path.endsWith(".py"))return"python";if(path.endsWith(".json"))return"json";if(path.endsWith(".md"))return"markdown";if(path.endsWith(".xml"))return"xml";if(path.endsWith(".toml"))return"ini";return"javascript";}

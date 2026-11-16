// Reference implementations for validating public test cases. Never included in learner files.
export const practiceReferences = {
  "RR-104": `import { database } from "./database.js";
export function updateProfile(cache, userId, changes) {
  const updated = {...cache.get(userId), ...changes};
  database.save(userId, updated); cache.set(userId, updated); return updated;
}`,
  "RR-091": `export function pageToOffset(page, size) {if(page < 1) throw new RangeError(); return (page-1)*size;}
export async function fetchPage(transport,page,pageSize=20) {return transport.get("/items",{offset:pageToOffset(page,pageSize),limit:pageSize});}`,
  "RR-JS-003": `export function isSessionValid(session,now=Date.now()){return Boolean(session?.userId)&&session.expiresAt>now;}`,
  "RR-JS-004": `export function discountFor(order){return order.discount??0.1;}`,
  "RR-JS-005": `export function connect(socket,onMessage){socket.addEventListener("message",onMessage);return()=>{socket.removeEventListener("message",onMessage);socket.close();};}`,
  "RR-JS-006": `export function retryDelay(baseMs,attempt){return baseMs*2**attempt;}`,
  "RR-JS-007": `import crypto from "node:crypto";
export function verify(payload,signature,secret){const expected=crypto.createHmac("sha256",secret).update(payload).digest();const actual=Buffer.from(signature,"hex");return expected.length===actual.length&&crypto.timingSafeEqual(expected,actual);}`,
  "RR-JS-008": `export async function runPool(tasks,limit){const results=[];let cursor=0;async function worker(){while(cursor<tasks.length){const index=cursor++;results[index]=await tasks[index]();}}await Promise.all(Array.from({length:Math.min(limit,tasks.length)},worker));return results;}`,
  "RR-JS-009": `export function featureEnabled(env){return String(env.FEATURE_ENABLED).toLowerCase()==="true";}`,
  "RR-306": `import re
def slugify(title):
    return re.sub(r"[\\W_]+", "-", title.lower()).strip("-")
`,
  "RR-076": `from decimal import Decimal, ROUND_HALF_UP
def calculate_refund(unit_price, quantity, ratio):
    return (Decimal(unit_price) * quantity * Decimal(ratio)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
`,
  "RR-PY-003": `def report_day(now):
    return now.date().isoformat()
`,
  "RR-PY-004": `def valid_rows(rows):
    return [row for row in rows if any(value.strip() for value in row)]
`,
  "RR-PY-005": `def should_retry(job):
    return job["status"] == "failed" and job["attempts"] < job["max_attempts"]
`,
  "RR-PY-006": `def target_path(root, member):
    root = root.resolve()
    target = (root / member).resolve()
    if not target.is_relative_to(root):
        raise ValueError("Outside root")
    return target
`,
  "RR-PY-007": `def get_cached(entry, now):
    return entry["token"] if entry and entry["expires_at"] > now else None
`,
  "RR-PY-008": `def batches(items, size):
    for index in range(0, len(items), size):
        yield items[index:index+size]
`,
  "RR-PY-009": `def effective_permissions(role_permissions, user_permissions):
    return role_permissions | user_permissions
`,
  "RR-PY-010": `def allow(state, now, limit=3, window=60):
    if now - state["started_at"] >= window:
        state.update(started_at=now, count=0)
    state["count"] += 1
    return state["count"] <= limit
`,
  "RR-203": `package dev.reporush;import java.util.*;public final class Inventory{private final List<Item> items;public Inventory(List<Item> items){this.items=List.copyOf(items);}public Optional<Item> findBySku(String sku){return items.stream().filter(item->item.sku().equals(sku)).findFirst();}}`,
  "RR-218": `package dev.reporush;public final class WalletService{public void transfer(Wallet from,Wallet to,long amount){Wallet first=from.id<to.id?from:to;Wallet second=from.id<to.id?to:from;first.lock.lock();second.lock.lock();try{if(from.balance<amount)throw new IllegalStateException();from.balance-=amount;to.balance+=amount;}finally{second.lock.unlock();first.lock.unlock();}}}`,
  "RR-JAVA-003": `package dev.reporush;import java.util.*;public class NotificationKey{private final String recipient,template;public NotificationKey(String r,String t){recipient=r;template=t;}public boolean equals(Object o){return o instanceof NotificationKey k&&Objects.equals(recipient,k.recipient)&&Objects.equals(template,k.template);}public int hashCode(){return Objects.hash(recipient,template);}}`,
  "RR-JAVA-004": `package dev.reporush;import java.math.*;public class TaxCalculator{public BigDecimal tax(BigDecimal subtotal,int ratePercent){return subtotal.multiply(BigDecimal.valueOf(ratePercent)).divide(BigDecimal.valueOf(100));}}`,
  "RR-JAVA-005": `package dev.reporush;public class OrderService{public String ship(String state){if(!"PAID".equals(state))throw new DomainException("Must be paid");return "SHIPPED";}}`,
  "RR-JAVA-006": `package dev.reporush;import java.util.*;public class LruCache<K,V> extends LinkedHashMap<K,V>{private final int capacity;public LruCache(int c){super(c,0.75f,true);capacity=c;}protected boolean removeEldestEntry(Map.Entry<K,V> e){return size()>capacity;}}`,
  "RR-JAVA-007": String.raw`package dev.reporush;public class CsvWriter{public String field(String value){return "\""+value.replace("\"","\"\"")+"\"";}}`,
  "RR-JAVA-008": `package dev.reporush;import java.util.*;public class TaskScheduler{public List<String> sort(List<String> priorities){return priorities.stream().sorted(Comparator.<String>comparingInt(Integer::parseInt).reversed()).toList();}}`,
  "RR-JAVA-009": `package dev.reporush;public class QueryService{public void run(Pool pool){Connection c=pool.borrow();try{c.execute();}finally{pool.release(c);}}interface Pool{Connection borrow();void release(Connection c);}interface Connection{void execute();}}`,
  "RR-JAVA-010": `package dev.reporush;import java.util.Date;import java.time.*;import java.time.format.*;public class AuditFormatter{private static final DateTimeFormatter F=DateTimeFormatter.ofPattern("yyyy-MM-dd");public String format(Date d){return F.format(d.toInstant().atZone(ZoneId.systemDefault()));}}`,
};

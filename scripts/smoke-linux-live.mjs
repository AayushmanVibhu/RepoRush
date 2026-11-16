import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve, join} from 'node:path';
import {randomUUID} from 'node:crypto';
import * as sdk from 'e2b';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = resolve(import.meta.dirname, '..');
function load(file, dependencies) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(join(root, file), 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(source, {exports, process, TextEncoder, TextDecoder, require(name) {if (name in dependencies) return dependencies[name]; throw Error(`Unexpected dependency ${name}`);}});
  return exports;
}
if (!process.env.E2B_API_KEY) throw new Error('Add E2B_API_KEY to ignored .env.local before running this smoke test.');
const policy = load('lib/sandbox-policy.ts', {});
const service = load('lib/linux-sandbox.ts', {e2b: sdk, 'node:crypto':{randomUUID}, './mongodb':{getDatabase() {throw Error('Live smoke does not access MongoDB.');}}, '@/app/challenges':{challenges:[]}, './sandbox-policy':policy, './test-results':load('lib/test-results.ts',{})});
let sandbox;
let pty;
try {
  sandbox = await service.createSandbox(180000);
  await service.ensureRuntime(sandbox, 'JavaScript');
  await service.seedFiles(sandbox, {'smoke.txt':'editor version'});
  assert.equal(await sandbox.files.read(`${service.REPO}/smoke.txt`), 'editor version');
  let output = '';
  pty = await sandbox.pty.create({cwd:service.REPO, cols:80, rows:20, timeoutMs:0, onData:data => {output += new TextDecoder().decode(data);}});
  await sandbox.pty.sendInput(pty.pid, new TextEncoder().encode("export RR_SMOKE=terminal; printf 'terminal version' > smoke.txt\n"));
  for (let i=0; i<30 && await sandbox.files.read(`${service.REPO}/smoke.txt`) !== 'terminal version'; i++) await new Promise(resolve => setTimeout(resolve,100));
  assert.equal(await sandbox.files.read(`${service.REPO}/smoke.txt`), 'terminal version');
  const pid = pty.pid;
  await pty.disconnect();
  pty = await sandbox.pty.connect(pid, {timeoutMs:10000, onData:data => {output += new TextDecoder().decode(data);}});
  await sandbox.pty.sendInput(pid, new TextEncoder().encode("printf '\\nPERSISTED_%s\\n' \"$RR_SMOKE\"\n"));
  for (let i=0; i<30 && !output.includes('PERSISTED_terminal'); i++) await new Promise(resolve => setTimeout(resolve,100));
  assert.ok(output.includes('PERSISTED_terminal'));
  console.log('Live PTY input, reconnect, shell state and shared filesystem: PASS');
  const snapshots = JSON.parse(readFileSync(join(root,'app/interview-data/challenges.json'),'utf8'));
  for (const [id, reference] of [['RR-INT-JS-002','form-prevalence.js'], ['RR-INT-PY-002','weather.py'], ['RR-INT-JAVA-001','PaymentService.java']]) {
    const challenge = snapshots.find(item => item.id === id);
    await sandbox.setTimeout(150000);
    await service.ensureRuntime(sandbox, challenge.language);
    await service.seedFiles(sandbox, challenge.files);
    const command = policy.executionPlan(id).command;
    let failed = false;
    try {await sandbox.commands.run(command, {cwd:service.REPO, timeoutMs:25000});}
    catch(error) {if (error instanceof sdk.CommandExitError) failed = true; else throw error;}
    assert.ok(failed, `${id}: starter should fail`);
    await sandbox.files.write(`${service.REPO}/${challenge.entryFile}`, readFileSync(join(root,'scripts/interview-references',reference),'utf8'));
    const result = await sandbox.commands.run(command, {cwd:service.REPO, timeoutMs:25000});
    assert.equal(result.exitCode,0);
    console.log(`${id}: live starter FAIL and repaired PASS verified`);
  }
} catch(error) {
  console.error(`Live smoke failed: ${String(error.message).replaceAll(process.env.E2B_API_KEY,'[redacted]')}`);
  process.exitCode=1;
} finally {
  await pty?.disconnect().catch(() => undefined);
  if (sandbox) {await sandbox.kill(); console.log('Live smoke sandbox terminated.');}
}

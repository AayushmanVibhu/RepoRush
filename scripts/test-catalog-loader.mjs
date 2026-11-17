import vm from "node:vm";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = resolve(import.meta.dirname, "..");
const cache = new Map();
export function mockTypeScript(relative, exports) {
  cache.set(resolve(root, relative), exports);
}
export function loadTypeScript(relative) {
  const path = resolve(root, relative);
  if (cache.has(path)) return cache.get(path);
  const requireFromFile = createRequire(path);
  const exports = {};
  cache.set(path, exports);
  vm.runInNewContext(
    ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    {
      exports,
      console,
      process,
      Buffer,
      Date,
      AbortSignal,
      Response,
      TextEncoder,
      URL,
      URLSearchParams,
      get indexedDB() { return globalThis.indexedDB; },
      get localStorage() { return globalThis.localStorage; },
      get crypto() { return globalThis.crypto; },
      get fetch() { return globalThis.fetch; },
      require(name) {
        if (
          !name.startsWith("@/") &&
          !name.startsWith("./") &&
          !name.startsWith("../")
        ) {
          return requireFromFile(name);
        }
        const target = name.startsWith("@/")
          ? resolve(root, name.slice(2))
          : resolve(dirname(path), name);
        if (existsSync(`${target}.ts`)) return loadTypeScript(`${target}.ts`);
        return requireFromFile(target);
      },
    },
  );
  return exports;
}

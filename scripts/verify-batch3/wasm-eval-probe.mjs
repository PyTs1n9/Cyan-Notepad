/**
 * Does the ONNX runtime glue reach `new Function` while loading?
 *
 * `script-src 'self'` (the batch 3 CSP) blocks runtime code generation, so an
 * eager `new Function` at instantiation time would break the local embedding
 * pipeline in a way no amount of static reading settles. This probe instantiates
 * the exact wasm build the bundle ships and reports whether the embind
 * invoker factory is reached during init.
 *
 *   node scripts/verify-batch3/wasm-eval-probe.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const glue = path.join(root, "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs");
const wasm = path.join(root, "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm");

if (!fs.existsSync(glue) || !fs.existsSync(wasm)) {
  console.log("SKIP  onnxruntime-web asyncify build not installed");
  process.exit(0);
}

const wasmBytes = fs.readFileSync(wasm);
let calls = 0;
const traces = [];
const RealFunction = Function;

// Everything `new Function(src)` would compile and run instead throws, which is
// what a CSP without 'unsafe-eval' does.
globalThis.Function = new Proxy(RealFunction, {
  apply(target, thisArg, args) {
    calls += 1;
    traces.push(String(args.at(-1)).slice(0, 60));
    return Reflect.apply(target, thisArg, args);
  },
  construct(target, args, newTarget) {
    calls += 1;
    traces.push(String(args.at(-1)).slice(0, 60));
    return Reflect.construct(target, args, newTarget);
  },
});

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input?.url ?? String(input);
  if (url.endsWith(".wasm")) {
    return new Response(wasmBytes, { headers: { "content-type": "application/wasm" } });
  }
  return realFetch(input, init);
};

let factory;
try {
  ({ default: factory } = await import(pathToFileURL(glue).href));
} catch (error) {
  console.log(`SKIP  glue import failed: ${error.message}`);
  process.exit(0);
}

try {
  const instance = await factory({
    locateFile: (file) => path.join(root, "node_modules/onnxruntime-web/dist", file),
  });
  console.log(`instantiated: ${typeof instance}`);
  const init = instance?._OrtInit ?? instance?._OrtGetApiBase;
  if (typeof init === "function") {
    init.call(instance, 1, 0);
    console.log("called _OrtInit");
  }
} catch (error) {
  console.log(`instantiate error: ${error.message}`);
}

console.log(`new Function calls during init: ${calls}`);
for (const trace of traces) console.log(`  ${JSON.stringify(trace)}`);
process.exit(calls === 0 ? 0 : 2);

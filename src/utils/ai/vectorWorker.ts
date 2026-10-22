/**
 * Embedding worker: runs `bge-small-zh-v1.5` (int8 ONNX) off the main thread
 * via transformers.js. Model files ship in `public/models/` (bundled into the
 * installer); remote model fetches are disabled so the app stays offline.
 */
/// <reference lib="webworker" />
import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

env.allowRemoteModels = false;
env.localModelPath = `${import.meta.env.BASE_URL}models/`;

/** bge-zh retrieval models expect this prefix on queries (not on passages). */
const QUERY_INSTRUCTION = "为这个句子生成表示以用于检索相关文章：";

let extractor: FeatureExtractionPipeline | null = null;
let loading: Promise<FeatureExtractionPipeline> | null = null;

function ensureExtractor(): Promise<FeatureExtractionPipeline> {
  if (extractor) return Promise.resolve(extractor);
  if (!loading) {
    loading = pipeline("feature-extraction", "bge-small-zh-v1.5", {
      dtype: "q8",
      device: "wasm",
    }).then((pipe: FeatureExtractionPipeline) => {
      extractor = pipe;
      return pipe;
    });
  }
  // `loading` is assigned above whenever it was null; TS cannot see that.
  return loading ?? Promise.reject(new Error("extractor unavailable"));
}

type WorkerRequest =
  | { type: "init" }
  | { type: "embed"; id: number; texts: string[]; isQuery?: boolean };

type WorkerResponse =
  | { type: "ready" }
  | { type: "vectors"; id: number; vectors: number[][] }
  | { type: "error"; id?: number; message: string };

function post(message: WorkerResponse): void {
  (self as unknown as Worker).postMessage(message);
}

async function embed(
  texts: string[],
  isQuery: boolean,
): Promise<number[][]> {
  const pipe = await ensureExtractor();
  const prepared = isQuery ? texts.map((t) => QUERY_INSTRUCTION + t) : texts;
  const output = (await pipe(prepared, { pooling: "mean", normalize: true })) as {
    tolist: () => number[][];
  };
  return output.tolist();
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === "init") {
    ensureExtractor()
      .then(() => post({ type: "ready" }))
      .catch((error: unknown) =>
        post({ type: "error", message: error instanceof Error ? error.message : String(error) }),
      );
    return;
  }
  if (request.type === "embed") {
    embed(request.texts, Boolean(request.isQuery))
      .then((vectors) => post({ type: "vectors", id: request.id, vectors }))
      .catch((error: unknown) =>
        post({
          type: "error",
          id: request.id,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
  }
});

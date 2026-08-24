import { Board } from "./board";
import { findBestMove } from "./search";
import type {
  Move,
  Player,
  SearchIteration,
  SearchOptions,
  SearchResult,
} from "./types";

export type WorkerSearchOptions = Omit<SearchOptions, "signal" | "onIteration">;

export interface GomokuWorkerRequest {
  readonly id: number;
  readonly size: number;
  readonly cells: Uint8Array;
  readonly player: Player;
  readonly options: WorkerSearchOptions;
}

export type GomokuWorkerResponse =
  | {
      readonly id: number;
      readonly kind: "iteration";
      readonly iteration: SearchIteration;
    }
  | { readonly id: number; readonly kind: "result"; readonly result: SearchResult }
  | { readonly id: number; readonly kind: "error"; readonly message: string };

let nextRequestId = 1;

function clock(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function signalIsAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted ?? false;
}

function abortedResult(
  startedAt: number,
  latest: SearchIteration | null,
): SearchResult {
  const move: Move | null = latest === null ? null : latest.move;
  return {
    move,
    score: latest?.score ?? 0,
    depth: latest?.depth ?? 0,
    nodes: latest?.nodes ?? 0,
    elapsedMs: clock() - startedAt,
    principalVariation: latest?.principalVariation ?? [],
    stopped: "aborted",
  };
}

/**
 * Browser-friendly async search. Vite/Astro bundles the worker referenced here.
 * Cancellation terminates the worker immediately, while iteration callbacks run
 * on the UI thread. Environments without `Worker` use the synchronous engine
 * after yielding once.
 */
export async function chooseMove(
  board: Board,
  player: Player,
  options: SearchOptions = {},
): Promise<SearchResult> {
  const startedAt = clock();
  if (signalIsAborted(options.signal)) return abortedResult(startedAt, null);

  if (typeof Worker === "undefined") {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (signalIsAborted(options.signal)) return abortedResult(startedAt, null);
    return findBestMove(board, player, options);
  }

  const id = nextRequestId;
  nextRequestId += 1;
  const { signal, onIteration, ...workerOptions } = options;
  const request: GomokuWorkerRequest = {
    id,
    size: board.size,
    cells: board.toFlatArray(),
    player,
    options: workerOptions,
  };

  return new Promise<SearchResult>((resolve, reject) => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
      name: "gomoku-search",
    });
    let settled = false;
    let latest: SearchIteration | null = null;

    const cleanup = (): void => {
      signal?.removeEventListener("abort", handleAbort);
      worker.terminate();
    };
    const finish = (result: SearchResult): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const handleAbort = (): void => finish(abortedResult(startedAt, latest));

    worker.onmessage = (event: MessageEvent<GomokuWorkerResponse>) => {
      const response = event.data;
      if (response.id !== id) return;
      if (response.kind === "iteration") {
        latest = response.iteration;
        try {
          onIteration?.(response.iteration);
        } catch (error) {
          fail(error);
        }
      } else if (response.kind === "result") {
        finish(response.result);
      } else {
        fail(new Error(response.message));
      }
    };
    worker.onerror = (event) => {
      fail(new Error(event.message || "Gomoku worker failed."));
    };
    signal?.addEventListener("abort", handleAbort, { once: true });
    if (signalIsAborted(signal)) handleAbort();
    else worker.postMessage(request);
  });
}

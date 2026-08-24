import { Board } from "./board";
import { GomokuEngine } from "./search";
import type { GomokuWorkerRequest, GomokuWorkerResponse } from "./worker-client";

interface WorkerScope {
  postMessage(message: GomokuWorkerResponse): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<GomokuWorkerRequest>) => void,
  ): void;
}

const scope = self as unknown as WorkerScope;
const engine = new GomokuEngine();

scope.addEventListener("message", (event) => {
  const request = event.data;
  try {
    const board = new Board(request.size, request.cells);
    const result = engine.search(board, request.player, {
      ...request.options,
      onIteration: (iteration) => {
        scope.postMessage({
          id: request.id,
          kind: "iteration",
          iteration,
        });
      },
    });
    scope.postMessage({ id: request.id, kind: "result", result });
  } catch (error) {
    scope.postMessage({
      id: request.id,
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

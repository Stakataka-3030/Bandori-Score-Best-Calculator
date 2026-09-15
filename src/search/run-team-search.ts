import type {
  BandoriTeamSearchInput,
  BandoriTeamSearchResponse,
} from "@/lib/bandori/team-builder/core/types";
import type {
  TeamSearchWorkerFailure,
  TeamSearchWorkerSuccess,
} from "@/workers/team-search-worker";

export type RunTeamSearchOptions = {
  signal?: AbortSignal;
};

function createRequestId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function runBandoriTeamSearch(
  input: BandoriTeamSearchInput,
  options: RunTeamSearchOptions = {},
): Promise<BandoriTeamSearchResponse> {
  if (options.signal?.aborted) {
    return Promise.reject(new DOMException("Search aborted", "AbortError"));
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/team-search-worker.ts", import.meta.url),
      { type: "module" },
    );
    const id = createRequestId();

    const cleanup = () => {
      options.signal?.removeEventListener("abort", onAbort);
      worker.terminate();
    };

    const onAbort = () => {
      cleanup();
      reject(new DOMException("Search aborted", "AbortError"));
    };

    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || "Team-search worker failed"));
    };

    worker.onmessage = (event: MessageEvent<TeamSearchWorkerSuccess | TeamSearchWorkerFailure>) => {
      if (event.data.id !== id) return;
      cleanup();
      if (event.data.ok) resolve(event.data.response);
      else reject(new Error(event.data.error));
    };

    options.signal?.addEventListener("abort", onAbort, { once: true });
    worker.postMessage({ id, input });
  });
}

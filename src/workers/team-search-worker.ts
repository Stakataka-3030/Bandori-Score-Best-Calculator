/// <reference lib="webworker" />

import { searchBandoriBestTeams } from "@/lib/bandori-team-search";
import type {
  BandoriTeamSearchInput,
  BandoriTeamSearchResponse,
} from "@/lib/bandori/team-builder/core/types";

type TeamSearchWorkerRequest = {
  id: string;
  input: BandoriTeamSearchInput;
};

type TeamSearchWorkerSuccess = {
  id: string;
  ok: true;
  response: BandoriTeamSearchResponse;
};

type TeamSearchWorkerFailure = {
  id: string;
  ok: false;
  error: string;
};

const worker = self as DedicatedWorkerGlobalScope;

worker.onmessage = (event: MessageEvent<TeamSearchWorkerRequest>) => {
  const { id, input } = event.data;
  try {
    const response = searchBandoriBestTeams(input);
    worker.postMessage({ id, ok: true, response } satisfies TeamSearchWorkerSuccess);
  } catch (cause) {
    worker.postMessage({
      id,
      ok: false,
      error: cause instanceof Error ? cause.message : String(cause),
    } satisfies TeamSearchWorkerFailure);
  }
};

export type {
  TeamSearchWorkerRequest,
  TeamSearchWorkerSuccess,
  TeamSearchWorkerFailure,
};

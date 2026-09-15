import { invoke } from "@tauri-apps/api/core";
import type { MedleySearchInputV1, Triple } from "@/lib/bandori/medley-foundation";

export type MedleySearchTeam = {
  slot: number;
  memberInstanceIds: [number, number, number, number, number];
  averageScore: number;
};

export type MedleySearchSolution = {
  selectedAreaItemIds: number[];
  teams: Triple<MedleySearchTeam>;
  totalAverageScore: number;
};

export type MedleySearchDiagnostics = Record<string, unknown>;

export type MedleySearchOutcome =
  | {
      status: "exact";
      best: MedleySearchSolution | null;
      discovered: MedleySearchSolution[];
      diagnostics: MedleySearchDiagnostics;
    }
  | {
      status: "incomplete";
      reason: string;
      bestSoFar: MedleySearchSolution | null;
      discovered: MedleySearchSolution[];
      diagnostics: MedleySearchDiagnostics;
    };

export type HydratedMedleySearchTeam = {
  slot: number;
  memberInstanceIds: [number, number, number, number, number];
  parameters: {
    cardPower: number;
    areaItemPower: number;
    eventPower: number;
    deckTotalParameter: number;
  };
  minimumScore: number;
  averageScore: number;
  maximumScore: number;
  bestSkillOrderMemberInstanceIds: [number, number, number, number, number, number];
  maximumScoreOrderCount: number;
  scoreOrderCount: number;
};

export type HydratedMedleySearchSolution = {
  selectedAreaItemIds: number[];
  teams: Triple<HydratedMedleySearchTeam>;
  totalMinimumScore: number;
  totalAverageScore: number;
  totalMaximumScore: number;
};

export type MedleySearchRunResult = {
  outcome: MedleySearchOutcome;
  hydration: {
    candidates: HydratedMedleySearchSolution[];
    maximumScoreCandidateIndex: number | null;
  };
};

export type RunNativeMedleySearchOptions = {
  maxDurationMs?: number;
  memoryBudgetBytes?: number;
  signal?: AbortSignal;
};

const DEFAULT_MEMORY_BUDGET_BYTES = 1024 * 1024 * 1024;

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function abortError(): DOMException {
  return new DOMException("Medley search cancelled", "AbortError");
}

export async function runNativeMedleySearch(
  input: MedleySearchInputV1,
  options: RunNativeMedleySearchOptions = {},
): Promise<MedleySearchRunResult> {
  if (!isTauriRuntime()) {
    throw new Error("Medley 原生搜索需要在 Tauri 桌面客户端中运行");
  }
  if (options.signal?.aborted) throw abortError();

  const maxDurationMs = Math.max(1_000, Math.min(3_600_000, Math.trunc(options.maxDurationMs ?? 30_000)));
  const memoryBudgetBytes = Math.max(
    16 * 1024,
    Math.min(2 * 1024 * 1024 * 1024, Math.trunc(options.memoryBudgetBytes ?? DEFAULT_MEMORY_BUDGET_BYTES)),
  );
  const requestId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `medley-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const onAbort = () => {
    void invoke<boolean>("cancel_medley_search", { requestId }).catch(() => false);
  };
  options.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const raw = await invoke<string>("run_medley_search", {
      request: {
        requestId,
        inputJson: JSON.stringify(input),
        maxDurationMs,
        memoryBudgetBytes,
      },
    });
    if (options.signal?.aborted) throw abortError();
    return JSON.parse(raw) as MedleySearchRunResult;
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
  }
}

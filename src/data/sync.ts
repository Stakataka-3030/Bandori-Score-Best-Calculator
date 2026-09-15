import {
  fetchBestdoriChart,
  fetchBestdoriMaster,
  sha256Strings,
} from "./bestdori-provider";
import {
  commitGeneration,
  getGenerationState,
  loadActiveGeneration,
  readCachedChart,
  setLastCheckedAt,
  writeCachedChart,
} from "./cache";
import {
  BESTDORI_MASTER_KINDS,
  type BestdoriMasterKind,
  type GameDataGeneration,
  type MasterDatasetInfo,
  type MasterSyncResult,
} from "./types";

export const DEFAULT_MASTER_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

const ALL_ATTRIBUTES = ["powerful", "pure", "cool", "happy"] as const;
const ALL_CN_BAND_IDS = [1, 2, 3, 4, 5, 21, 18, 45];

function createCnOnlyAllMemberAreaItem(nameCn: string): Record<string, unknown> {
  const maxLevel = 5;
  const names = [null, null, null, nameCn, null];
  const level = Array.from({ length: 5 }, () => maxLevel);
  const description: Record<string, Array<string | null>> = {};
  const performance: Record<string, number[]> = {};
  const technique: Record<string, number[]> = {};
  const visual: Record<string, number[]> = {};

  for (let currentLevel = 1; currentLevel <= maxLevel; currentLevel += 1) {
    const percent = currentLevel * 0.5;
    const regionalPercent = Array.from({ length: 5 }, () => percent);
    description[String(currentLevel)] = [null, null, null, `全部成员的属性上升${percent}%`, null];
    performance[String(currentLevel)] = regionalPercent;
    technique[String(currentLevel)] = regionalPercent;
    visual[String(currentLevel)] = regionalPercent;
  }

  return {
    areaItemName: names,
    targetAttributes: [...ALL_ATTRIBUTES],
    targetBandIds: [...ALL_CN_BAND_IDS],
    level,
    description,
    performance,
    technique,
    visual,
  };
}

// Bestdori currently omits these CN-only all-member items. Keep the HHWX-audited
// compatibility overlay local so direct synchronization remains sufficient for CN profiles.
const CN_ONLY_AREA_ITEMS: Record<string, Record<string, unknown>> = {
  "59": createCnOnlyAllMemberAreaItem("巧克力海螺包"),
  "68": createCnOnlyAllMemberAreaItem("盆栽套装"),
  "72": createCnOnlyAllMemberAreaItem("极上咖啡"),
};

function normalizeMaster(
  kind: BestdoriMasterKind,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (kind === "areaItems") {
    return {
      ...payload,
      ...CN_ONLY_AREA_ITEMS,
    };
  }
  return payload;
}

async function buildRemoteGeneration(): Promise<GameDataGeneration> {
  const resources = await Promise.all(
    BESTDORI_MASTER_KINDS.map(async (kind) => [kind, await fetchBestdoriMaster(kind)] as const),
  );
  const fetchedAt = new Date().toISOString();
  const generation = await sha256Strings(
    resources.map(([kind, resource]) => `${kind}:${resource.sha256}`),
  );

  const datasets = Object.fromEntries(resources.map(([kind, resource]) => [
    kind,
    {
      kind,
      url: resource.url,
      sha256: resource.sha256,
      recordCount: Object.keys(resource.payload).length,
    } satisfies MasterDatasetInfo,
  ])) as GameDataGeneration["manifest"]["datasets"];

  const masters = Object.fromEntries(resources.map(([kind, resource]) => [
    kind,
    normalizeMaster(kind, resource.payload),
  ])) as GameDataGeneration["masters"];

  return {
    manifest: {
      schemaVersion: 1,
      generation,
      fetchedAt,
      source: "bestdori",
      datasets,
    },
    masters,
  };
}

export async function syncBestdoriMasters(): Promise<MasterSyncResult> {
  const checkedAt = new Date().toISOString();
  const stateBefore = await getGenerationState();
  try {
    const remote = await buildRemoteGeneration();
    if (remote.manifest.generation === stateBefore.activeGeneration) {
      await setLastCheckedAt(checkedAt);
      return {
        ok: true,
        updated: false,
        generation: stateBefore.activeGeneration,
        previousGeneration: stateBefore.previousGeneration,
        checkedAt,
      };
    }

    await commitGeneration(remote);
    return {
      ok: true,
      updated: true,
      generation: remote.manifest.generation,
      previousGeneration: stateBefore.activeGeneration,
      checkedAt,
    };
  } catch (cause) {
    await setLastCheckedAt(checkedAt).catch(() => undefined);
    return {
      ok: false,
      updated: false,
      generation: stateBefore.activeGeneration,
      previousGeneration: stateBefore.previousGeneration,
      checkedAt,
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export async function syncBestdoriMastersIfStale(
  maxAgeMs = DEFAULT_MASTER_REFRESH_INTERVAL_MS,
): Promise<MasterSyncResult | null> {
  const state = await getGenerationState();
  const lastCheckedAt = state.lastCheckedAt ? Date.parse(state.lastCheckedAt) : Number.NaN;
  if (
    state.activeGeneration
    && Number.isFinite(lastCheckedAt)
    && Date.now() - lastCheckedAt < maxAgeMs
  ) {
    return null;
  }
  return syncBestdoriMasters();
}

export async function loadCurrentGameData(): Promise<GameDataGeneration | null> {
  return loadActiveGeneration();
}

export async function ensureCurrentGameData(): Promise<{
  generation: GameDataGeneration | null;
  syncResult: MasterSyncResult | null;
}> {
  const cached = await loadActiveGeneration();
  if (cached) {
    // Do not block the caller on a routine refresh; the UI can observe the returned
    // promise separately if it wants to display an update notification.
    void syncBestdoriMastersIfStale();
    return { generation: cached, syncResult: null };
  }

  const syncResult = await syncBestdoriMasters();
  return {
    generation: await loadActiveGeneration(),
    syncResult,
  };
}

export async function getCachedOrRemoteChart(
  songId: number,
  difficulty: number,
): Promise<unknown[]> {
  const cached = await readCachedChart(songId, difficulty);
  const active = await loadActiveGeneration();
  const currentSongsSha = active?.manifest.datasets.songs.sha256 ?? null;

  if (cached && cached.sourceSongsSha256 === currentSongsSha) {
    return cached.payload;
  }

  try {
    const remote = await fetchBestdoriChart(songId, difficulty);
    await writeCachedChart({
      songId,
      difficulty,
      sha256: remote.sha256,
      fetchedAt: new Date().toISOString(),
      sourceSongsSha256: currentSongsSha,
      payload: remote.payload,
    });
    return remote.payload;
  } catch (cause) {
    // A cached chart remains usable when the network is temporarily unavailable.
    // The songs-master hash only controls refresh attempts, not offline availability.
    if (cached) {
      return cached.payload;
    }
    throw cause;
  }
}

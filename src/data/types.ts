export const BESTDORI_MASTER_KINDS = [
  "cards",
  "skills",
  "characters",
  "bands",
  "areaItems",
  "songs",
  "events",
] as const;

export type BestdoriMasterKind = (typeof BESTDORI_MASTER_KINDS)[number];

export type MasterDatasetInfo = {
  kind: BestdoriMasterKind;
  url: string;
  sha256: string;
  recordCount: number;
};

export type GameDataManifest = {
  schemaVersion: 1;
  generation: string;
  fetchedAt: string;
  source: "bestdori" | "embedded";
  datasets: Record<BestdoriMasterKind, MasterDatasetInfo>;
};

export type GameDataGeneration = {
  manifest: GameDataManifest;
  // Bestdori master schemas vary by dataset and evolve independently. Runtime adapters
  // validate the gameplay fields they consume; the cached raw master layer stays dynamic.
  masters: Record<BestdoriMasterKind, Record<string, any>>;
};

export type GenerationState = {
  activeGeneration: string | null;
  previousGeneration: string | null;
  lastCheckedAt: string | null;
};

export type CachedMasterRecord = {
  key: string;
  generation: string;
  kind: BestdoriMasterKind;
  sha256: string;
  fetchedAt: string;
  payload: Record<string, unknown>;
};

export type CachedChartRecord = {
  key: string;
  songId: number;
  difficulty: number;
  sha256: string;
  fetchedAt: string;
  sourceSongsSha256: string | null;
  payload: unknown[];
};

export type MasterSyncResult = {
  ok: boolean;
  updated: boolean;
  generation: string | null;
  previousGeneration: string | null;
  checkedAt: string;
  error?: string;
};

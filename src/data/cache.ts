import {
  BESTDORI_MASTER_KINDS,
  type BestdoriMasterKind,
  type CachedChartRecord,
  type CachedMasterRecord,
  type GameDataGeneration,
  type GameDataManifest,
  type GenerationState,
} from "./types";

const DATABASE_NAME = "bandori-score-best-calculator";
const DATABASE_VERSION = 1;
const META_STORE = "meta";
const MASTER_STORE = "masters";
const CHART_STORE = "charts";
const GENERATION_STATE_KEY = "generation-state";

type MetaRecord<T = unknown> = {
  key: string;
  value: T;
};

let databasePromise: Promise<IDBDatabase> | null = null;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) {
    return databasePromise;
  }

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error ?? new Error("Unable to open game-data cache"));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains(MASTER_STORE)) {
        const masters = database.createObjectStore(MASTER_STORE, { keyPath: "key" });
        masters.createIndex("generation", "generation", { unique: false });
        masters.createIndex("kind", "kind", { unique: false });
      }
      if (!database.objectStoreNames.contains(CHART_STORE)) {
        database.createObjectStore(CHART_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });

  return databasePromise;
}

export async function getGenerationState(): Promise<GenerationState> {
  const database = await openDatabase();
  const transaction = database.transaction(META_STORE, "readonly");
  const record = await requestResult(
    transaction.objectStore(META_STORE).get(GENERATION_STATE_KEY) as IDBRequest<MetaRecord<GenerationState> | undefined>,
  );
  await transactionDone(transaction);
  return record?.value ?? {
    activeGeneration: null,
    previousGeneration: null,
    lastCheckedAt: null,
  };
}

export async function setLastCheckedAt(lastCheckedAt: string): Promise<void> {
  const current = await getGenerationState();
  const database = await openDatabase();
  const transaction = database.transaction(META_STORE, "readwrite");
  transaction.objectStore(META_STORE).put({
    key: GENERATION_STATE_KEY,
    value: { ...current, lastCheckedAt },
  } satisfies MetaRecord<GenerationState>);
  await transactionDone(transaction);
}

function masterKey(generation: string, kind: BestdoriMasterKind): string {
  return `${generation}:${kind}`;
}

async function readGeneration(generation: string): Promise<GameDataGeneration | null> {
  const database = await openDatabase();
  const transaction = database.transaction([META_STORE, MASTER_STORE], "readonly");
  const mastersStore = transaction.objectStore(MASTER_STORE);
  const records = await Promise.all(BESTDORI_MASTER_KINDS.map((kind) => requestResult(
    mastersStore.get(masterKey(generation, kind)) as IDBRequest<CachedMasterRecord | undefined>,
  )));
  const manifestRecord = await requestResult(
    transaction.objectStore(META_STORE).get(`manifest:${generation}`) as IDBRequest<MetaRecord<GameDataManifest> | undefined>,
  );
  await transactionDone(transaction);

  if (!manifestRecord?.value || records.some((record) => !record)) {
    return null;
  }

  const masters = Object.fromEntries(records.map((record) => [record!.kind, record!.payload])) as GameDataGeneration["masters"];
  return {
    manifest: manifestRecord.value,
    masters,
  };
}

export async function loadActiveGeneration(): Promise<GameDataGeneration | null> {
  const state = await getGenerationState();
  if (state.activeGeneration) {
    const active = await readGeneration(state.activeGeneration);
    if (active) {
      return active;
    }
  }
  if (state.previousGeneration) {
    return readGeneration(state.previousGeneration);
  }
  return null;
}

export async function commitGeneration(generation: GameDataGeneration): Promise<void> {
  const current = await getGenerationState();
  const database = await openDatabase();
  const transaction = database.transaction([META_STORE, MASTER_STORE], "readwrite");
  const mastersStore = transaction.objectStore(MASTER_STORE);
  const fetchedAt = generation.manifest.fetchedAt;

  for (const kind of BESTDORI_MASTER_KINDS) {
    const dataset = generation.manifest.datasets[kind];
    mastersStore.put({
      key: masterKey(generation.manifest.generation, kind),
      generation: generation.manifest.generation,
      kind,
      sha256: dataset.sha256,
      fetchedAt,
      payload: generation.masters[kind],
    } satisfies CachedMasterRecord);
  }

  const metaStore = transaction.objectStore(META_STORE);
  metaStore.put({
    key: `manifest:${generation.manifest.generation}`,
    value: generation.manifest,
  } satisfies MetaRecord<GameDataManifest>);
  metaStore.put({
    key: GENERATION_STATE_KEY,
    value: {
      activeGeneration: generation.manifest.generation,
      previousGeneration: current.activeGeneration === generation.manifest.generation
        ? current.previousGeneration
        : current.activeGeneration,
      lastCheckedAt: fetchedAt,
    },
  } satisfies MetaRecord<GenerationState>);

  await transactionDone(transaction);
  await removeObsoleteGenerations(new Set([
    generation.manifest.generation,
    current.activeGeneration,
  ].filter((value): value is string => Boolean(value))));
}

async function removeObsoleteGenerations(keep: Set<string>): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction([META_STORE, MASTER_STORE], "readwrite");
  const mastersStore = transaction.objectStore(MASTER_STORE);
  const cursorRequest = mastersStore.openCursor();

  await new Promise<void>((resolve, reject) => {
    cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error("Unable to clean old game-data generations"));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        resolve();
        return;
      }
      const record = cursor.value as CachedMasterRecord;
      if (!keep.has(record.generation)) {
        cursor.delete();
      }
      cursor.continue();
    };
  });

  const metaStore = transaction.objectStore(META_STORE);
  const metaCursorRequest = metaStore.openCursor();
  await new Promise<void>((resolve, reject) => {
    metaCursorRequest.onerror = () => reject(metaCursorRequest.error ?? new Error("Unable to clean old manifests"));
    metaCursorRequest.onsuccess = () => {
      const cursor = metaCursorRequest.result;
      if (!cursor) {
        resolve();
        return;
      }
      const key = String(cursor.key);
      if (key.startsWith("manifest:") && !keep.has(key.slice("manifest:".length))) {
        cursor.delete();
      }
      cursor.continue();
    };
  });

  await transactionDone(transaction);
}

function chartKey(songId: number, difficulty: number): string {
  return `${songId}:${difficulty}`;
}

export async function readCachedChart(songId: number, difficulty: number): Promise<CachedChartRecord | null> {
  const database = await openDatabase();
  const transaction = database.transaction(CHART_STORE, "readonly");
  const record = await requestResult(
    transaction.objectStore(CHART_STORE).get(chartKey(songId, difficulty)) as IDBRequest<CachedChartRecord | undefined>,
  );
  await transactionDone(transaction);
  return record ?? null;
}

export async function writeCachedChart(record: Omit<CachedChartRecord, "key">): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(CHART_STORE, "readwrite");
  transaction.objectStore(CHART_STORE).put({
    ...record,
    key: chartKey(record.songId, record.difficulty),
  } satisfies CachedChartRecord);
  await transactionDone(transaction);
}

export async function clearGameDataCache(): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction([META_STORE, MASTER_STORE, CHART_STORE], "readwrite");
  transaction.objectStore(META_STORE).clear();
  transaction.objectStore(MASTER_STORE).clear();
  transaction.objectStore(CHART_STORE).clear();
  await transactionDone(transaction);
}

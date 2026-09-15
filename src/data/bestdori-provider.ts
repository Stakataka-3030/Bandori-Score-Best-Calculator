import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { BestdoriMasterKind } from "./types";

export const BESTDORI_BASE_URL = "https://bestdori.com";

export const BESTDORI_MASTER_URLS: Record<BestdoriMasterKind, string> = {
  cards: `${BESTDORI_BASE_URL}/api/cards/all.5.json`,
  skills: `${BESTDORI_BASE_URL}/api/skills/all.10.json`,
  characters: `${BESTDORI_BASE_URL}/api/characters/main.3.json`,
  bands: `${BESTDORI_BASE_URL}/api/bands/all.1.json`,
  areaItems: `${BESTDORI_BASE_URL}/api/areaItems/main.5.json`,
  songs: `${BESTDORI_BASE_URL}/api/songs/all.7.json`,
  events: `${BESTDORI_BASE_URL}/api/events/all.6.json`,
};

const BESTDORI_CHART_DIFFICULTIES = ["easy", "normal", "hard", "expert", "special"] as const;

const REQUEST_TIMEOUT_MS = 20_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function getFetch(): typeof globalThis.fetch {
  return (isTauriRuntime() ? tauriFetch : globalThis.fetch) as typeof globalThis.fetch;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function assertMasterShape(kind: BestdoriMasterKind, value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Bestdori ${kind} payload is not an object`);
  }
  const entries = Object.entries(value);
  if (entries.length === 0) {
    throw new Error(`Bestdori ${kind} payload is empty`);
  }

  // Reject common proxy/error-page mistakes while keeping validation tolerant of
  // Bestdori adding fields. Exact gameplay-field validation happens in adapters.
  const sample = entries.slice(0, Math.min(entries.length, 32));
  if (sample.some(([key]) => !/^\d+$/u.test(key))) {
    throw new Error(`Bestdori ${kind} payload contains a non-numeric top-level key`);
  }

  if (kind === "cards") {
    const card = sample.map(([, item]) => item).find(isRecord);
    if (!card || !("characterId" in card) || !("skillId" in card) || !("stat" in card)) {
      throw new Error("Bestdori cards payload is missing required card fields");
    }
  } else if (kind === "areaItems") {
    const item = sample.map(([, entry]) => entry).find(isRecord);
    if (!item || !("targetAttributes" in item) || !("targetBandIds" in item)) {
      throw new Error("Bestdori areaItems payload is missing target fields");
    }
  } else if (kind === "songs") {
    const song = sample.map(([, entry]) => entry).find(isRecord);
    if (!song || !("difficulty" in song)) {
      throw new Error("Bestdori songs payload is missing difficulty data");
    }
  }

  return value;
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await getFetch()(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export type FetchedJsonResource<T> = {
  url: string;
  sha256: string;
  rawText: string;
  payload: T;
};

export async function fetchBestdoriMaster(
  kind: BestdoriMasterKind,
): Promise<FetchedJsonResource<Record<string, unknown>>> {
  const url = BESTDORI_MASTER_URLS[kind];
  const rawText = await fetchText(url);
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(`Bestdori ${kind} returned invalid JSON`);
  }
  return {
    url,
    rawText,
    sha256: await sha256Hex(rawText),
    payload: assertMasterShape(kind, parsed),
  };
}

export async function fetchBestdoriChart(
  songId: number,
  difficulty: number,
): Promise<FetchedJsonResource<unknown[]>> {
  if (!Number.isSafeInteger(songId) || songId <= 0) {
    throw new Error(`Invalid songId: ${songId}`);
  }
  if (!Number.isSafeInteger(difficulty) || difficulty < 0 || difficulty >= BESTDORI_CHART_DIFFICULTIES.length) {
    throw new Error(`Invalid chart difficulty: ${difficulty}`);
  }

  const difficultyName = BESTDORI_CHART_DIFFICULTIES[difficulty];
  const url = `${BESTDORI_BASE_URL}/api/charts/${songId}/${difficultyName}.json`;
  const rawText = await fetchText(url);
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(`Bestdori chart ${songId}/${difficultyName} returned invalid JSON`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`Bestdori chart ${songId}/${difficultyName} is empty or invalid`);
  }
  return {
    url,
    rawText,
    sha256: await sha256Hex(rawText),
    payload: parsed,
  };
}

export async function sha256Strings(values: readonly string[]): Promise<string> {
  return sha256Hex(values.join("\n"));
}

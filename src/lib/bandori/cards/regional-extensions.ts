import { BANDORI_SERVER_COUNT } from "@/lib/bandori-server";

/**
 * Minimal compute-only extraction of HHWX's regional card resolution semantics.
 *
 * Medley source normalization only needs the JP-fallback resolver. The account,
 * network, UI and snapshot layers are intentionally not included here.
 */

type BandoriCardServerExtension = Record<string, unknown>;
type BandoriCardServerExtensions = [
  BandoriCardServerExtension | null,
  BandoriCardServerExtension | null,
  BandoriCardServerExtension | null,
  BandoriCardServerExtension | null,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readServerExtensions(card: object): BandoriCardServerExtensions {
  const value = (card as { serverExtensions?: unknown }).serverExtensions;
  if (!Array.isArray(value) || value.length !== BANDORI_SERVER_COUNT) {
    throw new Error("Bandori card must have exactly four serverExtensions slots");
  }
  for (const [index, extension] of value.entries()) {
    if (extension === null) continue;
    if (!isRecord(extension)) {
      throw new Error(`Bandori card has an invalid serverExtensions slot: ${index}`);
    }
    if (Object.hasOwn(extension, "serverExtensions")) {
      throw new Error("Bandori card serverExtensions must not override themselves");
    }
  }
  return value as BandoriCardServerExtensions;
}

export function resolveBandoriCardForServer<T extends object>(
  card: T,
  server: number,
): T | null {
  if (!Number.isInteger(server) || server < 0 || server >= BANDORI_SERVER_COUNT) {
    throw new Error(`Unsupported Bandori card server index: ${server}`);
  }

  // Pre-extension Bestdori/HHWX snapshots are already canonical JP-shaped rows.
  if (!Object.hasOwn(card, "serverExtensions")) return card;

  const extension = readServerExtensions(card)[server];
  if (extension === null) return null;
  if (Object.keys(extension).length === 0) return card;

  const canonical = { ...card } as T & Record<string, unknown>;
  delete canonical.serverExtensions;
  for (const [key, value] of Object.entries(extension)) {
    if (value === null) delete canonical[key];
    else canonical[key] = value;
  }
  return canonical as T;
}

export function resolveBandoriCardForServerWithJpFallback<T extends object>(
  card: T,
  server: number,
): T | null {
  const serverCard = resolveBandoriCardForServer(card, server);
  if (serverCard || server === 0) return serverCard;

  // Match HHWX team-calculation semantics: a JP-present card remains a valid
  // future candidate for other servers even when their current snapshot slot is null.
  return resolveBandoriCardForServer(card, 0);
}

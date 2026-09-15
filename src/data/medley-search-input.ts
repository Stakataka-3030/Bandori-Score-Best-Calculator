import {
  encodeBestdoriProfile,
  encodeBestdoriUint16Ids,
  encodeRunLengthPairs,
  type NormalizedBestdoriCard,
  type NormalizedBestdoriProfile,
} from "@/lib/bestdori-profile-codec";
import {
  applyOwnedCardParameterPreferences,
  type OwnedCardParameterPreferences,
  type TemporaryCard,
} from "@/lib/card-preferences";
import {
  buildMedleySearchInput,
  type MedleyDifficulty,
  type MedleySearchInputV1,
  type Triple,
} from "@/lib/bandori/medley-foundation";
import { MEDLEY_SEARCH_SOURCE_SCHEMA_VERSION } from "@/lib/bandori/medley-foundation/contracts";
import type { ImportedCharacterBonus, ImportedProfile } from "@/lib/profile-import";
import { getCachedOrRemoteChart } from "./sync";
import type { GameDataGeneration } from "./types";

const DIFFICULTIES: MedleyDifficulty[] = ["easy", "normal", "hard", "expert", "special"];

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeInternalAreaItems(
  items: NormalizedBestdoriProfile["items"],
): NormalizedBestdoriProfile["items"] {
  // Public Bestdori v2 uses zero-based levels and null for not-owned. HHWX's
  // internal calculator payload uses one-based owned levels and zero for missing.
  return Object.fromEntries(Object.entries(items).map(([key, levels]) => [
    key,
    levels.map((level) => (level === null ? 0 : Math.max(0, Math.trunc(level) + 1))),
  ]));
}

function effectiveProfileCards(
  profile: ImportedProfile,
  data: GameDataGeneration,
  preferences: OwnedCardParameterPreferences | undefined,
  temporaryCards: readonly TemporaryCard[],
): NormalizedBestdoriCard[] {
  const temporaryIds = new Set(temporaryCards.map((card) => card.cardId));
  const owned = profile.profile.cards
    .filter((card) => !temporaryIds.has(card.cardId))
    .map((card) => applyOwnedCardParameterPreferences(
      card,
      data.masters.cards[String(card.cardId)] as never,
      preferences,
      profile.profile.server,
    ));
  return [...owned, ...temporaryCards.map(({ instanceId: _instanceId, ...card }) => card)];
}

function compactCharacterPotentials(bonuses: readonly ImportedCharacterBonus[]): {
  ids: string;
  performance: unknown[];
  technique: unknown[];
  visual: unknown[];
} | undefined {
  if (bonuses.length === 0) return undefined;
  const sorted = [...bonuses].sort((left, right) => left.characterId - right.characterId);
  return {
    ids: encodeBestdoriUint16Ids(sorted.map((bonus) => bonus.characterId)),
    performance: encodeRunLengthPairs(sorted.map((bonus) => bonus.potential.performance ?? null)),
    technique: encodeRunLengthPairs(sorted.map((bonus) => bonus.potential.technique ?? null)),
    visual: encodeRunLengthPairs(sorted.map((bonus) => bonus.potential.visual ?? null)),
  };
}

function compactCharacterMissionBonuses(bonuses: readonly ImportedCharacterBonus[]): {
  ids: string;
  collection: { performance: unknown[]; technique: unknown[]; visual: unknown[] };
  training: { performance: unknown[]; technique: unknown[]; visual: unknown[] };
} | undefined {
  if (bonuses.length === 0) return undefined;
  const sorted = [...bonuses].sort((left, right) => left.characterId - right.characterId);
  return {
    ids: encodeBestdoriUint16Ids(sorted.map((bonus) => bonus.characterId)),
    collection: {
      performance: encodeRunLengthPairs(sorted.map((bonus) => bonus.mission.collection.performance)),
      technique: encodeRunLengthPairs(sorted.map((bonus) => bonus.mission.collection.technique)),
      visual: encodeRunLengthPairs(sorted.map((bonus) => bonus.mission.collection.visual)),
    },
    training: {
      performance: encodeRunLengthPairs(sorted.map((bonus) => bonus.mission.training.performance)),
      technique: encodeRunLengthPairs(sorted.map((bonus) => bonus.mission.training.technique)),
      visual: encodeRunLengthPairs(sorted.map((bonus) => bonus.mission.training.visual)),
    },
  };
}

function buildInternalProfilePayload(
  profile: ImportedProfile,
  data: GameDataGeneration,
  preferences: OwnedCardParameterPreferences | undefined,
  temporaryCards: readonly TemporaryCard[],
): Record<string, unknown> {
  const normalized: NormalizedBestdoriProfile = {
    name: profile.profile.name,
    server: profile.profile.server,
    cards: effectiveProfileCards(profile, data, preferences, temporaryCards),
    items: normalizeInternalAreaItems(profile.profile.items),
    // The exact potential/mission split is carried in the HHWX payload fields below.
    potentials: [],
  };
  return {
    bestdoriProfile: encodeBestdoriProfile(normalized),
    characterPotentials: compactCharacterPotentials(profile.characterBonuses),
    characterMissionBonuses: compactCharacterMissionBonuses(profile.characterBonuses),
  };
}

function eventBonusFromBestdori(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const attributeAndCharacter = isRecord(value.eventAttributeAndCharacterBonus)
    ? value.eventAttributeAndCharacterBonus
    : null;
  const characterParameter = isRecord(value.eventCharacterParameterBonus)
    ? value.eventCharacterParameterBonus
    : null;
  return {
    attributes: Array.isArray(value.attributes) ? value.attributes : [],
    characters: Array.isArray(value.characters) ? value.characters : [],
    pointPercent: finite(attributeAndCharacter?.pointPercent),
    parameterPercent: finite(attributeAndCharacter?.parameterPercent),
    performancePercent: finite(characterParameter?.performance),
    techniquePercent: finite(characterParameter?.technique),
    visualPercent: finite(characterParameter?.visual),
    members: Array.isArray(value.members) ? value.members : [],
    limitBreaks: Array.isArray(value.limitBreaks) ? value.limitBreaks : [],
  };
}

export type MedleySongSelection = {
  songId: number;
  difficulty: MedleyDifficulty;
};

export type CreateMedleySearchInputOptions = {
  songs: Triple<MedleySongSelection>;
  eventId?: number | null;
  perfectRatePercent: number;
  ownedCardParameters?: OwnedCardParameterPreferences;
  temporaryCards?: readonly TemporaryCard[];
};

export async function createMedleySearchInput(
  profile: ImportedProfile,
  data: GameDataGeneration,
  options: CreateMedleySearchInputOptions,
): Promise<MedleySearchInputV1> {
  if (!Number.isFinite(options.perfectRatePercent)
    || options.perfectRatePercent < 0
    || options.perfectRatePercent > 100) {
    throw new Error(`PERFECT 率无效：${options.perfectRatePercent}`);
  }

  for (const selection of options.songs) {
    if (!Number.isSafeInteger(selection.songId) || selection.songId <= 0) {
      throw new Error(`歌曲 ID 无效：${selection.songId}`);
    }
    if (!DIFFICULTIES.includes(selection.difficulty)) {
      throw new Error(`Medley 难度无效：${selection.difficulty}`);
    }
    if (!isRecord(data.masters.songs[String(selection.songId)])) {
      throw new Error(`当前游戏数据中不存在歌曲 ${selection.songId}`);
    }
  }

  const rawEvent = options.eventId === null || options.eventId === undefined
    ? null
    : data.masters.events[String(options.eventId)];
  if (options.eventId !== null && options.eventId !== undefined && !isRecord(rawEvent)) {
    throw new Error(`当前游戏数据中不存在活动 ${options.eventId}`);
  }

  const charts = await Promise.all(options.songs.map((selection) => (
    getCachedOrRemoteChart(selection.songId, DIFFICULTIES.indexOf(selection.difficulty))
  ))) as Triple<unknown[]>;

  return buildMedleySearchInput({
    schemaVersion: MEDLEY_SEARCH_SOURCE_SCHEMA_VERSION,
    profilePayload: buildInternalProfilePayload(
      profile,
      data,
      options.ownedCardParameters,
      options.temporaryCards ?? [],
    ),
    cardsById: data.masters.cards,
    charactersById: data.masters.characters,
    skillsById: data.masters.skills,
    areaItemsById: data.masters.areaItems,
    songsById: data.masters.songs,
    eventBonus: eventBonusFromBestdori(rawEvent),
    perfectRatePercentText: String(options.perfectRatePercent),
    songs: options.songs.map((selection, slot) => ({
      songIdText: String(selection.songId),
      difficulty: selection.difficulty,
      chart: charts[slot],
    })) as Triple<{ songIdText: string; difficulty: MedleyDifficulty; chart: unknown }>,
  });
}

import { BANDORI_AREA_ITEM_IDS_BY_GROUP } from "@/lib/bandori-area-item-groups";
import type {
  BandoriCharacterBonusState,
  BandoriEventBonus,
  BandoriUserAreaItemState,
  BandoriUserCardState,
  BestdoriAreaItemMaster,
  BestdoriCardMaster,
  BestdoriSkillMaster,
} from "@/lib/bandori-team-calculator";
import type {
  BandoriTeamSearchDifficulty,
  BandoriTeamSearchEventType,
  BandoriTeamSearchExternalSkill,
  BandoriTeamSearchInput,
  BandoriTeamSearchLiveType,
  BandoriTeamSearchTarget,
  BestdoriSongMaster,
} from "@/lib/bandori/team-builder/core/types";
import {
  applyOwnedCardParameterPreferences,
  type OwnedCardParameterPreferences,
  type TemporaryCard,
} from "@/lib/card-preferences";
import type { ImportedCharacterBonus, ImportedProfile } from "@/lib/profile-import";
import { getCachedOrRemoteChart } from "./sync";
import type { GameDataGeneration } from "./types";

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function toUserCards(
  profile: ImportedProfile,
  cardsById: Record<string, unknown>,
  server: number,
  preferences: OwnedCardParameterPreferences | undefined,
  temporaryCards: readonly TemporaryCard[],
): BandoriUserCardState[] {
  // HHWX treats a temporary copy of a card ID as a replacement for the owned copy,
  // so the optimizer never sees two instances with the same master card ID by accident.
  const temporaryCardIds = new Set(temporaryCards.map((card) => card.cardId));
  const owned = profile.profile.cards
    .filter((card) => !temporaryCardIds.has(card.cardId))
    .map((card) => {
      const master = cardsById[String(card.cardId)] as (BestdoriCardMaster & Record<string, unknown>) | undefined;
      const effective = applyOwnedCardParameterPreferences(card, master, preferences, server);
      return {
        cardId: effective.cardId,
        cardInstanceKey: `profile:${effective.cardId}`,
        level: effective.level,
        masterRank: effective.masterRank,
        skillLevel: effective.skillLevel,
        episodeCount: effective.episodeCount,
        isTrained: effective.isTrained,
        isExcluded: effective.isExcluded,
      } satisfies BandoriUserCardState;
    });

  const temporary = temporaryCards.map((card) => ({
    cardId: card.cardId,
    cardInstanceKey: `temporary:${card.instanceId}`,
    level: card.level,
    masterRank: card.masterRank,
    skillLevel: card.skillLevel,
    episodeCount: card.episodeCount,
    isTrained: card.isTrained,
    isExcluded: false,
  } satisfies BandoriUserCardState));

  return [...owned, ...temporary];
}

function toUserAreaItems(profile: ImportedProfile): BandoriUserAreaItemState[] {
  const result: BandoriUserAreaItemState[] = [];
  for (const [groupKey, encodedLevels] of Object.entries(profile.profile.items)) {
    const itemIds = BANDORI_AREA_ITEM_IDS_BY_GROUP[groupKey] ?? [];
    encodedLevels.forEach((encodedLevel, index) => {
      const areaItemId = itemIds[index];
      if (!areaItemId) return;
      // Bestdori profile v2 stores area-item levels zero-based; null means not owned.
      const level = encodedLevel === null
        ? 0
        : Math.max(0, Math.trunc(encodedLevel) + 1);
      if (level > 0) result.push({ areaItemId, level });
    });
  }
  return result;
}

function hasDetailedCharacterBonus(bonus: ImportedCharacterBonus): boolean {
  const potential = bonus.potential;
  const collection = bonus.mission.collection;
  const training = bonus.mission.training;
  return (
    potential.performance !== potential.technique
    || potential.performance !== potential.visual
    || collection.performance !== collection.technique
    || collection.performance !== collection.visual
    || training.performance !== training.technique
    || training.performance !== training.visual
  );
}

function toCharacterBonus(
  bonus: ImportedCharacterBonus,
  roundingMode: "combined" | "split-by-type",
): BandoriCharacterBonusState {
  // HHWX profile mission values are stored in tenths of a percent. The core calculator
  // expects actual percentage points, so e.g. 40 in the profile means 4%, not 40%.
  const collection = {
    performance: bonus.mission.collection.performance / 10,
    technique: bonus.mission.collection.technique / 10,
    visual: bonus.mission.collection.visual / 10,
  };
  const training = {
    performance: bonus.mission.training.performance / 10,
    technique: bonus.mission.training.technique / 10,
    visual: bonus.mission.training.visual / 10,
  };
  return {
    characterId: bonus.characterId,
    potential: bonus.potential,
    missionBonusPercent: {
      performance: collection.performance + training.performance,
      technique: collection.technique + training.technique,
      visual: collection.visual + training.visual,
    },
    missionBonusPercentByType: {
      collection,
      training,
    },
    missionBonusRoundingMode: roundingMode,
  };
}

function toCharacterBonuses(profile: ImportedProfile): BandoriCharacterBonusState[] {
  // Match HHWX's rounding behavior: detailed per-parameter profiles combine mission
  // percentages before flooring; legacy/equal profiles retain split-by-type rounding.
  const roundingMode = profile.characterBonuses.some(hasDetailedCharacterBonus)
    ? "combined"
    : "split-by-type";
  return profile.characterBonuses.map((bonus) => toCharacterBonus(bonus, roundingMode));
}

export function eventTypeFromBestdori(value: unknown): BandoriTeamSearchEventType {
  switch (value) {
    case "story":
    case "challenge":
    case "versus":
    case "live_try":
    case "mission_live":
    case "festival":
    case "medley":
      return value;
    case "normal":
      return "story";
    default:
      return "none";
  }
}

export function allowedLiveTypesForEvent(
  eventType: BandoriTeamSearchEventType,
): BandoriTeamSearchLiveType[] {
  if (eventType === "challenge") {
    return ["free", "multi", "challenge"];
  }
  if (eventType === "versus" || eventType === "festival") {
    return ["versus"];
  }
  if (eventType === "medley") {
    // The HHWX single-song engine represents medley context with free here;
    // the full three-song medley optimizer remains a separate search mode.
    return ["free"];
  }
  return ["free", "multi"];
}

function eventBonusFromBestdori(value: unknown): BandoriEventBonus | null {
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
    // Bestdori calls Master Rank / 星光练习 event bonuses `limitBreaks`.
    // The HHWX core matches these entries by card rarity + masterRank.
    limitBreaks: Array.isArray(value.limitBreaks) ? value.limitBreaks : [],
  };
}

export type CreateBandoriSearchInputOptions = {
  songId: number;
  difficulty: BandoriTeamSearchDifficulty;
  eventId?: number | null;
  resultLimit?: number;
  perfectRate?: number;
  target?: BandoriTeamSearchTarget;
  liveType?: BandoriTeamSearchLiveType;
  eventType?: BandoriTeamSearchEventType;
  eventFormula?: 0 | 1 | 2;
  useFever?: boolean;
  useSpecialRoomBonus?: boolean;
  roomPower?: number;
  otherPlayersAveragePower?: number;
  otherPlayerSkills?: BandoriTeamSearchExternalSkill[];
  encoreSkillSource?: "self" | "other1" | "other2" | "other3" | "other4";
  liveBoostCount?: 0 | 1 | 2 | 3;
  challengeCpCost?: 200 | 400 | 800 | 1600;
  ownedCardParameters?: OwnedCardParameterPreferences;
  temporaryCards?: readonly TemporaryCard[];
  maxSearchDurationMs?: number;
  constraints?: BandoriTeamSearchInput["constraints"];
};

export async function createBandoriSearchInput(
  profile: ImportedProfile,
  data: GameDataGeneration,
  options: CreateBandoriSearchInputOptions,
): Promise<BandoriTeamSearchInput> {
  if (!Number.isSafeInteger(options.songId) || options.songId <= 0) {
    throw new Error(`歌曲 ID 无效：${options.songId}`);
  }

  const song = data.masters.songs[String(options.songId)];
  if (!isRecord(song)) {
    throw new Error(`当前游戏数据中不存在歌曲 ${options.songId}`);
  }

  const rawEvent = options.eventId === null || options.eventId === undefined
    ? null
    : data.masters.events[String(options.eventId)];
  if (options.eventId !== null && options.eventId !== undefined && !isRecord(rawEvent)) {
    throw new Error(`当前游戏数据中不存在活动 ${options.eventId}`);
  }

  const chart = await getCachedOrRemoteChart(
    options.songId,
    ["easy", "normal", "hard", "expert", "special"].indexOf(options.difficulty),
  );
  const inferredEventType = options.eventType
    ?? eventTypeFromBestdori(isRecord(rawEvent) ? rawEvent.eventType : null);
  const allowedLiveTypes = allowedLiveTypesForEvent(inferredEventType);
  const normalizedLiveType = options.liveType && allowedLiveTypes.includes(options.liveType)
    ? options.liveType
    : allowedLiveTypes[0] ?? "free";

  return {
    userCards: toUserCards(
      profile,
      data.masters.cards,
      profile.profile.server,
      options.ownedCardParameters,
      options.temporaryCards ?? [],
    ),
    userAreaItems: toUserAreaItems(profile),
    characterBonuses: toCharacterBonuses(profile),
    cardsById: data.masters.cards as Record<string, BestdoriCardMaster | undefined>,
    charactersById: data.masters.characters as Record<string, { bandId?: number | null } | undefined>,
    skillsById: data.masters.skills as Record<string, BestdoriSkillMaster | undefined>,
    areaItemsById: data.masters.areaItems as Record<string, BestdoriAreaItemMaster | undefined>,
    chart: chart as Record<string, unknown>[],
    chartCacheKey: `${data.manifest.datasets.songs.sha256}:${options.songId}:${options.difficulty}`,
    song: song as BestdoriSongMaster,
    difficulty: options.difficulty,
    eventBonus: eventBonusFromBestdori(rawEvent),
    resultLimit: options.resultLimit,
    perfectRate: options.perfectRate,
    useFever: options.useFever,
    // HHWX's current frontend enables the special-room parameter bonus path.
    useSpecialRoomBonus: options.useSpecialRoomBonus ?? true,
    eventType: inferredEventType,
    // HHWX's current calculator uses the current V3 event-point formula.
    eventFormula: options.eventFormula ?? 2,
    liveType: normalizedLiveType,
    target: options.target,
    roomPower: options.roomPower,
    // Keep the same current HHWX default for Multi Live room estimates.
    otherPlayersAveragePower: options.otherPlayersAveragePower
      ?? (normalizedLiveType === "multi" ? 380_000 : undefined),
    otherPlayerSkills: options.otherPlayerSkills,
    encoreSkillSource: options.encoreSkillSource,
    // 3 boosts / 1600 CP are HHWX's current calculator defaults.
    liveBoostCount: options.liveBoostCount ?? 3,
    challengeCpCost: options.challengeCpCost ?? 1600,
    server: profile.profile.server,
    maxSearchDurationMs: options.maxSearchDurationMs,
    constraints: options.constraints,
  };
}

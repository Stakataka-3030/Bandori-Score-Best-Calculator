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
  BandoriTeamSearchInput,
  BandoriTeamSearchLiveType,
  BandoriTeamSearchTarget,
  BestdoriSongMaster,
} from "@/lib/bandori/team-builder/core/types";
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

function toUserCards(profile: ImportedProfile): BandoriUserCardState[] {
  return profile.profile.cards.map((card) => ({
    cardId: card.cardId,
    level: card.level,
    masterRank: card.masterRank,
    skillLevel: card.skillLevel,
    episodeCount: card.episodeCount,
    isTrained: card.isTrained,
    isExcluded: card.isExcluded,
  }));
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

function toCharacterBonus(bonus: ImportedCharacterBonus): BandoriCharacterBonusState {
  const collection = bonus.mission.collection;
  const training = bonus.mission.training;
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
    missionBonusRoundingMode: "split-by-type",
  };
}

function toCharacterBonuses(profile: ImportedProfile): BandoriCharacterBonusState[] {
  return profile.characterBonuses.map(toCharacterBonus);
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
    userCards: toUserCards(profile),
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
    useSpecialRoomBonus: options.useSpecialRoomBonus,
    eventType: inferredEventType,
    eventFormula: options.eventFormula,
    liveType: normalizedLiveType,
    target: options.target,
    roomPower: options.roomPower,
    otherPlayersAveragePower: options.otherPlayersAveragePower,
    server: profile.profile.server,
    maxSearchDurationMs: options.maxSearchDurationMs,
    constraints: options.constraints,
  };
}

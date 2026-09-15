import type { BestdoriCardMaster } from "@/lib/bandori-team-calculator";
import type { NormalizedBestdoriCard } from "@/lib/bestdori-profile-codec";

export type CardPreferenceRarityThreshold = 3 | 4 | 5;

export type OwnedCardParameterPreferences = {
  maxLevelEpisodeTraining: boolean;
  maxMasterRank: boolean;
  maxMasterRankRarityThreshold: CardPreferenceRarityThreshold;
  maxSkillLevel: boolean;
  maxSkillLevelRarityThreshold: CardPreferenceRarityThreshold;
};

export type TemporaryCard = NormalizedBestdoriCard & {
  instanceId: string;
};

export type TeamBuilderCardPreferences = {
  temporaryCards: TemporaryCard[];
  ownedCardParameters: OwnedCardParameterPreferences;
};

export const DEFAULT_OWNED_CARD_PARAMETER_PREFERENCES: OwnedCardParameterPreferences = {
  maxLevelEpisodeTraining: false,
  maxMasterRank: false,
  maxMasterRankRarityThreshold: 4,
  maxSkillLevel: false,
  maxSkillLevelRarityThreshold: 3,
};

export const CARD_PARAMETER_RARITY_THRESHOLD_OPTIONS: CardPreferenceRarityThreshold[] = [3, 4, 5];

const STORAGE_KEY = "bandori-score-best-calculator:card-preferences:v1";

type MasterRecord = BestdoriCardMaster & Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function integer(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
}

function positiveInteger(value: unknown, fallback = 0): number {
  const normalized = integer(value, fallback);
  return normalized > 0 ? normalized : fallback;
}

function regionalNumber(value: unknown, server: number, fallback = 0): number {
  if (Array.isArray(value)) {
    const direct = Number(value[server]);
    if (Number.isFinite(direct)) return direct;
    const jp = Number(value[0]);
    return Number.isFinite(jp) ? jp : fallback;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function masterRarity(card: MasterRecord | undefined): number {
  return positiveInteger(card?.rarity, 0);
}

export function masterCardHasTraining(card: MasterRecord | undefined): boolean {
  return Boolean(card && isRecord(card.stat) && isRecord(card.stat.training));
}

export function getMasterCardMaxLevel(card: MasterRecord | undefined, server: number): number {
  if (!card) return 1;
  const base = Math.max(1, Math.trunc(regionalNumber(card.levelLimit, server, 1)));
  const stat = isRecord(card.stat) ? card.stat : null;
  const training = isRecord(stat?.training) ? stat.training : null;
  const trainingLimit = masterCardHasTraining(card)
    ? Math.max(0, Math.trunc(regionalNumber(training?.levelLimit, server, 0)))
    : 0;
  return base + trainingLimit;
}

export function getMasterCardMaxEpisodeCount(card: MasterRecord | undefined): number {
  const stat = card && isRecord(card.stat) ? card.stat : null;
  return Array.isArray(stat?.episodes) ? stat.episodes.length : 0;
}

export function normalizeRarityThreshold(
  value: unknown,
  fallback: CardPreferenceRarityThreshold,
): CardPreferenceRarityThreshold {
  const normalized = Math.min(5, Math.max(3, integer(value, fallback)));
  return normalized === 3 || normalized === 4 || normalized === 5 ? normalized : fallback;
}

export function applyOwnedCardParameterPreferences(
  card: NormalizedBestdoriCard,
  masterCard: MasterRecord | undefined,
  preferences: OwnedCardParameterPreferences | undefined,
  server: number,
): NormalizedBestdoriCard {
  if (!preferences || !masterCard) return card;

  const rarity = masterRarity(masterCard);
  const nextCard: NormalizedBestdoriCard = { ...card };

  // Matches HHWX: one switch normalizes level, both episodes, and training together.
  if (preferences.maxLevelEpisodeTraining) {
    nextCard.level = Math.max(nextCard.level, getMasterCardMaxLevel(masterCard, server));
    nextCard.episodeCount = Math.max(nextCard.episodeCount, getMasterCardMaxEpisodeCount(masterCard));
    if (masterCardHasTraining(masterCard)) {
      nextCard.isTrained = true;
      nextCard.hasTrainedArt = true;
    }
  }

  if (preferences.maxMasterRank && rarity > 0 && rarity <= preferences.maxMasterRankRarityThreshold) {
    nextCard.masterRank = 4;
  }

  if (preferences.maxSkillLevel && rarity > 0 && rarity <= preferences.maxSkillLevelRarityThreshold) {
    nextCard.skillLevel = 5;
  }

  return nextCard;
}

export function createTemporaryCard(
  cardId: number,
  masterCard: MasterRecord | undefined,
  server: number,
): TemporaryCard | null {
  if (!Number.isSafeInteger(cardId) || cardId <= 0 || !masterCard) return null;
  const trained = masterCardHasTraining(masterCard);
  return {
    instanceId: typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `temporary-${cardId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    cardId,
    level: getMasterCardMaxLevel(masterCard, server),
    masterRank: 4,
    skillLevel: 5,
    episodeCount: getMasterCardMaxEpisodeCount(masterCard),
    isTrained: trained,
    hasTrainedArt: trained,
    isExcluded: false,
  };
}

export function createDefaultCardPreferences(): TeamBuilderCardPreferences {
  return {
    temporaryCards: [],
    ownedCardParameters: { ...DEFAULT_OWNED_CARD_PARAMETER_PREFERENCES },
  };
}

function normalizeOwnedCardParameterPreferences(value: unknown): OwnedCardParameterPreferences {
  if (!isRecord(value)) return { ...DEFAULT_OWNED_CARD_PARAMETER_PREFERENCES };
  return {
    maxLevelEpisodeTraining: value.maxLevelEpisodeTraining === true,
    maxMasterRank: value.maxMasterRank === true,
    maxMasterRankRarityThreshold: normalizeRarityThreshold(
      value.maxMasterRankRarityThreshold,
      DEFAULT_OWNED_CARD_PARAMETER_PREFERENCES.maxMasterRankRarityThreshold,
    ),
    maxSkillLevel: value.maxSkillLevel === true,
    maxSkillLevelRarityThreshold: normalizeRarityThreshold(
      value.maxSkillLevelRarityThreshold,
      DEFAULT_OWNED_CARD_PARAMETER_PREFERENCES.maxSkillLevelRarityThreshold,
    ),
  };
}

export function readCardPreferences(profileKey: string): TeamBuilderCardPreferences {
  if (typeof window === "undefined" || !profileKey) return createDefaultCardPreferences();
  try {
    const root = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as unknown;
    const stored = isRecord(root) && isRecord(root[profileKey]) ? root[profileKey] : null;
    return {
      temporaryCards: [],
      ownedCardParameters: normalizeOwnedCardParameterPreferences(stored?.ownedCardParameters),
    };
  } catch {
    return createDefaultCardPreferences();
  }
}

export function writeCardPreferences(profileKey: string, preferences: TeamBuilderCardPreferences): void {
  if (typeof window === "undefined" || !profileKey) return;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as unknown;
    const root = isRecord(parsed) ? { ...parsed } : {};
    root[profileKey] = {
      ownedCardParameters: normalizeOwnedCardParameterPreferences(preferences.ownedCardParameters),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
  } catch {
    // Optional persistence must never interrupt calculation.
  }
}

import {
  decodeBestdoriProfile,
  decodeBestdoriUint16Ids,
  decodeRunLengthPairs,
  parseBestdoriProfile,
  type BestdoriProfile,
  type NormalizedBestdoriProfile,
} from "@/lib/bestdori-profile-codec";

export type CharacterParameterSet = {
  performance: number;
  technique: number;
  visual: number;
};

export type ImportedCharacterBonus = {
  characterId: number;
  potential: Partial<CharacterParameterSet>;
  mission: {
    collection: CharacterParameterSet;
    training: CharacterParameterSet;
  };
};

export type ImportedProfile = {
  raw: BestdoriProfile;
  profile: NormalizedBestdoriProfile;
  characterBonuses: ImportedCharacterBonus[];
  hasHhwxExtension: boolean;
};

type CompactPotentialRecords = {
  ids: string;
  performance: unknown[];
  technique: unknown[];
  visual: unknown[];
};

type CompactMissionBonusRecords = {
  ids: string;
  collection: { performance: unknown[]; technique: unknown[]; visual: unknown[] };
  training: { performance: unknown[]; technique: unknown[]; visual: unknown[] };
};

type HhwxExtension = {
  format?: unknown;
  characterPotentials?: unknown;
  characterMissionBonuses?: unknown;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finite(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function zeroParameters(): CharacterParameterSet {
  return { performance: 0, technique: 0, visual: 0 };
}

function decodePotentialRecords(value: unknown): Map<number, Partial<CharacterParameterSet>> {
  const source = record(value);
  if (!source || typeof source.ids !== "string" || !Array.isArray(source.performance)
    || !Array.isArray(source.technique) || !Array.isArray(source.visual)) return new Map();
  const ids = decodeBestdoriUint16Ids(source.ids);
  const performance = decodeRunLengthPairs(source.performance, ids.length);
  const technique = decodeRunLengthPairs(source.technique, ids.length);
  const visual = decodeRunLengthPairs(source.visual, ids.length);
  return new Map(ids.map((characterId, index) => [characterId, {
    performance: finite(performance[index]),
    technique: finite(technique[index]),
    visual: finite(visual[index]),
  }]));
}

function decodeMissionRecords(value: unknown): Map<number, ImportedCharacterBonus["mission"]> {
  const source = record(value);
  const collection = record(source?.collection);
  const training = record(source?.training);
  if (!source || typeof source.ids !== "string" || !collection || !training) return new Map();
  const ids = decodeBestdoriUint16Ids(source.ids);
  const readGroup = (group: Record<string, unknown>, key: keyof CharacterParameterSet) => (
    Array.isArray(group[key]) ? decodeRunLengthPairs(group[key] as unknown[], ids.length) : []
  );
  const cp = readGroup(collection, "performance");
  const ct = readGroup(collection, "technique");
  const cv = readGroup(collection, "visual");
  const tp = readGroup(training, "performance");
  const tt = readGroup(training, "technique");
  const tv = readGroup(training, "visual");
  return new Map(ids.map((characterId, index) => [characterId, {
    collection: { performance: finite(cp[index]), technique: finite(ct[index]), visual: finite(cv[index]) },
    training: { performance: finite(tp[index]), technique: finite(tt[index]), visual: finite(tv[index]) },
  }]));
}

function decodeHhwxExtension(profile: BestdoriProfile): ImportedCharacterBonus[] {
  const extension = record(profile.hhwx) as HhwxExtension | null;
  if (!extension || extension.format !== "hhwx-profile-v1") return [];
  const potentials = decodePotentialRecords(extension.characterPotentials as CompactPotentialRecords | undefined);
  const missions = decodeMissionRecords(extension.characterMissionBonuses as CompactMissionBonusRecords | undefined);
  const ids = new Set([...potentials.keys(), ...missions.keys()]);
  return [...ids].sort((a, b) => a - b).map((characterId) => ({
    characterId,
    potential: potentials.get(characterId) ?? {},
    mission: missions.get(characterId) ?? {
      collection: zeroParameters(),
      training: zeroParameters(),
    },
  }));
}

function distributeBestdoriPotentialTotal(totalValue: unknown): {
  potential: number;
  training: number;
  collection: number;
} {
  const normalizedTotal = Math.max(0, Math.trunc(finite(totalValue)));
  // Bestdori uses 1 as the legacy no-bonus sentinel.
  const effectiveTotal = normalizedTotal <= 1 ? 0 : normalizedTotal;
  return {
    potential: Math.min(effectiveTotal, 50),
    training: Math.min(Math.max(effectiveTotal - 50, 0), 20),
    collection: Math.min(Math.max(effectiveTotal - 70, 0), 40),
  };
}

function decodeBestdoriCompatibilityBonuses(profile: NormalizedBestdoriProfile): ImportedCharacterBonus[] {
  return profile.potentials.flatMap((total, index) => {
    const characterId = index + 1;
    if (characterId <= 0 || characterId > 50) return [];
    const distributed = distributeBestdoriPotentialTotal(total);
    if (distributed.potential === 0 && distributed.training === 0 && distributed.collection === 0) {
      return [];
    }
    const potential = {
      performance: distributed.potential,
      technique: distributed.potential,
      visual: distributed.potential,
    };
    const collection = {
      performance: distributed.collection,
      technique: distributed.collection,
      visual: distributed.collection,
    };
    const training = {
      performance: distributed.training,
      technique: distributed.training,
      visual: distributed.training,
    };
    return [{ characterId, potential, mission: { collection, training } }];
  });
}

export function importProfileFile(value: unknown): ImportedProfile {
  const raw = parseBestdoriProfile(value);
  const profile = decodeBestdoriProfile(raw);
  const extension = record(raw.hhwx);
  const hasHhwxExtension = extension?.format === "hhwx-profile-v1";
  return {
    raw,
    profile,
    characterBonuses: hasHhwxExtension
      ? decodeHhwxExtension(raw)
      : decodeBestdoriCompatibilityBonuses(profile),
    hasHhwxExtension,
  };
}

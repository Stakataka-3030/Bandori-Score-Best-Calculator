/*
 * Portable score engine derived from HHWX core/scoring.ts.
 *
 * The score model is intentionally kept independent from team enumeration. A caller supplies
 * a prepared chart, band power and already-resolved skills. Five normal trigger windows are
 * followed by the sixth encore/leader window when the chart provides it.
 */
import type {
  BandoriJudge,
  BestdoriSkillMaster,
  ResolvedBandoriScoreSkillEffect,
  ResolvedBandoriSkill,
} from "@/lib/bandori-team-calculator";
import { JUDGE_PERCENT, JUDGE_RANK } from "./constants";
import { getScoreComboMultiplier } from "./chart";
import { buildPermutations, clamp, getRegionalNumber } from "./utils";
import type {
  BandoriTeamSearchInput,
  BandoriTeamSearchSkillOrderActor,
  PreparedChart,
  ScoreCalculationCache,
  ScoreComboOptions,
  SearchCard,
  SkillUpperRates,
} from "./types";

const SKILL_ORDER_PERMUTATIONS = buildPermutations([0, 1, 2, 3, 4]);

function getSkillEndNote(chart: PreparedChart, slotIndex: number, durationSeconds: number): number {
  const triggerTime = chart.skillTriggerTimes[slotIndex];
  if (triggerTime === undefined) return chart.notesCount;
  const endTime = triggerTime + durationSeconds + 0.00001;
  let low = 0;
  let high = chart.notesCount;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((chart.notes[middle]?.time ?? 0) > endTime) high = middle;
    else low = middle + 1;
  }
  return low;
}

function conditionMatches(effect: ResolvedBandoriScoreSkillEffect, judge: BandoriJudge): boolean {
  return effect.condition === "none" || JUDGE_RANK[judge] <= JUDGE_RANK[effect.condition];
}

function isGoodOrWorseJudge(judge: BandoriJudge): boolean {
  return JUDGE_RANK[judge] > JUDGE_RANK.great;
}

function getExpectedJudgePercent(perfectRate: number): number {
  const p = clamp(perfectRate, 0, 1);
  return JUDGE_PERCENT.perfect * p + JUDGE_PERCENT.great * (1 - p);
}

function getEffectMultiplier(
  effect: ResolvedBandoriScoreSkillEffect,
  judge: BandoriJudge,
  continuedActive: boolean,
  rateUpBonusPercent: number,
): { multiplier: number; continuedActive: boolean } {
  if (effect.type === "score_rate_up_with_perfect") return { multiplier: 1, continuedActive };
  if (effect.type === "score_continued_note_judge") {
    const next = continuedActive && !isGoodOrWorseJudge(judge);
    return { multiplier: next ? 1 + (effect.valuePercent + rateUpBonusPercent) / 100 : 1, continuedActive: next };
  }
  if (effect.type === "score_under_great_half") {
    if (conditionMatches(effect, judge)) return { multiplier: 1 + (effect.valuePercent + rateUpBonusPercent) / 100, continuedActive };
    return { multiplier: isGoodOrWorseJudge(judge) ? 0.5 : 1, continuedActive };
  }
  if (effect.type === "score_only_perfect") {
    return {
      multiplier: judge === "perfect" && conditionMatches(effect, judge)
        ? 1 + (effect.valuePercent + rateUpBonusPercent) / 100
        : 0,
      continuedActive,
    };
  }
  return {
    multiplier: conditionMatches(effect, judge) ? 1 + (effect.valuePercent + rateUpBonusPercent) / 100 : 1,
    continuedActive,
  };
}

function hasContinuedJudgeEffect(skill: ResolvedBandoriSkill): boolean {
  return skill.scoreEffects.some((effect) => effect.type === "score_continued_note_judge");
}

function getExpectedSkillMultiplier(skill: ResolvedBandoriSkill, perfectRate: number, activeNoteCount: number): number {
  const p = clamp(perfectRate, 0, 1);
  const expectedJudgePercent = getExpectedJudgePercent(p);
  let continuedMultiplier = 0;
  let perfectBonus = 0;
  let greatBonus = 0;
  let scoringEffectApplied = false;
  for (const effect of skill.scoreEffects) {
    if (effect.type === "score_rate_up_with_perfect") continue;
    const rateUpBonusPercent = skill.hasRateUpWithPerfect ? 0.5 * Math.min(activeNoteCount, 100) * p : 0;
    const valueBonus = (effect.valuePercent + rateUpBonusPercent) / 100;
    if (effect.type === "score_continued_note_judge") {
      continuedMultiplier = 1 + valueBonus;
      scoringEffectApplied = true;
    } else if (effect.type === "score_under_great_half") {
      perfectBonus = valueBonus;
      greatBonus = -0.5;
      scoringEffectApplied = true;
    } else if (effect.type === "score_only_perfect" || effect.condition === "perfect") {
      if (perfectBonus === 0) perfectBonus = valueBonus;
      scoringEffectApplied = true;
    } else {
      if (perfectBonus === 0) perfectBonus = valueBonus;
      if (greatBonus === 0) greatBonus = valueBonus;
      scoringEffectApplied = true;
    }
  }
  if (!scoringEffectApplied) return 1;
  const perfectMultiplier = 1 + perfectBonus;
  const greatMultiplier = 1 + greatBonus;
  if (continuedMultiplier > 0) return greatMultiplier + (p ** activeNoteCount) * (continuedMultiplier - greatMultiplier);
  if (perfectMultiplier === greatMultiplier) return perfectMultiplier;
  return (
    JUDGE_PERCENT.perfect * perfectMultiplier * p
    + JUDGE_PERCENT.great * greatMultiplier * (1 - p)
  ) / expectedJudgePercent;
}

function getSkillMultiplierForJudge(skill: ResolvedBandoriSkill, judge: BandoriJudge): number {
  let multiplier = 1;
  let continuedActive = true;
  for (const effect of skill.scoreEffects) {
    const next = getEffectMultiplier(effect, judge, continuedActive, 0);
    continuedActive = next.continuedActive;
    multiplier = Math.max(multiplier, next.multiplier);
  }
  return Math.max(0, multiplier);
}

function getConstantSkillMultiplier(skill: ResolvedBandoriSkill, perfectRate: number): number {
  if (skill.hasRateUpWithPerfect) return Number.NaN;
  const perfectMultiplier = getSkillMultiplierForJudge(skill, "perfect");
  if (perfectRate === 1) return perfectMultiplier;
  if (hasContinuedJudgeEffect(skill)) return Number.NaN;
  return getExpectedSkillMultiplier(skill, perfectRate, 1);
}

function buildBaseNoteScores(
  chart: PreparedChart,
  bandPower: number,
  perfectRate: number,
  comboOptions?: ScoreComboOptions,
): Int32Array {
  const scores = new Int32Array(chart.notesCount);
  if (chart.notesCount === 0 || bandPower <= 0) return scores;
  const baseScorePerPower = 3 * (1 + (chart.playLevel - 5) / 100) / chart.notesCount;
  const judgePercent = getExpectedJudgePercent(perfectRate);
  for (let i = 0; i < chart.notesCount; i += 1) {
    const note = chart.notes[i];
    scores[i] = Math.floor(
      bandPower * baseScorePerPower * judgePercent * getScoreComboMultiplier(i, comboOptions) * (note.fever ? 2 : 1),
    );
  }
  return scores;
}

function sumInt32(values: Int32Array): number {
  let sum = 0;
  for (const value of values) sum += value;
  return sum;
}

function getSkillWindowContribution(
  chart: PreparedChart,
  skill: ResolvedBandoriSkill | null | undefined,
  slotIndex: number,
  baseNoteScores: Int32Array,
  perfectRate: number,
): number {
  if (!skill || skill.scoreEffects.length === 0) return 0;
  const start = chart.skillStartNotes[slotIndex] ?? chart.notesCount;
  const end = getSkillEndNote(chart, slotIndex, skill.durationSeconds);
  const constantMultiplier = getConstantSkillMultiplier(skill, perfectRate);
  let contribution = 0;
  for (let noteIndex = start; noteIndex < end; noteIndex += 1) {
    const activeNoteCount = noteIndex - start + 1;
    const multiplier = Number.isFinite(constantMultiplier)
      ? constantMultiplier
      : getExpectedSkillMultiplier(skill, perfectRate, activeNoteCount);
    contribution += Math.floor(baseNoteScores[noteIndex] * Math.max(0, multiplier)) - baseNoteScores[noteIndex];
  }
  return contribution;
}

function getContributions(
  chart: PreparedChart,
  skill: ResolvedBandoriSkill | null | undefined,
  baseNoteScores: Int32Array,
  perfectRate: number,
): number[] {
  return Array.from({ length: 6 }, (_, slotIndex) => getSkillWindowContribution(chart, skill, slotIndex, baseNoteScores, perfectRate));
}

export type SkillWindowScoreResult = {
  score: number;
  averageScore: number;
  rawAverageScore?: number;
  minScore: number;
  maxScoreOrderCount: number;
  maxScoreOrderTotal: number;
  leaderIndex: number;
  permutation: number[];
  skillOrderCardIds?: number[];
  skillOrderActors?: BandoriTeamSearchSkillOrderActor[];
  roomScoreRatePerPower?: number;
};

function emptyResult(): SkillWindowScoreResult {
  return {
    score: Number.NEGATIVE_INFINITY,
    averageScore: Number.NEGATIVE_INFINITY,
    minScore: 0,
    maxScoreOrderCount: 0,
    maxScoreOrderTotal: SKILL_ORDER_PERMUTATIONS.length,
    leaderIndex: 0,
    permutation: SKILL_ORDER_PERMUTATIONS[0],
  };
}

function assignmentStats(contributions: number[][]): {
  max: number;
  min: number;
  count: number;
  permutation: number[];
} {
  let max = Number.NEGATIVE_INFINITY;
  let min = Number.POSITIVE_INFINITY;
  let count = 0;
  let selected = SKILL_ORDER_PERMUTATIONS[0];
  for (const permutation of SKILL_ORDER_PERMUTATIONS) {
    let value = 0;
    for (let slot = 0; slot < 5; slot += 1) value += contributions[permutation[slot]]?.[slot] ?? 0;
    if (value > max) {
      max = value;
      count = 1;
      selected = permutation;
    } else if (value === max) {
      count += 1;
    }
    if (value < min) min = value;
  }
  return { max, min, count, permutation: selected };
}

function eligible(eligibleLeaderIndexes: readonly boolean[] | undefined, index: number): boolean {
  return eligibleLeaderIndexes === undefined || eligibleLeaderIndexes[index] === true;
}

export function calculateBestScoreForNonOverlappingSkillWindowsTargetOnly(
  chart: PreparedChart,
  bandPower: number,
  skills: Array<ResolvedBandoriSkill | null>,
  perfectRate: number,
  _cache?: ScoreCalculationCache,
  comboOptions?: ScoreComboOptions,
): SkillWindowScoreResult {
  return calculateBestScoreForNonOverlappingSkillWindows(
    chart, bandPower, skills, perfectRate, _cache, undefined, comboOptions, true,
  );
}

export function calculateBestScoreForNonOverlappingSkillWindows(
  chart: PreparedChart,
  bandPower: number,
  skills: Array<ResolvedBandoriSkill | null>,
  perfectRate: number,
  _cache?: ScoreCalculationCache,
  encoreSkill?: ResolvedBandoriSkill | null,
  comboOptions?: ScoreComboOptions,
  targetOnly = false,
  shouldCalculateDetailed?: (targetOnlyResult: SkillWindowScoreResult) => boolean,
  eligibleLeaderIndexes?: readonly boolean[],
): SkillWindowScoreResult {
  const baseNoteScores = buildBaseNoteScores(chart, bandPower, perfectRate, comboOptions);
  const baseScore = sumInt32(baseNoteScores);
  const contributions = skills.map((skill) => getContributions(chart, skill, baseNoteScores, perfectRate));
  const averageTriggerContribution = contributions.reduce((sum, contribution) => (
    sum + contribution.slice(0, 5).reduce((a, b) => a + b, 0) / 5
  ), 0);

  let targetOnlyResult: SkillWindowScoreResult;
  if (encoreSkill !== undefined) {
    if (!eligible(eligibleLeaderIndexes, 0)) return emptyResult();
    const encore = getContributions(chart, encoreSkill, baseNoteScores, perfectRate)[5] ?? 0;
    const averageScore = Math.floor(baseScore + averageTriggerContribution + encore);
    targetOnlyResult = { score: averageScore, averageScore, minScore: averageScore, maxScoreOrderCount: 0, maxScoreOrderTotal: 120, leaderIndex: 0, permutation: SKILL_ORDER_PERMUTATIONS[0] };
  } else {
    let bestAverage = Number.NEGATIVE_INFINITY;
    let leaderIndex = 0;
    for (let i = 0; i < skills.length; i += 1) {
      if (!eligible(eligibleLeaderIndexes, i)) continue;
      const average = Math.floor(baseScore + averageTriggerContribution + (contributions[i]?.[5] ?? 0));
      if (average > bestAverage) { bestAverage = average; leaderIndex = i; }
    }
    targetOnlyResult = { score: bestAverage, averageScore: bestAverage, minScore: bestAverage, maxScoreOrderCount: 0, maxScoreOrderTotal: 120, leaderIndex, permutation: SKILL_ORDER_PERMUTATIONS[0] };
  }

  if (targetOnly || (shouldCalculateDetailed && !shouldCalculateDetailed(targetOnlyResult))) return targetOnlyResult;
  const assignment = assignmentStats(contributions);

  if (encoreSkill !== undefined) {
    const encore = getContributions(chart, encoreSkill, baseNoteScores, perfectRate)[5] ?? 0;
    return {
      score: baseScore + assignment.max + encore,
      averageScore: targetOnlyResult.averageScore,
      minScore: baseScore + assignment.min + encore,
      maxScoreOrderCount: assignment.count,
      maxScoreOrderTotal: 120,
      leaderIndex: 0,
      permutation: assignment.permutation,
    };
  }

  let best: SkillWindowScoreResult | null = null;
  for (let i = 0; i < skills.length; i += 1) {
    if (!eligible(eligibleLeaderIndexes, i)) continue;
    const encore = contributions[i]?.[5] ?? 0;
    const candidate: SkillWindowScoreResult = {
      score: baseScore + assignment.max + encore,
      averageScore: Math.floor(baseScore + averageTriggerContribution + encore),
      minScore: baseScore + assignment.min + encore,
      maxScoreOrderCount: assignment.count,
      maxScoreOrderTotal: 120,
      leaderIndex: i,
      permutation: assignment.permutation,
    };
    if (!best || candidate.averageScore > best.averageScore || (candidate.averageScore === best.averageScore && candidate.score > best.score)) best = candidate;
  }
  return best ?? emptyResult();
}

export function calculateBestMultiLiveScoreForSkillWindows(
  chart: PreparedChart,
  bandPower: number,
  selfSkills: Array<ResolvedBandoriSkill | null>,
  otherSkills: Array<ResolvedBandoriSkill | null>,
  encoreSkillSource: BandoriTeamSearchInput["encoreSkillSource"],
  cards: SearchCard[],
  perfectRate: number,
  _cache?: ScoreCalculationCache,
  comboOptions?: ScoreComboOptions,
  targetOnly = false,
  shouldCalculateDetailed?: (targetOnlyResult: SkillWindowScoreResult) => boolean,
  eligibleLeaderIndexes?: readonly boolean[],
): SkillWindowScoreResult {
  const baseNoteScores = buildBaseNoteScores(chart, bandPower, perfectRate, comboOptions);
  const baseScore = sumInt32(baseNoteScores);
  const other = otherSkills.slice(0, 4).map((skill) => getContributions(chart, skill, baseNoteScores, perfectRate));
  while (other.length < 4) other.push([0, 0, 0, 0, 0, 0]);
  const externalEncoreIndex = encoreSkillSource?.startsWith("other") ? Number(encoreSkillSource.replace("other", "")) - 1 : -1;
  let best: SkillWindowScoreResult | null = null;

  for (let leaderIndex = 0; leaderIndex < selfSkills.length; leaderIndex += 1) {
    if (!eligible(eligibleLeaderIndexes, leaderIndex)) continue;
    const self = getContributions(chart, selfSkills[leaderIndex], baseNoteScores, perfectRate);
    const actors = [self, other[0], other[1], other[2], other[3]];
    const assignment = assignmentStats(actors);
    const averageTriggers = actors.reduce((sum, c) => sum + c.slice(0, 5).reduce((a, b) => a + b, 0) / 5, 0);
    const encore = externalEncoreIndex >= 0 ? other[externalEncoreIndex]?.[5] ?? 0 : self[5] ?? 0;
    const averageScore = Math.floor(baseScore + averageTriggers + encore);
    const targetResult: SkillWindowScoreResult = {
      score: averageScore,
      averageScore,
      rawAverageScore: baseScore + averageTriggers + encore,
      minScore: averageScore,
      maxScoreOrderCount: 0,
      maxScoreOrderTotal: 120,
      leaderIndex,
      permutation: SKILL_ORDER_PERMUTATIONS[0],
    };
    if (targetOnly || (shouldCalculateDetailed && !shouldCalculateDetailed(targetResult))) {
      if (!best || targetResult.averageScore > best.averageScore) best = targetResult;
      continue;
    }
    const skillOrderActors: BandoriTeamSearchSkillOrderActor[] = [
      ...assignment.permutation.map((skillIndex) => skillIndex === 0 ? "self" : `other${skillIndex}` as BandoriTeamSearchSkillOrderActor),
      externalEncoreIndex >= 0 ? `other${externalEncoreIndex + 1}` as BandoriTeamSearchSkillOrderActor : "self",
    ];
    const candidate: SkillWindowScoreResult = {
      score: baseScore + assignment.max + encore,
      averageScore,
      rawAverageScore: targetResult.rawAverageScore,
      minScore: baseScore + assignment.min + encore,
      maxScoreOrderCount: assignment.count,
      maxScoreOrderTotal: 120,
      leaderIndex,
      permutation: assignment.permutation,
      skillOrderCardIds: [...assignment.permutation.map((skillIndex) => skillIndex === 0 ? cards[leaderIndex]?.cardId ?? 0 : 0), externalEncoreIndex >= 0 ? 0 : cards[leaderIndex]?.cardId ?? 0],
      skillOrderActors,
    };
    if (!best || candidate.averageScore > best.averageScore || (candidate.averageScore === best.averageScore && candidate.score > best.score)) best = candidate;
  }
  return best ?? emptyResult();
}

export function calculateBaseScoreRatePerPower(chart: PreparedChart, comboOptions?: ScoreComboOptions): number {
  if (chart.notesCount === 0) return 0;
  const base = 3 * (1 + (chart.playLevel - 5) / 100) / chart.notesCount;
  return chart.notes.reduce((sum, note, index) => sum + base * JUDGE_PERCENT.perfect * getScoreComboMultiplier(index, comboOptions) * (note.fever ? 2 : 1), 0);
}

function getSkillMaxValuePercent(skill: BestdoriSkillMaster | undefined, server: number): number {
  if (!skill) return 0;
  const effects = skill.activationEffect?.activateEffectTypes ?? {};
  const maxEffect = Object.entries(effects).reduce((max, [type, effect]) => type === "score_rate_up_with_perfect" ? max : Math.max(max, getRegionalNumber(effect.activateEffectValue, server) ?? 0), 0);
  const unified = getRegionalNumber(skill.activationEffect?.unificationActivateEffectValue, server) ?? 0;
  return Math.max(maxEffect, unified) + ("score_rate_up_with_perfect" in effects ? 50 : 0);
}

export function getSkillDurationSeconds(skill: BestdoriSkillMaster | undefined, skillLevel: number, server: number): number {
  if (!skill) return 0;
  const level = clamp(Math.trunc(skillLevel), 1, 5);
  return getRegionalNumber(Array.isArray(skill.duration) ? skill.duration[level - 1] : skill.duration, server) ?? 0;
}

function windowUpperRates(chart: PreparedChart, valuePercent: number, durationSeconds: number, comboOptions?: ScoreComboOptions): SkillUpperRates {
  if (valuePercent <= 0 || durationSeconds <= 0 || chart.notesCount === 0) return { maxRate: 0, averageRate: 0, leaderRate: 0 };
  const base = 3 * (1 + (chart.playLevel - 5) / 100) / chart.notesCount;
  let maxRate = 0; let triggerSum = 0; let leaderRate = 0;
  for (let slot = 0; slot < 6; slot += 1) {
    const start = chart.skillStartNotes[slot] ?? chart.notesCount;
    const end = getSkillEndNote(chart, slot, durationSeconds);
    let rate = 0;
    for (let i = start; i < end; i += 1) rate += base * JUDGE_PERCENT.perfect * getScoreComboMultiplier(i, comboOptions) * (chart.notes[i].fever ? 2 : 1);
    maxRate = Math.max(maxRate, rate);
    if (slot < 5) triggerSum += rate; else leaderRate = rate;
  }
  const multiplier = valuePercent / 100;
  return { maxRate: maxRate * multiplier, averageRate: (triggerSum / 5) * multiplier, leaderRate: leaderRate * multiplier };
}

export function calculateSkillUpperRatesPerPower(chart: PreparedChart, skill: BestdoriSkillMaster | undefined, skillLevel: number, server: number, comboOptions?: ScoreComboOptions): SkillUpperRates {
  return windowUpperRates(chart, getSkillMaxValuePercent(skill, server), getSkillDurationSeconds(skill, skillLevel, server), comboOptions);
}

export function getResolvedSkillMaxScoreUpPercent(skill: ResolvedBandoriSkill | null): number {
  if (!skill) return 0;
  const maxEffect = skill.scoreEffects.reduce((max, effect) => effect.type === "score_rate_up_with_perfect" ? max : Math.max(max, effect.valuePercent), 0);
  return maxEffect + (skill.hasRateUpWithPerfect ? 50 : 0);
}

export function calculateResolvedSkillUpperRatesPerPower(chart: PreparedChart, skill: ResolvedBandoriSkill | null, comboOptions?: ScoreComboOptions): SkillUpperRates {
  return windowUpperRates(chart, getResolvedSkillMaxScoreUpPercent(skill), skill?.durationSeconds ?? 0, comboOptions);
}

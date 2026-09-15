import fs from "node:fs";

const path = "src/lib/bandori/team-builder/core/scoring.ts";
let source = fs.readFileSync(path, "utf8");

function replaceOnce(before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing patch anchor: ${label}`);
  source = source.replace(before, after);
}

replaceOnce(
`import {
  BANDORI_SKILL_SHUFFLE_PATH_COUNT,
  getExpectedTriggerContributionForLayout,
  getMaximumExpectedSkillContributionAcrossInitialSlots,
  scoreWeightedSkillLayout,
} from "./skill-shuffle";`,
`import {
  BANDORI_SKILL_SHUFFLE_PATH_COUNT,
  BANDORI_WEIGHTED_SKILL_ORDERS,
  getExpectedTriggerContributionForLayout,
  scoreWeightedSkillLayout,
} from "./skill-shuffle";
import {
  bandoriSkillTriggersCanShift,
  scheduleBandoriSkillTriggerTimes,
} from "./skill-trigger-scheduler";`,
"imports",
);

const scheduledHelpers = String.raw`
function getFirstNoteAfterTime(chart: PreparedChart, timeSeconds: number): number {
  let low = 0;
  let high = chart.notesCount;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((chart.notes[middle]?.time ?? 0) > timeSeconds + 1e-9) high = middle;
    else low = middle + 1;
  }
  return low;
}

function getFirstNoteAfterSkillEnd(
  chart: PreparedChart,
  startTimeSeconds: number,
  durationSeconds: number,
): number {
  const endTime = startTimeSeconds + durationSeconds + 0.00001;
  let low = 0;
  let high = chart.notesCount;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((chart.notes[middle]?.time ?? 0) > endTime) high = middle;
    else low = middle + 1;
  }
  return low;
}

function calculateScheduledSkillContribution(
  chart: PreparedChart,
  skill: ResolvedBandoriSkill | null | undefined,
  startTimeSeconds: number,
  activationIndex: number,
  innerScores: Int32Array,
  perfectRate: number,
): number {
  if (!skill || skill.scoreEffects.length === 0) return 0;
  const nominalStart = chart.skillTriggerTimes[activationIndex];
  // Preserve the chart's trigger-entity ordering when an activation was not
  // delayed: notes after the trigger entity at the same timestamp receive the
  // skill. A delayed activation has no trigger entity at its new timestamp, so
  // it starts strictly after that timestamp.
  const start = nominalStart !== undefined && Math.abs(startTimeSeconds - nominalStart) <= 1e-9
    ? chart.skillStartNotes[activationIndex] ?? chart.notesCount
    : getFirstNoteAfterTime(chart, startTimeSeconds);
  const end = getFirstNoteAfterSkillEnd(chart, startTimeSeconds, skill.durationSeconds);
  if (start >= end) return 0;

  const constantMultiplier = getGeneratedJudgeConstantSkillMultiplier(skill, perfectRate);
  let contribution = 0;
  for (let noteIndex = start; noteIndex < end; noteIndex += 1) {
    const multiplier = Number.isFinite(constantMultiplier)
      ? constantMultiplier
      : getExpectedSkillMultiplier(skill, perfectRate, noteIndex - start + 1);
    contribution += Math.floor(innerScores[noteIndex] * Math.max(0, multiplier)) - innerScores[noteIndex];
  }
  return contribution;
}

function calculateBestScheduledSoloScore(
  chart: PreparedChart,
  bandPower: number,
  skills: Array<ResolvedBandoriSkill | null>,
  perfectRate: number,
  cache: ScoreCalculationCache | undefined,
  encoreSkill: ResolvedBandoriSkill | null | undefined,
  comboOptions: ScoreComboOptions | undefined,
  targetOnly: boolean,
  shouldCalculateDetailed: ((targetOnlyResult: SkillWindowScoreResult) => boolean) | undefined,
  eligibleLeaderIndexes: readonly boolean[] | undefined,
): SkillWindowScoreResult {
  const nominalTriggerTimes = chart.skillTriggerTimes.slice(0, 6);
  if (nominalTriggerTimes.length !== 6 || skills.length !== 5) return createEmptySkillWindowScoreResult();

  const judgeList = getCachedJudgeList(chart.notesCount, perfectRate, cache);
  const innerScoreResult = buildInnerScoreResult(
    chart,
    bandPower,
    judgeList,
    perfectRate,
    comboOptions,
    cache,
  );
  const baseScore = innerScoreResult.total;
  const contributionCache = new Map<string, number>();
  const sequenceScoreCache = new Map<string, number>();

  const contributionAt = (
    skill: ResolvedBandoriSkill | null | undefined,
    startTime: number,
    activationIndex: number,
  ): number => {
    if (!skill || skill.scoreEffects.length === 0) return 0;
    const key = skill.cacheKey + "@" + activationIndex + ":" + startTime.toPrecision(15);
    const cached = contributionCache.get(key);
    if (cached !== undefined) return cached;
    const contribution = calculateScheduledSkillContribution(
      chart,
      skill,
      startTime,
      activationIndex,
      innerScoreResult.scores,
      perfectRate,
    );
    contributionCache.set(key, contribution);
    return contribution;
  };

  const scoreSequence = (order: readonly number[], leaderIndex: number): number => {
    const key = leaderIndex + ":" + order.join(",");
    const cached = sequenceScoreCache.get(key);
    if (cached !== undefined) return cached;
    const sixthSkill = encoreSkill === undefined ? skills[leaderIndex] : encoreSkill;
    const activationSkills = [
      ...order.map((cardIndex) => skills[cardIndex] ?? null),
      sixthSkill ?? null,
    ];
    const durations = activationSkills.map((skill) => skill?.durationSeconds ?? 0);
    const scheduled = scheduleBandoriSkillTriggerTimes(nominalTriggerTimes, durations);
    let score = baseScore;
    for (let activation = 0; activation < 6; activation += 1) {
      score += contributionAt(
        activationSkills[activation],
        scheduled.starts[activation],
        activation,
      );
    }
    sequenceScoreCache.set(key, score);
    return score;
  };

  let selectedLayout: number[] | null = null;
  let selectedLeaderIndex = -1;
  let selectedRawAverageScore = Number.NEGATIVE_INFINITY;

  for (const layout of SKILL_ORDER_PERMUTATIONS) {
    const leaderIndex = layout[2];
    if (!isEligibleLeaderIndex(eligibleLeaderIndexes, leaderIndex)) continue;
    let weightedTotal = 0;
    for (const weightedOrder of BANDORI_WEIGHTED_SKILL_ORDERS) {
      const order = weightedOrder.permutation.map((slot) => layout[slot]);
      weightedTotal += scoreSequence(order, leaderIndex) * weightedOrder.weight;
    }
    const rawAverageScore = weightedTotal / BANDORI_SKILL_SHUFFLE_PATH_COUNT;
    if (rawAverageScore > selectedRawAverageScore) {
      selectedRawAverageScore = rawAverageScore;
      selectedLayout = [...layout];
      selectedLeaderIndex = leaderIndex;
    }
  }

  if (!selectedLayout || selectedLeaderIndex < 0) return createEmptySkillWindowScoreResult();

  const averageScore = Math.floor(selectedRawAverageScore);
  const targetOnlyResult: SkillWindowScoreResult = {
    score: averageScore,
    averageScore,
    rawAverageScore: selectedRawAverageScore,
    minScore: averageScore,
    maxScoreOrderCount: 0,
    maxScoreOrderTotal: BANDORI_SKILL_SHUFFLE_PATH_COUNT,
    leaderIndex: selectedLeaderIndex,
    permutation: SKILL_ORDER_PERMUTATIONS[0],
    teamLayoutCardIndexes: [...selectedLayout],
  };
  if (targetOnly || (shouldCalculateDetailed && !shouldCalculateDetailed(targetOnlyResult))) {
    return targetOnlyResult;
  }

  let maximumScore = Number.NEGATIVE_INFINITY;
  let minimumScore = Number.POSITIVE_INFINITY;
  let maximumPathWeight = 0;
  let representativeOrder: number[] = [];
  for (const weightedOrder of BANDORI_WEIGHTED_SKILL_ORDERS) {
    const order = weightedOrder.permutation.map((slot) => selectedLayout[slot]);
    const score = scoreSequence(order, selectedLeaderIndex);
    minimumScore = Math.min(minimumScore, score);
    if (score > maximumScore) {
      maximumScore = score;
      maximumPathWeight = weightedOrder.weight;
      representativeOrder = order;
    } else if (score === maximumScore) {
      maximumPathWeight += weightedOrder.weight;
    }
  }

  return {
    score: maximumScore,
    averageScore,
    rawAverageScore: selectedRawAverageScore,
    minScore: minimumScore,
    maxScoreOrderCount: maximumPathWeight,
    maxScoreOrderTotal: BANDORI_SKILL_SHUFFLE_PATH_COUNT,
    leaderIndex: selectedLeaderIndex,
    permutation: representativeOrder,
    teamLayoutCardIndexes: [...selectedLayout],
  };
}

const GLOBAL_SKILL_WINDOW_RATE_CACHE = new WeakMap<PreparedChart, Map<string, number>>();

function getGlobalMaximumBaseWindowRate(
  chart: PreparedChart,
  durationSeconds: number,
  comboOptions?: ScoreComboOptions,
): number {
  let chartCache = GLOBAL_SKILL_WINDOW_RATE_CACHE.get(chart);
  if (!chartCache) {
    chartCache = new Map();
    GLOBAL_SKILL_WINDOW_RATE_CACHE.set(chart, chartCache);
  }
  const key = [durationSeconds, comboOptions?.startCombo ?? 0, comboOptions?.useMedleyCombo ? 1 : 0].join(":");
  const cached = chartCache.get(key);
  if (cached !== undefined) return cached;

  if (chart.notesCount === 0 || durationSeconds <= 0) {
    chartCache.set(key, 0);
    return 0;
  }
  const baseScorePerPower = 3 * (1 + (chart.playLevel - 5) / 100) / chart.notesCount;
  const noteRates = chart.notes.map((note, noteIndex) => (
    baseScorePerPower
    * JUDGE_PERCENT.perfect
    * getScoreComboMultiplier(noteIndex, comboOptions)
    * (note.fever ? 2 : 1)
  ));
  let left = 0;
  let right = 0;
  let current = 0;
  let best = 0;
  while (left < chart.notesCount) {
    if (right < left) right = left;
    const windowEnd = (chart.notes[left]?.time ?? 0) + durationSeconds + 0.00001;
    while (right < chart.notesCount && (chart.notes[right]?.time ?? Number.POSITIVE_INFINITY) <= windowEnd) {
      current += noteRates[right] ?? 0;
      right += 1;
    }
    best = Math.max(best, current);
    if (right > left) current -= noteRates[left] ?? 0;
    left += 1;
  }
  chartCache.set(key, best);
  return best;
}
`;

replaceOnce(
"export function calculateBestScoreForNonOverlappingSkillWindows(\n",
scheduledHelpers + "\nexport function calculateBestScoreForNonOverlappingSkillWindows(\n",
"scheduled helper insertion",
);

replaceOnce(
`  // The first five solo/free-live skill activations use the game's position-dependent
  // shuffle, not a uniform 5! permutation. We first choose the initial five-card layout
  // by exact expected value, then enumerate only the 96 reachable weighted trigger orders
  // for max/min/probability details. The sixth window remains the leader/encore window.
  const judgeList = getCachedJudgeList(chart.notesCount, perfectRate, cache);`,
`  // The first five solo/free-live skill activations use the game's position-dependent
  // shuffle. If a skill can run into the next trigger's 0.75s guard interval, the
  // sequence becomes order-dependent in time as well as in probability, so switch
  // to the exact scheduler-aware path. Otherwise the fixed-window fast path remains exact.
  const firstFiveDurations = skills.map((skill) => skill?.durationSeconds ?? 0);
  if (bandoriSkillTriggersCanShift(chart.skillTriggerTimes.slice(0, 6), firstFiveDurations)) {
    return calculateBestScheduledSoloScore(
      chart,
      bandPower,
      skills,
      perfectRate,
      cache,
      encoreSkill,
      comboOptions,
      targetOnly,
      shouldCalculateDetailed,
      eligibleLeaderIndexes,
    );
  }

  const judgeList = getCachedJudgeList(chart.notesCount, perfectRate, cache);`,
"dynamic path switch",
);

const oldCoarse = `  const baseScorePerPower = 3 * (1 + (chart.playLevel - 5) / 100) / chart.notesCount;
  let bestWindowRate = 0;
  const triggerWindowRates = [0, 0, 0, 0, 0];
  let leaderWindowRate = 0;
  for (let slotIndex = 0; slotIndex < 6; slotIndex += 1) {
    const start = chart.skillStartNotes[slotIndex] ?? chart.notesCount;
    const end = getSkillEndNote(chart, slotIndex, durationSeconds);
    let windowRate = 0;
    for (let noteIndex = start; noteIndex < end; noteIndex += 1) {
      const note = chart.notes[noteIndex];
      windowRate += baseScorePerPower * JUDGE_PERCENT.perfect * getScoreComboMultiplier(noteIndex, comboOptions) * (note.fever ? 2 : 1);
    }
    bestWindowRate = Math.max(bestWindowRate, windowRate);
    if (slotIndex < 5) triggerWindowRates[slotIndex] = windowRate;
    else leaderWindowRate = windowRate;
  }

  const multiplier = valuePercent / 100;
  return {
    maxRate: bestWindowRate * multiplier,
    averageRate: getMaximumExpectedSkillContributionAcrossInitialSlots(triggerWindowRates) * multiplier,
    leaderRate: leaderWindowRate * multiplier,
  };`;
const newCoarse = `  // A delayed activation may move away from every nominal trigger window. For
  // pruning, use the best duration-sized window anywhere in the chart for all
  // three skill terms. This is intentionally optimistic and therefore safe.
  const globalWindowRate = getGlobalMaximumBaseWindowRate(chart, durationSeconds, comboOptions);
  const multiplier = valuePercent / 100;
  const upper = globalWindowRate * multiplier;
  return {
    maxRate: upper,
    averageRate: upper,
    leaderRate: upper,
  };`;

let replacements = 0;
while (source.includes(oldCoarse)) {
  source = source.replace(oldCoarse, newCoarse);
  replacements += 1;
}
if (replacements !== 2) throw new Error(`Expected 2 upper-rate replacements, got ${replacements}`);

fs.writeFileSync(path, source);

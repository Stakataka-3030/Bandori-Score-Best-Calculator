import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const ROOT = resolve(process.cwd());

async function read(path) {
  return readFile(resolve(ROOT, path), "utf8");
}

async function write(path, content) {
  return writeFile(resolve(ROOT, path), content, "utf8");
}

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) {
    if (source.includes(after)) return source;
    throw new Error(`Unable to apply ${label}: baseline marker not found`);
  }
  if (source.indexOf(before, index + before.length) >= 0) {
    throw new Error(`Unable to apply ${label}: baseline marker is not unique`);
  }
  return source.slice(0, index) + after + source.slice(index + before.length);
}

function replaceSection(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) {
    if (source.includes(replacement.trim().slice(0, 80))) return source;
    throw new Error(`Unable to apply ${label}: start marker not found`);
  }
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`Unable to apply ${label}: end marker not found`);
  return source.slice(0, start) + replacement + "\n\n" + source.slice(end);
}

async function patchScoring() {
  const path = "src/lib/bandori/team-builder/core/scoring.ts";
  let source = await read(path);

  source = replaceOnce(
    source,
    'import { buildPermutations, clamp, getRegionalNumber } from "./utils";\n',
    'import { buildPermutations, clamp, getRegionalNumber } from "./utils";\nimport {\n  BANDORI_SKILL_SHUFFLE_PATH_COUNT,\n  getExpectedTriggerContributionForLayout,\n  getMaximumExpectedSkillContributionAcrossInitialSlots,\n  scoreWeightedSkillLayout,\n} from "./skill-shuffle";\n',
    "skill-shuffle scoring import",
  );

  source = replaceOnce(
    source,
    "  roomScoreRatePerPower?: number;\n};",
    "  roomScoreRatePerPower?: number;\n  // Initial team slots 0..4 mapped to indexes in the evaluated five-card array.\n  // Slot 2 is the leader slot. Present for the real solo/free-live shuffle model.\n  teamLayoutCardIndexes?: number[];\n};",
    "score-result layout field",
  );

  const scoringFunction = `export function calculateBestScoreForNonOverlappingSkillWindows(
  chart: PreparedChart,
  bandPower: number,
  skills: Array<ResolvedBandoriSkill | null>,
  perfectRate: number,
  cache?: ScoreCalculationCache,
  encoreSkill?: ResolvedBandoriSkill | null,
  comboOptions?: ScoreComboOptions,
  targetOnly = false,
  shouldCalculateDetailed?: (targetOnlyResult: SkillWindowScoreResult) => boolean,
  eligibleLeaderIndexes?: readonly boolean[],
): SkillWindowScoreResult {
  // The first five solo/free-live skill activations use the game's position-dependent
  // shuffle, not a uniform 5! permutation. We first choose the initial five-card layout
  // by exact expected value, then enumerate only the 96 reachable weighted trigger orders
  // for max/min/probability details. The sixth window remains the leader/encore window.
  const judgeList = getCachedJudgeList(chart.notesCount, perfectRate, cache);
  const relevantSkills = encoreSkill === undefined ? skills : [...skills, encoreSkill];
  const canUseConstantOnlyScoring = relevantSkills.every((skill) => (
    !skill || Number.isFinite(getGeneratedJudgeConstantSkillMultiplier(skill, perfectRate))
  ));
  const innerScoreRates = canUseConstantOnlyScoring
    ? getCachedInnerScoreRates(chart, judgeList, perfectRate, comboOptions, cache)
    : null;
  const innerScoreResult = innerScoreRates
    ? null
    : buildInnerScoreResult(chart, bandPower, judgeList, perfectRate, comboOptions, cache);
  const innerScores = innerScoreResult?.scores ?? null;
  const baseScore = innerScoreRates
    ? getCachedBaseScoreFromRates(chart, bandPower, perfectRate, comboOptions, innerScoreRates, cache)
    : innerScoreResult?.total ?? 0;

  const constantWindowContributionCache = new Map<string, Int32Array>();
  const zeroContributions = [0, 0, 0, 0, 0, 0];
  const contributionCache = new Map<string, number[]>();
  const getContributions = (skill: ResolvedBandoriSkill | null | undefined): number[] => {
    if (!skill) return zeroContributions;
    const cached = contributionCache.get(skill.cacheKey);
    if (cached) return cached;
    const contributions = getCachedSkillWindowContributions(
      chart,
      bandPower,
      skill,
      perfectRate,
      comboOptions,
      cache,
      () => {
        const constantMultiplier = getGeneratedJudgeConstantSkillMultiplier(skill, perfectRate);
        if (innerScoreRates && Number.isFinite(constantMultiplier)) {
          const windowContributions = calculateConstantWindowContributionsFromRates(
            chart,
            skill,
            constantMultiplier,
            bandPower,
            innerScoreRates,
            constantWindowContributionCache,
          );
          return Array.from(windowContributions);
        }
        if (canUseConstantOnlyScoring || !innerScores) return zeroContributions;
        return Array.from({ length: 6 }, (_, slotIndex) => (
          calculateSkillExtraContribution(
            chart,
            skill,
            slotIndex,
            judgeList,
            innerScores,
            perfectRate,
            cache,
            constantWindowContributionCache,
          )
        ));
      },
    );
    contributionCache.set(skill.cacheKey, contributions);
    return contributions;
  };

  const contributions = skills.map((skill) => getContributions(skill));
  const externalEncoreContribution = encoreSkill === undefined
    ? null
    : getContributions(encoreSkill)[5] ?? 0;

  let selectedLayout: number[] | null = null;
  let selectedLeaderIndex = -1;
  let selectedRawAverageScore = Number.NEGATIVE_INFINITY;

  // SKILL_ORDER_PERMUTATIONS is also the complete set of 5! possible initial card layouts.
  // layout[slot] is the evaluated-card index placed in original team slot 0..4.
  for (const layout of SKILL_ORDER_PERMUTATIONS) {
    const leaderIndex = layout[2];
    if (!isEligibleLeaderIndex(eligibleLeaderIndexes, leaderIndex)) continue;
    const expectedTriggerContribution = getExpectedTriggerContributionForLayout(contributions, layout);
    const encoreContribution = externalEncoreContribution ?? (contributions[leaderIndex]?.[5] ?? 0);
    const rawAverageScore = baseScore + expectedTriggerContribution + encoreContribution;
    if (rawAverageScore > selectedRawAverageScore) {
      selectedRawAverageScore = rawAverageScore;
      selectedLayout = layout;
      selectedLeaderIndex = leaderIndex;
    }
  }

  if (!selectedLayout || selectedLeaderIndex < 0) {
    return createEmptySkillWindowScoreResult();
  }

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

  if (
    targetOnly
    || (shouldCalculateDetailed && !shouldCalculateDetailed(targetOnlyResult))
  ) {
    return targetOnlyResult;
  }

  const weighted = scoreWeightedSkillLayout(contributions, selectedLayout);
  const encoreContribution = externalEncoreContribution
    ?? (contributions[selectedLeaderIndex]?.[5] ?? 0);
  return {
    score: baseScore + weighted.maxTriggerContribution + encoreContribution,
    averageScore,
    rawAverageScore: selectedRawAverageScore,
    minScore: baseScore + weighted.minTriggerContribution + encoreContribution,
    // Under the real shuffle these fields are RNG-path weights, so x/1024 is the
    // exact probability of reaching the displayed maximum score.
    maxScoreOrderCount: weighted.maxPathWeight,
    maxScoreOrderTotal: BANDORI_SKILL_SHUFFLE_PATH_COUNT,
    leaderIndex: selectedLeaderIndex,
    permutation: weighted.representativeTriggerCardIndexes,
    teamLayoutCardIndexes: [...selectedLayout],
  };
}`;

  source = replaceSection(
    source,
    "export function calculateBestScoreForNonOverlappingSkillWindows(\n",
    "export function calculateBaseScoreRatePerPower(",
    scoringFunction,
    "real weighted solo scoring",
  );

  const coarseUpper = `export function calculateSkillUpperRatesPerPower(
  chart: PreparedChart,
  skill: BestdoriSkillMaster | undefined,
  skillLevel: number,
  server: number,
  comboOptions?: ScoreComboOptions,
): SkillUpperRates {
  // This bound is intentionally optimistic. Under the real shuffle, trigger expectation
  // depends on the initial team slot, so averageRate uses the best possible initial-slot
  // expectation. This can overestimate a complete layout but can never prune the optimum.
  const valuePercent = getSkillMaxValuePercent(skill, server);
  const durationSeconds = getSkillDurationSeconds(skill, skillLevel, server);
  if (valuePercent <= 0 || durationSeconds <= 0 || chart.notesCount === 0) {
    return { maxRate: 0, averageRate: 0, leaderRate: 0 };
  }

  const baseScorePerPower = 3 * (1 + (chart.playLevel - 5) / 100) / chart.notesCount;
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
  };
}`;

  source = replaceSection(
    source,
    "export function calculateSkillUpperRatesPerPower(\n",
    "export function getResolvedSkillMaxScoreUpPercent(",
    coarseUpper,
    "position-aware coarse skill bound",
  );

  const resolvedUpper = `export function calculateResolvedSkillUpperRatesPerPower(
  chart: PreparedChart,
  skill: ResolvedBandoriSkill | null,
  comboOptions?: ScoreComboOptions,
): SkillUpperRates {
  // Resolved conditional skills use the same optimistic best-initial-slot expectation so
  // context-partitioned DFS bounds remain safe under the non-uniform real shuffle.
  const valuePercent = getResolvedSkillMaxScoreUpPercent(skill);
  const durationSeconds = skill?.durationSeconds ?? 0;
  if (valuePercent <= 0 || durationSeconds <= 0 || chart.notesCount === 0) {
    return { maxRate: 0, averageRate: 0, leaderRate: 0 };
  }

  const baseScorePerPower = 3 * (1 + (chart.playLevel - 5) / 100) / chart.notesCount;
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
  };
}`;

  const resolvedStart = source.indexOf("export function calculateResolvedSkillUpperRatesPerPower(\n");
  if (resolvedStart >= 0) {
    source = source.slice(0, resolvedStart) + resolvedUpper + "\n";
  } else if (!source.includes("context-partitioned DFS bounds remain safe")) {
    throw new Error("Unable to apply resolved position-aware skill bound");
  }

  await write(path, source);
}

async function patchTypes() {
  const path = "src/lib/bandori/team-builder/core/types.ts";
  let source = await read(path);
  source = replaceOnce(
    source,
    "  leaderCardId: number;\n  leaderCardInstanceKey?: string;\n  skillOrderCardIds: number[];",
    "  leaderCardId: number;\n  leaderCardInstanceKey?: string;\n  // Optimal initial team slots 0..4; slot 2 is the leader.\n  teamLayoutCardIds?: number[];\n  teamLayoutCardInstanceKeys?: string[];\n  skillOrderCardIds: number[];",
    "team-search layout result fields",
  );
  await write(path, source);
}

async function patchTeamEvaluation() {
  const path = "src/lib/bandori/team-builder/core/team-evaluation.ts";
  let source = await read(path);
  source = replaceOnce(
    source,
    "  const skillOrderActors = best.skillOrderActors;\n  const baseCardPower = cards.reduce((sum, card) => sum + getCoreBaseCardPower(card), 0);",
    "  const skillOrderActors = best.skillOrderActors;\n  const teamLayoutCardIds = best.teamLayoutCardIndexes?.map((cardIndex) => cards[cardIndex].cardId);\n  const teamLayoutCardInstanceKeys = best.teamLayoutCardIndexes?.map((cardIndex) => getCardInstanceKey(cards[cardIndex]));\n  const baseCardPower = cards.reduce((sum, card) => sum + getCoreBaseCardPower(card), 0);",
    "team-evaluation layout hydration",
  );
  source = replaceOnce(
    source,
    "    leaderCardId: cards[best.leaderIndex].cardId,\n    leaderCardInstanceKey: getCardInstanceKey(cards[best.leaderIndex]),\n    skillOrderCardIds,",
    "    leaderCardId: cards[best.leaderIndex].cardId,\n    leaderCardInstanceKey: getCardInstanceKey(cards[best.leaderIndex]),\n    teamLayoutCardIds,\n    teamLayoutCardInstanceKeys,\n    skillOrderCardIds,",
    "team-evaluation layout result",
  );
  await write(path, source);
}

await patchScoring();
await patchTypes();
await patchTeamEvaluation();
console.log("Applied real Bandori weighted skill-shuffle patches.");

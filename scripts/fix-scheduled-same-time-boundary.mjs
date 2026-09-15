import fs from "node:fs";

function patchText(source, label) {
  const oldSignature = `function calculateScheduledSkillContribution(
  chart: PreparedChart,
  skill: ResolvedBandoriSkill | null | undefined,
  startTimeSeconds: number,
  innerScores: Int32Array,
  perfectRate: number,
): number {
  if (!skill || skill.scoreEffects.length === 0) return 0;
  const start = getFirstNoteAfterTime(chart, startTimeSeconds);`;
  const newSignature = `function calculateScheduledSkillContribution(
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
    : getFirstNoteAfterTime(chart, startTimeSeconds);`;
  if (!source.includes(oldSignature)) throw new Error(`${label}: scheduled contribution signature anchor missing`);
  source = source.replace(oldSignature, newSignature);

  const oldContribution = `  const contributionAt = (skill: ResolvedBandoriSkill | null | undefined, startTime: number): number => {
    if (!skill || skill.scoreEffects.length === 0) return 0;
    const key = skill.cacheKey + "@" + startTime.toPrecision(15);
    const cached = contributionCache.get(key);
    if (cached !== undefined) return cached;
    const contribution = calculateScheduledSkillContribution(
      chart,
      skill,
      startTime,
      innerScoreResult.scores,
      perfectRate,
    );`;
  const newContribution = `  const contributionAt = (
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
    );`;
  if (!source.includes(oldContribution)) throw new Error(`${label}: contribution cache anchor missing`);
  source = source.replace(oldContribution, newContribution);

  const oldCall = `      score += contributionAt(activationSkills[activation], scheduled.starts[activation]);`;
  const newCall = `      score += contributionAt(
        activationSkills[activation],
        scheduled.starts[activation],
        activation,
      );`;
  if (!source.includes(oldCall)) throw new Error(`${label}: contribution call anchor missing`);
  source = source.replace(oldCall, newCall);
  return source;
}

for (const [path, label] of [
  ["src/lib/bandori/team-builder/core/scoring.ts", "current scorer"],
  ["scripts/apply-skill-trigger-delay-patch.mjs", "re-vendor patch"],
]) {
  const original = fs.readFileSync(path, "utf8");
  fs.writeFileSync(path, patchText(original, label));
}

/*
 * Bandori skill-trigger scheduling.
 *
 * The game leaves a 0.75 second guard interval after a skill effect ends. If the
 * next chart trigger falls before that guard interval has finished, the next
 * skill activation is delayed to the end of the interval instead of overlapping
 * the previous skill.
 */

export const BANDORI_SKILL_TRIGGER_GUARD_SECONDS = 0.75;

export type ScheduledSkillTriggers = {
  starts: number[];
  shifted: boolean;
};

/**
 * Resolve the actual activation times for an ordered sequence of skills.
 *
 * `nominalTriggerTimes[i]` is the chart trigger time for activation i and
 * `durationSeconds[i]` is the duration of the skill that actually fires there.
 * The duration of the final activation does not affect any later trigger, but it
 * is accepted so callers can pass the complete six-skill duration list.
 */
export function scheduleBandoriSkillTriggerTimes(
  nominalTriggerTimes: readonly number[],
  durationSeconds: readonly number[],
): ScheduledSkillTriggers {
  const starts = new Array<number>(nominalTriggerTimes.length);
  let shifted = false;

  for (let index = 0; index < nominalTriggerTimes.length; index += 1) {
    const nominal = nominalTriggerTimes[index] ?? 0;
    if (!Number.isFinite(nominal)) {
      throw new Error(`Invalid Bandori nominal skill trigger time at index ${index}`);
    }

    if (index === 0) {
      starts[index] = nominal;
      continue;
    }

    const previousDuration = Math.max(0, durationSeconds[index - 1] ?? 0);
    if (!Number.isFinite(previousDuration)) {
      throw new Error(`Invalid Bandori skill duration at index ${index - 1}`);
    }
    const earliest = starts[index - 1] + previousDuration + BANDORI_SKILL_TRIGGER_GUARD_SECONDS;
    const actual = Math.max(nominal, earliest);
    starts[index] = actual;
    if (actual > nominal + 1e-9) shifted = true;
  }

  return { starts, shifted };
}

/**
 * Conservative fast-path test for one five-card team. If false, no ordering of
 * the first five members can move any of the six activations, so the legacy
 * fixed-window scorer is exactly equivalent to the scheduler-aware scorer.
 */
export function bandoriSkillTriggersCanShift(
  nominalTriggerTimes: readonly number[],
  firstFiveDurations: readonly number[],
): boolean {
  const maximumDuration = firstFiveDurations.reduce((maximum, duration) => (
    Number.isFinite(duration) ? Math.max(maximum, Math.max(0, duration)) : maximum
  ), 0);

  for (let index = 1; index < nominalTriggerTimes.length; index += 1) {
    const previousNominal = nominalTriggerTimes[index - 1];
    const nominal = nominalTriggerTimes[index];
    if (!Number.isFinite(previousNominal) || !Number.isFinite(nominal)) return true;
    if (nominal + 1e-9 < previousNominal + maximumDuration + BANDORI_SKILL_TRIGGER_GUARD_SECONDS) {
      return true;
    }
  }
  return false;
}

import assert from "node:assert/strict";
import {
  BANDORI_SKILL_TRIGGER_GUARD_SECONDS,
  bandoriSkillTriggersCanShift,
  scheduleBandoriSkillTriggerTimes,
} from "../src/lib/bandori/team-builder/core/skill-trigger-scheduler.ts";

assert.equal(BANDORI_SKILL_TRIGGER_GUARD_SECONDS, 0.75);

{
  const result = scheduleBandoriSkillTriggerTimes(
    [10, 17.75, 30, 40, 50, 60],
    [7, 5, 5, 5, 5, 5],
  );
  assert.deepEqual(result.starts, [10, 17.75, 30, 40, 50, 60]);
  assert.equal(result.shifted, false);
}

{
  const result = scheduleBandoriSkillTriggerTimes(
    [10, 17.2, 24.5, 40, 50, 60],
    [7, 7.5, 5, 5, 5, 5],
  );
  assert.equal(result.starts[1], 17.75);
  assert.equal(result.starts[2], 26);
  assert.equal(result.shifted, true);
}

{
  const result = scheduleBandoriSkillTriggerTimes(
    [20, 27.2, 34.4, 41.6, 48.8, 56],
    [7, 7, 7, 7, 7, 7],
  );
  assert.deepEqual(result.starts, [20, 27.75, 35.5, 43.25, 51, 58.75]);
}

assert.equal(bandoriSkillTriggersCanShift([10, 18, 26, 34, 42, 50], [7, 7, 7, 7, 7]), false);
assert.equal(bandoriSkillTriggersCanShift([10, 17.7, 26, 34, 42, 50], [7, 7, 7, 7, 7]), true);

console.log("Bandori skill-trigger scheduler regression checks passed.");

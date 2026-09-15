import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Node 22.23+ strips erasable TypeScript syntax natively, so this executes the
// actual production module instead of a duplicated test implementation.
const sourcePath = resolve("src/lib/bandori/team-builder/core/skill-shuffle.ts");
const shuffle = await import(`${pathToFileURL(sourcePath).href}?verify=${Date.now()}`);

assert.equal(shuffle.BANDORI_SKILL_SHUFFLE_PATH_COUNT, 1024);
assert.equal(shuffle.BANDORI_SKILL_SHUFFLE_REACHABLE_ORDER_COUNT, 96);
assert.equal(shuffle.BANDORI_WEIGHTED_SKILL_ORDERS.length, 96);
assert.equal(
  shuffle.BANDORI_WEIGHTED_SKILL_ORDERS.reduce((sum, order) => sum + order.weight, 0),
  1024,
);
assert.deepEqual(shuffle.BANDORI_SKILL_SLOT_TRIGGER_WEIGHTS, [
  [192, 192, 192, 192, 256],
  [291, 243, 198, 156, 136],
  [144, 176, 200, 216, 288],
  [141, 157, 178, 204, 344],
  [256, 256, 256, 256, 0],
]);
assert.equal(Math.min(...shuffle.BANDORI_WEIGHTED_SKILL_ORDERS.map((order) => order.weight)), 4);
assert.equal(Math.max(...shuffle.BANDORI_WEIGHTED_SKILL_ORDERS.map((order) => order.weight)), 19);

// Original slot 4 can never be the fifth first-round skill activation.
assert.equal(shuffle.BANDORI_SKILL_SLOT_TRIGGER_WEIGHTS[4][4], 0);

// Every original slot still appears exactly once in every final trigger order.
for (const order of shuffle.BANDORI_WEIGHTED_SKILL_ORDERS) {
  assert.deepEqual([...order.permutation].sort((a, b) => a - b), [0, 1, 2, 3, 4]);
}

console.log("Verified real Bandori skill shuffle: 1024 RNG paths -> 96 weighted orders.");

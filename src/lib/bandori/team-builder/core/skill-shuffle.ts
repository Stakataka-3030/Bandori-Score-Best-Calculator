/*
 * First-five Bandori skill-order distribution.
 *
 * The game starts from the team's original five slots and, for i = 0..4, removes
 * the element currently at list[i] and reinserts it at Random.Range(0, list.Count)
 * after removal. Unity's integer Random.Range upper bound is exclusive, so the
 * insertion index is always 0..3 for a five-member list.
 *
 * That creates 4^5 = 1024 equally likely RNG paths. They collapse to 96 reachable
 * final trigger orders with unequal weights. Slot 2 is the leader slot; encore is
 * handled separately and is not part of this distribution.
 */

export const BANDORI_SKILL_SHUFFLE_SIZE = 5;
export const BANDORI_SKILL_SHUFFLE_PATH_COUNT = 4 ** BANDORI_SKILL_SHUFFLE_SIZE;
export const BANDORI_SKILL_SHUFFLE_REACHABLE_ORDER_COUNT = 96;

export type BandoriSkillSlot = 0 | 1 | 2 | 3 | 4;
export type BandoriSkillSlotPermutation = readonly [
  BandoriSkillSlot,
  BandoriSkillSlot,
  BandoriSkillSlot,
  BandoriSkillSlot,
  BandoriSkillSlot,
];

export type WeightedBandoriSkillOrder = {
  permutation: BandoriSkillSlotPermutation;
  weight: number;
};

function orderKey(order: readonly number[]): string {
  return order.join(",");
}

function compareOrders(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < BANDORI_SKILL_SHUFFLE_SIZE; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function enumerateWeightedOrders(): WeightedBandoriSkillOrder[] {
  const weights = new Map<string, { permutation: BandoriSkillSlotPermutation; weight: number }>();

  function visit(step: number, order: BandoriSkillSlot[]): void {
    if (step === BANDORI_SKILL_SHUFFLE_SIZE) {
      const permutation = [...order] as unknown as BandoriSkillSlotPermutation;
      const key = orderKey(permutation);
      const current = weights.get(key);
      if (current) current.weight += 1;
      else weights.set(key, { permutation, weight: 1 });
      return;
    }

    // At every step, removing one member leaves Count === 4, and the integer
    // Random.Range(0, Count) upper bound is exclusive.
    for (let insertIndex = 0; insertIndex < BANDORI_SKILL_SHUFFLE_SIZE - 1; insertIndex += 1) {
      const next = [...order];
      const [member] = next.splice(step, 1);
      next.splice(insertIndex, 0, member);
      visit(step + 1, next);
    }
  }

  visit(0, [0, 1, 2, 3, 4]);
  return [...weights.values()].sort((left, right) => compareOrders(left.permutation, right.permutation));
}

export const BANDORI_WEIGHTED_SKILL_ORDERS = enumerateWeightedOrders();

function buildSlotTriggerWeights(): readonly (readonly number[])[] {
  const matrix = Array.from(
    { length: BANDORI_SKILL_SHUFFLE_SIZE },
    () => Array<number>(BANDORI_SKILL_SHUFFLE_SIZE).fill(0),
  );
  for (const order of BANDORI_WEIGHTED_SKILL_ORDERS) {
    order.permutation.forEach((originalSlot, triggerIndex) => {
      matrix[originalSlot][triggerIndex] += order.weight;
    });
  }
  return matrix;
}

/**
 * Integer path counts. Divide by BANDORI_SKILL_SHUFFLE_PATH_COUNT (1024) to get probabilities.
 * Row = original team slot; column = first-five trigger index.
 */
export const BANDORI_SKILL_SLOT_TRIGGER_WEIGHTS = buildSlotTriggerWeights();

function assertDistribution(): void {
  const totalWeight = BANDORI_WEIGHTED_SKILL_ORDERS.reduce((sum, order) => sum + order.weight, 0);
  if (totalWeight !== BANDORI_SKILL_SHUFFLE_PATH_COUNT) {
    throw new Error(`Bandori skill shuffle path count mismatch: ${totalWeight}`);
  }
  if (BANDORI_WEIGHTED_SKILL_ORDERS.length !== BANDORI_SKILL_SHUFFLE_REACHABLE_ORDER_COUNT) {
    throw new Error(`Bandori skill shuffle reachable-order mismatch: ${BANDORI_WEIGHTED_SKILL_ORDERS.length}`);
  }

  const expected = [
    [192, 192, 192, 192, 256],
    [291, 243, 198, 156, 136],
    [144, 176, 200, 216, 288],
    [141, 157, 178, 204, 344],
    [256, 256, 256, 256, 0],
  ];
  for (let slot = 0; slot < BANDORI_SKILL_SHUFFLE_SIZE; slot += 1) {
    for (let trigger = 0; trigger < BANDORI_SKILL_SHUFFLE_SIZE; trigger += 1) {
      if (BANDORI_SKILL_SLOT_TRIGGER_WEIGHTS[slot][trigger] !== expected[slot][trigger]) {
        throw new Error(`Bandori skill shuffle matrix mismatch at ${slot}/${trigger}`);
      }
    }
  }
}

assertDistribution();

/** Weighted expected contribution of one skill when it starts in one original team slot. */
export function getExpectedSkillContributionForInitialSlot(
  triggerContributions: readonly number[],
  initialSlot: BandoriSkillSlot,
): number {
  let weighted = 0;
  for (let trigger = 0; trigger < BANDORI_SKILL_SHUFFLE_SIZE; trigger += 1) {
    weighted += (triggerContributions[trigger] ?? 0)
      * BANDORI_SKILL_SLOT_TRIGGER_WEIGHTS[initialSlot][trigger];
  }
  return weighted / BANDORI_SKILL_SHUFFLE_PATH_COUNT;
}

/** Safe optimistic expected contribution when the initial team slot is not fixed yet. */
export function getMaximumExpectedSkillContributionAcrossInitialSlots(
  triggerContributions: readonly number[],
): number {
  let best = Number.NEGATIVE_INFINITY;
  for (let slot = 0; slot < BANDORI_SKILL_SHUFFLE_SIZE; slot += 1) {
    best = Math.max(
      best,
      getExpectedSkillContributionForInitialSlot(triggerContributions, slot as BandoriSkillSlot),
    );
  }
  return Number.isFinite(best) ? best : 0;
}

export type WeightedSkillLayoutScore = {
  expectedTriggerContribution: number;
  maxTriggerContribution: number;
  minTriggerContribution: number;
  maxPathWeight: number;
  representativeTriggerCardIndexes: number[];
};

/**
 * Score one fixed initial layout. `layout[slot]` is the card/skill index occupying
 * that original team slot. `contributions[cardIndex][triggerIndex]` is the score
 * delta if that skill fires in the corresponding first-five trigger window.
 */
export function scoreWeightedSkillLayout(
  contributions: readonly (readonly number[])[],
  layout: readonly number[],
): WeightedSkillLayoutScore {
  let expectedWeighted = 0;
  let maxTriggerContribution = Number.NEGATIVE_INFINITY;
  let minTriggerContribution = Number.POSITIVE_INFINITY;
  let maxPathWeight = 0;
  let representativeTriggerCardIndexes: number[] = [];

  for (const order of BANDORI_WEIGHTED_SKILL_ORDERS) {
    let contribution = 0;
    const triggerCardIndexes = new Array<number>(BANDORI_SKILL_SHUFFLE_SIZE);
    for (let trigger = 0; trigger < BANDORI_SKILL_SHUFFLE_SIZE; trigger += 1) {
      const initialSlot = order.permutation[trigger];
      const cardIndex = layout[initialSlot];
      triggerCardIndexes[trigger] = cardIndex;
      contribution += contributions[cardIndex]?.[trigger] ?? 0;
    }

    expectedWeighted += contribution * order.weight;
    if (contribution > maxTriggerContribution) {
      maxTriggerContribution = contribution;
      maxPathWeight = order.weight;
      representativeTriggerCardIndexes = triggerCardIndexes;
    } else if (contribution === maxTriggerContribution) {
      maxPathWeight += order.weight;
    }
    minTriggerContribution = Math.min(minTriggerContribution, contribution);
  }

  return {
    expectedTriggerContribution: expectedWeighted / BANDORI_SKILL_SHUFFLE_PATH_COUNT,
    maxTriggerContribution: Number.isFinite(maxTriggerContribution) ? maxTriggerContribution : 0,
    minTriggerContribution: Number.isFinite(minTriggerContribution) ? minTriggerContribution : 0,
    maxPathWeight,
    representativeTriggerCardIndexes,
  };
}

/** Fast expected-only path used while selecting the best leader/initial layout. */
export function getExpectedTriggerContributionForLayout(
  contributions: readonly (readonly number[])[],
  layout: readonly number[],
): number {
  let total = 0;
  for (let slot = 0; slot < BANDORI_SKILL_SHUFFLE_SIZE; slot += 1) {
    const cardIndex = layout[slot];
    total += getExpectedSkillContributionForInitialSlot(
      contributions[cardIndex] ?? [],
      slot as BandoriSkillSlot,
    );
  }
  return total;
}

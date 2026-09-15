use std::collections::BTreeMap;
use std::sync::OnceLock;

pub const SKILL_SHUFFLE_SIZE: usize = 5;
pub const SKILL_SHUFFLE_PATH_COUNT: u16 = 1024;
pub const SKILL_SHUFFLE_REACHABLE_ORDER_COUNT: usize = 96;

/// Integer RNG-path counts. Row = original team slot; column = trigger index.
pub const SKILL_SLOT_TRIGGER_WEIGHTS: [[u16; SKILL_SHUFFLE_SIZE]; SKILL_SHUFFLE_SIZE] = [
    [192, 192, 192, 192, 256],
    [291, 243, 198, 156, 136],
    [144, 176, 200, 216, 288],
    [141, 157, 178, 204, 344],
    [256, 256, 256, 256, 0],
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WeightedSkillOrder {
    /// For each trigger index, gives the original team slot whose skill fires.
    pub permutation: [usize; SKILL_SHUFFLE_SIZE],
    /// Number of the 1024 equally likely Unity RNG paths that end at this order.
    pub weight: u16,
}

fn enumerate_orders() -> Vec<WeightedSkillOrder> {
    fn visit(
        step: usize,
        order: [usize; SKILL_SHUFFLE_SIZE],
        weights: &mut BTreeMap<[usize; SKILL_SHUFFLE_SIZE], u16>,
    ) {
        if step == SKILL_SHUFFLE_SIZE {
            *weights.entry(order).or_insert(0) += 1;
            return;
        }

        // Removing one member leaves Count == 4. Unity integer Random.Range has
        // an exclusive upper bound, so insertion indexes are exactly 0..=3.
        for insert_index in 0..SKILL_SHUFFLE_SIZE - 1 {
            let removed = order[step];
            let mut compact = [0_usize; SKILL_SHUFFLE_SIZE - 1];
            let mut compact_index = 0;
            for (index, member) in order.into_iter().enumerate() {
                if index == step {
                    continue;
                }
                compact[compact_index] = member;
                compact_index += 1;
            }

            let mut next = [0_usize; SKILL_SHUFFLE_SIZE];
            let mut source = 0;
            for (index, slot) in next.iter_mut().enumerate() {
                if index == insert_index {
                    *slot = removed;
                } else {
                    *slot = compact[source];
                    source += 1;
                }
            }
            visit(step + 1, next, weights);
        }
    }

    let mut weights = BTreeMap::new();
    visit(0, [0, 1, 2, 3, 4], &mut weights);
    let result = weights
        .into_iter()
        .map(|(permutation, weight)| WeightedSkillOrder {
            permutation,
            weight,
        })
        .collect::<Vec<_>>();

    assert_eq!(result.len(), SKILL_SHUFFLE_REACHABLE_ORDER_COUNT);
    assert_eq!(
        result
            .iter()
            .map(|order| u32::from(order.weight))
            .sum::<u32>(),
        u32::from(SKILL_SHUFFLE_PATH_COUNT),
    );

    let mut matrix = [[0_u16; SKILL_SHUFFLE_SIZE]; SKILL_SHUFFLE_SIZE];
    for order in &result {
        for (trigger, original_slot) in order.permutation.into_iter().enumerate() {
            matrix[original_slot][trigger] += order.weight;
        }
    }
    assert_eq!(matrix, SKILL_SLOT_TRIGGER_WEIGHTS);
    result
}

#[must_use]
pub fn weighted_skill_orders() -> &'static [WeightedSkillOrder] {
    static ORDERS: OnceLock<Vec<WeightedSkillOrder>> = OnceLock::new();
    ORDERS.get_or_init(enumerate_orders).as_slice()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn real_shuffle_has_expected_paths_orders_and_slot_matrix() {
        let orders = weighted_skill_orders();
        assert_eq!(orders.len(), 96);
        assert_eq!(
            orders
                .iter()
                .map(|order| u32::from(order.weight))
                .sum::<u32>(),
            1024,
        );

        for row in SKILL_SLOT_TRIGGER_WEIGHTS {
            assert_eq!(row.into_iter().map(u32::from).sum::<u32>(), 1024);
        }
        assert_eq!(SKILL_SLOT_TRIGGER_WEIGHTS[4][4], 0);
    }
}

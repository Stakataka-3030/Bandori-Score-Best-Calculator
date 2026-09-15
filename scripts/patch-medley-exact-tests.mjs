import { readFile, writeFile } from "node:fs/promises";

const path = "crates/bandori-medley-search/src/exact_score.rs";
let text = await readFile(path, "utf8");

text = text.replace(
  `.sum::<f64>()\n                / 120.0;`,
  `.sum::<f64>()\n                / expected.songs[slot].permutation_expected_score_bits.len() as f64;`,
);
text = text.replace(
  "fn score_range_matches_all_120_reference_orders()",
  "fn score_range_matches_all_weighted_reference_paths()",
);

const oldBlock = `        let reference_scores = &reference.songs[0].permutation_expected_score_bits;\n        assert_eq!(range.order_scores.len(), 120);\n        assert_eq!(reference_scores.len(), 120);\n        for (actual, expected) in range.order_scores.iter().zip(reference_scores) {\n            assert_eq!((*actual as f64).to_bits(), expected.to_f64().to_bits());\n        }\n\n        let expected_minimum = range.order_scores.iter().copied().min().unwrap();\n        let expected_maximum = range.order_scores.iter().copied().max().unwrap();\n        let expected_maximum_count = range\n            .order_scores\n            .iter()\n            .filter(|score| **score == expected_maximum)\n            .count() as u16;\n        let mut orders = Vec::with_capacity(120);\n        visit_skill_orders(0, &mut [0; 5], &mut [false; 5], &mut |order| {\n            orders.push(order)\n        });\n        let expected_best_order = orders[range\n            .order_scores\n            .iter()\n            .position(|score| *score == expected_maximum)\n            .unwrap()];`;
const newBlock = `        let reference_scores = &reference.songs[0].permutation_expected_score_bits;\n        assert_eq!(range.order_scores.len(), weighted_skill_orders().len());\n        assert_eq!(reference_scores.len(), usize::from(SKILL_SHUFFLE_PATH_COUNT));\n        let mut expanded_scores = Vec::with_capacity(usize::from(SKILL_SHUFFLE_PATH_COUNT));\n        for (actual, weighted_order) in range.order_scores.iter().zip(weighted_skill_orders()) {\n            expanded_scores.extend(std::iter::repeat_n(*actual, usize::from(weighted_order.weight)));\n        }\n        for (actual, expected) in expanded_scores.iter().zip(reference_scores) {\n            assert_eq!((*actual as f64).to_bits(), expected.to_f64().to_bits());\n        }\n\n        let expected_minimum = range.order_scores.iter().copied().min().unwrap();\n        let expected_maximum = range.order_scores.iter().copied().max().unwrap();\n        let expected_maximum_count = range\n            .order_scores\n            .iter()\n            .zip(weighted_skill_orders())\n            .filter(|(score, _)| **score == expected_maximum)\n            .map(|(_, order)| order.weight)\n            .sum::<u16>();\n        let best_index = range\n            .order_scores\n            .iter()\n            .position(|score| *score == expected_maximum)\n            .unwrap();\n        let expected_best_order = weighted_skill_orders()[best_index].permutation;`;
if (!text.includes(oldBlock)) throw new Error("exact weighted-order test block changed upstream");
text = text.replace(oldBlock, newBlock);

await writeFile(path, text, "utf8");
console.log(`patched ${path} tests`);

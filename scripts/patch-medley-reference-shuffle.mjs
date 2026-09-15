import { readFile, writeFile } from "node:fs/promises";

const path = "crates/bandori-medley-reference/src/scoring.rs";
let text = await readFile(path, "utf8");

function replaceOne(pattern, replacement, label) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matches = [...text.matchAll(new RegExp(pattern.source, flags))];
  if (matches.length !== 1) throw new Error(`${label}: expected 1 match, got ${matches.length}`);
  text = text.replace(pattern, replacement);
}

replaceOne(
  /use bandori_medley_model::\{\n    ExactProbabilityV1, FixedMedleyEvaluationInputV1, FixedTeamV1, MedleySongV1,\n    ResolvedScoreSkillV1, SCORING_RULES_VERSION, SkillBehaviorV1,\n\};/,
  `use bandori_medley_model::{\n    ExactProbabilityV1, FixedMedleyEvaluationInputV1, FixedTeamV1, MedleySongV1,\n    ResolvedScoreSkillV1, SCORING_RULES_VERSION, SKILL_SHUFFLE_PATH_COUNT, SkillBehaviorV1,\n    weighted_skill_orders,\n};`,
  "reference imports",
);
replaceOne(/use crate::permutations::skill_orders;\n\n/, "", "remove uniform order import");
replaceOne(
  /const SKILL_ORDER_COUNT: u16 = 120;/,
  "const SKILL_ORDER_COUNT: u16 = SKILL_SHUFFLE_PATH_COUNT;",
  "reference path denominator",
);
replaceOne(
  /    let orders = skill_orders\(\);\n    let mut permutation_expected_score_bits = Vec::with_capacity\(orders\.len\(\)\);\n    let mut average_accumulator = 0_i128;\n    for order in orders \{[\s\S]*?    let average_score = \(\(average_accumulator \/ 24\) as f64 \/ 5\.0\)\.floor\(\);/,
  `    let mut permutation_expected_score_bits =\n        Vec::with_capacity(usize::from(SKILL_SHUFFLE_PATH_COUNT));\n    let mut average_accumulator = 0_i128;\n    for weighted_order in weighted_skill_orders() {\n        let score = score_one_order(\n            input,\n            song,\n            team,\n            &trigger_indexes,\n            weighted_order.permutation,\n            &base_note_scores,\n            perfect_rate,\n        )?;\n        average_accumulator = average_accumulator\n            .checked_add(\n                score\n                    .checked_mul(i128::from(weighted_order.weight))\n                    .ok_or_else(|| {\n                        ScoreError::new(\n                            ScoreErrorCode::ArithmeticOverflow,\n                            format!(\"songs[{}].skillShuffle\", song.slot),\n                            \"weighted skill score overflowed i128\",\n                        )\n                    })?,\n            )\n            .ok_or_else(|| {\n                ScoreError::new(\n                    ScoreErrorCode::ArithmeticOverflow,\n                    format!(\"songs[{}].skillShuffle\", song.slot),\n                    \"weighted skill score sum overflowed i128\",\n                )\n            })?;\n        let bits = F64BitsV1::from_f64(score as f64);\n        for _ in 0..weighted_order.weight {\n            permutation_expected_score_bits.push(bits);\n        }\n    }\n    // Every entry above now represents one of the 1024 equally likely Unity RNG\n    // paths, so the expected score is their weighted arithmetic mean.\n    let average_score =\n        (average_accumulator as f64 / f64::from(SKILL_SHUFFLE_PATH_COUNT)).floor();`,
  "weighted reference score loop",
);

text = text.replace(
  "assert_eq!(song.permutation_expected_score_bits.len(), 120);",
  "assert_eq!(song.permutation_expected_score_bits.len(), usize::from(SKILL_SHUFFLE_PATH_COUNT));",
);

await writeFile(path, text, "utf8");
console.log(`patched ${path}`);

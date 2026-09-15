import { readFile, writeFile } from "node:fs/promises";

const path = "crates/bandori-medley-search/src/fast_upper.rs";
let text = await readFile(path, "utf8");

function replaceOne(pattern, replacement, label) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matches = [...text.matchAll(new RegExp(pattern.source, flags))];
  if (matches.length !== 1) throw new Error(`${label}: expected 1 match, got ${matches.length}`);
  text = text.replace(pattern, replacement);
}

replaceOne(
  /use bandori_medley_model::ResolvedScoreSkillV1;/,
  `use bandori_medley_model::{\n    ResolvedScoreSkillV1, SKILL_SHUFFLE_PATH_COUNT, SKILL_SLOT_TRIGGER_WEIGHTS,\n};`,
  "fast-upper imports",
);
replaceOne(
  /                    let first_sum = coverage\[slot\]\[\.\.5\][\s\S]*?                            leader: mul_up\(coverage\[slot\]\[5\], delta\)\?,\n                        \};/,
  `                    // The card's original slot is not fixed at a partial-search node.\n                    // Relax it independently to whichever initial slot gives this card the\n                    // largest real-shuffle expectation. This can overestimate a complete\n                    // team's jointly feasible placement, which is exactly what a safe upper\n                    // bound needs; it can never prune the true optimum.\n                    let mut best_first_five_coverage = 0.0_f64;\n                    for initial_slot in 0..5 {\n                        let mut weighted_coverage = 0.0_f64;\n                        for trigger in 0..5 {\n                            weighted_coverage = add_up(\n                                weighted_coverage,\n                                mul_up(\n                                    coverage[slot][trigger],\n                                    f64::from(SKILL_SLOT_TRIGGER_WEIGHTS[initial_slot][trigger]),\n                                )?,\n                            )?;\n                        }\n                        let expected_coverage = div_up(\n                            weighted_coverage,\n                            f64::from(SKILL_SHUFFLE_PATH_COUNT),\n                        )?;\n                        best_first_five_coverage =\n                            best_first_five_coverage.max(expected_coverage);\n                    }\n                    contributions[card.instance_id as usize][context_index][slot] =\n                        SkillContribution {\n                            first_five: mul_up(best_first_five_coverage, delta)?,\n                            leader: mul_up(coverage[slot][5], delta)?,\n                        };`,
  "real-shuffle first-five upper",
);

await writeFile(path, text, "utf8");
console.log(`patched ${path}`);

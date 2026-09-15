import { readFile, writeFile } from "node:fs/promises";

// Hydration exposes RNG path-weight probabilities, not a count of reachable permutations.
const path = "crates/bandori-medley-search/src/hydration.rs";
let text = await readFile(path, "utf8");

if (!text.includes("use bandori_medley_model::ResolvedScoreSkillV1;")) {
  throw new Error("hydration import shape changed");
}
text = text.replace(
  "use bandori_medley_model::ResolvedScoreSkillV1;",
  "use bandori_medley_model::{ResolvedScoreSkillV1, SKILL_SHUFFLE_PATH_COUNT};",
);
if (!text.includes("const SCORE_ORDER_COUNT: u16 = 120;")) {
  throw new Error("hydration score-order denominator changed upstream");
}
text = text.replace(
  "const SCORE_ORDER_COUNT: u16 = 120;",
  "const SCORE_ORDER_COUNT: u16 = SKILL_SHUFFLE_PATH_COUNT;",
);
text = text.replace(
  "assert_eq!(team.score_order_count, 120);",
  "assert_eq!(team.score_order_count, SKILL_SHUFFLE_PATH_COUNT);",
);
text = text.replace(
  "assert!((1..=120).contains(&team.maximum_score_order_count));",
  "assert!((1..=SKILL_SHUFFLE_PATH_COUNT).contains(&team.maximum_score_order_count));",
);

await writeFile(path, text, "utf8");
console.log(`patched ${path}`);

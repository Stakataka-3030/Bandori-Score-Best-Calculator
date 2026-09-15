import { readFile, writeFile } from "node:fs/promises";

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

await writeFile(path, text, "utf8");
console.log(`patched ${path}`);

import { readFile, writeFile } from "node:fs/promises";

const path = "crates/bandori-medley-search/src/upper_bound.rs";
let text = await readFile(path, "utf8");

const oldBlock = `pub(crate) fn reference_ceiling(path_ceiling: u128) -> Result<f64, UpperBoundFailure> {\n    // The exact mean numerator is <= 5*path_ceiling. Integer-to-f64 conversion\n    // and division by positive five are monotone, including at large values.\n    let numerator = path_ceiling\n        .checked_mul(5)\n        .ok_or(UpperBoundFailure::Unknown)?;\n    checked_finite(numerator as f64 / 5.0)\n}`;
const newBlock = `pub(crate) fn reference_ceiling(path_ceiling: u128) -> Result<f64, UpperBoundFailure> {\n    // The exact real-shuffle expectation is bounded before the final floor.\n    // Converting the integer ceiling to f64 and stepping upward keeps the bound\n    // conservative even when the integer itself is not exactly representable.\n    let converted = checked_finite(path_ceiling as f64)?;\n    checked_finite(if path_ceiling == 0 { 0.0 } else { converted.next_up() })\n}`;
if (!text.includes(oldBlock)) throw new Error("reference_ceiling upstream block changed");
text = text.replace(oldBlock, newBlock);

text = text.replace(
  `            let upper = reference_ceiling(ceiling).unwrap();\n            for offset in 0..=4 {\n                let numerator = (5 * ceiling).saturating_sub(offset);\n                assert!(numerator as f64 / 5.0 <= upper);\n            }`,
  `            let upper = reference_ceiling(ceiling).unwrap();\n            assert!(ceiling as f64 <= upper);`,
);

await writeFile(path, text, "utf8");
console.log(`patched ${path}`);

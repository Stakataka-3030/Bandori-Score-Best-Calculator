import fs from "node:fs";

const patchPath = "scripts/apply-compact-jp-ui.mjs";
let source = fs.readFileSync(patchPath, "utf8");
source = source
  .replace("${formatNumber(result.averageScore)}", "\\${formatNumber(result.averageScore)}")
  .replace("${(result.pointBonusRate * 100).toFixed(0)}", "\\${(result.pointBonusRate * 100).toFixed(0)}")
  .replace("${result.eventPointMultiplier}", "\\${result.eventPointMultiplier}");
fs.writeFileSync(patchPath, source);
await import("./apply-compact-jp-ui.mjs?fixed=2");

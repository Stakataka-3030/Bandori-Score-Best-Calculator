import fs from "node:fs";

const path = "crates/bandori-medley-search/tests/tiny_exact_search.rs";
let source = fs.readFileSync(path, "utf8");

const replacements = [
  [
    "                time_seconds: f64::from(note_id),",
    "                time_seconds: f64::from(note_id) * 10.0,",
  ],
  [
    "        note.time_seconds *= 0.25;",
    "        note.time_seconds *= 0.5;",
  ],
  [
    "    input.songs[2].notes[6].time_seconds = 5.25;",
    "    input.songs[2].notes[6].time_seconds = 52.5;",
  ],
];

for (const [before, after] of replacements) {
  if (!source.includes(before)) {
    if (source.includes(after)) continue;
    throw new Error(`tiny oracle timing anchor missing: ${before}`);
  }
  source = source.replace(before, after);
}

fs.writeFileSync(path, source);

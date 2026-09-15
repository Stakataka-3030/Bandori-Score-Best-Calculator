import { readFile, writeFile } from "node:fs/promises";

const path = "crates/bandori-medley-search/tests/tiny_exact_search.rs";
let text = await readFile(path, "utf8");

function replaceOne(pattern, replacement, label) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matches = [...text.matchAll(new RegExp(pattern.source, flags))];
  if (matches.length !== 1) throw new Error(`${label}: expected 1 match, got ${matches.length}`);
  text = text.replace(pattern, replacement);
}

replaceOne(
  /fn fixed_input\(\n    input: &MedleySearchInputV1,\n    configuration: &AreaItemConfigurationV1,\n    teams: \[\[u32; 5\]; 3\],\n    leader_positions: \[usize; 3\],\n\) -> FixedMedleyEvaluationInputV1 \{\n    let ordered_source_teams: \[\[u32; 5\]; 3\] =\n        std::array::from_fn\(\|slot\| members_with_leader\(teams\[slot\], leader_positions\[slot\]\)\);/,
  `fn fixed_input(\n    input: &MedleySearchInputV1,\n    configuration: &AreaItemConfigurationV1,\n    ordered_source_teams: [[u32; 5]; 3],\n) -> FixedMedleyEvaluationInputV1 {`,
  "fixed input accepts explicit layouts",
);
text = text.replace(
  "let mut source_instance_ids = teams.into_iter().flatten().collect::<Vec<_>>();",
  "let mut source_instance_ids = ordered_source_teams.into_iter().flatten().collect::<Vec<_>>();",
);
text = text.replace(
  "    for team in teams {\n",
  "    for team in ordered_source_teams {\n",
);

const marker = `fn parameter_sum(parameter: [f64; 3]) -> f64 {`;
if (!text.includes(marker)) throw new Error("parameter_sum marker missing");
text = text.replace(
  marker,
  `fn member_layouts(team: [u32; 5]) -> Vec<[u32; 5]> {\n    fn visit(\n        depth: usize,\n        team: [u32; 5],\n        layout: &mut [u32; 5],\n        used: &mut [bool; 5],\n        result: &mut Vec<[u32; 5]>,\n    ) {\n        if depth == 5 {\n            result.push(*layout);\n            return;\n        }\n        for index in 0..5 {\n            if used[index] {\n                continue;\n            }\n            used[index] = true;\n            layout[depth] = team[index];\n            visit(depth + 1, team, layout, used, result);\n            used[index] = false;\n        }\n    }\n\n    let mut result = Vec::with_capacity(120);\n    visit(0, team, &mut [0; 5], &mut [false; 5], &mut result);\n    assert_eq!(result.len(), 120);\n    result\n}\n\n${marker}`,
);

replaceOne(
  /#\[derive\(Clone, Copy\)\]\nstruct ReferenceTeam \{\n    member_set: \[u32; 5\],\n    member_mask: u128,\n    song_scores: \[f64; 3\],\n    leaders: \[u32; 3\],\n\}/,
  `#[derive(Clone, Copy)]\nstruct ReferenceTeam {\n    member_set: [u32; 5],\n    member_mask: u128,\n    song_scores: [f64; 3],\n    song_member_orders: [[u32; 5]; 3],\n}`,
  "reference team stores layouts",
);

replaceOne(
  /            let mut leader_scores = \[\[f64::NAN; 3\]; 5\];[\s\S]*?            ReferenceTeam \{\n                member_set,\n                member_mask: member_mask\(member_set\),\n                song_scores,\n                leaders,\n            \}/,
  `            let layouts = member_layouts(member_set);\n            let mut song_scores = [f64::NEG_INFINITY; 3];\n            let mut song_member_orders = [[0_u32; 5]; 3];\n            for song_slot in 0..3 {\n                for &layout in &layouts {\n                    let mut ordered_teams = [\n                        members_with_leader(fillers[0], 0),\n                        members_with_leader(fillers[1], 0),\n                        layout,\n                    ];\n                    ordered_teams.swap(song_slot, 2);\n                    let trace = evaluate_fixed_medley(&fixed_input(\n                        input,\n                        configuration,\n                        ordered_teams,\n                    ))\n                    .expect(\"tiny fixed medley must score in the independent reference\");\n                    let score = trace.songs[song_slot].average_score();\n                    if score > song_scores[song_slot]\n                        || (score == song_scores[song_slot]\n                            && layout < song_member_orders[song_slot])\n                    {\n                        song_scores[song_slot] = score;\n                        song_member_orders[song_slot] = layout;\n                    }\n                }\n            }\n            ReferenceTeam {\n                member_set,\n                member_mask: member_mask(member_set),\n                song_scores,\n                song_member_orders,\n            }`,
  "reference team all layouts",
);

replaceOne(
  /                    let output_teams = std::array::from_fn\(\|slot\| MedleySearchTeamV1 \{\n                        slot: u8::try_from\(slot\)\.expect\("three team slots fit u8"\),\n                        member_instance_ids: members_with_leader\([\s\S]*?                        average_score: selected\[slot\]\.song_scores\[slot\],\n                    \}\);/,
  `                    let output_teams = std::array::from_fn(|slot| MedleySearchTeamV1 {\n                        slot: u8::try_from(slot).expect(\"three team slots fit u8\"),\n                        member_instance_ids: selected[slot].song_member_orders[slot],\n                        average_score: selected[slot].song_scores[slot],\n                    });`,
  "reference output exact layouts",
);

await writeFile(path, text, "utf8");
console.log(`patched ${path} independent oracle`);

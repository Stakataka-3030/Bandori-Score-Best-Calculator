import { readFile, writeFile } from "node:fs/promises";

const path = "crates/bandori-medley-search/src/search.rs";
let text = await readFile(path, "utf8");

function replaceOne(pattern, replacement, label) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matches = [...text.matchAll(new RegExp(pattern.source, flags))];
  if (matches.length !== 1) throw new Error(`${label}: expected 1 match, got ${matches.length}`);
  text = text.replace(pattern, replacement);
}

replaceOne(
  /fn candidate_solution_from_assigned\([\s\S]*?\n\}\n\nfn candidate_solution\(/,
  `fn candidate_solution_from_assigned(\n    configuration: &AreaItemConfigurationV1,\n    member_instance_ids: [[u32; 5]; 3],\n    song_scores: [f64; 3],\n) -> Result<MedleySearchSolutionV1, SearchAbort> {\n    let teams = std::array::from_fn(|song_slot| MedleySearchTeamV1 {\n        slot: song_slot as u8,\n        member_instance_ids: member_instance_ids[song_slot],\n        average_score: song_scores[song_slot],\n    });\n    let total_average_score = (song_scores[0] + song_scores[1]) + song_scores[2];\n    if !total_average_score.is_finite() {\n        return Err(abort(SearchIncompleteReasonV1::ArithmeticOverflow));\n    }\n    Ok(MedleySearchSolutionV1 {\n        selected_area_item_ids: configuration.selected_area_item_ids.clone(),\n        teams,\n        total_average_score,\n    })\n}\n\nfn candidate_solution(`,
  "materialize exact layout directly",
);

replaceOne(
  /    candidate_solution_from_assigned\(\n        configuration,\n        rows\.map\(\|row\| row\.member_instance_ids\),\n        std::array::from_fn\(\|slot\| rows\[slot\]\.leader_instance_ids\[slot\]\),\n        std::array::from_fn\(\|slot\| rows\[slot\]\.song_scores\[slot\]\),\n    \)/,
  `    candidate_solution_from_assigned(\n        configuration,\n        std::array::from_fn(|slot| rows[slot].song_member_instance_ids[slot]),\n        std::array::from_fn(|slot| rows[slot].song_scores[slot]),\n    )`,
  "candidate solution rows",
);

replaceOne(
  /fn map_candidate_failure\(failure: CandidateFailure\) -> SearchAbort \{[\s\S]*?\n\}/,
  `fn map_candidate_failure(failure: CandidateFailure) -> SearchAbort {\n    match failure {\n        CandidateFailure::InvalidCardReference\n        | CandidateFailure::InvalidCharacterCombination\n        | CandidateFailure::InvalidAreaItemReference => abort(SearchIncompleteReasonV1::InvalidData),\n        CandidateFailure::ArithmeticNonFinite | CandidateFailure::ArithmeticOverflow => {\n            abort(SearchIncompleteReasonV1::ArithmeticOverflow)\n        }\n    }\n}`,
  "candidate failure mapping",
);

// evaluate_candidate now receives prepared songs before the sorted member set.
text = text.replaceAll(
  "evaluate_candidate(input, configuration, members, songs)",
  "evaluate_candidate(input, configuration, songs, members)",
);

text = text.replaceAll("exact_leader_instance_id", "exact_member_instance_ids");
text = text.replace(
  "exact_member_instance_ids: Some(row.leader_instance_ids[song_slot]),",
  "exact_member_instance_ids: Some(row.song_member_instance_ids[song_slot]),",
);

replaceOne(
  /fn exact_local_score<'control, 'callback, F>\([\s\S]*?\n\}\n\nfn plan_configurations/,
  `fn exact_local_score<'control, 'callback, F>(\n    row: &mut LocalCandidate,\n    song_slot: usize,\n    state: &mut RunState<'control, 'callback>,\n    score_candidate: &mut F,\n) -> Result<(f64, [u32; 5]), SearchAbort>\nwhere\n    F: FnMut([u32; 5], &mut RunState<'control, 'callback>) -> Result<CompactCandidate, SearchAbort>,\n{\n    if let Some(member_order) = row.exact_member_instance_ids {\n        return Ok((row.exact_score, member_order));\n    }\n    let exact = score_candidate(row.member_instance_ids, state)?;\n    let score = exact.song_scores[song_slot];\n    if score > row.upper_score {\n        return Err(abort(SearchIncompleteReasonV1::ScorerDisagreement));\n    }\n    let member_order = exact.song_member_instance_ids[song_slot];\n    row.exact_score = score;\n    row.exact_member_instance_ids = Some(member_order);\n    Ok((score, member_order))\n}\n\nfn plan_configurations`,
  "exact local layout cache",
);

// Plain three-way join: keep sorted sets for conflicts, but use exact layouts in output.
text = text.replaceAll("zero_leader", "zero_order");
text = text.replaceAll("one_leader", "one_order");
text = text.replaceAll("two_leader", "two_order");
text = text.replace(
  `                    [zero_members, one_members, two_members],\n                    [zero_order, one_order, two_order],\n                    song_scores,`,
  `                    [zero_order, one_order, two_order],\n                    song_scores,`,
);

// Indexed join follows the same rule.
text = text.replaceAll("outer_leader", "outer_order");
text = text.replaceAll("inner_leader", "inner_order");
text = text.replaceAll("indexed_leader", "indexed_order");
replaceOne(
  /                    let mut member_instance_ids = \[\[0; 5\]; 3\];\n                    member_instance_ids\[pair_slots\[0\]\] = outer_members;\n                    member_instance_ids\[pair_slots\[1\]\] = inner_members;\n                    member_instance_ids\[indexed_slot\] = indexed_members;\n                    let mut leader_instance_ids = \[0; 3\];\n                    leader_instance_ids\[pair_slots\[0\]\] = outer_order;\n                    leader_instance_ids\[pair_slots\[1\]\] = inner_order;\n                    leader_instance_ids\[indexed_slot\] = indexed_order;\n                    let solution = candidate_solution_from_assigned\(\n                        configuration,\n                        member_instance_ids,\n                        leader_instance_ids,\n                        song_scores,\n                    \)\?;/,
  `                    let mut member_instance_ids = [[0; 5]; 3];\n                    member_instance_ids[pair_slots[0]] = outer_order;\n                    member_instance_ids[pair_slots[1]] = inner_order;\n                    member_instance_ids[indexed_slot] = indexed_order;\n                    let solution = candidate_solution_from_assigned(\n                        configuration,\n                        member_instance_ids,\n                        song_scores,\n                    )?;`,
  "indexed join exact layouts",
);

// Existing test-only row builders supplied a scalar leader. Convert that leader into
// the same explicit member order used by production search.
text = text.replaceAll(
  "exact_member_instance_ids: Some(leader),",
  "exact_member_instance_ids: Some(member_order_for_leader(member_instance_ids, leader).unwrap()),",
);
text = text.replaceAll(
  "exact_member_instance_ids: Some(members[0]),",
  "exact_member_instance_ids: Some(member_order_for_leader(members, members[0]).unwrap()),",
);

await writeFile(path, text, "utf8");
console.log(`patched ${path}`);

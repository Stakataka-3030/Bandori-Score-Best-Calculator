import fs from "node:fs";

const path = "crates/bandori-medley-search/src/fast_upper.rs";
let source = fs.readFileSync(path, "utf8");

if (!source.includes("SKILL_TRIGGER_GUARD_SECONDS")) {
  source = source.replace(
    "ResolvedScoreSkillV1, SKILL_SHUFFLE_PATH_COUNT, SKILL_SLOT_TRIGGER_WEIGHTS,",
    "ResolvedScoreSkillV1, SKILL_SHUFFLE_PATH_COUNT, SKILL_SLOT_TRIGGER_WEIGHTS,\n    SKILL_TRIGGER_GUARD_SECONDS,",
  );
}

const powerAnchor = `        let power_range = continued_power_range(
            perfect_rate,
            u32::try_from(maximum_notes).map_err(|_| UpperBoundFailure::Unknown)?,
        )?;`;
if (!source.includes(powerAnchor)) throw new Error("fast-upper power anchor missing");
source = source.replace(
  powerAnchor,
  powerAnchor + `
        let maximum_skill_duration = input
            .cards
            .iter()
            .filter(|card| !card.is_excluded)
            .flat_map(|card| contexts(card))
            .map(|skill| skill.duration_seconds)
            .fold(0.0_f64, f64::max);`,
);

const afterSongs = `        // A duration's exact windows are traversed once, never once per node or
        // area configuration. Direct upward sums avoid unsafe prefix subtraction.`;
if (!source.includes(afterSongs)) throw new Error("fast-upper song marker missing");
source = source.replace(
  afterSongs,
`        let song_can_shift = std::array::from_fn::<_, 3, _>(|slot| {
            let song = &input.songs[slot];
            (1..6).any(|activation| {
                let previous = song.notes[triggers[slot][activation - 1]].time_seconds;
                let nominal = song.notes[triggers[slot][activation]].time_seconds;
                nominal + 1e-9
                    < previous + maximum_skill_duration + SKILL_TRIGGER_GUARD_SECONDS
            })
        });

` + afterSongs,
);

const oldCoverage = `                    let mut coverage = [[0.0; 6]; 3];
                    for slot in 0..3 {
                        for activation_index in 0..6 {
                            let trigger = triggers[slot][activation_index];
                            let song = &input.songs[slot];
                            let end = checked_finite(
                                song.notes[trigger].time_seconds + skill.duration_seconds,
                            )?;
                            for (note, alpha) in
                                song.notes.iter().zip(&alphas[slot]).skip(trigger + 1)
                            {
                                if note.time_seconds <= end {
                                    coverage[slot][activation_index] =
                                        add_up(coverage[slot][activation_index], *alpha)?;
                                }
                            }
                        }
                    }
                    entry.insert(coverage);`;
const newCoverage = `                    let mut coverage = [[0.0; 6]; 3];
                    for slot in 0..3 {
                        let song = &input.songs[slot];
                        if song_can_shift[slot] {
                            // Once any earlier member can delay a later trigger, that later
                            // skill may start away from every nominal trigger time. Use the
                            // best duration-sized window anywhere in the chart for all six
                            // activations. This is deliberately optimistic and therefore a
                            // safe branch-and-bound upper.
                            let mut left = 0_usize;
                            let mut right = 0_usize;
                            let mut current = 0.0_f64;
                            let mut best = 0.0_f64;
                            while left < song.notes.len() {
                                if right < left {
                                    right = left;
                                    current = 0.0;
                                }
                                let end = checked_finite(
                                    song.notes[left].time_seconds + skill.duration_seconds,
                                )?;
                                while right < song.notes.len()
                                    && song.notes[right].time_seconds <= end
                                {
                                    current = add_up(current, alphas[slot][right])?;
                                    right += 1;
                                }
                                best = best.max(current);
                                if right > left {
                                    current = sub_up(current, alphas[slot][left])?;
                                }
                                left += 1;
                            }
                            coverage[slot].fill(best);
                        } else {
                            for activation_index in 0..6 {
                                let trigger = triggers[slot][activation_index];
                                let end = checked_finite(
                                    song.notes[trigger].time_seconds + skill.duration_seconds,
                                )?;
                                for (note, alpha) in
                                    song.notes.iter().zip(&alphas[slot]).skip(trigger + 1)
                                {
                                    if note.time_seconds <= end {
                                        coverage[slot][activation_index] =
                                            add_up(coverage[slot][activation_index], *alpha)?;
                                    }
                                }
                            }
                        }
                    }
                    entry.insert(coverage);`;
if (!source.includes(oldCoverage)) throw new Error("fast-upper coverage anchor missing");
source = source.replace(oldCoverage, newCoverage);

fs.writeFileSync(path, source);

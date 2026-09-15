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
`        // Bound each activation's delayed start separately. earliest is the chart
        // trigger itself. latest recursively assumes every preceding activation uses
        // the longest skill in the entire eligible card pool, which is reachable or
        // later than every real schedule. A skill's real note window is therefore a
        // subset of [trigger+1, latest+duration]. Summing that whole union is looser
        // than an exact sliding window but remains a rigorous upper bound while
        // preserving far more positional information than an anywhere-in-chart bound.
        let latest_starts = std::array::from_fn::<_, 3, _>(|slot| {
            let song = &input.songs[slot];
            let mut latest = [0.0_f64; 6];
            for activation in 0..6 {
                let nominal = song.notes[triggers[slot][activation]].time_seconds;
                latest[activation] = if activation == 0 {
                    nominal
                } else {
                    nominal.max(
                        latest[activation - 1]
                            + maximum_skill_duration
                            + SKILL_TRIGGER_GUARD_SECONDS,
                    )
                };
            }
            latest
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
                        for activation_index in 0..6 {
                            let trigger = triggers[slot][activation_index];
                            let latest_end = checked_finite(
                                latest_starts[slot][activation_index] + skill.duration_seconds,
                            )?;
                            // Actual activation starts can only move later than the
                            // nominal trigger. Starting at trigger+1 includes every note
                            // any delayed schedule could possibly score, while excluding
                            // the trigger entity itself. Direct upward addition makes this
                            // a safe superset bound without prefix-subtraction rounding.
                            for (note, alpha) in
                                song.notes.iter().zip(&alphas[slot]).skip(trigger + 1)
                            {
                                if note.time_seconds <= latest_end {
                                    coverage[slot][activation_index] =
                                        add_up(coverage[slot][activation_index], *alpha)?;
                                } else {
                                    break;
                                }
                            }
                        }
                    }
                    entry.insert(coverage);`;
if (!source.includes(oldCoverage)) throw new Error("fast-upper coverage anchor missing");
source = source.replace(oldCoverage, newCoverage);

fs.writeFileSync(path, source);

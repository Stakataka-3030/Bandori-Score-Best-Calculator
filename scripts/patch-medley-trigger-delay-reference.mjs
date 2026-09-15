import fs from "node:fs";

const path = "crates/bandori-medley-reference/src/scoring.rs";
let source = fs.readFileSync(path, "utf8");

if (!source.includes("SKILL_TRIGGER_GUARD_SECONDS")) {
  source = source.replace(
    "ResolvedScoreSkillV1, SCORING_RULES_VERSION, SKILL_SHUFFLE_PATH_COUNT, SkillBehaviorV1,\n    weighted_skill_orders,",
    "ResolvedScoreSkillV1, SCORING_RULES_VERSION, SKILL_SHUFFLE_PATH_COUNT,\n    SKILL_TRIGGER_GUARD_SECONDS, SkillBehaviorV1, weighted_skill_orders,",
  );
}

const start = source.indexOf("fn build_activations<'a>(");
const end = source.indexOf("\nfn note_score(", start);
if (start < 0 || end < 0) throw new Error("reference build_activations anchor missing");

const replacement = `fn build_activations<'a>(
    input: &'a FixedMedleyEvaluationInputV1,
    song: &MedleySongV1,
    trigger_indexes: &[usize; 6],
    team: &FixedTeamV1,
    order: [usize; 5],
) -> Result<[Activation<'a>; 6], ScoreError> {
    let member_positions = [order[0], order[1], order[2], order[3], order[4], 2];
    let instance_ids = member_positions.map(|position| team.member_instance_ids[position]);
    let mut start_times = [0.0_f64; 6];
    let mut end_times = [0.0_f64; 6];
    let mut start_note_indexes = [0_usize; 6];

    for activation_index in 0..6 {
        let nominal = song.notes[trigger_indexes[activation_index]].time_seconds;
        let actual = if activation_index == 0 {
            nominal
        } else {
            let previous_skill =
                &input.cards[instance_ids[activation_index - 1] as usize].skill;
            nominal.max(
                start_times[activation_index - 1]
                    + previous_skill.duration_seconds
                    + SKILL_TRIGGER_GUARD_SECONDS,
            )
        };
        let skill = &input.cards[instance_ids[activation_index] as usize].skill;
        let end = actual + skill.duration_seconds;
        if !actual.is_finite() || !end.is_finite() {
            return Err(ScoreError::new(
                ScoreErrorCode::ArithmeticNonFinite,
                format!("songs[{}].skillTriggers[{activation_index}]", song.slot),
                "scheduled skill time must remain finite",
            ));
        }
        start_times[activation_index] = actual;
        end_times[activation_index] = end;
        // Preserve the established same-time chord rule when this activation was
        // not delayed: notes after the trigger entity at the same timestamp receive
        // the skill. A delayed activation has no trigger entity at its actual time,
        // so it starts after all notes at that timestamp.
        start_note_indexes[activation_index] = if actual.to_bits() == nominal.to_bits() {
            trigger_indexes[activation_index] + 1
        } else {
            song.notes
                .partition_point(|note| note.time_seconds <= actual)
        };
    }

    Ok(std::array::from_fn(|activation_index| Activation {
        start_note_index: start_note_indexes[activation_index],
        end_time_seconds: end_times[activation_index],
        skill: &input.cards[instance_ids[activation_index] as usize].skill,
    }))
}
`;
source = source.slice(0, start) + replacement + source.slice(end);

fs.writeFileSync(path, source);

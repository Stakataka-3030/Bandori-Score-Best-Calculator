//! Versioned, search-independent inputs for the Bandori medley scorer.
//!
//! The model uses JSON-safe integers and finite JavaScript-compatible numbers.
//! It does not accept UI state, network responses, or search controls.

#![forbid(unsafe_code)]

mod input;
mod skill_shuffle;
mod validation;

pub use input::{
    CardScoringInputV1, DifficultyV1, ExactProbabilityV1, FixedMedleyEvaluationInputV1,
    FixedTeamV1, MedleySongV1, ResolvedScoreSkillV1, ScoringNoteV1, SkillBehaviorV1,
};
pub use skill_shuffle::{
    SKILL_SHUFFLE_PATH_COUNT, SKILL_SHUFFLE_REACHABLE_ORDER_COUNT, SKILL_SHUFFLE_SIZE,
    SKILL_SLOT_TRIGGER_WEIGHTS, WeightedSkillOrder, weighted_skill_orders,
};
pub use validation::{ValidationCode, ValidationError};

/// Schema identifier reserved for the first normalized scoring input contract.
pub const SCORING_INPUT_SCHEMA_VERSION: &str = "hhwx-medley-scoring-input-v1";

/// Rules identifier for the Bestdori-compatible HHWX medley calculator.
pub const SCORING_RULES_VERSION: &str = "hhwx-medley-bestdori-v4";

/// Decode strict JSON and validate the complete fixed-input contract.
pub fn decode_fixed_medley_evaluation_json(
    json: &str,
) -> Result<FixedMedleyEvaluationInputV1, ValidationError> {
    let input: FixedMedleyEvaluationInputV1 = serde_json::from_str(json)
        .map_err(|error| ValidationError::decode_failed(error.to_string()))?;
    input.validate()?;
    Ok(input)
}

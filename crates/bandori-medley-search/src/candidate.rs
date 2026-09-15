use std::collections::BTreeSet;
use std::sync::OnceLock;

use bandori_medley_model::ResolvedScoreSkillV1;

use crate::exact_score::{ExactScoreFailure, PreparedSong};
use crate::parameters::{TeamParameterFailure, calculate_team_parameters};
use crate::{AreaItemConfigurationV1, MedleySearchInputV1, SearchCardV1};

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct CompactCandidate {
    /// Stable, sorted set identity used by overlap/search joins.
    pub(crate) member_instance_ids: [u32; 5],
    /// Exact best initial layout for each song. Index two is the leader.
    pub(crate) song_member_instance_ids: [[u32; 5]; 3],
    pub(crate) song_scores: [f64; 3],
    pub(crate) leader_instance_ids: [u32; 3],
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum CandidateFailure {
    InvalidCardReference,
    InvalidCharacterCombination,
    InvalidAreaItemReference,
    ArithmeticNonFinite,
    ArithmeticOverflow,
}

pub(crate) fn member_order_for_leader(
    member_instance_ids: [u32; 5],
    leader_instance_id: u32,
) -> Result<[u32; 5], CandidateFailure> {
    let mut others = member_instance_ids
        .into_iter()
        .filter(|instance_id| *instance_id != leader_instance_id)
        .collect::<Vec<_>>();
    if others.len() != 4 {
        return Err(CandidateFailure::InvalidCardReference);
    }
    Ok([
        others.remove(0),
        others.remove(0),
        leader_instance_id,
        others.remove(0),
        others.remove(0),
    ])
}

fn initial_member_layouts() -> &'static [[usize; 5]] {
    static LAYOUTS: OnceLock<Vec<[usize; 5]>> = OnceLock::new();
    LAYOUTS
        .get_or_init(|| {
            fn visit(
                depth: usize,
                layout: &mut [usize; 5],
                used: &mut [bool; 5],
                result: &mut Vec<[usize; 5]>,
            ) {
                if depth == 5 {
                    result.push(*layout);
                    return;
                }
                for member in 0..5 {
                    if used[member] {
                        continue;
                    }
                    used[member] = true;
                    layout[depth] = member;
                    visit(depth + 1, layout, used, result);
                    used[member] = false;
                }
            }

            let mut result = Vec::with_capacity(120);
            visit(0, &mut [0; 5], &mut [false; 5], &mut result);
            assert_eq!(result.len(), 120);
            result
        })
        .as_slice()
}

fn resolve_context_skills(cards: [&SearchCardV1; 5]) -> [ResolvedScoreSkillV1; 5] {
    let is_same_band = cards.iter().all(|card| card.band_id == cards[0].band_id);
    let is_same_attribute = cards
        .iter()
        .all(|card| card.attribute == cards[0].attribute);
    cards.map(|card| match (is_same_band, is_same_attribute) {
        (false, false) => card.skill_contexts.mixed,
        (true, false) => card.skill_contexts.same_band,
        (false, true) => card.skill_contexts.same_attribute,
        (true, true) => card.skill_contexts.same_band_and_attribute,
    })
}

fn map_parameter_failure(failure: TeamParameterFailure) -> CandidateFailure {
    match failure {
        TeamParameterFailure::CardReferenceMissing { .. } => CandidateFailure::InvalidCardReference,
        TeamParameterFailure::AreaItemReferenceMissing { .. } => {
            CandidateFailure::InvalidAreaItemReference
        }
        TeamParameterFailure::ArithmeticNonFinite => CandidateFailure::ArithmeticNonFinite,
    }
}

fn map_score_failure(failure: ExactScoreFailure) -> CandidateFailure {
    match failure {
        ExactScoreFailure::InvalidSong => CandidateFailure::InvalidCardReference,
        ExactScoreFailure::ArithmeticNonFinite => CandidateFailure::ArithmeticNonFinite,
        ExactScoreFailure::ArithmeticOverflow => CandidateFailure::ArithmeticOverflow,
    }
}

pub(crate) fn evaluate_candidate(
    input: &MedleySearchInputV1,
    configuration: &AreaItemConfigurationV1,
    songs: &[PreparedSong<'_>; 3],
    mut member_instance_ids: [u32; 5],
) -> Result<CompactCandidate, CandidateFailure> {
    member_instance_ids.sort_unstable();
    let mut cards = Vec::with_capacity(5);
    let mut instance_ids = BTreeSet::new();
    let mut character_ids = BTreeSet::new();
    for instance_id in member_instance_ids {
        let card = input
            .cards
            .get(instance_id as usize)
            .filter(|card| card.instance_id == instance_id)
            .ok_or(CandidateFailure::InvalidCardReference)?;
        if card.is_excluded || !instance_ids.insert(instance_id) {
            return Err(CandidateFailure::InvalidCardReference);
        }
        if !character_ids.insert(card.character_id) {
            return Err(CandidateFailure::InvalidCharacterCombination);
        }
        cards.push(card);
    }
    let cards: [&SearchCardV1; 5] = cards
        .try_into()
        .map_err(|_| CandidateFailure::InvalidCardReference)?;
    let skills = resolve_context_skills(cards);

    // Unlike the upstream 5-leader shortcut, the real game shuffle makes all
    // original slots observable. Enumerate the 5! initial layouts exactly. The
    // scorer itself uses the 5x5 path-weight matrix, so this does not expand to
    // 120*1024 RNG simulations.
    let mut layouts = Vec::<([usize; 5], f64)>::with_capacity(120);
    let mut ordered_members = Vec::<[u32; 5]>::with_capacity(120);
    for layout in initial_member_layouts() {
        let members = layout.map(|member| member_instance_ids[member]);
        let parameter =
            calculate_team_parameters(&input.cards, &input.area_items, configuration, members)
                .map_err(map_parameter_failure)?
                .deck_total_parameter;
        layouts.push((*layout, parameter));
        ordered_members.push(members);
    }

    let mut best_scores = [f64::NEG_INFINITY; 3];
    let mut best_member_orders = [[0_u32; 5]; 3];
    let mut best_leaders = [0_u32; 3];

    // Layout order is lexicographic, so score ties retain a stable source order.
    for (song_slot, song) in songs.iter().enumerate() {
        let scores = song
            .score_layouts(skills, &layouts)
            .map_err(map_score_failure)?;
        let mut best_layout_index = 0;
        for layout_index in 1..scores.len() {
            if scores[layout_index] > scores[best_layout_index] {
                best_layout_index = layout_index;
            }
        }
        let members = ordered_members[best_layout_index];
        best_scores[song_slot] = scores[best_layout_index];
        best_member_orders[song_slot] = members;
        best_leaders[song_slot] = members[2];
    }

    Ok(CompactCandidate {
        member_instance_ids,
        song_member_instance_ids: best_member_orders,
        song_scores: best_scores,
        leader_instance_ids: best_leaders,
    })
}

pub(crate) fn candidates_overlap(left: &CompactCandidate, right: &CompactCandidate) -> bool {
    left.member_instance_ids
        .iter()
        .any(|instance_id| right.member_instance_ids.contains(instance_id))
}

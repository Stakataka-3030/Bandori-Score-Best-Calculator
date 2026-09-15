import fs from "node:fs";

const path = "crates/bandori-medley-search/src/exact_score.rs";
let source = fs.readFileSync(path, "utf8");

if (!source.includes("SKILL_TRIGGER_GUARD_SECONDS")) {
  source = source.replace(
    "SKILL_SLOT_TRIGGER_WEIGHTS, SkillBehaviorV1, weighted_skill_orders,",
    "SKILL_SLOT_TRIGGER_WEIGHTS, SKILL_TRIGGER_GUARD_SECONDS, SkillBehaviorV1, weighted_skill_orders,",
  );
}

const marker = `    /// Enumerate the 96 reachable weighted first-five orders for one already
    /// ordered team. The sixth trigger repeats \`leader\`.
`;
if (!source.includes(marker)) throw new Error("exact scorer insertion marker missing");

const helpers = `    fn can_any_order_shift(&self, skills: &[ResolvedScoreSkillV1; 5]) -> bool {
        let maximum_duration = skills
            .iter()
            .map(|skill| skill.duration_seconds)
            .fold(0.0_f64, f64::max);
        (1..6).any(|index| {
            self.trigger_times[index] + 1e-9
                < self.trigger_times[index - 1]
                    + maximum_duration
                    + SKILL_TRIGGER_GUARD_SECONDS
        })
    }

    fn scheduled_start_times(
        &self,
        skills: &[ResolvedScoreSkillV1; 5],
        order: [usize; 5],
        leader: usize,
    ) -> Result<[f64; 6], ExactScoreFailure> {
        if leader >= 5 || order.into_iter().any(|member| member >= 5) {
            return Err(ExactScoreFailure::InvalidSong);
        }
        let members = [order[0], order[1], order[2], order[3], order[4], leader];
        let mut starts = [0.0_f64; 6];
        for activation in 0..6 {
            let nominal = self.trigger_times[activation];
            let actual = if activation == 0 {
                nominal
            } else {
                nominal.max(
                    starts[activation - 1]
                        + skills[members[activation - 1]].duration_seconds
                        + SKILL_TRIGGER_GUARD_SECONDS,
                )
            };
            if !actual.is_finite() {
                return Err(ExactScoreFailure::ArithmeticNonFinite);
            }
            starts[activation] = actual;
        }
        Ok(starts)
    }

    fn scheduled_contribution(
        &self,
        base_scores: &[u32],
        skill: ResolvedScoreSkillV1,
        activation_index: usize,
        start_time: f64,
    ) -> Result<i128, ExactScoreFailure> {
        let nominal = self.trigger_times[activation_index];
        let start = if start_time.to_bits() == nominal.to_bits() {
            self.window_starts[activation_index]
        } else {
            self.song
                .notes
                .partition_point(|note| note.time_seconds <= start_time)
        };
        let end_time = start_time + skill.duration_seconds;
        if !end_time.is_finite() {
            return Err(ExactScoreFailure::ArithmeticNonFinite);
        }
        let end = self
            .song
            .notes
            .partition_point(|note| note.time_seconds <= end_time);
        if start >= end {
            return Ok(0);
        }

        let mut contribution = 0_i128;
        for (group_index, group) in self.combo_groups.iter().enumerate() {
            let first = start.max(group.start);
            let last = end.min(group.end);
            if first >= last {
                continue;
            }
            let base = *base_scores
                .get(group_index)
                .ok_or(ExactScoreFailure::ArithmeticOverflow)?;
            for note_index in first..last {
                let covered_note_count = note_index - start + 1;
                let multiplier = skill_multiplier(
                    skill,
                    covered_note_count,
                    self.perfect_rate,
                    self.judgment_multiplier,
                );
                let with_skill = floor_to_u32(f64::from(base) * multiplier)?;
                contribution = contribution
                    .checked_add(i128::from(with_skill) - i128::from(base))
                    .ok_or(ExactScoreFailure::ArithmeticOverflow)?;
            }
        }
        Ok(contribution)
    }

    fn score_scheduled_order(
        &self,
        skills: &[ResolvedScoreSkillV1; 5],
        base_scores: &[u32],
        base_total: i128,
        order: [usize; 5],
        leader: usize,
        contribution_cache: &mut BTreeMap<(usize, usize, u64), i128>,
    ) -> Result<i128, ExactScoreFailure> {
        let starts = self.scheduled_start_times(skills, order, leader)?;
        let members = [order[0], order[1], order[2], order[3], order[4], leader];
        let mut score = base_total;
        for activation in 0..6 {
            let member = members[activation];
            let key = (member, activation, starts[activation].to_bits());
            let contribution = if let Some(value) = contribution_cache.get(&key) {
                *value
            } else {
                let value = self.scheduled_contribution(
                    base_scores,
                    skills[member],
                    activation,
                    starts[activation],
                )?;
                contribution_cache.insert(key, value);
                value
            };
            score = score
                .checked_add(contribution)
                .ok_or(ExactScoreFailure::ArithmeticOverflow)?;
        }
        Ok(score)
    }

    fn score_range_scheduled(
        &self,
        skills: [ResolvedScoreSkillV1; 5],
        parameter: f64,
        leader: usize,
    ) -> Result<PreparedSongScoreRange, ExactScoreFailure> {
        let base_scores = self.base_scores(parameter)?;
        let base_total: i128 = self
            .combo_groups
            .iter()
            .zip(&base_scores)
            .map(|(group, score)| i128::from(*score) * (group.end - group.start) as i128)
            .sum();
        let mut contribution_cache = BTreeMap::new();
        let mut minimum_score = i128::MAX;
        let mut maximum_score = i128::MIN;
        let mut best_order = [0, 1, 2, 3, 4];
        let mut maximum_score_order_count = 0_u16;
        let mut weighted_total = 0_i128;
        #[cfg(test)]
        let mut order_scores = Vec::with_capacity(weighted_skill_orders().len());

        for weighted_order in weighted_skill_orders() {
            let order = weighted_order.permutation;
            let score = self.score_scheduled_order(
                &skills,
                &base_scores,
                base_total,
                order,
                leader,
                &mut contribution_cache,
            )?;
            weighted_total = weighted_total
                .checked_add(
                    score
                        .checked_mul(i128::from(weighted_order.weight))
                        .ok_or(ExactScoreFailure::ArithmeticOverflow)?,
                )
                .ok_or(ExactScoreFailure::ArithmeticOverflow)?;
            minimum_score = minimum_score.min(score);
            if score > maximum_score {
                maximum_score = score;
                best_order = order;
                maximum_score_order_count = weighted_order.weight;
            } else if score == maximum_score {
                maximum_score_order_count = maximum_score_order_count
                    .checked_add(weighted_order.weight)
                    .ok_or(ExactScoreFailure::ArithmeticOverflow)?;
            }
            #[cfg(test)]
            order_scores.push(score);
        }

        let average_score =
            (weighted_total as f64 / f64::from(SKILL_SHUFFLE_PATH_COUNT)).floor();
        if !average_score.is_finite() || average_score < 0.0 {
            return Err(ExactScoreFailure::ArithmeticNonFinite);
        }
        Ok(PreparedSongScoreRange {
            minimum_score,
            average_score,
            maximum_score,
            best_order,
            maximum_score_order_count,
            #[cfg(test)]
            order_scores,
        })
    }

    fn score_layouts_scheduled(
        &self,
        skills: [ResolvedScoreSkillV1; 5],
        layouts: &[([usize; 5], f64)],
    ) -> Result<Vec<f64>, ExactScoreFailure> {
        type ParameterState = (i128, Vec<u32>, BTreeMap<(usize, usize, u64), i128>);
        let mut parameter_cache = BTreeMap::<u64, ParameterState>::new();
        let mut result = Vec::with_capacity(layouts.len());

        for &(layout, parameter) in layouts {
            let mut seen = [false; 5];
            for member in layout {
                if member >= 5 || seen[member] {
                    return Err(ExactScoreFailure::InvalidSong);
                }
                seen[member] = true;
            }
            let key = parameter.to_bits();
            if let std::collections::btree_map::Entry::Vacant(entry) = parameter_cache.entry(key) {
                let base_scores = self.base_scores(parameter)?;
                let base_total: i128 = self
                    .combo_groups
                    .iter()
                    .zip(&base_scores)
                    .map(|(group, score)| i128::from(*score) * (group.end - group.start) as i128)
                    .sum();
                entry.insert((base_total, base_scores, BTreeMap::new()));
            }
            let (base_total, base_scores, contribution_cache) = parameter_cache
                .get_mut(&key)
                .ok_or(ExactScoreFailure::ArithmeticNonFinite)?;
            let leader = layout[2];
            let mut weighted_total = 0_i128;
            for weighted_order in weighted_skill_orders() {
                let order = weighted_order.permutation.map(|original_slot| layout[original_slot]);
                let score = self.score_scheduled_order(
                    &skills,
                    base_scores,
                    *base_total,
                    order,
                    leader,
                    contribution_cache,
                )?;
                weighted_total = weighted_total
                    .checked_add(
                        score
                            .checked_mul(i128::from(weighted_order.weight))
                            .ok_or(ExactScoreFailure::ArithmeticOverflow)?,
                    )
                    .ok_or(ExactScoreFailure::ArithmeticOverflow)?;
            }
            let average =
                (weighted_total as f64 / f64::from(SKILL_SHUFFLE_PATH_COUNT)).floor();
            if !average.is_finite() || average < 0.0 {
                return Err(ExactScoreFailure::ArithmeticNonFinite);
            }
            result.push(average);
        }
        Ok(result)
    }

`;
source = source.replace(marker, helpers + marker);

source = source.replace(
`        if leader >= 5 {
            return Err(ExactScoreFailure::InvalidSong);
        }
        let prepared_skills = self.prepare_skills(skills)?;`,
`        if leader >= 5 {
            return Err(ExactScoreFailure::InvalidSong);
        }
        if self.can_any_order_shift(&skills) {
            return self.score_range_scheduled(skills, parameter, leader);
        }
        let prepared_skills = self.prepare_skills(skills)?;`,
);

source = source.replace(
`    ) -> Result<Vec<f64>, ExactScoreFailure> {
        let prepared_skills = self.prepare_skills(skills)?;
        let mut cache = BTreeMap::<u64, (i128, [[i128; 5]; 6])>::new();`,
`    ) -> Result<Vec<f64>, ExactScoreFailure> {
        if self.can_any_order_shift(&skills) {
            return self.score_layouts_scheduled(skills, layouts);
        }
        let prepared_skills = self.prepare_skills(skills)?;
        let mut cache = BTreeMap::<u64, (i128, [[i128; 5]; 6])>::new();`,
);

fs.writeFileSync(path, source);

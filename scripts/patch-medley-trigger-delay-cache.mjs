import fs from "node:fs";

const path = "crates/bandori-medley-search/src/exact_score.rs";
let source = fs.readFileSync(path, "utf8");

const oldType = `        type ParameterState = (i128, Vec<u32>, BTreeMap<(usize, usize, u64), i128>);`;
const newType = `        type ParameterState = (
            i128,
            Vec<u32>,
            BTreeMap<(usize, usize, u64), i128>,
            BTreeMap<([usize; 5], usize), i128>,
        );`;
if (!source.includes(oldType)) throw new Error("scheduled layout parameter-state anchor missing");
source = source.replace(oldType, newType);

const oldInsert = `                entry.insert((base_total, base_scores, BTreeMap::new()));`;
const newInsert = `                entry.insert((
                    base_total,
                    base_scores,
                    BTreeMap::new(),
                    BTreeMap::new(),
                ));`;
if (!source.includes(oldInsert)) throw new Error("scheduled layout cache insertion anchor missing");
source = source.replace(oldInsert, newInsert);

const oldGet = `            let (base_total, base_scores, contribution_cache) = parameter_cache
                .get_mut(&key)
                .ok_or(ExactScoreFailure::ArithmeticNonFinite)?;`;
const newGet = `            let (base_total, base_scores, contribution_cache, sequence_cache) = parameter_cache
                .get_mut(&key)
                .ok_or(ExactScoreFailure::ArithmeticNonFinite)?;`;
if (!source.includes(oldGet)) throw new Error("scheduled layout cache retrieval anchor missing");
source = source.replace(oldGet, newGet);

const oldScore = `                let score = self.score_scheduled_order(
                    &skills,
                    base_scores,
                    *base_total,
                    order,
                    leader,
                    contribution_cache,
                )?;`;
const newScore = `                let sequence_key = (order, leader);
                let score = if let Some(score) = sequence_cache.get(&sequence_key) {
                    *score
                } else {
                    let score = self.score_scheduled_order(
                        &skills,
                        base_scores,
                        *base_total,
                        order,
                        leader,
                        contribution_cache,
                    )?;
                    sequence_cache.insert(sequence_key, score);
                    score
                };`;
// The same expression appears once in score_range_scheduled and once in
// score_layouts_scheduled. Only replace the final occurrence, which belongs to
// the layout loop.
const index = source.lastIndexOf(oldScore);
if (index < 0) throw new Error("scheduled layout score anchor missing");
source = source.slice(0, index) + newScore + source.slice(index + oldScore.length);

fs.writeFileSync(path, source);

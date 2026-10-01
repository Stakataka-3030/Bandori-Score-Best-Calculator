# Bandori medley reference scorer

`bandori-medley-reference` is the deliberately direct scorer used to check the optimized production scorer. It accepts the fixed-team model from `bandori-medley-model`; it does not generate teams or prune candidates.

For each song, it evaluates the 96 reachable orders of the first five skill activations with their weights from 1024 equally likely shuffle paths, repeats the selected leader at the sixth activation, and scans the chart for each order. This is slower than the production reduction, but the calculation is easy to inspect and returns an IEEE-754 trace with the base coefficient, integer base note scores, per-order scores, combo offsets and binary64 words.

PERFECT rate enters the deterministic judgment and skill multipliers before the two note-score floors. The scorer does not build histories of individual PERFECT and GREAT outcomes. Integer weighted order sums are exact; the weighted numerator is converted to binary64 and divided by the 1024 shuffle paths. Each song mean is floored before the medley total is formed.

The reference contains no roster enumeration, ranking, upper bounds, memory budget, timeout or partial-result behavior. The local [architecture and upstream map](../../docs/architecture.md) describes the adopted shuffle model. The [reference implementation](src/scoring.rs) and its tests define the current scoring behavior; runnable checks are in the [development guide](../../docs/development.md).

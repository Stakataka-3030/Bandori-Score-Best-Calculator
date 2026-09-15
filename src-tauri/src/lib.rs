use std::time::{Duration, Instant};

use bandori_medley_search::{
    MedleySearchOutcomeV1, MedleySearchSolutionV1, SearchControl, SearchStopReason,
    decode_medley_search_input_json, hydrate_medley_search_solutions, search_medley,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MedleySearchRequest {
    input_json: String,
    max_duration_ms: u64,
    memory_budget_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MedleySearchRunResult<'a> {
    outcome: &'a MedleySearchOutcomeV1,
    hydration: &'a bandori_medley_search::MedleySearchHydrationV1,
}

fn discovered(outcome: &MedleySearchOutcomeV1) -> &[MedleySearchSolutionV1] {
    match outcome {
        MedleySearchOutcomeV1::Exact { discovered, .. }
        | MedleySearchOutcomeV1::Incomplete { discovered, .. } => discovered,
    }
}

fn run_medley_search_blocking(request: MedleySearchRequest) -> Result<String, String> {
    let input = decode_medley_search_input_json(&request.input_json)
        .map_err(|error| format!("Medley input invalid: {error:?}"))?;
    let memory_budget_bytes = usize::try_from(request.memory_budget_bytes)
        .unwrap_or(usize::MAX)
        .max(16 * 1024);
    let duration = Duration::from_millis(request.max_duration_ms.clamp(1_000, 3_600_000));
    let started_at = Instant::now();
    let mut stop_check = || {
        (started_at.elapsed() >= duration).then_some(SearchStopReason::TimedOut)
    };
    let mut control = SearchControl::new(memory_budget_bytes, &mut stop_check);
    let outcome = search_medley(&input, &mut control);
    let hydration = hydrate_medley_search_solutions(&input, discovered(&outcome))
        .map_err(|reason| format!("Medley result hydration failed: {reason:?}"))?;
    serde_json::to_string(&MedleySearchRunResult {
        outcome: &outcome,
        hydration: &hydration,
    })
    .map_err(|error| format!("Medley result serialization failed: {error}"))
}

#[tauri::command]
async fn run_medley_search(request: MedleySearchRequest) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || run_medley_search_blocking(request))
        .await
        .map_err(|error| format!("Medley native worker failed: {error}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![run_medley_search])
        .run(tauri::generate_context!())
        .expect("error while running Bandori Score Best Calculator");
}

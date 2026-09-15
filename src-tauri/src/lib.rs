use std::collections::HashMap;
use std::sync::{
    Arc, Mutex, OnceLock,
    atomic::{AtomicBool, Ordering},
};
use std::time::{Duration, Instant};

use bandori_medley_search::{
    MedleySearchOutcomeV1, MedleySearchSolutionV1, SearchControl, SearchStopReason,
    decode_medley_search_input_json, hydrate_medley_search_solutions, search_medley,
};
use serde::{Deserialize, Serialize};

static MEDLEY_CANCEL_FLAGS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();

fn cancel_flags() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    MEDLEY_CANCEL_FLAGS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MedleySearchRequest {
    request_id: String,
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

fn run_medley_search_blocking(
    request: MedleySearchRequest,
    cancelled: Arc<AtomicBool>,
) -> Result<String, String> {
    let input = decode_medley_search_input_json(&request.input_json)
        .map_err(|error| format!("Medley input invalid: {error:?}"))?;
    let memory_budget_bytes = usize::try_from(request.memory_budget_bytes)
        .unwrap_or(usize::MAX)
        .max(16 * 1024);
    let duration = Duration::from_millis(request.max_duration_ms.clamp(1_000, 3_600_000));
    let started_at = Instant::now();
    let mut stop_check = || {
        if cancelled.load(Ordering::Relaxed) {
            Some(SearchStopReason::Cancelled)
        } else if started_at.elapsed() >= duration {
            Some(SearchStopReason::TimedOut)
        } else {
            None
        }
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
    if request.request_id.trim().is_empty() {
        return Err("Medley requestId must not be empty".to_owned());
    }
    let request_id = request.request_id.clone();
    let cancelled = Arc::new(AtomicBool::new(false));
    {
        let mut flags = cancel_flags()
            .lock()
            .map_err(|_| "Medley cancellation state is poisoned".to_owned())?;
        if flags.insert(request_id.clone(), Arc::clone(&cancelled)).is_some() {
            return Err("Medley requestId is already running".to_owned());
        }
    }

    let result = tauri::async_runtime::spawn_blocking(move || {
        run_medley_search_blocking(request, cancelled)
    })
    .await
    .map_err(|error| format!("Medley native worker failed: {error}"))?;

    if let Ok(mut flags) = cancel_flags().lock() {
        flags.remove(&request_id);
    }
    result
}

#[tauri::command]
fn cancel_medley_search(request_id: String) -> Result<bool, String> {
    let flags = cancel_flags()
        .lock()
        .map_err(|_| "Medley cancellation state is poisoned".to_owned())?;
    let Some(flag) = flags.get(&request_id) else {
        return Ok(false);
    };
    flag.store(true, Ordering::Relaxed);
    Ok(true)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![run_medley_search, cancel_medley_search])
        .run(tauri::generate_context!())
        .expect("error while running Bandori Score Best Calculator");
}

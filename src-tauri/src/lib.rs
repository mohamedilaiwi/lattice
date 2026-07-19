//! Tauri shell for Lattice: thin IPC wrappers around `lattice-core`.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use lattice_core::store::{BlockCacheEntry, LatticeStore};
use lattice_core::vault::{NoteFile, TreeEntry, Vault, VaultInfo, WriteOutcome};
use lattice_core::watcher::VaultWatcher;
use tauri::{AppHandle, Emitter, Manager, State};

const FS_EVENT: &str = "vault://fs-event";

#[derive(Default)]
struct AppState {
    vault: Mutex<Option<Vault>>,
    watcher: Mutex<Option<VaultWatcher>>,
}

fn with_vault<T>(
    state: &State<'_, AppState>,
    operation: impl FnOnce(&Vault) -> Result<T, String>,
) -> Result<T, String> {
    let guard = state.vault.lock().map_err(|error| error.to_string())?;
    let vault = guard.as_ref().ok_or_else(|| "no vault open".to_string())?;
    operation(vault)
}

fn stringify<T, E: std::fmt::Display>(result: Result<T, E>) -> Result<T, String> {
    result.map_err(|error| error.to_string())
}

fn last_vault_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = stringify(app.path().app_config_dir())?;
    stringify(fs::create_dir_all(&dir))?;
    Ok(dir.join("last-vault"))
}

fn attach_vault(
    app: &AppHandle,
    state: &State<'_, AppState>,
    vault: Vault,
) -> Result<VaultInfo, String> {
    let info = vault.info();

    let emitter = app.clone();
    let watcher = stringify(VaultWatcher::start(vault.root(), move |event| {
        let _ = emitter.emit(FS_EVENT, &event);
    }))?;

    *state.watcher.lock().map_err(|error| error.to_string())? = Some(watcher);
    *state.vault.lock().map_err(|error| error.to_string())? = Some(vault);

    let last = last_vault_file(app)?;
    stringify(fs::write(last, &info.path))?;
    Ok(info)
}

#[tauri::command]
fn get_last_vault(app: AppHandle) -> Result<Option<String>, String> {
    let file = last_vault_file(&app)?;
    match fs::read_to_string(file) {
        Ok(path) if Path::new(path.trim()).is_dir() => Ok(Some(path.trim().to_string())),
        _ => Ok(None),
    }
}

#[tauri::command]
fn open_vault(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<VaultInfo, String> {
    let vault = stringify(Vault::open(Path::new(&path)))?;
    attach_vault(&app, &state, vault)
}

#[tauri::command]
fn create_vault(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<VaultInfo, String> {
    let vault = stringify(Vault::create(Path::new(&path)))?;
    attach_vault(&app, &state, vault)
}

#[tauri::command]
fn list_tree(state: State<'_, AppState>) -> Result<Vec<TreeEntry>, String> {
    with_vault(&state, |vault| stringify(vault.list_tree()))
}

#[tauri::command]
fn read_note(state: State<'_, AppState>, rel_path: String) -> Result<NoteFile, String> {
    with_vault(&state, |vault| stringify(vault.read_note(&rel_path)))
}

#[tauri::command]
fn write_note(
    state: State<'_, AppState>,
    rel_path: String,
    content: String,
    base_hash: Option<String>,
) -> Result<WriteOutcome, String> {
    with_vault(&state, |vault| {
        stringify(vault.write_note(&rel_path, &content, base_hash.as_deref()))
    })
}

#[tauri::command]
fn create_note(state: State<'_, AppState>, rel_path: String) -> Result<(), String> {
    with_vault(&state, |vault| stringify(vault.create_note(&rel_path)))
}

#[tauri::command]
fn create_folder(state: State<'_, AppState>, rel_path: String) -> Result<(), String> {
    with_vault(&state, |vault| stringify(vault.create_folder(&rel_path)))
}

#[tauri::command]
fn rename_entry(
    state: State<'_, AppState>,
    from_rel_path: String,
    to_rel_path: String,
) -> Result<(), String> {
    with_vault(&state, |vault| {
        stringify(vault.rename_entry(&from_rel_path, &to_rel_path))
    })
}

#[tauri::command]
fn read_block_cache(
    state: State<'_, AppState>,
    rel_path: String,
) -> Result<Option<BlockCacheEntry>, String> {
    with_vault(&state, |vault| {
        stringify(LatticeStore::new(vault).read_block_cache(&rel_path))
    })
}

#[tauri::command]
fn write_block_cache(
    state: State<'_, AppState>,
    rel_path: String,
    source_hash: String,
    blocks_json: String,
) -> Result<(), String> {
    with_vault(&state, |vault| {
        stringify(LatticeStore::new(vault).write_block_cache(&rel_path, &source_hash, &blocks_json))
    })
}

#[tauri::command]
fn read_settings(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    with_vault(&state, |vault| {
        stringify(LatticeStore::new(vault).read_settings())
    })
}

#[tauri::command]
fn write_settings(state: State<'_, AppState>, settings: serde_json::Value) -> Result<(), String> {
    with_vault(&state, |vault| {
        stringify(LatticeStore::new(vault).write_settings(&settings))
    })
}

#[tauri::command]
fn load_workspace_state(state: State<'_, AppState>) -> Result<Option<String>, String> {
    with_vault(&state, |vault| {
        stringify(LatticeStore::new(vault).load_state("layout"))
    })
}

#[tauri::command]
fn save_workspace_state(state: State<'_, AppState>, json: String) -> Result<(), String> {
    with_vault(&state, |vault| {
        stringify(LatticeStore::new(vault).save_state("layout", &json))
    })
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            get_last_vault,
            open_vault,
            create_vault,
            list_tree,
            read_note,
            write_note,
            create_note,
            create_folder,
            rename_entry,
            read_block_cache,
            write_block_cache,
            read_settings,
            write_settings,
            load_workspace_state,
            save_workspace_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Lattice");
}

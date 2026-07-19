//! File watching for external note changes. Events are mapped to
//! vault-relative paths and Lattice-internal files are filtered out; the
//! Tauri shell forwards the rest to the frontend, which decides between
//! reload and review (never a silent overwrite).

use std::path::{Path, PathBuf};

use notify::event::{EventKind, ModifyKind};
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;

use crate::vault::{is_internal_path, to_rel_path};
use crate::CoreResult;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsEvent {
    pub kind: FsEventKind,
    pub rel_paths: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FsEventKind {
    Created,
    Modified,
    Removed,
    Renamed,
}

pub struct VaultWatcher {
    // Held so the watcher thread stays alive for the vault's lifetime.
    _watcher: RecommendedWatcher,
}

impl VaultWatcher {
    pub fn start(root: &Path, on_event: impl Fn(FsEvent) + Send + 'static) -> CoreResult<Self> {
        let root_buf: PathBuf = root.to_path_buf();
        let mut watcher =
            notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
                let Ok(event) = result else {
                    return;
                };
                let Some(kind) = map_kind(&event.kind) else {
                    return;
                };
                let rel_paths: Vec<String> = event
                    .paths
                    .iter()
                    .filter(|path| !is_internal_path(&root_buf, path))
                    .filter_map(|path| to_rel_path(&root_buf, path))
                    .collect();
                if rel_paths.is_empty() {
                    return;
                }
                on_event(FsEvent { kind, rel_paths });
            })?;
        watcher.watch(root, RecursiveMode::Recursive)?;
        Ok(Self { _watcher: watcher })
    }
}

fn map_kind(kind: &EventKind) -> Option<FsEventKind> {
    match kind {
        EventKind::Create(_) => Some(FsEventKind::Created),
        EventKind::Remove(_) => Some(FsEventKind::Removed),
        EventKind::Modify(ModifyKind::Name(_)) => Some(FsEventKind::Renamed),
        EventKind::Modify(_) => Some(FsEventKind::Modified),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use std::sync::mpsc;
    use std::time::Duration;

    use super::*;
    use crate::vault::Vault;

    #[test]
    fn reports_external_note_changes_and_hides_internal_ones() {
        let dir = tempfile::tempdir().unwrap();
        let vault = Vault::open(dir.path()).unwrap();
        let (sender, receiver) = mpsc::channel::<FsEvent>();
        let _watcher = VaultWatcher::start(vault.root(), move |event| {
            let _ = sender.send(event);
        })
        .unwrap();

        // Give the watcher a moment to register before writing.
        std::thread::sleep(Duration::from_millis(250));
        std::fs::write(dir.path().join("Note.md"), "# hello").unwrap();
        std::fs::write(dir.path().join(".lattice").join("settings.json"), "{}").unwrap();

        let mut saw_note = false;
        while let Ok(event) = receiver.recv_timeout(Duration::from_secs(5)) {
            assert!(
                event
                    .rel_paths
                    .iter()
                    .all(|path| !path.starts_with(".lattice")),
                "internal paths must be filtered: {:?}",
                event.rel_paths
            );
            if event.rel_paths.iter().any(|path| path == "Note.md") {
                saw_note = true;
                break;
            }
        }
        assert!(saw_note, "expected a watcher event for Note.md");
    }
}

//! Vault access: tree listing, note reads, atomic conflict-checked writes.
//!
//! Invariants (see CLAUDE.md): Markdown files are canonical user content;
//! everything app-generated lives under `<vault>/.lattice/`; saves are atomic
//! and carry the expected base hash so external changes are detected, never
//! clobbered.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::{sha256_hex, CoreError, CoreResult};

pub const LATTICE_DIR: &str = ".lattice";
const TMP_SUFFIX: &str = ".lattice-tmp";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultInfo {
    pub path: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeEntry {
    pub name: String,
    pub rel_path: String,
    pub kind: EntryKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<TreeEntry>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    Dir,
    Note,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteFile {
    pub content: String,
    pub hash: String,
    /// Milliseconds since the Unix epoch of the file's last modification.
    pub modified_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    tag = "status",
    rename_all = "lowercase",
    rename_all_fields = "camelCase"
)]
pub enum WriteOutcome {
    Saved {
        hash: String,
    },
    Conflict {
        disk_hash: String,
        disk_content: String,
    },
}

#[derive(Debug, Clone)]
pub struct Vault {
    root: PathBuf,
}

impl Vault {
    /// Open an existing folder as a vault, creating `.lattice/` state dirs.
    pub fn open(path: &Path) -> CoreResult<Self> {
        if !path.is_dir() {
            return Err(CoreError::Invalid(format!(
                "not a folder: {}",
                path.display()
            )));
        }
        let vault = Self {
            root: path.to_path_buf(),
        };
        vault.ensure_state_dirs()?;
        Ok(vault)
    }

    /// Create a vault in an empty or not-yet-existing folder.
    pub fn create(path: &Path) -> CoreResult<Self> {
        if path.exists() {
            let occupied = fs::read_dir(path)?.next().is_some();
            if occupied {
                return Err(CoreError::Invalid(
                    "the selected folder is not empty; choose an empty folder or open it as an existing vault".into(),
                ));
            }
        } else {
            fs::create_dir_all(path)?;
        }
        Self::open(path)
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn info(&self) -> VaultInfo {
        let name = self
            .root
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| self.root.display().to_string());
        VaultInfo {
            path: self.root.display().to_string(),
            name,
        }
    }

    pub fn lattice_dir(&self) -> PathBuf {
        self.root.join(LATTICE_DIR)
    }

    fn ensure_state_dirs(&self) -> CoreResult<()> {
        fs::create_dir_all(self.lattice_dir().join("blocks"))?;
        fs::create_dir_all(self.lattice_dir().join("hashes"))?;
        Ok(())
    }

    /// Resolve a vault-relative path, rejecting traversal and reserved names.
    pub fn resolve(&self, rel_path: &str) -> CoreResult<PathBuf> {
        if rel_path.is_empty() {
            return Err(CoreError::Invalid("empty path".into()));
        }
        let mut resolved = self.root.clone();
        for segment in rel_path.split('/') {
            if segment.is_empty() || segment == "." || segment == ".." {
                return Err(CoreError::Invalid(format!("invalid path: {rel_path}")));
            }
            if segment.starts_with('.') {
                return Err(CoreError::Invalid(format!(
                    "hidden and reserved names are not allowed: {rel_path}"
                )));
            }
            if segment.contains('\\') {
                return Err(CoreError::Invalid(format!(
                    "use forward slashes in paths: {rel_path}"
                )));
            }
            resolved.push(segment);
        }
        Ok(resolved)
    }

    pub fn list_tree(&self) -> CoreResult<Vec<TreeEntry>> {
        self.list_dir(&self.root, "")
    }

    fn list_dir(&self, dir: &Path, rel_prefix: &str) -> CoreResult<Vec<TreeEntry>> {
        let mut dirs: Vec<TreeEntry> = Vec::new();
        let mut notes: Vec<TreeEntry> = Vec::new();

        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                continue;
            }
            let rel_path = if rel_prefix.is_empty() {
                name.clone()
            } else {
                format!("{rel_prefix}/{name}")
            };
            let file_type = entry.file_type()?;
            if file_type.is_dir() {
                let children = self.list_dir(&entry.path(), &rel_path)?;
                dirs.push(TreeEntry {
                    name,
                    rel_path,
                    kind: EntryKind::Dir,
                    children: Some(children),
                });
            } else if file_type.is_file() && name.to_lowercase().ends_with(".md") {
                notes.push(TreeEntry {
                    name,
                    rel_path,
                    kind: EntryKind::Note,
                    children: None,
                });
            }
        }

        dirs.sort_by_key(|entry| entry.name.to_lowercase());
        notes.sort_by_key(|entry| entry.name.to_lowercase());
        dirs.extend(notes);
        Ok(dirs)
    }

    pub fn read_note(&self, rel_path: &str) -> CoreResult<NoteFile> {
        let path = self.resolve(rel_path)?;
        let content = fs::read_to_string(&path)?;
        let hash = sha256_hex(&content);
        let modified_ms = fs::metadata(&path)
            .and_then(|meta| meta.modified())
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis() as u64);
        Ok(NoteFile {
            content,
            hash,
            modified_ms,
        })
    }

    /// Atomically write a note. When `base_hash` no longer matches the file on
    /// disk the write is refused and the disk version returned instead.
    pub fn write_note(
        &self,
        rel_path: &str,
        content: &str,
        base_hash: Option<&str>,
    ) -> CoreResult<WriteOutcome> {
        let path = self.resolve(rel_path)?;

        if path.exists() {
            let disk_content = fs::read_to_string(&path)?;
            let disk_hash = sha256_hex(&disk_content);
            let expected = base_hash.unwrap_or("");
            if disk_hash != expected {
                return Ok(WriteOutcome::Conflict {
                    disk_hash,
                    disk_content,
                });
            }
        }

        atomic_write(&path, content)?;
        Ok(WriteOutcome::Saved {
            hash: sha256_hex(content),
        })
    }

    /// Create a note seeded with its H1 title line, derived from the file
    /// name (Obsidian/Notion convention). The title text may diverge from the
    /// file name later; creation is the only point where they are coupled.
    pub fn create_note(&self, rel_path: &str) -> CoreResult<()> {
        if !rel_path.to_lowercase().ends_with(".md") {
            return Err(CoreError::Invalid("notes must end in .md".into()));
        }
        let path = self.resolve(rel_path)?;
        if path.exists() {
            return Err(CoreError::Invalid(format!("already exists: {rel_path}")));
        }
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let stem = rel_path
            .rsplit('/')
            .next()
            .unwrap_or(rel_path)
            .trim_end_matches(".md")
            .trim_end_matches(".MD");
        atomic_write(&path, &format!("# {stem}\n"))?;
        Ok(())
    }

    pub fn create_folder(&self, rel_path: &str) -> CoreResult<()> {
        let path = self.resolve(rel_path)?;
        fs::create_dir_all(&path)?;
        Ok(())
    }

    pub fn rename_entry(&self, from_rel: &str, to_rel: &str) -> CoreResult<()> {
        let from = self.resolve(from_rel)?;
        let to = self.resolve(to_rel)?;
        if !from.exists() {
            return Err(CoreError::Invalid(format!("does not exist: {from_rel}")));
        }
        if to.exists() {
            return Err(CoreError::Invalid(format!("already exists: {to_rel}")));
        }
        if let Some(parent) = to.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::rename(&from, &to)?;
        Ok(())
    }
}

/// Write via a temp file in the same directory, then rename into place, so a
/// crash mid-write can never leave a truncated note.
fn atomic_write(path: &Path, content: &str) -> CoreResult<()> {
    let parent = path
        .parent()
        .ok_or_else(|| CoreError::Invalid(format!("no parent dir: {}", path.display())))?;
    let file_name = path
        .file_name()
        .ok_or_else(|| CoreError::Invalid(format!("no file name: {}", path.display())))?
        .to_string_lossy()
        .into_owned();
    let tmp_path = parent.join(format!(".{file_name}{TMP_SUFFIX}"));

    fs::write(&tmp_path, content)?;
    match fs::rename(&tmp_path, path) {
        Ok(()) => Ok(()),
        Err(first_error) => {
            // Windows refuses to rename over an existing file; replace it.
            if cfg!(windows) && path.exists() {
                fs::remove_file(path)?;
                fs::rename(&tmp_path, path)?;
                Ok(())
            } else {
                let _ = fs::remove_file(&tmp_path);
                Err(first_error.into())
            }
        }
    }
}

/// True when a filesystem path is Lattice-internal (state dir or temp file)
/// and should be invisible to the frontend.
pub fn is_internal_path(root: &Path, path: &Path) -> bool {
    let Ok(rel) = path.strip_prefix(root) else {
        return true;
    };
    rel.components().any(|component| {
        let name = component.as_os_str().to_string_lossy();
        name.starts_with('.') || name.ends_with(TMP_SUFFIX)
    })
}

/// Vault-relative path with forward slashes, for IPC payloads.
pub fn to_rel_path(root: &Path, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(root).ok()?;
    let mut parts: Vec<String> = Vec::new();
    for component in rel.components() {
        parts.push(component.as_os_str().to_string_lossy().into_owned());
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("/"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_vault() -> (tempfile::TempDir, Vault) {
        let dir = tempfile::tempdir().expect("tempdir");
        let vault = Vault::open(dir.path()).expect("open vault");
        (dir, vault)
    }

    #[test]
    fn open_creates_state_dirs() {
        let (_dir, vault) = temp_vault();
        assert!(vault.lattice_dir().join("blocks").is_dir());
        assert!(vault.lattice_dir().join("hashes").is_dir());
    }

    #[test]
    fn create_rejects_non_empty_folders() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("existing.txt"), "hello").unwrap();
        assert!(Vault::create(dir.path()).is_err());
    }

    #[test]
    fn resolve_rejects_traversal_and_hidden_paths() {
        let (_dir, vault) = temp_vault();
        assert!(vault.resolve("../outside.md").is_err());
        assert!(vault.resolve("notes/../../outside.md").is_err());
        assert!(vault.resolve(".lattice/workspace.sqlite").is_err());
        assert!(vault.resolve(".hidden.md").is_err());
        assert!(vault.resolve("").is_err());
        assert!(vault.resolve("notes/ok.md").is_ok());
    }

    #[test]
    fn create_note_seeds_the_title_from_the_file_name() {
        let (_dir, vault) = temp_vault();
        vault.create_note("Chemistry/Deep Dive.md").unwrap();
        let note = vault.read_note("Chemistry/Deep Dive.md").unwrap();
        assert_eq!(note.content, "# Deep Dive\n");
    }

    #[test]
    fn note_round_trip_and_atomic_save() {
        let (_dir, vault) = temp_vault();
        vault.create_note("Physics/Optics.md").unwrap();
        let outcome = vault
            .write_note(
                "Physics/Optics.md",
                "# Optics\n\nBody.\n",
                Some(&sha256_hex("# Optics\n")),
            )
            .unwrap();
        let WriteOutcome::Saved { hash } = outcome else {
            panic!("expected save");
        };
        let note = vault.read_note("Physics/Optics.md").unwrap();
        assert_eq!(note.content, "# Optics\n\nBody.\n");
        assert_eq!(note.hash, hash);
        assert!(note.modified_ms.is_some());
        // No temp files may survive a save.
        assert!(!vault.root().join("Physics/.Optics.md.lattice-tmp").exists());
    }

    #[test]
    fn stale_base_hash_is_a_conflict_not_an_overwrite() {
        let (_dir, vault) = temp_vault();
        vault.create_note("a.md").unwrap();
        vault
            .write_note("a.md", "mine", Some(&sha256_hex("# a\n")))
            .unwrap();
        // Simulate an external editor changing the file.
        fs::write(vault.root().join("a.md"), "external").unwrap();

        let outcome = vault
            .write_note("a.md", "mine v2", Some(&sha256_hex("mine")))
            .unwrap();
        match outcome {
            WriteOutcome::Conflict {
                disk_content,
                disk_hash,
            } => {
                assert_eq!(disk_content, "external");
                assert_eq!(disk_hash, sha256_hex("external"));
            }
            WriteOutcome::Saved { .. } => panic!("stale write must not succeed"),
        }
        // The file still holds the external version.
        assert_eq!(vault.read_note("a.md").unwrap().content, "external");
    }

    #[test]
    fn matching_base_hash_overwrites_intentionally() {
        let (_dir, vault) = temp_vault();
        vault.create_note("a.md").unwrap();
        fs::write(vault.root().join("a.md"), "external").unwrap();
        // "Keep my version" resolves the conflict by writing against the
        // external version's hash.
        let outcome = vault
            .write_note("a.md", "mine", Some(&sha256_hex("external")))
            .unwrap();
        assert!(matches!(outcome, WriteOutcome::Saved { .. }));
        assert_eq!(vault.read_note("a.md").unwrap().content, "mine");
    }

    #[test]
    fn tree_lists_dirs_first_and_hides_internal_state() {
        let (_dir, vault) = temp_vault();
        vault.create_note("Zeta.md").unwrap();
        vault.create_note("Alpha.md").unwrap();
        vault.create_note("Chemistry/Photoresist.md").unwrap();
        fs::write(vault.root().join("notes.txt"), "not markdown").unwrap();

        let tree = vault.list_tree().unwrap();
        let names: Vec<&str> = tree.iter().map(|entry| entry.name.as_str()).collect();
        assert_eq!(names, vec!["Chemistry", "Alpha.md", "Zeta.md"]);
        assert_eq!(tree[0].kind, EntryKind::Dir);
        let children = tree[0].children.as_ref().unwrap();
        assert_eq!(children[0].rel_path, "Chemistry/Photoresist.md");
    }

    #[test]
    fn rename_moves_notes_and_folders() {
        let (_dir, vault) = temp_vault();
        vault.create_note("Old.md").unwrap();
        vault.rename_entry("Old.md", "Archive/New.md").unwrap();
        assert!(vault.read_note("Archive/New.md").is_ok());
        assert!(vault.read_note("Old.md").is_err());
    }

    #[test]
    fn internal_paths_are_detected() {
        let (_dir, vault) = temp_vault();
        let root = vault.root();
        assert!(is_internal_path(
            root,
            &root.join(".lattice/workspace.sqlite")
        ));
        assert!(is_internal_path(root, &root.join(".a.md.lattice-tmp")));
        assert!(!is_internal_path(root, &root.join("Notes/a.md")));
        assert_eq!(
            to_rel_path(root, &root.join("Notes/a.md")).as_deref(),
            Some("Notes/a.md")
        );
    }
}

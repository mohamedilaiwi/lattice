//! `.lattice/` persistence: workspace layout in SQLite, block cache and
//! source-version metadata on disk, and non-secret local settings.
//!
//! Never store credentials here — provider keys belong in the OS keychain
//! (milestone 2), not in the vault.

use std::fs;
use std::path::PathBuf;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::vault::Vault;
use crate::{sha256_hex, CoreResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockCacheEntry {
    pub source_hash: String,
    pub blocks_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SourceVersion {
    source_hash: String,
}

pub struct LatticeStore {
    lattice_dir: PathBuf,
}

impl LatticeStore {
    pub fn new(vault: &Vault) -> Self {
        Self {
            lattice_dir: vault.lattice_dir(),
        }
    }

    fn db(&self) -> CoreResult<Connection> {
        let connection = Connection::open(self.lattice_dir.join("workspace.sqlite"))?;
        connection.execute_batch(
            "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
        )?;
        Ok(connection)
    }

    pub fn load_state(&self, key: &str) -> CoreResult<Option<String>> {
        let connection = self.db()?;
        let mut statement = connection.prepare("SELECT value FROM kv WHERE key = ?1")?;
        let mut rows = statement.query([key])?;
        match rows.next()? {
            Some(row) => Ok(Some(row.get(0)?)),
            None => Ok(None),
        }
    }

    pub fn save_state(&self, key: &str, value: &str) -> CoreResult<()> {
        let connection = self.db()?;
        connection.execute(
            "INSERT INTO kv (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [key, value],
        )?;
        Ok(())
    }

    /// Cache files are keyed by the hash of the note's vault-relative path so
    /// arbitrary note names never leak into `.lattice/` file names.
    fn cache_key(rel_path: &str) -> String {
        sha256_hex(rel_path)
    }

    pub fn read_block_cache(&self, rel_path: &str) -> CoreResult<Option<BlockCacheEntry>> {
        let key = Self::cache_key(rel_path);
        let blocks_path = self.lattice_dir.join("blocks").join(format!("{key}.json"));
        let hash_path = self.lattice_dir.join("hashes").join(format!("{key}.json"));
        if !blocks_path.is_file() || !hash_path.is_file() {
            return Ok(None);
        }
        let blocks_json = fs::read_to_string(blocks_path)?;
        let version: SourceVersion = serde_json::from_str(&fs::read_to_string(hash_path)?)?;
        Ok(Some(BlockCacheEntry {
            source_hash: version.source_hash,
            blocks_json,
        }))
    }

    pub fn write_block_cache(
        &self,
        rel_path: &str,
        source_hash: &str,
        blocks_json: &str,
    ) -> CoreResult<()> {
        let key = Self::cache_key(rel_path);
        fs::create_dir_all(self.lattice_dir.join("blocks"))?;
        fs::create_dir_all(self.lattice_dir.join("hashes"))?;
        fs::write(
            self.lattice_dir.join("blocks").join(format!("{key}.json")),
            blocks_json,
        )?;
        let version = SourceVersion {
            source_hash: source_hash.to_string(),
        };
        fs::write(
            self.lattice_dir.join("hashes").join(format!("{key}.json")),
            serde_json::to_string(&version)?,
        )?;
        Ok(())
    }

    pub fn read_settings(&self) -> CoreResult<serde_json::Value> {
        let path = self.lattice_dir.join("settings.json");
        if !path.is_file() {
            return Ok(serde_json::json!({}));
        }
        Ok(serde_json::from_str(&fs::read_to_string(path)?)?)
    }

    pub fn write_settings(&self, settings: &serde_json::Value) -> CoreResult<()> {
        let path = self.lattice_dir.join("settings.json");
        fs::write(path, serde_json::to_string_pretty(settings)?)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_store() -> (tempfile::TempDir, LatticeStore) {
        let dir = tempfile::tempdir().unwrap();
        let vault = Vault::open(dir.path()).unwrap();
        let store = LatticeStore::new(&vault);
        (dir, store)
    }

    #[test]
    fn workspace_state_round_trips() {
        let (_dir, store) = temp_store();
        assert!(store.load_state("layout").unwrap().is_none());
        store.save_state("layout", "{\"panes\":[]}").unwrap();
        store.save_state("layout", "{\"panes\":[1]}").unwrap();
        assert_eq!(
            store.load_state("layout").unwrap().as_deref(),
            Some("{\"panes\":[1]}")
        );
    }

    #[test]
    fn block_cache_round_trips_and_misses_cleanly() {
        let (_dir, store) = temp_store();
        assert!(store.read_block_cache("a.md").unwrap().is_none());
        store
            .write_block_cache("a.md", "hash-1", "[{\"type\":\"paragraph\"}]")
            .unwrap();
        let entry = store.read_block_cache("a.md").unwrap().unwrap();
        assert_eq!(entry.source_hash, "hash-1");
        assert_eq!(entry.blocks_json, "[{\"type\":\"paragraph\"}]");
        assert!(store.read_block_cache("other.md").unwrap().is_none());
    }

    #[test]
    fn settings_default_to_empty_object() {
        let (_dir, store) = temp_store();
        assert_eq!(store.read_settings().unwrap(), serde_json::json!({}));
        store
            .write_settings(&serde_json::json!({ "defaultMode": "rich" }))
            .unwrap();
        assert_eq!(
            store.read_settings().unwrap(),
            serde_json::json!({ "defaultMode": "rich" })
        );
    }
}

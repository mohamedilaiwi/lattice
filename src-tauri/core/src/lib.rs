//! Pure vault, persistence, and watcher logic for Lattice.
//!
//! This crate deliberately has no Tauri dependency so it can be compiled and
//! tested without desktop system libraries. The Tauri shell wraps it in IPC
//! commands.

pub mod store;
pub mod vault;
pub mod watcher;

use sha2::{Digest, Sha256};

/// SHA-256 lower-case hex. Must stay byte-compatible with the TypeScript
/// implementation in `src/lib/markdown/hash.ts`.
pub fn sha256_hex(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    let digest = hasher.finalize();
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("serialization error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("watcher error: {0}")]
    Watch(#[from] notify::Error),
    #[error("{0}")]
    Invalid(String),
}

pub type CoreResult<T> = Result<T, CoreError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sha256_matches_frontend_test_vectors() {
        assert_eq!(
            sha256_hex("abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(
            sha256_hex(""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }
}

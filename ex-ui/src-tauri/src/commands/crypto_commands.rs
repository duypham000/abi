//! AES-256-GCM encryption/decryption for the local SQLite cache.
//!
//! The encryption key is stored in the OS keyring (same service as auth tokens),
//! so secrets cached to `entity_cache.data_json` are protected at rest.
//!
//! Key lifecycle:
//!   - First call to `cmd_encrypt` / `cmd_decrypt` generates a fresh 256-bit key
//!     and stores it in the OS keyring under `com.tomo.app` / `cache_encryption_key`.
//!   - Subsequent calls reuse the stored key.
//!   - Ciphertext format: base64( nonce[12] || ciphertext || tag[16] )
//!     (aes_gcm combines ciphertext+tag, so the raw bytes are nonce + encrypted_blob).

use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};

#[cfg(not(target_os = "android"))]
const KEYRING_SERVICE: &str = "com.tomo.app";
#[cfg(not(target_os = "android"))]
const KEYRING_ACCOUNT: &str = "cache_encryption_key";

/// Retrieve or generate the AES-256-GCM key from the OS keyring.
#[cfg(not(target_os = "android"))]
fn get_or_create_key() -> Result<[u8; 32], String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|e| format!("keyring open: {e}"))?;

    match entry.get_password() {
        Ok(encoded) => {
            let bytes = B64.decode(encoded).map_err(|e| format!("key decode: {e}"))?;
            bytes
                .try_into()
                .map_err(|_| "stored key has wrong length".to_string())
        }
        Err(_) => {
            // Generate a new key and persist it
            use aes_gcm::aead::rand_core::RngCore;
            let mut key = [0u8; 32];
            OsRng.fill_bytes(&mut key);
            entry
                .set_password(&B64.encode(key))
                .map_err(|e| format!("keyring set: {e}"))?;
            Ok(key)
        }
    }
}

/// Encrypt plaintext with AES-256-GCM.
/// Returns base64-encoded ciphertext (nonce prepended).
#[tauri::command]
pub fn cmd_encrypt(plaintext: String) -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        // Android: no OS keyring; return plaintext as-is (caller must not cache secrets on Android).
        return Ok(plaintext);
    }
    #[cfg(not(target_os = "android"))]
    {
        let raw_key = get_or_create_key()?;
        let key = Key::<Aes256Gcm>::from_slice(&raw_key);
        let cipher = Aes256Gcm::new(key);
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let encrypted = cipher
            .encrypt(&nonce, plaintext.as_bytes())
            .map_err(|e| format!("encrypt: {e}"))?;

        // Pack: nonce (12 bytes) + encrypted bytes (ciphertext + 16-byte GCM tag)
        let mut blob = nonce.to_vec();
        blob.extend_from_slice(&encrypted);
        Ok(B64.encode(blob))
    }
}

/// Decrypt a base64-encoded ciphertext produced by `cmd_encrypt`.
#[tauri::command]
pub fn cmd_decrypt(ciphertext_b64: String) -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        // Android: passthrough (no encryption applied).
        return Ok(ciphertext_b64);
    }
    #[cfg(not(target_os = "android"))]
    {
        let raw_key = get_or_create_key()?;
        let key = Key::<Aes256Gcm>::from_slice(&raw_key);
        let cipher = Aes256Gcm::new(key);

        let blob = B64.decode(ciphertext_b64).map_err(|e| format!("base64 decode: {e}"))?;
        if blob.len() < 12 {
            return Err("ciphertext too short".to_string());
        }
        let (nonce_bytes, encrypted) = blob.split_at(12);
        let nonce = Nonce::from_slice(nonce_bytes);
        let decrypted = cipher
            .decrypt(nonce, encrypted)
            .map_err(|e| format!("decrypt: {e}"))?;
        String::from_utf8(decrypted).map_err(|e| format!("utf8: {e}"))
    }
}

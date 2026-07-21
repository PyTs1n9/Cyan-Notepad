use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginCredentials {
    email: String,
    password: String,
}

fn encode_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

fn decode_hex(value: &str) -> Result<Vec<u8>, String> {
    if value.len() % 2 != 0 {
        return Err("Invalid encrypted credential data".to_string());
    }

    value
        .as_bytes()
        .chunks_exact(2)
        .map(|pair| {
            let high = (pair[0] as char)
                .to_digit(16)
                .ok_or_else(|| "Invalid encrypted credential data".to_string())?;
            let low = (pair[1] as char)
                .to_digit(16)
                .ok_or_else(|| "Invalid encrypted credential data".to_string())?;
            Ok(((high << 4) | low) as u8)
        })
        .collect()
}

#[cfg(target_os = "windows")]
fn protect(data: &[u8]) -> Result<Vec<u8>, String> {
    use std::{ptr, slice};
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::Cryptography::{CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB},
    };

    let data_len =
        u32::try_from(data.len()).map_err(|_| "Credential data is too large".to_string())?;
    let input = CRYPT_INTEGER_BLOB {
        cbData: data_len,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    let succeeded = unsafe {
        CryptProtectData(
            &input,
            ptr::null(),
            ptr::null(),
            ptr::null(),
            ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if succeeded == 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }

    let protected = if output.cbData == 0 || output.pbData.is_null() {
        Vec::new()
    } else {
        unsafe { slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() }
    };
    unsafe {
        LocalFree(output.pbData as *mut std::ffi::c_void);
    }
    Ok(protected)
}

#[cfg(target_os = "windows")]
fn unprotect(data: &[u8]) -> Result<Vec<u8>, String> {
    use std::{ptr, slice};
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::Cryptography::{
            CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
        },
    };

    let data_len =
        u32::try_from(data.len()).map_err(|_| "Credential data is too large".to_string())?;
    let input = CRYPT_INTEGER_BLOB {
        cbData: data_len,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    let succeeded = unsafe {
        CryptUnprotectData(
            &input,
            ptr::null_mut(),
            ptr::null(),
            ptr::null(),
            ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if succeeded == 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }

    let unprotected = if output.cbData == 0 || output.pbData.is_null() {
        Vec::new()
    } else {
        unsafe { slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() }
    };
    unsafe {
        LocalFree(output.pbData as *mut std::ffi::c_void);
    }
    Ok(unprotected)
}

#[cfg(not(target_os = "windows"))]
fn protect(_data: &[u8]) -> Result<Vec<u8>, String> {
    Err("Remember password is only supported on Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
fn unprotect(_data: &[u8]) -> Result<Vec<u8>, String> {
    Err("Remember password is only supported on Windows".to_string())
}

#[tauri::command]
pub fn encrypt_login_credentials(email: String, password: String) -> Result<String, String> {
    let credentials = LoginCredentials { email, password };
    let serialized = serde_json::to_vec(&credentials).map_err(|error| error.to_string())?;
    protect(&serialized).map(|data| encode_hex(&data))
}

#[tauri::command]
pub fn decrypt_login_credentials(
    encrypted_credentials: String,
) -> Result<LoginCredentials, String> {
    let encrypted = decode_hex(&encrypted_credentials)?;
    let serialized = unprotect(&encrypted)?;
    serde_json::from_slice(&serialized).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_round_trip() {
        let input = b"cyan-notepad";
        assert_eq!(decode_hex(&encode_hex(input)).unwrap(), input);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_protection_round_trip() {
        let input = br#"{"email":"user@example.com","password":"secret"}"#;
        let encrypted = protect(input).unwrap();
        assert_ne!(encrypted, input);
        assert_eq!(unprotect(&encrypted).unwrap(), input);
    }
}

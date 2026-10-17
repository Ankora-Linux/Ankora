#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::net::{IpAddr, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use url::Url;

// ============================================================================
// GÜVENLİK SABİTLERİ VE WHITELIST POLİTİKALARI (SECURITY POLICY)
// ============================================================================

/// Terminalde doğrudan veya kompozit çalıştırılmasına izin verilen kesin komutlar
const EXACT_ALLOWED_COMMANDS: &[&str] = &[
    "uname -a",
    "uname -r",
    "whoami",
    "uptime",
    "ls",
    "ls -la",
    "ls -l",
    "ls -lh",
    "date",
    "hostname",
    "id",
    "free -m",
    "free -h",
    "df -h",
    "df -h /",
    "cat /etc/os-release",
    "cat /etc/issue",
    "cat /proc/version",
    "cat /proc/meminfo",
    "cat /proc/cpuinfo",
    "ps aux",
    "top -b -n 1",
    "apt-get clean",
    "rm -rf /tmp/*",
    "apt-get clean && rm -rf /tmp/*",
    "df -h / && free -m",
    "clear",
    "sync",
];

/// Tekil parametreli komutlarda izin verilen ikili (binary) programlar
const ALLOWED_UTILITIES: &[&str] = &[
    "uname", "whoami", "uptime", "date", "hostname", "id",
    "free", "df", "ls", "ps", "top", "which",
    "cat", "pwd", "echo", "head", "tail", "grep", "wc",
    "lscpu", "lsblk", "arch", "w", "who", "cal", "apt-cache",
];

/// `cat` komutu ile okunmasına izin verilen güvenli telemetri dosyaları
const ALLOWED_CAT_FILES: &[&str] = &[
    "/etc/os-release",
    "/etc/issue",
    "/proc/version",
    "/proc/meminfo",
    "/proc/cpuinfo",
];

/// AI Asistanının kullanıcı onayıyla çalıştırabileceği kısıtlı güvenli eylemler
const ALLOWED_AGENT_ACTIONS: &[&str] = &[
    "apt-get clean && rm -rf /tmp/*",
    "apt-get clean",
    "rm -rf /tmp/*",
    "df -h / && free -m",
    "df -h",
    "free -m",
    "uptime",
    "sync",
];

/// Ankora Office tarafından okunabilecek güvenli belge uzantıları (.docx ikili dosya olduğundan metin/pdf listesinde yer almaz)
const ALLOWED_DOC_EXTENSIONS: &[&str] = &[
    "pdf", "md", "txt", "conf", "log", "json", "yaml", "yml", "ini",
    "js", "py", "sh", "css", "html", "xml",
    "png", "jpg", "jpeg", "webp", "gif",
];

/// Kesinlikle doğrudan veya dolaylı çalıştırılması yasaklanan tehlikeli sistem araçları (Kara Liste)
const FORBIDDEN_LAUNCH_BINARIES: &[&str] = &[
    "sudo", "su", "pkexec", "dd", "mkfs", "fdisk", "parted",
    "sh", "bash", "zsh", "dash", "csh", "tcsh", "fish", "env",
    "xargs", "passwd", "chpasswd", "chmod", "chown", "reboot",
    "poweroff", "shutdown", "init", "systemctl", "telinit", "halt",
    "chroot", "unshare", "nsenter", "mount", "umount",
    "nc", "ncat", "socat", "ssh", "scp", "wget", "curl",
    "kill", "pkill", "killall", "tee", "install", "ln",
    "mkfifo", "mknod", "insmod", "modprobe", "rmmod",
    "docker", "podman", "runuser", "sg", "newgrp",
    "at", "batch", "crontab", "systemd-run",
];

/// Kesinlikle okunması engellenen hassas sistem dosyası ve dizin kalıpları
const SENSITIVE_FILE_PATTERNS: &[&str] = &[
    "/etc/shadow",
    "/etc/gshadow",
    "/etc/sudoers",
    "/etc/master.passwd",
    "/etc/security",
    "/root/.ssh",
    ".ssh/",
    "id_rsa",
    "id_ed25519",
    "id_ecdsa",
    "id_dsa",
    "/proc/kcore",
    "/sys/",
    "/dev/",
    "/var/log/auth",
    // Kasada tutulan kimlik bilgileri ve kilit dosyası
    "ai_creds.json",
    "lock.hash",
];

/// İzin verilen klavye haritaları
const ALLOWED_KEYBOARDS: &[&str] = &["tr", "tr_f", "us", "de", "fr", "gb"];

// ============================================================================
// DOĞRULAMA YARDIMCILARI (INPUT SANITIZATION)
// ============================================================================

fn is_valid_username(name: &str) -> bool {
    if name.is_empty() || name.len() > 32 {
        return false;
    }
    let mut chars = name.chars();
    let first = match chars.next() {
        Some(c) => c,
        None => return false,
    };
    if !first.is_ascii_lowercase() && first != '_' {
        return false;
    }
    chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-')
}

fn is_valid_hostname(host: &str) -> bool {
    if host.is_empty() || host.len() > 63 {
        return false;
    }
    if host.starts_with('-') || host.ends_with('-') {
        return false;
    }
    host.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

fn is_valid_disk_target(path: &str) -> bool {
    if !path.starts_with("/dev/") {
        return false;
    }
    let dev = &path[5..];
    if dev.is_empty() || dev.len() > 16 {
        return false;
    }
    // sd[a-z]+ : dev starts with "sd", remainder is all ASCII lowercase letters (no partition digits!)
    let is_sd = dev.starts_with("sd") && dev.len() >= 3 && dev[2..].chars().all(|c| c.is_ascii_lowercase());
    // vd[a-z]+ : dev starts with "vd", remainder is all ASCII lowercase letters (no partition digits!)
    let is_vd = dev.starts_with("vd") && dev.len() >= 3 && dev[2..].chars().all(|c| c.is_ascii_lowercase());
    // nvme<ctrl>n<ns> : exactly digits for controller and namespace, no trailing 'p<part>' partition suffix
    let is_nvme = if dev.starts_with("nvme") {
        let rem = &dev[4..];
        if let Some((ns_ctrl, ns_id)) = rem.split_once('n') {
            !ns_ctrl.is_empty() && ns_ctrl.chars().all(|c| c.is_ascii_digit())
                && !ns_id.is_empty() && ns_id.chars().all(|c| c.is_ascii_digit())
        } else {
            false
        }
    } else {
        false
    };

    is_sd || is_vd || is_nvme
}

fn is_valid_deb_package_name(pkg: &str) -> bool {
    if pkg.len() < 2 || pkg.len() > 64 {
        return false;
    }
    let mut chars = pkg.chars();
    let first = match chars.next() {
        Some(c) => c,
        None => return false,
    };
    if !first.is_ascii_alphanumeric() {
        return false;
    }
    chars.all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '-' || c == '.')
}

// ============================================================================
// VERİ YAPILARI (DATA STRUCTURES)
// ============================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct XdgApplication {
    pub id: String,
    pub name: String,
    pub exec: String,
    pub icon: String,
    pub comment: String,
    pub categories: Vec<String>,
    pub desktop_file: String,
    #[serde(default)]
    pub is_installed_by_user: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DocumentResult {
    pub file_name: String,
    pub file_type: String,
    pub file_size: u64,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemTelemetry {
    pub os_name: String,
    pub kernel: String,
    pub init_system: String,
    pub memory_used_mb: u64,
    pub memory_total_mb: u64,
    pub cpu_cores: usize,
    pub uptime_seconds: u64,
    pub battery_percent: Option<u8>,
    pub battery_status: Option<String>,
    // /proc/stat iki okuma arası; ilk örnekte 0.0 döner.
    pub cpu_percent: f64,
    pub disk_percent: Option<u8>,
    pub disk_used_gb: f64,
    pub disk_total_gb: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StorageDisk {
    pub name: String,
    pub path: String,
    pub size_gb: f64,
    pub model: String,
    pub is_removable: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InstallPayload {
    pub target_disk: String,
    pub fullname: String,
    pub username: String,
    pub hostname: String,
    pub password: String,
    pub autologin: bool,
    #[serde(default)]
    pub timezone: Option<String>,
    #[serde(default)]
    pub keyboard_layout: Option<String>,
    #[serde(default)]
    pub language: Option<String>,
}

// Bölge/dil/saat seçimlerinde ortak izin listeleri. Zaman dilimi ayrıca
// /usr/share/zoneinfo altında gerçekten var olmak zorundadır.
const ALLOWED_LANGUAGES: &[&str] = &["tr_TR.UTF-8", "en_US.UTF-8"];
const COMMON_TIMEZONES: &[&str] = &[
    "Europe/Istanbul",
    "Europe/London",
    "Europe/Berlin",
    "Europe/Paris",
    "Europe/Moscow",
    "America/New_York",
    "America/Chicago",
    "America/Los_Angeles",
    "Asia/Dubai",
    "Asia/Baku",
    "Asia/Nicosia",
    "UTC",
];

fn is_valid_timezone(tz: &str) -> bool {
    if tz.is_empty() || tz.len() > 64 || tz.contains("..") || tz.starts_with('/') {
        return false;
    }
    if !tz.chars().all(|c| c.is_ascii_alphanumeric() || c == '/' || c == '_' || c == '-' || c == '+') {
        return false;
    }
    std::path::Path::new("/usr/share/zoneinfo").join(tz).is_file()
}

fn current_timezone() -> String {
    if let Ok(link) = std::fs::read_link("/etc/localtime") {
        let s = link.to_string_lossy().into_owned();
        if let Some(pos) = s.find("zoneinfo/") {
            return s[pos + 9..].to_string();
        }
    }
    if let Ok(tz) = std::fs::read_to_string("/etc/timezone") {
        let t = tz.trim().to_string();
        if !t.is_empty() {
            return t;
        }
    }
    "Europe/Istanbul".to_string()
}

fn current_language() -> String {
    for path in ["/etc/default/locale", "/etc/locale.conf"] {
        if let Ok(content) = std::fs::read_to_string(path) {
            for line in content.lines() {
                let t = line.trim();
                if let Some(val) = t.strip_prefix("LANG=") {
                    let v = val.trim().trim_matches('"').to_string();
                    if ALLOWED_LANGUAGES.contains(&v.as_str()) {
                        return v;
                    }
                }
            }
        }
    }
    "tr_TR.UTF-8".to_string()
}

fn current_keyboard_layout() -> String {
    if let Ok(content) = std::fs::read_to_string("/etc/default/keyboard") {
        let mut layout = String::new();
        let mut variant = String::new();
        for line in content.lines() {
            let t = line.trim();
            if let Some(v) = t.strip_prefix("XKBLAYOUT=") {
                layout = v.trim().trim_matches('"').to_string();
            } else if let Some(v) = t.strip_prefix("XKBVARIANT=") {
                variant = v.trim().trim_matches('"').to_string();
            }
        }
        if layout == "tr" && variant == "f" {
            return "tr_f".to_string();
        }
        if ALLOWED_KEYBOARDS.contains(&layout.as_str()) {
            return layout;
        }
    }
    "tr".to_string()
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AiResponse {
    pub reply: String,
    pub has_action: bool,
    pub action_command: Option<String>,
    pub action_desc: Option<String>,
    #[serde(default)]
    pub action_token: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MemoryTrimResult {
    pub success: bool,
    pub freed_mb: u64,
    pub current_used_mb: u64,
    pub current_total_mb: u64,
    pub message: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct RadioState {
    pub available: bool,
    pub backend: String,
    pub wifi_enabled: bool,
    pub bluetooth_enabled: bool,
    pub wifi_ssid: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct WifiNetwork {
    pub ssid: String,
    pub signal: u8,
    pub active: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct NetworkInfo {
    pub interface: String,
    pub ip: String,
    pub prefix: u8,
    pub gateway: String,
    pub dns: Vec<String>,
    pub connected: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct ProcessInfo {
    pub pid: i32,
    pub user: String,
    pub cpu: f64,
    pub mem_mb: f64,
    pub status: String,
    pub name: String,
}

fn get_ankora_config_dir() -> PathBuf {
    let mut path = dirs::config_dir().unwrap_or_else(|| PathBuf::from("/root/.config"));
    path.push("ankora");
    let _ = fs::create_dir_all(&path);
    path
}

// ----------------------------------------------------------------------------
// GÜVENLİ KİMLİK BİLGİSİ YÖNETİMİ (SECURE MACHINE-BOUND ENCRYPTED VAULT) - BULGU #6 GİDERİLDİ
// ----------------------------------------------------------------------------
fn get_credentials_path() -> PathBuf {
    get_ankora_config_dir().join("credentials.dat")
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Standart RFC 2104 HMAC-SHA256 Gerçekleştirmesi
fn hmac_sha256(key: &[u8], message: &[u8]) -> [u8; 32] {
    let mut k = [0u8; 64];
    if key.len() > 64 {
        let hash = Sha256::digest(key);
        k[..32].copy_from_slice(&hash);
    } else {
        k[..key.len()].copy_from_slice(key);
    }
    let mut ipad = [0x36u8; 64];
    let mut opad = [0x5cu8; 64];
    for i in 0..64 {
        ipad[i] ^= k[i];
        opad[i] ^= k[i];
    }
    let mut inner = Sha256::new();
    inner.update(&ipad);
    inner.update(message);
    let inner_hash = inner.finalize();

    let mut outer = Sha256::new();
    outer.update(&opad);
    outer.update(&inner_hash);
    let result = outer.finalize();
    let mut out = [0u8; 32];
    out.copy_from_slice(&result);
    out
}

fn fill_secure_random_bytes(buf: &mut [u8]) {
    #[cfg(unix)]
    {
        if let Ok(mut f) = fs::File::open("/dev/urandom") {
            if f.read_exact(buf).is_ok() {
                return;
            }
        }
        if let Ok(mut f) = fs::File::open("/dev/random") {
            if f.read_exact(buf).is_ok() {
                return;
            }
        }
    }
    // Deterministik olmayan yüksek çözünürlüklü zaman + işlem entropisi desteği
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    let mut hasher = Sha256::new();
    hasher.update(&now.to_le_bytes());
    hasher.update(b"ankora-csprng-entropy-seed-v3");
    let digest = hasher.finalize();
    for (i, byte) in buf.iter_mut().enumerate() {
        *byte = digest[i % digest.len()];
    }
}

/// RFC 2898 / RFC 8018 PBKDF2-HMAC-SHA256 Anahtar Türetim Fonksiyonu (Key Derivation Function)
fn pbkdf2_hmac_sha256(password: &[u8], salt: &[u8], iterations: u32) -> [u8; 32] {
    let mut initial = salt.to_vec();
    initial.extend_from_slice(&1u32.to_be_bytes());
    let mut u = hmac_sha256(password, &initial);
    let mut f = u;
    for _ in 1..iterations {
        u = hmac_sha256(password, &u);
        for i in 0..32 {
            f[i] ^= u[i];
        }
    }
    f
}

fn get_machine_key() -> [u8; 32] {
    // 1. Kullanıcıya özel CSPRNG gizli anahtar dosyası (~/.config/ankora/.vault_secret, 0600)
    let secret_path = get_ankora_config_dir().join(".vault_secret");
    let mut user_secret = [0u8; 32];
    let mut loaded = false;

    if secret_path.exists() {
        if let Ok(bytes) = fs::read(&secret_path) {
            if bytes.len() >= 32 {
                user_secret.copy_from_slice(&bytes[..32]);
                loaded = true;
            }
        }
    }

    if !loaded {
        fill_secure_random_bytes(&mut user_secret);
        let _ = fs::write(&secret_path, &user_secret);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&secret_path, fs::Permissions::from_mode(0o600));
        }
    }

    // 2. Makine kimliği + Kullanıcı adı + Gizli anahtar ile PBKDF2-HMAC-SHA256 türetimi (60.000 tur)
    let mut seed = Vec::new();
    seed.extend_from_slice(&user_secret);
    if let Ok(id) = fs::read_to_string("/etc/machine-id") {
        seed.extend_from_slice(id.trim().as_bytes());
    } else if let Ok(id) = fs::read_to_string("/var/lib/dbus/machine-id") {
        seed.extend_from_slice(id.trim().as_bytes());
    }
    if let Ok(host) = fs::read_to_string("/etc/hostname") {
        seed.extend_from_slice(host.trim().as_bytes());
    }
    if let Ok(user) = std::env::var("USER") {
        seed.extend_from_slice(user.as_bytes());
    } else if let Ok(user) = std::env::var("USERNAME") {
        seed.extend_from_slice(user.as_bytes());
    }
    seed.extend_from_slice(b"ankora-os-ayaz-credential-vault-salt-v3");

    pbkdf2_hmac_sha256(&user_secret, &seed, 60_000)
}

fn encrypt_vault_payload(plaintext: &[u8]) -> Vec<u8> {
    let master_key = get_machine_key();
    let mut salt = [0u8; 16];
    fill_secure_random_bytes(&mut salt);

    // PBKDF2 ile oturum anahtarları türetimi (10.000 tur)
    let session_key = pbkdf2_hmac_sha256(&master_key, &salt, 10_000);
    let mac_key = hmac_sha256(&session_key, b"ANKORA_VAULT_HMAC_KEY_V2");
    let enc_key = hmac_sha256(&session_key, b"ANKORA_VAULT_ENC_KEY_V2");

    let mut ciphertext = Vec::with_capacity(plaintext.len());
    let mut block_idx = 0u64;
    for chunk in plaintext.chunks(32) {
        let mut b_hasher = Sha256::new();
        b_hasher.update(&enc_key);
        b_hasher.update(&block_idx.to_le_bytes());
        let stream_block = b_hasher.finalize();
        for (p_byte, s_byte) in chunk.iter().zip(stream_block.iter()) {
            ciphertext.push(p_byte ^ s_byte);
        }
        block_idx += 1;
    }

    // Encrypt-then-MAC: Salt + Ciphertext üzerinde HMAC-SHA256
    let mut mac_msg = salt.to_vec();
    mac_msg.extend_from_slice(&ciphertext);
    let mac = hmac_sha256(&mac_key, &mac_msg);

    let mut out = Vec::with_capacity(16 + 16 + 32 + ciphertext.len());
    out.extend_from_slice(b"ANKORA_VAULT_V2\n");
    out.extend_from_slice(&salt);
    out.extend_from_slice(&mac);
    out.extend_from_slice(&ciphertext);
    out
}

fn decrypt_vault_payload(data: &[u8]) -> Option<Vec<u8>> {
    let magic = b"ANKORA_VAULT_V2\n";
    if data.len() < magic.len() + 16 + 32 || &data[..magic.len()] != magic {
        return None;
    }
    let offset = magic.len();
    let salt = &data[offset..offset + 16];
    let expected_mac = &data[offset + 16..offset + 48];
    let ciphertext = &data[offset + 48..];

    let master_key = get_machine_key();

    // 1. Yeni PBKDF2 türetimli doğrulama ve çözme
    let session_key = pbkdf2_hmac_sha256(&master_key, salt, 10_000);
    let mac_key = hmac_sha256(&session_key, b"ANKORA_VAULT_HMAC_KEY_V2");
    let enc_key = hmac_sha256(&session_key, b"ANKORA_VAULT_ENC_KEY_V2");

    let mut mac_msg = salt.to_vec();
    mac_msg.extend_from_slice(ciphertext);
    let computed_mac = hmac_sha256(&mac_key, &mac_msg);

    if constant_time_eq(&computed_mac, expected_mac) {
        let mut plaintext = Vec::with_capacity(ciphertext.len());
        let mut block_idx = 0u64;
        for chunk in ciphertext.chunks(32) {
            let mut b_hasher = Sha256::new();
            b_hasher.update(&enc_key);
            b_hasher.update(&block_idx.to_le_bytes());
            let stream_block = b_hasher.finalize();
            for (c_byte, s_byte) in chunk.iter().zip(stream_block.iter()) {
                plaintext.push(c_byte ^ s_byte);
            }
            block_idx += 1;
        }
        return Some(plaintext);
    }

    // 2. Geriye dönük uyumluluk: Eski tek-tur türetimli format desteği
    let mut k_hasher = Sha256::new();
    k_hasher.update(&master_key);
    k_hasher.update(salt);
    let legacy_session_key = k_hasher.finalize();
    let legacy_computed_mac = hmac_sha256(&legacy_session_key, ciphertext);

    if constant_time_eq(&legacy_computed_mac, expected_mac) {
        let mut plaintext = Vec::with_capacity(ciphertext.len());
        let mut block_idx = 0u64;
        for chunk in ciphertext.chunks(32) {
            let mut b_hasher = Sha256::new();
            b_hasher.update(&legacy_session_key);
            b_hasher.update(&block_idx.to_le_bytes());
            let stream_block = b_hasher.finalize();
            for (c_byte, s_byte) in chunk.iter().zip(stream_block.iter()) {
                plaintext.push(c_byte ^ s_byte);
            }
            block_idx += 1;
        }
        return Some(plaintext);
    }

    None
}

fn load_credentials() -> std::collections::HashMap<String, String> {
    let path = get_credentials_path();
    if let Ok(data) = fs::read(&path) {
        // 1. Yeni şifreli formatı çöz
        if let Some(decrypted) = decrypt_vault_payload(&data) {
            if let Ok(map) = serde_json::from_slice::<std::collections::HashMap<String, String>>(&decrypted) {
                return map;
            }
        }
        // 2. Eski Base64 formatı varsa çöz ve güvenli formata otomatik terfi et
        if let Ok(decoded) = base64::engine::general_purpose::STANDARD.decode(&data) {
            if let Ok(map) = serde_json::from_slice::<std::collections::HashMap<String, String>>(&decoded) {
                let _ = save_credentials(&map);
                return map;
            }
        }
    }
    std::collections::HashMap::new()
}

fn save_credentials(map: &std::collections::HashMap<String, String>) -> Result<(), String> {
    let path = get_credentials_path();
    let json_bytes = serde_json::to_vec(map).map_err(|e| e.to_string())?;
    let encrypted = encrypt_vault_payload(&json_bytes);
    fs::write(&path, encrypted).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

#[tauri::command]
fn save_ai_credential(provider: String, api_key: String) -> Result<(), String> {
    let clean_prov = provider.trim().to_lowercase();
    let clean_key = api_key.trim().to_string();
    let mut map = load_credentials();
    if clean_key.is_empty() {
        map.remove(&clean_prov);
    } else {
        map.insert(clean_prov, clean_key);
    }
    save_credentials(&map)
}

#[tauri::command]
fn has_ai_credential(provider: String) -> Result<bool, String> {
    let clean_prov = provider.trim().to_lowercase();
    let map = load_credentials();
    Ok(map.get(&clean_prov).map(|k| !k.is_empty()).unwrap_or(false))
}

#[tauri::command]
fn delete_ai_credential(provider: String) -> Result<(), String> {
    let clean_prov = provider.trim().to_lowercase();
    let mut map = load_credentials();
    map.remove(&clean_prov);
    save_credentials(&map)
}

// ----------------------------------------------------------------------------
// GÜVENLİ KİLİT EKRANI & OTURUM KORUMASI (NATIVE LOCK & X11 / SHA-256) - BULGU #3 GİDERİLDİ
// ----------------------------------------------------------------------------
fn get_lock_hash_path() -> PathBuf {
    let var_path = PathBuf::from("/var/lib/ankora/lock.hash");
    let var_dir = Path::new("/var/lib/ankora");
    if var_path.exists() {
        return var_path;
    }
    // /var/lib/ankora mevcutsa sistem seviyesinde korumalı konumu tercih et
    if var_dir.is_dir() {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Ok(meta) = var_dir.metadata() {
                if meta.permissions().mode() & 0o222 != 0 {
                    return var_path;
                }
            }
        }
    }
    get_ankora_config_dir().join("lock.hash")
}

static LOCK_ATTEMPTS: Mutex<(u32, Option<Instant>)> = Mutex::new((0, None));

fn compute_salted_pin_hash(salt: &[u8], pin: &str) -> [u8; 32] {
    let mut state = salt.to_vec();
    state.extend_from_slice(pin.as_bytes());

    let mut current_hash = Sha256::digest(&state);
    // 50,000 tur iterative SHA-256 PBKDF2 zorluğu
    for i in 0..50_000u32 {
        let mut h = Sha256::new();
        h.update(&current_hash);
        h.update(salt);
        h.update(&i.to_le_bytes());
        current_hash = h.finalize();
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&current_hash);
    out
}

#[tauri::command]
fn is_lock_configured() -> Result<bool, String> {
    let path = get_lock_hash_path();
    if !path.exists() {
        return Ok(false);
    }
    // Hard-link koruması: nlink > 1 ise dosya reddedilir
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if let Ok(meta) = fs::metadata(&path) {
            if meta.nlink() > 1 {
                return Err("Güvenlik Hatası: Kilit dosyası çoklu bağlantıya (hard link) sahip, erişim reddedildi.".to_string());
            }
        }
    }
    let data = fs::read(&path).map_err(|e| e.to_string())?;
    if data.len() < 48 {
        return Err("Güvenlik Hatası: Kilit dosyası bozulmuş veya geçersiz boyutta (48 bayttan kısa).".to_string());
    }
    Ok(true)
}

#[tauri::command]
fn set_lock_credentials(current_pin: Option<String>, new_pin: String) -> Result<(), String> {
    let clean_new = new_pin.trim();
    if clean_new.len() < 4 {
        return Err("Yeni PIN/Parola en az 4 karakter olmalıdır.".to_string());
    }

    let is_configured = is_lock_configured().unwrap_or(false);
    if is_configured {
        let cur = current_pin.unwrap_or_default();
        if !verify_lock_credentials(cur)? {
            return Err("Mevcut PIN hatalı! PIN değiştirme reddedildi.".to_string());
        }
    }

    let mut salt = [0u8; 16];
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    for (i, b) in now.to_le_bytes().iter().enumerate() {
        salt[i] = *b ^ ((i as u8 + 1) * 31);
    }
    if let Ok(mut f) = fs::File::open("/dev/urandom") {
        let _ = f.read_exact(&mut salt);
    }

    let hash = compute_salted_pin_hash(&salt, clean_new);

    let path = get_lock_hash_path();
    let mut out = Vec::with_capacity(48);
    out.extend_from_slice(&salt);
    out.extend_from_slice(&hash);
    if let Err(e) = fs::write(&path, &out) {
        let fallback_path = get_ankora_config_dir().join("lock.hash");
        fs::write(&fallback_path, &out).map_err(|e2| format!("Kilit dosyası yazılamadı: {} / {}", e, e2))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&fallback_path, fs::Permissions::from_mode(0o600));
        }
    } else {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
        }
    }

    if let Ok(mut lock) = LOCK_ATTEMPTS.lock() {
        lock.0 = 0;
        lock.1 = None;
    }

    Ok(())
}

#[tauri::command]
fn verify_lock_credentials(pin: String) -> Result<bool, String> {
    if let Ok(lock) = LOCK_ATTEMPTS.lock() {
        if let Some(cooldown) = lock.1 {
            let elapsed = cooldown.elapsed();
            // Üstel bekleme: 2^(deneme-2) saniye, en fazla 300 saniye
            let penalty_duration = if lock.0 >= 3 {
                let exp = (lock.0 as u32).saturating_sub(2);
                // checked_pow: 64. denemeden sonra 2^64 taşar ve bekleme kalkmasın
                let secs = 2u64.checked_pow(exp).unwrap_or(3600).min(300);
                Duration::from_secs(secs)
            } else {
                Duration::from_secs(0)
            };
            if elapsed < penalty_duration {
                let remaining = (penalty_duration - elapsed).as_secs();
                return Err(format!(
                    "Çok fazla hatalı deneme! Lütfen {} saniye bekleyin.",
                    remaining + 1
                ));
            }
        }
    }

    let path = get_lock_hash_path();
    if !path.exists() {
        return Ok(false);
    }

    let data = fs::read(&path).map_err(|e| e.to_string())?;
    if data.len() < 48 {
        return Err("Güvenlik Hatası: Kilit verisi bozulmuş veya eksik.".to_string());
    }

    let salt = &data[..16];
    let expected_hash = &data[16..48];
    let computed_hash = compute_salted_pin_hash(salt, pin.trim());

    let mut diff = 0u8;
    for (a, b) in computed_hash.iter().zip(expected_hash.iter()) {
        diff |= a ^ b;
    }

    let is_valid = diff == 0;

    if let Ok(mut lock) = LOCK_ATTEMPTS.lock() {
        if is_valid {
            lock.0 = 0;
            lock.1 = None;
        } else {
            lock.0 += 1;
            lock.1 = Some(Instant::now());
        }
    }

    Ok(is_valid)
}

#[tauri::command]
fn lock_x11_session() -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        let xtrlock_path = Path::new("/usr/bin/xtrlock");
        if xtrlock_path.exists() {
            let mut cmd = Command::new("/usr/bin/xtrlock");
            cmd.arg("-b");
            match cmd.spawn() {
                Ok(_) => Ok("X11 xtrlock oturumu kilitlendi.".to_string()),
                Err(e) => Err(format!("xtrlock başlatılamadı: {}", e)),
            }
        } else {
            Ok("xtrlock bulunamadı; kiosk UI kilit ekranı devrede.".to_string())
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        Ok("Geliştirme ortamında kilit ekranı arayüz modu aktif.".to_string())
    }
}

/// Kilit açıldığında xtrlock sonlandırılır: süreç canlı kalırsa imleç kilit
/// simgesinde kalır ve masaüstünde hiçbir yere tıklanamaz.
#[tauri::command]
fn unlock_x11_session() -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        let status = Command::new("pkill").args(["-x", "xtrlock"]).status();
        match status {
            Ok(s) if s.success() => Ok("X11 kilidi açıldı (xtrlock sonlandırıldı).".to_string()),
            Ok(_) => Ok("Çalışan xtrlock süreci yoktu; X11 kilidi zaten açıktı.".to_string()),
            Err(e) => Err(format!("X11 kilidi açılamadı: {}", e)),
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        Ok("Geliştirme ortamında kilit ekranı arayüz modu aktif.".to_string())
    }
}

// ============================================================================
// 1. GERÇEK TAURI NATIVE WINDOW DRAG
// ============================================================================
#[tauri::command]
fn drag_window(window: tauri::Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

// ============================================================================
// 2. DİNAMİK XDG .DESKTOP MOTORU
// ============================================================================
fn parse_desktop_entry(path: &Path) -> Option<XdgApplication> {
    let content = fs::read_to_string(path).ok()?;
    let mut name = String::new();
    let mut exec = String::new();
    let mut icon = String::new();
    let mut comment = String::new();
    let mut categories = Vec::new();
    let mut nodisplay = false;

    let mut in_desktop_entry = false;
    for line in content.lines() {
        let line = line.trim();
        if line == "[Desktop Entry]" {
            in_desktop_entry = true;
            continue;
        } else if line.starts_with('[') {
            in_desktop_entry = false;
        }

        if !in_desktop_entry {
            continue;
        }

        if let Some((key, val)) = line.split_once('=') {
            let key = key.trim();
            let val = val.trim();
            match key {
                "Name" if name.is_empty() => name = val.to_string(),
                "Exec" if exec.is_empty() => {
                    let cleaned = val.split('%').next().unwrap_or(val).trim();
                    exec = cleaned.to_string();
                }
                "Icon" if icon.is_empty() => icon = val.to_string(),
                "Comment" if comment.is_empty() => comment = val.to_string(),
                "NoDisplay" => nodisplay = val.eq_ignore_ascii_case("true"),
                "Categories" => {
                    categories = val.split(';').filter(|s| !s.is_empty()).map(|s| s.to_string()).collect();
                }
                _ => {}
            }
        }
    }

    if nodisplay || name.is_empty() || exec.is_empty() {
        return None;
    }

    let file_stem = path.file_stem()?.to_string_lossy().to_string();
    Some(XdgApplication {
        id: file_stem,
        name,
        exec,
        icon,
        comment,
        categories,
        desktop_file: path.to_string_lossy().to_string(),
        is_installed_by_user: false,
    })
}

#[tauri::command]
async fn scan_xdg_applications() -> Result<Vec<XdgApplication>, String> {
    // .desktop dizinleri diske yayılmış bir tarama; ana olay döngüsünü
    // bloklamasın diye çalışma havuzuna devredilir.
    tauri::async_runtime::spawn_blocking(scan_xdg_applications_blocking)
        .await
        .map_err(|e| format!("XDG taraması yürütülemedi: {}", e))?
}

fn scan_xdg_applications_blocking() -> Result<Vec<XdgApplication>, String> {
    #[cfg(target_os = "linux")]
    {
        let mut apps = Vec::new();
        let user_apps_dir = dirs::data_dir().map(|d| d.join("applications")).unwrap_or_default();
        let user_flatpak_dir = dirs::data_dir().map(|d| d.join("flatpak/exports/share/applications")).unwrap_or_default();
        let flatpak_sys_dir = PathBuf::from("/var/lib/flatpak/exports/share/applications");
        let search_dirs = [
            PathBuf::from("/usr/share/applications"),
            PathBuf::from("/usr/local/share/applications"),
            flatpak_sys_dir.clone(),
            user_apps_dir.clone(),
            user_flatpak_dir.clone(),
        ];

        for dir in &search_dirs {
            if dir.exists() {
                if let Ok(entries) = fs::read_dir(dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.extension().and_then(|s| s.to_str()) == Some("desktop") {
                            if let Some(mut app) = parse_desktop_entry(&path) {
                                // Kullanıcı dizinleri veya Flatpak dizinlerindeki uygulamalar kullanıcı kurulumudur
                                if dir == &user_apps_dir || dir == &user_flatpak_dir || dir == &flatpak_sys_dir {
                                    app.is_installed_by_user = true;
                                }
                                if !apps.iter().any(|a: &XdgApplication| a.id == app.id) {
                                    apps.push(app);
                                }
                            }
                        }
                    }
                }
            }
        }
        Ok(apps)
    }

    #[cfg(not(target_os = "linux"))]
    {
        // İndirilmemiş sahte uygulamalar listelenmez (Strict clean state)
        Ok(vec![])
    }
}

// ============================================================================
// 3. PAKET KURULUMU (DEBIAN .DEB DOĞRULAMALI) - GÜVENLİK BULGUSU #7
// ============================================================================
#[tauri::command]
async fn install_deb_package(package_name: String) -> Result<XdgApplication, String> {
    // apt/dpkg sürer; Command::output() senkron çağrısı spawn_blocking
    // içinde çalıştırılır ki pencere donmasın.
    tauri::async_runtime::spawn_blocking(move || install_deb_package_blocking(package_name))
        .await
        .map_err(|e| format!("Paket kurulumu yürütülemedi: {}", e))?
}

fn install_deb_package_blocking(package_name: String) -> Result<XdgApplication, String> {
    let clean_pkg = package_name.trim();
    if clean_pkg.is_empty() {
        return Err("Geçersiz paket adı.".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        let output = if clean_pkg.ends_with(".deb") {
            return Err("Güvenlik İlkesi: Yerel .deb paketleri doğrudan kurulamaz; sistem bileşenleri için resmi Ayaz Güncelleyici'yi kullanın.".to_string());
        } else {
            // Debian resmi paket adı: Sıkı regex doğrulaması ve bayrak enjeksiyonu koruması (--)
            if !is_valid_deb_package_name(clean_pkg) {
                return Err("Güvenlik Hatası: Geçersiz Debian paket adı biçimi.".to_string());
            }
            let helper = Path::new("/usr/local/bin/ayaz-pkg-helper");
            if helper.exists() {
                root_command("/usr/local/bin/ayaz-pkg-helper", &["install", clean_pkg])
            } else {
                root_command("apt-get", &["install", "-y", "--no-install-recommends", "--", clean_pkg])
            }
        };

        match output {
            Ok(res) => {
                if !res.status.success() {
                    let err = String::from_utf8_lossy(&res.stderr);
                    return Err(format!("Paket kurulumu başarısız: {}", err));
                }
            }
            Err(e) => return Err(format!("apt-get/dpkg çalıştırılamadı: {}", e)),
        }

        // Kurulum sonrası XDG dizinini tara ve masaüstü/uygulamalar dizinine yerleştir
        let apps = scan_xdg_applications_blocking()?;
        let final_app = if let Some(mut app) = apps.into_iter().find(|a| a.id.contains(clean_pkg) || clean_pkg.contains(&a.id)) {
            app.is_installed_by_user = true;
            app
        } else {
            XdgApplication {
                id: clean_pkg.to_string(),
                name: clean_pkg.to_uppercase(),
                exec: clean_pkg.to_string(),
                icon: "application-x-executable".to_string(),
                comment: format!("{} paketi sisteme kuruldu.", clean_pkg),
                categories: vec!["Utility".to_string()],
                desktop_file: format!("/usr/share/applications/{}.desktop", clean_pkg),
                is_installed_by_user: true,
            }
        };

        // Gerçek Masaüstü (~/Desktop) ve Başlat Menüsü (~/.local/share/applications) XDG .desktop Dosyası Yerleştirme
        if let Some(home_dir) = dirs::home_dir() {
            let desktop_dir = home_dir.join("Desktop");
            let local_apps_dir = home_dir.join(".local/share/applications");
            let _ = fs::create_dir_all(&desktop_dir);
            let _ = fs::create_dir_all(&local_apps_dir);

            // .desktop alanındaki satır sonu, dosyaya yeni anahtar enjekte eder
            let safe_field = |s: &str| s.replace('\n', " ").replace('\r', " ");

            let desktop_entry_content = format!(
                "[Desktop Entry]\nVersion=1.0\nType=Application\nName={}\nComment={}\nExec={}\nIcon={}\nTerminal=false\nCategories={};\nStartupNotify=true\nX-Ayaz-Installed=true\n",
                safe_field(&final_app.name),
                safe_field(&final_app.comment),
                safe_field(&final_app.exec),
                safe_field(&final_app.icon),
                safe_field(&final_app.categories.join(";"))
            );

            let target_desktop = desktop_dir.join(format!("{}.desktop", clean_pkg));
            let target_local = local_apps_dir.join(format!("{}.desktop", clean_pkg));

            let _ = fs::write(&target_desktop, &desktop_entry_content);
            let _ = fs::write(&target_local, &desktop_entry_content);

            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = fs::set_permissions(&target_desktop, fs::Permissions::from_mode(0o755));
                let _ = fs::set_permissions(&target_local, fs::Permissions::from_mode(0o755));
            }
        }

        Ok(final_app)
    }

    #[cfg(not(target_os = "linux"))]
    {
        if !clean_pkg.ends_with(".deb") && !is_valid_deb_package_name(clean_pkg) {
            return Err("Güvenlik Hatası: Geçersiz Debian paket adı biçimi.".to_string());
        }
        Ok(XdgApplication {
            id: clean_pkg.to_string(),
            name: format!("{} (Kuruldu)", clean_pkg),
            exec: clean_pkg.to_string(),
            icon: clean_pkg.to_string(),
            comment: "Yerel sisteme başarıyla kaydedildi.".to_string(),
            categories: vec!["System".to_string()],
            desktop_file: format!("/usr/share/applications/{}.desktop", clean_pkg),
            is_installed_by_user: true,
        })
    }
}

// ============================================================================
// 3b. VENDOR KURULUMU (üçüncü parti resmi depolar: Brave / Helium / Antigravity)
// Ad eşlemesi KODDA sabittir; arayüz yalnızca bu adları gönderebilir.
// Adres, anahtar ve komut bilgisi root-owned ayaz-pkg-helper betiğinin
// içindedir — arayüzden URL veya komut kabul edilmez.
// ============================================================================
#[tauri::command]
async fn install_vendor_package(vendor: String) -> Result<XdgApplication, String> {
    tauri::async_runtime::spawn_blocking(move || install_vendor_package_blocking(vendor))
        .await
        .map_err(|e| format!("Vendor kurulumu yürütülemedi: {}", e))?
}

fn install_vendor_package_blocking(vendor: String) -> Result<XdgApplication, String> {
    let (v, pkg) = match vendor.trim() {
        "brave" => ("brave", "brave-browser"),
        "helium" => ("helium", "helium-bin"),
        "antigravity" => ("antigravity", "antigravity"),
        _ => return Err("Bilinmeyen uygulama kaynağı.".to_string()),
    };

    #[cfg(target_os = "linux")]
    {
        let helper = Path::new("/usr/local/bin/ayaz-pkg-helper");
        if !helper.exists() {
            return Err(
                "Güvenlik İlkesi: vendor kurulumu yalnızca ayaz-pkg-helper üzerinden yapılabilir."
                    .to_string(),
            );
        }
        let res = match root_command("/usr/local/bin/ayaz-pkg-helper", &["vendor", v]) {
            Ok(o) => o,
            Err(e) => return Err(format!("Paket yardımcısı çalıştırılamadı: {}", e)),
        };
        if !res.status.success() {
            let err = String::from_utf8_lossy(&res.stderr);
            return Err(format!("Vendor kurulumu başarısız: {}", err));
        }
        // Depo eklendikten ve paket kurulduktan sonra XDG taraması ile
        // .desktop yerleşimi normal paket akışının kendisi tarafından yapılır.
        install_deb_package_blocking(pkg.to_string())
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = (v, pkg);
        Err("Bu platformda vendor kurulumu desteklenmez.".to_string())
    }
}

#[tauri::command]
async fn install_meb_certificate() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(install_meb_certificate_blocking)
        .await
        .map_err(|e| format!("MEB sertifika kurulumu yürütülemedi: {}", e))?
}

fn install_meb_certificate_blocking() -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        let helper = Path::new("/usr/local/bin/ayaz-pkg-helper");
        if !helper.exists() {
            return Err(
                "Güvenlik İlkesi: MEB sertifikası yalnızca ayaz-pkg-helper üzerinden kurulabilir."
                    .to_string(),
            );
        }
        let res = match root_command("/usr/local/bin/ayaz-pkg-helper", &["mebcert"]) {
            Ok(o) => o,
            Err(e) => return Err(format!("Paket yardımcısı çalıştırılamadı: {}", e)),
        };
        if !res.status.success() {
            let err = String::from_utf8_lossy(&res.stderr);
            let out = String::from_utf8_lossy(&res.stdout);
            let msg = if err.trim().is_empty() { out } else { err };
            return Err(format!("MEB sertifikası kurulamadı: {}", msg.trim()));
        }
        Ok("MEB kök sertifikası sisteme ve Brave/Chrome profillerine kuruldu.".to_string())
    }

    #[cfg(not(target_os = "linux"))]
    {
        Err("Bu platformda MEB sertifika kurulumu desteklenmez.".to_string())
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct XdgUserDirs {
    pub home: String,
    pub desktop: String,
    pub download: String,
    pub documents: String,
    pub pictures: String,
    pub music: String,
    pub videos: String,
}

fn read_user_dirs_file(home: &Path) -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    let cfg = home.join(".config/user-dirs.dirs");
    if let Ok(content) = fs::read_to_string(&cfg) {
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some((k, v)) = line.split_once('=') {
                let key = k.trim().to_string();
                let mut val = v.trim().trim_matches('"').to_string();
                if val.starts_with("$HOME") {
                    val = val.replacen("$HOME", &home.to_string_lossy(), 1);
                }
                map.insert(key, val);
            }
        }
    }
    map
}

#[tauri::command]
fn get_xdg_user_dirs() -> Result<XdgUserDirs, String> {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/home/ankora"));
    let map = read_user_dirs_file(&home);
    let pick = |xdg_key: &str, fallbacks: &[&str]| -> String {
        if let Some(v) = map.get(xdg_key) {
            if !v.is_empty() {
                return v.clone();
            }
        }
        for fb in fallbacks {
            let p = home.join(fb);
            if p.is_dir() {
                return p.to_string_lossy().to_string();
            }
        }
        home.join(fallbacks.first().unwrap_or(&"Downloads")).to_string_lossy().to_string()
    };
    Ok(XdgUserDirs {
        home: home.to_string_lossy().to_string(),
        desktop: pick("XDG_DESKTOP_DIR", &["Desktop", "Masaüstü"]),
        download: pick("XDG_DOWNLOAD_DIR", &["Downloads", "İndirilenler"]),
        documents: pick("XDG_DOCUMENTS_DIR", &["Documents", "Belgeler"]),
        pictures: pick("XDG_PICTURES_DIR", &["Pictures", "Resimler"]),
        music: pick("XDG_MUSIC_DIR", &["Music", "Müzik"]),
        videos: pick("XDG_VIDEOS_DIR", &["Videos", "Videolar"]),
    })
}

fn find_icon_file(candidates: &[String]) -> Option<(PathBuf, &'static str)> {
    let mut search_dirs: Vec<PathBuf> = Vec::new();
    if let Some(home) = dirs::home_dir() {
        search_dirs.push(home.join(".local/share/icons"));
        search_dirs.push(home.join(".icons"));
    }
    search_dirs.push(PathBuf::from("/usr/share/icons"));
    search_dirs.push(PathBuf::from("/usr/share/pixmaps"));
    search_dirs.push(PathBuf::from("/usr/local/share/icons"));
    search_dirs.push(PathBuf::from("/usr/local/share/pixmaps"));

    for cand in candidates {
        let c = cand.trim();
        if c.is_empty() {
            continue;
        }
        // Mutlak yol doğrudan denenir (güvenli uzantılarla sınırlı).
        let as_path = Path::new(c);
        if as_path.is_absolute() {
            if as_path.is_file() {
                if let Some(ext) = as_path.extension().and_then(|s| s.to_str()) {
                    let mime: Option<&'static str> = match ext.to_lowercase().as_str() {
                        "png" => Some("image/png"),
                        "svg" => Some("image/svg+xml"),
                        "xpm" => Some("image/x-xpixmap"),
                        _ => None,
                    };
                    if let Some(m) = mime {
                        return Some((as_path.to_path_buf(), m));
                    }
                }
            }
            continue;
        }
        let base = c.rsplit('/').next().unwrap_or(c);
        for dir in &search_dirs {
            // Önce tema/simgesiz düz ad, sonra yaygın tema alt yolları.
            let rels = [
                format!("{}.png", base),
                format!("{}.svg", base),
                format!("{}.xpm", base),
                // FairyWren Ayaz seçkisi (ISO ile kurulur, düz dizin).
                format!("FairyWren_Ayaz/apps/{}.svg", base),
                format!("FairyWren_Ayaz/apps/{}.png", base),
                // Papirus (FairyWren seçkisinin taban seti, ISO paketi).
                format!("Papirus-Dark/scalable/apps/{}.svg", base),
                format!("Papirus/scalable/apps/{}.svg", base),
                format!("Papirus-Dark/48x48/apps/{}.svg", base),
                format!("Papirus/48x48/apps/{}.svg", base),
                format!("hicolor/48x48/apps/{}.png", base),
                format!("hicolor/scalable/apps/{}.svg", base),
                format!("hicolor/32x32/apps/{}.png", base),
                format!("Adwaita/48x48/apps/{}.png", base),
                format!("Adwaita/scalable/apps/{}.svg", base),
            ];
            for rel in &rels {
                let p = dir.join(rel);
                if p.is_file() {
                    let mime = if rel.ends_with(".svg") {
                        "image/svg+xml"
                    } else if rel.ends_with(".xpm") {
                        "image/x-xpixmap"
                    } else {
                        "image/png"
                    };
                    return Some((p, mime));
                }
            }
        }
    }
    None
}

/// Kurulmuş uygulamanın gerçek simgesini veri URL'si olarak döndürür.
/// Aday adlar sırayla denenir; dosya 512 KB'ı aşarsa reddedilir.
#[tauri::command]
fn get_app_icon(names: Vec<String>) -> Result<Option<String>, String> {
    let found = find_icon_file(&names);
    if let Some((path, mime)) = found {
        let bytes = fs::read(&path).map_err(|e| e.to_string())?;
        if bytes.len() > 512 * 1024 {
            return Ok(None);
        }
        return Ok(Some(format!(
            "data:{};base64,{}",
            mime,
            base64::engine::general_purpose::STANDARD.encode(&bytes)
        )));
    }
    Ok(None)
}

#[tauri::command]
async fn remove_deb_package(package_name: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || remove_deb_package_blocking(package_name))
        .await
        .map_err(|e| format!("Paket kaldırma yürütülemedi: {}", e))?
}

fn remove_deb_package_blocking(package_name: String) -> Result<String, String> {
    let clean_pkg = package_name.trim();
    if clean_pkg.is_empty() || !is_valid_deb_package_name(clean_pkg) {
        return Err("Geçersiz Debian paket adı.".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(home_dir) = dirs::home_dir() {
            let desktop_file = home_dir.join("Desktop").join(format!("{}.desktop", clean_pkg));
            let local_file = home_dir.join(".local/share/applications").join(format!("{}.desktop", clean_pkg));
            let _ = fs::remove_file(desktop_file);
            let _ = fs::remove_file(local_file);
        }

        let helper = Path::new("/usr/local/bin/ayaz-pkg-helper");
        let res = if helper.exists() {
            root_command("/usr/local/bin/ayaz-pkg-helper", &["remove", clean_pkg])
        } else {
            root_command("apt-get", &["remove", "-y", "--", clean_pkg])
        };

        match res {
            Ok(out) => {
                if out.status.success() {
                    Ok(format!("{} paketi başarıyla kaldırıldı.", clean_pkg))
                } else {
                    let err = String::from_utf8_lossy(&out.stderr);
                    Err(format!("Paket kaldırma başarısız: {}", err))
                }
            }
            Err(e) => Err(format!("apt-get çalıştırılamadı: {}", e)),
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        Ok(format!("{} paketi simülasyonda kaldırıldı.", clean_pkg))
    }
}

// sudo tek seferlik denetlenir: sudo kurulu değilse ya da parolasız erişim
// kapalıysa her komutta ikinci (boş) denemeye düşülmez.
fn sudo_available() -> bool {
    static SUDO_OK: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *SUDO_OK.get_or_init(|| {
        Command::new("sudo")
            .args(["-n", "true"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    })
}

// Root gereken yollar: sudo kullanılabilirse sudo -n, değilse doğrudan
// çalıştır. Tek deneme, ayrı bir yedek çağrı yok.
fn root_command(prog: &str, args: &[&str]) -> std::io::Result<std::process::Output> {
    if sudo_available() {
        Command::new("sudo").arg("-n").arg(prog).args(args).output()
    } else {
        Command::new(prog).args(args).output()
    }
}

// Root sahibi /target dosyalarına yazım: sudo yokken doğrudan fs::write,
// varken sudo tee (stdin üzerinden).
fn root_write(path: &str, data: &str) -> Result<(), String> {
    if sudo_available() {
        let mut child = Command::new("sudo")
            .args(["-n", "tee", path])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("sudo tee başlatılamadı: {}", e))?;
        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        }
        let out = child.wait_with_output().map_err(|e| e.to_string())?;
        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
        }
        Ok(())
    } else {
        fs::write(path, data).map_err(|e| e.to_string())
    }
}

/// Terminal komutunun güvenlik politikasına (Security Whitelist) uygunluğunu denetler.
fn is_terminal_command_permitted(command: &str) -> Result<(), String> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Ok(());
    }

    // 1. Kesin izin verilen komutlar doğrudan onaylanır
    if EXACT_ALLOWED_COMMANDS.iter().any(|&c| c == trimmed) {
        return Ok(());
    }

    // 2. Exact whitelist haricinde tehlikeli kabuk zincirleme/yönlendirme karakterleri kesinlikle reddedilir
    let forbidden_chars = [';', '&', '|', '`', '$', '\n', '\r', '>', '<', '(', ')'];
    for fc in forbidden_chars {
        if trimmed.contains(fc) {
            return Err(format!("Güvenlik İlkesi İhlali: Komutta yetkisiz kabuk operatörü veya karakter tespit edildi ('{}').", fc));
        }
    }

    // 3. Komut parametrelerine ayrıştırılır
    let parts: Vec<&str> = trimmed.split_whitespace().collect();
    if parts.is_empty() {
        return Ok(());
    }

    let bin = parts[0];

    // Yasaklı ikili kontrolü (Kara Liste)
    if FORBIDDEN_LAUNCH_BINARIES.contains(&bin) {
        return Err(format!("Güvenlik İlkesi İhlali: '{}' komutu güvenlik politikası gereği doğrudan çalıştırılamaz.", bin));
    }

    // İzin verilen tekil araçlar kontrolü (Beyaz Liste)
    if !ALLOWED_UTILITIES.contains(&bin) {
        return Err(format!("Güvenlik İlkesi İhlali: '{}' komutu izin verilenler listesinde (whitelist) yer almıyor.", bin));
    }

    // 4. Hassas sistem dosyası kalıpları denetimi (SENSITIVE_FILE_PATTERNS)
    for arg in &parts[1..] {
        let arg_lower = arg.to_lowercase();
        for pattern in SENSITIVE_FILE_PATTERNS {
            if arg_lower.contains(&pattern.to_lowercase()) {
                return Err(format!("Güvenlik İlkesi İhlali: Hassas dosya/sistem yoluna erişim engellendi: '{}'.", pattern));
            }
        }
    }

    // 5. 'cat', 'head', 'tail', 'grep', 'wc' gibi dosya okuma araçlarında yol sınırı denetimi
    if ["cat", "head", "tail", "grep", "wc"].contains(&bin) {
        for arg in &parts[1..] {
            if arg.starts_with('/') {
                let is_allowed_cat = ALLOWED_CAT_FILES.contains(arg);
                let home_str = dirs::home_dir()
                    .unwrap_or_else(|| PathBuf::from("/home/ankora"))
                    .to_string_lossy()
                    .to_string();
                let is_in_home = arg.starts_with(&home_str);

                if !is_allowed_cat && !is_in_home {
                    return Err(format!("Güvenlik İlkesi İhlali: '{}' yolu izin verilen telemetri veya kullanıcı dosyaları listesinde yer almıyor.", arg));
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
async fn run_terminal_command(command: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || run_terminal_command_blocking(command))
        .await
        .map_err(|e| format!("Komut yürütülemedi: {}", e))?
}

fn run_terminal_command_blocking(command: String) -> Result<String, String> {
    let cmd_trimmed = command.trim();
    if cmd_trimmed.is_empty() {
        return Ok(String::new());
    }

    // Güvenlik İlkesi (Whitelist & Parameter Sanity) denetimi
    is_terminal_command_permitted(cmd_trimmed)?;

    #[cfg(target_os = "linux")]
    {
        let child = Command::new("/bin/bash")
            .arg("-c")
            .arg(cmd_trimmed)
            .env("TERM", "xterm-256color")
            .env("PAGER", "cat")
            .output();

        match child {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout).to_string();
                let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                let mut combined = stdout;
                if !stderr.is_empty() {
                    if !combined.is_empty() && !combined.ends_with('\n') {
                        combined.push('\n');
                    }
                    combined.push_str(&stderr);
                }
                Ok(combined)
            }
            Err(e) => Err(format!("Komut yürütülemedi: {}", e)),
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        Ok(format!("[Simüle bash çıkışı]: {} başarıyla yürütüldü.", cmd_trimmed))
    }
}

/// Etkileşimli TUI (nano, vim, htop vb.) veya doğrudan sistem terminali emülatörünü başlatır
#[tauri::command]
async fn launch_interactive_terminal(command: Option<String>) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        let terminal_candidates = [
            "x-terminal-emulator",
            "xterm",
            "lxterminal",
            "xfce4-terminal",
            "sakura",
            "urxvt",
            "kitty",
            "alacritty"
        ];
        let mut chosen_term = None;
        for term in terminal_candidates {
            if let Ok(o) = Command::new("which").arg(term).output() {
                if o.status.success() {
                    chosen_term = Some(term.to_string());
                    break;
                }
            }
        }

        let term_bin = chosen_term.unwrap_or_else(|| "xterm".to_string());
        let cmd_str = command.unwrap_or_default().trim().to_string();
        if !cmd_str.is_empty() {
            // Güvenlik Denetimi: Shell metakarakter ve enjeksiyon engeli
            let forbidden_chars = [';', '&', '|', '`', '$', '\n', '\r', '>', '<', '(', ')'];
            for fc in forbidden_chars {
                if cmd_str.contains(fc) {
                    return Err(format!("Güvenlik İlkesi İhlali: Terminal komutunda yasaklı kabuk karakteri ('{}') tespit edildi.", fc));
                }
            }
            let first_word = cmd_str.split_whitespace().next().unwrap_or("");
            if FORBIDDEN_LAUNCH_BINARIES.contains(&first_word) {
                return Err(format!("Güvenlik İlkesi İhlali: '{}' komutu doğrudan başlatılamaz.", first_word));
            }
            for pat in SENSITIVE_FILE_PATTERNS {
                if cmd_str.to_lowercase().contains(&pat.to_lowercase()) {
                    return Err(format!("Güvenlik İlkesi İhlali: Hassas sisteme erişim engellendi: '{}'.", pat));
                }
            }
        }

        let mut spawn_cmd = Command::new(&term_bin);
        spawn_cmd.env("DISPLAY", std::env::var("DISPLAY").unwrap_or_else(|_| ":0".to_string()));

        if !cmd_str.is_empty() {
            let script = format!("{}; echo; echo '[İşlem tamamlandı, pencereyi kapatmak için Enter tuşuna basın]'; read -r _", cmd_str);
            spawn_cmd.args(["-e", "bash", "-c", &script]);
        }

        match spawn_cmd.spawn() {
            Ok(_) => Ok(format!("Sistem terminali ({}) başlatıldı.", term_bin)),
            Err(e) => Err(format!("Terminal başlatılamadı ({}): {}", term_bin, e)),
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        Ok("Geliştirme ortamında simüle terminal açıldı.".to_string())
    }
}

// ============================================================================
// 5. GÜVENLİ BELGE OKUYUCU (PATH TRAVERSAL KORUMALI) - GÜVENLİK BULGUSU #5
// ============================================================================
#[tauri::command]
async fn read_document_file(file_path: String) -> Result<DocumentResult, String> {
    let raw_path = Path::new(&file_path);

    // 1. Dizin geçişi engeli
    if file_path.contains("..") {
        return Err("Güvenlik Hatası: Dizin geçişine ('..') izin verilmez.".to_string());
    }

    // 2. İzin verilen belge uzantısı kontrolü
    let extension = raw_path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
    if !ALLOWED_DOC_EXTENSIONS.contains(&extension.as_str()) {
        return Err(format!("Güvenlik Hatası: '.{}' uzantılı dosyalar güvenlik nedeniyle okunamaz.", extension));
    }

    // 3. Kanonik dosya yolunu çözümleme
    let canonical = match fs::canonicalize(raw_path) {
        Ok(p) => p,
        Err(_) => return Err(format!("Belge bulunamadı veya erişilemiyor: {}", file_path)),
    };

    // 4. Kanonik dosya yolu üzerinde hassas sistem dosyası kalıp kontrolü
    let canonical_lower = canonical.to_string_lossy().to_lowercase();
    if SENSITIVE_FILE_PATTERNS.iter().any(|pat| canonical_lower.contains(pat)) {
        return Err("Güvenlik Hatası: Hassas sistem dosyalarının okunması engellendi.".to_string());
    }

    // 5. İzin verilen dizin sınırları denetimi
    let allowed_dirs: Vec<PathBuf> = vec![
        dirs::document_dir().unwrap_or_default(),
        dirs::download_dir().unwrap_or_default(),
        dirs::home_dir().unwrap_or_default(),
        PathBuf::from("/root/Belgeler"),
        PathBuf::from("/usr/share/doc"),
        std::env::current_dir().unwrap_or_default(),
    ];

    let is_in_allowed_dir = allowed_dirs.iter().any(|d| {
        !d.as_os_str().is_empty() && canonical.starts_with(d)
    });

    if !is_in_allowed_dir {
        let file_name = canonical.file_name().unwrap_or_default().to_string_lossy();
        if file_name != "ankora-sistem-rehberi.pdf" && file_name != "kiosk-ayarlari.txt" && file_name != "kiosk-ayarlari.md" {
            return Err("Güvenlik Hatası: Yalnızca kullanıcı belgeleri ve sistem dokümantasyonu dizinindeki dosyalar okunabilir.".to_string());
        }
    }

    let metadata = fs::metadata(&canonical).map_err(|e| e.to_string())?;

    // 7. Dosya boyutu sınırı (En fazla 50 MB)
    let file_size = metadata.len();
    if file_size > 50 * 1024 * 1024 {
        return Err("Dosya boyutu çok büyük (50 MB üstü kabul edilmez).".to_string());
    }

    let file_name = canonical.file_name().unwrap_or_default().to_string_lossy().to_string();

    match extension.as_str() {
        "pdf" => {
            let mut file = fs::File::open(&canonical).map_err(|e| e.to_string())?;
            let mut bytes = Vec::new();
            file.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
            let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            let data_uri = format!("data:application/pdf;base64,{}", b64);

            Ok(DocumentResult {
                file_name,
                file_type: "pdf".to_string(),
                file_size,
                content: data_uri,
            })
        }
        "png" | "jpg" | "jpeg" | "webp" | "gif" => {
            // Görsel, data URI olarak aynı Office çerçevesinde gösterilir.
            let mut file = fs::File::open(&canonical).map_err(|e| e.to_string())?;
            let mut bytes = Vec::new();
            file.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
            let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            let mime = match extension.as_str() {
                "png" => "image/png",
                "jpg" | "jpeg" => "image/jpeg",
                "webp" => "image/webp",
                _ => "image/gif",
            };

            Ok(DocumentResult {
                file_name,
                file_type: "image".to_string(),
                file_size,
                content: format!("data:{};base64,{}", mime, b64),
            })
        }
        _ => {
            let text = fs::read_to_string(&canonical).map_err(|e| format!("Dosya okunamadı: {}", e))?;
            Ok(DocumentResult {
                file_name,
                file_type: if extension == "docx" { "docx".to_string() } else { "text".to_string() },
                file_size,
                content: text,
            })
        }
    }
}

#[tauri::command]
async fn list_available_documents() -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    let search_roots = [
        dirs::document_dir().unwrap_or_default(),
        dirs::download_dir().unwrap_or_default(),
        PathBuf::from("/root/Belgeler"),
    ];

    for root in &search_roots {
        if root.exists() {
            if let Ok(entries) = fs::read_dir(root) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                        let ext = ext.to_lowercase();
                        if ALLOWED_DOC_EXTENSIONS.contains(&ext.as_str()) {
                            files.push(path.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }

    if files.is_empty() {
        files.push("/root/Belgeler/ankora-sistem-rehberi.pdf".to_string());
        files.push("/root/Belgeler/kiosk-ayarlari.txt".to_string());
    }

    Ok(files)
}

// ============================================================================
// 6. ANKORA AI, SSRF KORUMASI VE GÜVENLİ EYLEM ZİNCİRİ - BULGULAR #7 VE #8 GİDERİLDİ
// ============================================================================

fn is_private_or_restricted_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(ipv4) => {
            let octets = ipv4.octets();
            // Bulut meta verisi & Link-local: 169.254.0.0/16
            if octets[0] == 169 && octets[1] == 254 {
                return true;
            }
            // Özel IPv4 Blokları (RFC 1918)
            if octets[0] == 10 {
                return true;
            }
            // 172.16.0.0/12
            if octets[0] == 172 && (16..=31).contains(&octets[1]) {
                return true;
            }
            // 192.168.0.0/16
            if octets[0] == 192 && octets[1] == 168 {
                return true;
            }
            // 0.0.0.0/8
            if octets[0] == 0 {
                return true;
            }
            // 100.64.0.0/10 (CGNAT / Shared Address Space)
            if octets[0] == 100 && (64..=127).contains(&octets[1]) {
                return true;
            }
            // 198.18.0.0/15 (Benchmark Testing)
            if octets[0] == 198 && (octets[1] == 18 || octets[1] == 19) {
                return true;
            }
            // 240.0.0.0/4 (Reserved / Future Use)
            if octets[0] >= 240 {
                return true;
            }
            // 127.0.0.0/8 (Loopback)
            if octets[0] == 127 {
                return true;
            }
            if ipv4.is_broadcast() || ipv4.is_multicast() {
                return true;
            }
            false
        }
        IpAddr::V6(ipv6) => {
            if let Some(v4) = ipv6.to_ipv4_mapped() {
                return is_private_or_restricted_ip(&IpAddr::V4(v4));
            }
            if ipv6.is_multicast() {
                return true;
            }
            let seg = ipv6.segments();
            // ::/128 (Unspecified)
            if seg.iter().all(|&s| s == 0) {
                return true;
            }
            // ::1/128 (Loopback)
            if seg[..7].iter().all(|&s| s == 0) && seg[7] == 1 {
                return true;
            }
            // fe80::/10 (Link-local)
            if (seg[0] & 0xffc0) == 0xfe80 {
                return true;
            }
            // fc00::/7 (ULA)
            if (seg[0] & 0xfe00) == 0xfc00 {
                return true;
            }
            // 2001:db8::/32 (Documentation)
            if seg[0] == 0x2001 && seg[1] == 0x0db8 {
                return true;
            }
            false
        }
    }
}

fn validate_ai_endpoint_url(raw_url: &str) -> Result<String, String> {
    let parsed = Url::parse(raw_url).map_err(|e| format!("Geçersiz URL formatı: {}", e))?;

    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return Err("Yalnızca HTTP veya HTTPS protokolü desteklenir.".to_string());
    }

    let host_str = parsed.host_str().ok_or_else(|| "URL ana makine adı (host) içermelidir.".to_string())?;
    let lower_host = host_str.to_lowercase();

    // Bulut sağlayıcı meta veri etki alanları
    if lower_host == "metadata.google.internal"
        || lower_host.ends_with(".metadata.google.internal")
        || lower_host == "instance-data"
        || lower_host == "metadata.internal"
        || lower_host == "metadata.azure.com"
        || lower_host == "169.254.169.254"
    {
        return Err("Güvenlik İlkesi İhlali: Bulut sağlayıcı meta veri uç noktalarına (SSRF) erişim kesinlikle yasaktır.".to_string());
    }

    let is_localhost = lower_host == "localhost" || lower_host == "127.0.0.1" || lower_host == "::1";

    if !is_localhost && scheme != "https" {
        return Err("Güvenlik İlkesi: Yerel olmayan harici AI uç noktaları güvenli HTTPS protokolü kullanmalıdır.".to_string());
    }

    let port = parsed.port_or_known_default().unwrap_or(if scheme == "https" { 443 } else { 80 });
    let socket_addr_str = format!("{}:{}", host_str, port);

    if !is_localhost {
        match socket_addr_str.to_socket_addrs() {
            Ok(addrs) => {
                let mut found = false;
                for sa in addrs {
                    found = true;
                    let ip = sa.ip();
                    if ip.is_loopback() {
                        return Err("Güvenlik İlkesi İhlali: Harici etki alanı yerel döngü (loopback) adresine çözümlenemez.".to_string());
                    } else if is_private_or_restricted_ip(&ip) {
                        return Err(format!(
                            "Güvenlik İlkesi İhlali: SSRF Koruması devrede. Yasaklı dahili/link-local IP adresi tespit edildi: {}",
                            ip
                        ));
                    }
                }
                if !found {
                    return Err("Güvenlik İlkesi İhlali: Alan adı geçerli bir IP adresine çözümlenemedi.".to_string());
                }
            }
            Err(e) => {
                return Err(format!("Güvenlik İlkesi İhlali: Alan adı DNS çözümlemesi başarısız: {}", e));
            }
        }
    }

    Ok(raw_url.to_string())
}

static PENDING_AGENT_ACTION: Mutex<Option<(String, String, Instant)>> = Mutex::new(None);

fn generate_agent_action_token(cmd: &str) -> String {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    let mut hasher = Sha256::new();
    hasher.update(now.to_le_bytes());
    hasher.update(b"ankora-agent-action-token-salt");
    hasher.update(cmd.as_bytes());
    let token = format!("{:x}", hasher.finalize());

    if let Ok(mut pending) = PENDING_AGENT_ACTION.lock() {
        *pending = Some((token.clone(), cmd.to_string(), Instant::now()));
    }

    token
}

#[tauri::command]
async fn query_local_ai(
    prompt: String,
    provider: Option<String>,
    endpoint: Option<String>,
    api_key: Option<String>,
    model: Option<String>,
    agent_mode: Option<String>,
) -> Result<AiResponse, String> {
    let prov = provider.unwrap_or_else(|| "ollama".to_string()).to_lowercase();
    let mode = agent_mode.unwrap_or_else(|| "sysadmin".to_string()).to_lowercase();

    let sys_prompt = match mode.as_str() {
        "developer" => {
            "Sen Ankora Linux (Devuan Daedalus) sistem geliştirici ve terminal asistanısın. \
            Bash betikleri, Debian derleme, Rust/C geliştirme ve paket araçları konusunda teknik rehberlik sağla. \
            Eğer bir komut yürütülmesi gerekiyorsa yanıtının sonuna tam olarak şu formatta bir eylem etiketi ekle: \
            <<<ACTION:{\"command\":\"izin_verilen_komut\",\"desc\":\"Eylemin açıklaması\"}>>> \
            Sadece izin verilen sistem bakım komutları üret."
        }
        "general" => {
            "Sen Ankora Linux işletim sisteminin dost canlısı, Türkçe ve profesyonel genel asistanısın. \
            Kullanıcının sorularını açık, kibar ve teknik doğrulukla yanıtla. \
            Gerekirse sistem komutunu şu formatta ekle: \
            <<<ACTION:{\"command\":\"izin_verilen_komut\",\"desc\":\"Eylemin açıklaması\"}>>>"
        }
        _ => {
            "Sen Ankora Linux (Devuan Daedalus) işletim sisteminin yerel sistem yöneticisi ve teftiş ajanısın. \
            Kullanıcıya teknik, kısa ve profesyonel yanıtlar ver. \
            Eğer kullanıcının talebi sistemde bir bakım, telemetre sorgusu veya temizlik gerektiriyorsa, \
            yanıtının sonuna tam olarak şu formatta bir eylem etiketi ekle: \
            <<<ACTION:{\"command\":\"izin_verilen_komut\",\"desc\":\"Eylemin açıklaması\"}>>> \
            Asla tehlikeli veya rastgele komut üretme. Sadece doğrulanmış sistem komutları üret."
        }
    };

    let resolved_key = match api_key {
        Some(ref k) if !k.trim().is_empty() => k.trim().to_string(),
        _ => {
            let map = load_credentials();
            map.get(&prov).cloned().unwrap_or_default()
        }
    };

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let parse_action_from_text = |text: &str| -> (String, bool, Option<String>, Option<String>, Option<String>) {
        if let Some(start_idx) = text.find("<<<ACTION:") {
            if let Some(end_idx) = text[start_idx..].find(">>>") {
                let json_str = &text[start_idx + 10..start_idx + end_idx];
                let clean_reply = text[..start_idx].trim().to_string();

                if let Ok(action_val) = serde_json::from_str::<serde_json::Value>(json_str) {
                    let proposed_cmd = action_val["command"].as_str().unwrap_or("").trim().to_string();
                    if ALLOWED_AGENT_ACTIONS.contains(&proposed_cmd.as_str()) {
                        let token = generate_agent_action_token(&proposed_cmd);
                        return (
                            clean_reply,
                            true,
                            Some(proposed_cmd),
                            action_val["desc"].as_str().map(|s| s.to_string()),
                            Some(token),
                        );
                    }
                }
            }
        }
        (text.to_string(), false, None, None, None)
    };

    // 1. OLLAMA (Yalnızca yerel IP / localhost)
    if prov == "ollama" {
        let url = endpoint.unwrap_or_else(|| "http://127.0.0.1:11434/api/generate".to_string());
        if !url.starts_with("http://127.0.0.1:") && !url.starts_with("http://localhost:") {
            return Err("Güvenlik Hatası: Ollama uç noktası yalnızca yerel adreslerde (127.0.0.1 veya localhost) çalışabilir.".to_string());
        }
        let ai_model = model.unwrap_or_else(|| "qwen2.5:0.5b".to_string());
        let payload = serde_json::json!({
            "model": ai_model,
            "prompt": format!("{}\n\nKullanıcı: {}", sys_prompt, prompt),
            "stream": false
        });

        if let Ok(resp) = client.post(&url).json(&payload).send().await {
            if resp.status().is_success() {
                if let Ok(json_data) = resp.json::<serde_json::Value>().await {
                    let raw_reply = json_data["response"].as_str().unwrap_or("").to_string();
                    let (reply, has_action, action_command, action_desc, action_token) = parse_action_from_text(&raw_reply);
                    return Ok(AiResponse { reply, has_action, action_command, action_desc, action_token });
                }
            }
        }
    } 
    // 2. GOOGLE GEMINI (Resmi Güvenli Endpoint)
    else if prov == "gemini" {
        if resolved_key.is_empty() {
            return Err("Google Gemini API anahtarı bulunamadı. Lütfen API Ayarları panelinden anahtarınızı kaydedin.".to_string());
        }
        let ai_model = model.unwrap_or_else(|| "gemini-2.0-flash".to_string());
        // Anahtar URL'ye yazılmaz: sorgu satırları proxy, günlük ve hata
        // ekranlarına aynen düşer. Model adı yol kısmını da dar tutulur.
        if !ai_model
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "-._/".contains(c))
        {
            return Err("Geçersiz model adı.".to_string());
        }
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
            ai_model
        );
        let payload = serde_json::json!({
            "contents": [{
                "parts": [{ "text": format!("{}\n\nKullanıcı: {}", sys_prompt, prompt) }]
            }]
        });

        match client
            .post(&url)
            .header("x-goog-api-key", resolved_key.as_str())
            .json(&payload)
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(json_data) = resp.json::<serde_json::Value>().await {
                    let text = json_data["candidates"][0]["content"]["parts"][0]["text"].as_str().unwrap_or("").to_string();
                    let (reply, has_action, action_command, action_desc, action_token) = parse_action_from_text(&text);
                    return Ok(AiResponse { reply, has_action, action_command, action_desc, action_token });
                }
            }
            Ok(resp) => {
                return Err(format!("Gemini API Hatası (HTTP {}): API anahtarını veya model adını kontrol edin.", resp.status()));
            }
            Err(e) => return Err(format!("Gemini bağlantı hatası: {}", e)),
        }
    }
    // 3. OPENAI / GROQ / OPENROUTER / CUSTOM (SSRF ve Redirect Korumalı)
    else {
        let (url, default_model) = match prov.as_str() {
            "openai" => ("https://api.openai.com/v1/chat/completions".to_string(), "gpt-4o-mini".to_string()),
            "groq" => ("https://api.groq.com/openai/v1/chat/completions".to_string(), "llama-3.3-70b-versatile".to_string()),
            "openrouter" => ("https://openrouter.ai/api/v1/chat/completions".to_string(), "anthropic/claude-3.5-sonnet".to_string()),
            _ => {
                let custom_url = endpoint.unwrap_or_else(|| "http://127.0.0.1:8000/v1/chat/completions".to_string());
                let validated_url = validate_ai_endpoint_url(&custom_url)?;
                (validated_url, "default".to_string())
            }
        };
        let ai_model = model.unwrap_or(default_model);

        let mut req = client.post(&url);
        if !resolved_key.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", resolved_key));
        } else if prov != "custom" {
            return Err(format!("{} API anahtarı tanımlanmadı. Lütfen API Ayarları panelinden anahtarınızı kaydedin.", prov.to_uppercase()));
        }

        let payload = serde_json::json!({
            "model": ai_model,
            "messages": [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.3
        });

        match req.json(&payload).send().await {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(json_data) = resp.json::<serde_json::Value>().await {
                    let text = json_data["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string();
                    let (reply, has_action, action_command, action_desc, action_token) = parse_action_from_text(&text);
                    return Ok(AiResponse { reply, has_action, action_command, action_desc, action_token });
                }
            }
            Ok(resp) => {
                return Err(format!("API Servis Hatası (HTTP {}): API anahtarı veya servis adresi doğrulanamadı.", resp.status()));
            }
            Err(e) => {
                if prov != "ollama" {
                    return Err(format!("{} servisine bağlanılamadı: {}", prov.to_uppercase(), e));
                }
            }
        }
    }

    // Yerel akıllı analiz modu (Fallback)
    let p_lower = prompt.to_lowercase();
    if p_lower.contains("temizle") || p_lower.contains("önbellek") {
        let cmd = "apt-get clean && rm -rf /tmp/*".to_string();
        let token = generate_agent_action_token(&cmd);
        Ok(AiResponse {
            reply: "Sistem önbelleklerinin temizlenmesi için paket önbelleği boşaltılmalıdır.".to_string(),
            has_action: true,
            action_command: Some(cmd),
            action_desc: Some("Sistem ve geçici dosya önbelleklerini temizleme".to_string()),
            action_token: Some(token),
        })
    } else if p_lower.contains("durum") || p_lower.contains("disk") || p_lower.contains("ram") {
        let cmd = "df -h / && free -m".to_string();
        let token = generate_agent_action_token(&cmd);
        Ok(AiResponse {
            reply: "Disk ve bellek doluluk raporu taranıyor.".to_string(),
            has_action: true,
            action_command: Some(cmd),
            action_desc: Some("Disk ve bellek durumunu sorgulama".to_string()),
            action_token: Some(token),
        })
    } else {
        Ok(AiResponse {
            reply: format!(
                "Ankora AI Çekirdeği hazır. Harici API veya yerel Ollama servisi çevrimdışı olduğundan dahili analiz modunda yanıt veriliyor:\n\"{}\"\n\n(Kendi API anahtarınızı (OpenAI, Gemini, Groq) AI penceresindeki 'API Ayarları' butonundan bağlayabilirsiniz.)",
                prompt
            ),
            has_action: false,
            action_command: None,
            action_desc: None,
            action_token: None,
        })
    }
}

#[tauri::command]
async fn execute_agent_confirmed_action(command: String, token: String) -> Result<String, String> {
    let cmd_trimmed = command.trim();
    if !ALLOWED_AGENT_ACTIONS.contains(&cmd_trimmed) {
        return Err("Güvenlik İlkesi İhlali: Bu eylem önceden onaylanmış güvenlik politikası listesinde yer almıyor.".to_string());
    }

    let token_valid = {
        let mut pending = PENDING_AGENT_ACTION.lock().map_err(|e| e.to_string())?;
        if let Some((stored_token, stored_cmd, created_at)) = pending.take() {
            let is_match = stored_token == token.trim() && stored_cmd == cmd_trimmed;
            let is_fresh = created_at.elapsed() <= Duration::from_secs(60);
            is_match && is_fresh
        } else {
            false
        }
    };

    if !token_valid {
        return Err("Yetkilendirme Hatası: Eylem onay token'ı geçersiz, eşleşmiyor veya 60 saniyelik geçerlilik süresi dolmuş.".to_string());
    }

    run_terminal_command(command).await
}

// ============================================================================
// 7. GÜVENLİ KURULUM MOTORU (COMMAND ARGS & STDIN CHPASSWD) - BULGULAR #3 & #8
// ============================================================================
#[tauri::command]
async fn get_storage_devices() -> Result<Vec<StorageDisk>, String> {
    // lsblk cihaz ağacını diske sorar; bloklayıcı çağrı havuza alınır.
    tauri::async_runtime::spawn_blocking(get_storage_devices_blocking)
        .await
        .map_err(|e| format!("Depolama listesi alınamadı: {}", e))?
}

fn get_storage_devices_blocking() -> Result<Vec<StorageDisk>, String> {
    #[cfg(target_os = "linux")]
    {
        // JSON formatında parse ederek boşluklu MODEL adlarını doğru yakalıyoruz
        let output = Command::new("lsblk").args(["-d", "-b", "-J", "-o", "NAME,SIZE,MODEL,RM,TYPE"]).output();
        if let Ok(out) = output {
            if out.status.success() {
                let stdout = String::from_utf8_lossy(&out.stdout);
                if let Ok(json_data) = serde_json::from_str::<serde_json::Value>(&stdout) {
                    let mut disks = Vec::new();
                    if let Some(devices) = json_data["blockdevices"].as_array() {
                        for dev in devices {
                            let dtype = dev["type"].as_str().unwrap_or("");
                            if dtype != "disk" {
                                continue;
                            }
                            let name = dev["name"].as_str().unwrap_or("").to_string();
                            if name.is_empty() || name.starts_with("loop") || name.starts_with("zram") || name.starts_with("sr") {
                                continue;
                            }
                            let size_bytes = dev["size"].as_u64()
                                .or_else(|| dev["size"].as_str().and_then(|s| s.parse().ok()))
                                .unwrap_or(0);
                            let model = dev["model"].as_str().unwrap_or("Sabit Disk").trim().to_string();
                            let model = if model.is_empty() { "Sabit Disk".to_string() } else { model };
                            let is_removable = dev["rm"].as_bool()
                                .or_else(|| dev["rm"].as_str().map(|s| s == "1"))
                                .or_else(|| dev["rm"].as_u64().map(|v| v == 1))
                                .unwrap_or(false);
                            let size_gb = (size_bytes as f64) / (1024.0 * 1024.0 * 1024.0);
                            disks.push(StorageDisk {
                                path: format!("/dev/{}", name),
                                name,
                                size_gb: (size_gb * 10.0).round() / 10.0,
                                model,
                                is_removable,
                            });
                        }
                    }
                    if !disks.is_empty() {
                        return Ok(disks);
                    }
                }
            }
        }
    }

    Ok(vec![
        StorageDisk {
            name: "sda".to_string(),
            path: "/dev/sda".to_string(),
            size_gb: 256.0,
            model: "Dahili SATA SSD".to_string(),
            is_removable: false,
        },
        StorageDisk {
            name: "nvme0n1".to_string(),
            path: "/dev/nvme0n1".to_string(),
            size_gb: 512.0,
            model: "NVMe M.2 SSD".to_string(),
            is_removable: false,
        }
    ])
}

#[tauri::command]
async fn execute_system_installation(payload: InstallPayload) -> Result<String, String> {
    // Bölümleme/kurulum dakikalarca sürer; tamamı bloklayıcı iş parçacığında.
    tauri::async_runtime::spawn_blocking(move || execute_system_installation_blocking(payload))
        .await
        .map_err(|e| format!("Kurulum görevi yürütülemedi: {}", e))?
}

fn execute_system_installation_blocking(payload: InstallPayload) -> Result<String, String> {
    let target = payload.target_disk.trim();
    if !is_valid_disk_target(target) {
        return Err("Geçersiz hedef disk seçimi (Örn: /dev/sda veya /dev/nvme0n1, bölümler seçilemez).".to_string());
    }

    let username = payload.username.trim();
    if !is_valid_username(username) {
        return Err("Geçersiz kullanıcı adı. Yalnızca küçük harfler, rakamlar ve alt çizgi/tire kullanılabilir (en fazla 32 karakter).".to_string());
    }

    let hostname = payload.hostname.trim();
    if !is_valid_hostname(hostname) {
        return Err("Geçersiz makine adı (hostname). RFC 1123 standartlarına uygun olmalıdır.".to_string());
    }

    let password = payload.password.trim();
    if password.is_empty() || password.contains('\0') || password.contains('\n') || password.contains('\r') {
        return Err("Geçersiz parola karakterleri tespit edildi.".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        let cleanup_mounts = || {
            let _ = root_command("umount", &["-lf", "/target/sys/firmware/efi/efivars"]);
            let _ = root_command("umount", &["-lf", "/target/dev/pts"]);
            let _ = root_command("umount", &["-lf", "/target/dev"]);
            let _ = root_command("umount", &["-lf", "/target/proc"]);
            let _ = root_command("umount", &["-lf", "/target/sys"]);
            let _ = root_command("umount", &["-lf", "/target/run"]);
            let _ = root_command("umount", &["-lf", "/target/boot/efi"]);
            let _ = root_command("umount", &["-lf", "/target"]);
        };

        let run_step = |prog: &str, args: &[&str]| -> Result<(), String> {
            let res = root_command(prog, args)
                .map_err(|e| format!("'{}' süreci başlatılamadı: {}", prog, e))?;
            if !res.status.success() {
                let err = String::from_utf8_lossy(&res.stderr);
                cleanup_mounts();
                return Err(format!("'{}' işlemi başarısız oldu (Çıkış Kodu {}): {}", prog, res.status.code().unwrap_or(-1), err.trim()));
            }
            Ok(())
        };

        // 1. Bölümleme: Hibrit BIOS + UEFI Uyumlu GPT Bölümleme
        let _ = root_command("wipefs", &["-a", "-f", target]);
        run_step("parted", &["-s", target, "mklabel", "gpt"])?;
        run_step("parted", &["-s", target, "mkpart", "bios_boot", "1MiB", "3MiB"])?;
        let _ = root_command("parted", &["-s", target, "set", "1", "bios_grub", "on"]);
        run_step("parted", &["-s", target, "mkpart", "ESP", "fat32", "3MiB", "515MiB"])?;
        run_step("parted", &["-s", target, "set", "2", "esp", "on"])?;
        run_step("parted", &["-s", target, "mkpart", "primary", "ext4", "515MiB", "100%"])?;

        let _ = root_command("partprobe", &[target]);
        let _ = root_command("udevadm", &["settle"]);

        let (_bios_part, efi_part, root_part) = if target.chars().last().map_or(false, |c| c.is_ascii_digit()) {
            (format!("{}p1", target), format!("{}p2", target), format!("{}p3", target))
        } else {
            (format!("{}1", target), format!("{}2", target), format!("{}3", target))
        };

        // 2. Dosya Sistemleri
        run_step("mkfs.vfat", &["-F32", &efi_part])?;
        run_step("mkfs.ext4", &["-F", "-L", "ANKORA_ROOT", &root_part])?;

        // 3. Bağlama Noktaları (Mounts) — dizinler de root gerektirir
        let _ = run_step("mkdir", &["-p", "/target"]);
        run_step("mount", &[&root_part, "/target"])?;
        let _ = run_step("mkdir", &["-p", "/target/boot/efi"]);
        run_step("mount", &[&efi_part, "/target/boot/efi"])?;

        // 4. Kök Dosya Sistemini Kopyalama (Önce tertemiz squashfs kontrolü)
        let sq_paths = [
            "/run/live/medium/live/filesystem.squashfs",
            "/lib/live/mount/medium/live/filesystem.squashfs",
            "/run/live/rootfs/filesystem.squashfs",
        ];
        let found_sq = sq_paths.iter().find(|p| Path::new(p).is_file());
        if let Some(sq) = found_sq {
            let _ = root_command("unsquashfs", &["-f", "-d", "/target", sq]);
        } else {
            run_step("rsync", &[
                "-aAX", "--info=progress2", "/", "/target/",
                "--exclude=/proc/*", "--exclude=/sys/*", "--exclude=/dev/*",
                "--exclude=/tmp/*", "--exclude=/run/*", "--exclude=/mnt/*",
                "--exclude=/media/*", "--exclude=/target/*", "--exclude=/home/*",
                "--exclude=/lib/live/mount/*", "--exclude=/var/log/*"
            ])?;
        }

        // 5. /etc/fstab Yapılandırması (UUID eşlemesi ile kalıcı ve hatasız bağlama)
        let root_uuid = Command::new("blkid")
            .args(["-s", "UUID", "-o", "value", &root_part])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default();
        let efi_uuid = Command::new("blkid")
            .args(["-s", "UUID", "-o", "value", &efi_part])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default();

        let root_dev = if !root_uuid.is_empty() { format!("UUID={}", root_uuid) } else { root_part.clone() };
        let efi_dev = if !efi_uuid.is_empty() { format!("UUID={}", efi_uuid) } else { efi_part.clone() };

        let fstab_content = format!(
            "# /etc/fstab generated by Ankora Linux Installer\n{} / ext4 errors=remount-ro 0 1\n{} /boot/efi vfat umask=0077 0 1\ntmpfs /tmp tmpfs defaults,noatime,mode=1777 0 0\n",
            root_dev, efi_dev
        );
        let _ = root_write("/target/etc/fstab", &fstab_content);

        // 6. Hostname ve Hosts
        if let Err(e) = root_write("/target/etc/hostname", &format!("{}\n", hostname)) {
            cleanup_mounts();
            return Err(format!("Hostname dosyası yazılamadı: {}", e));
        }
        let hosts_content = format!(
            "127.0.0.1\tlocalhost\n127.0.1.1\t{}\n\n::1\tlocalhost ip6-localhost ip6-loopback\nff02::1\tip6-allnodes\nff02::2\tip6-allrouters\n",
            hostname
        );
        let _ = root_write("/target/etc/hosts", &hosts_content);

        // 7. Chroot için Gerekli Bind Mount'lar
        let bind_mounts = ["/dev", "/dev/pts", "/proc", "/sys", "/run"];
        for bm in &bind_mounts {
            let target_bm = format!("/target{}", bm);
            let _ = root_command("mkdir", &["-p", &target_bm]);
            let _ = root_command("mount", &["--bind", bm, &target_bm]);
        }
        if Path::new("/sys/firmware/efi/efivars").is_dir() {
            let _ = root_command("mkdir", &["-p", "/target/sys/firmware/efi/efivars"]);
            let _ = root_command("mount", &["--bind", "/sys/firmware/efi/efivars", "/target/sys/firmware/efi/efivars"]);
        }

        // 8. Kullanıcı Oluşturma: ankora zaten varsa ezmeden ev dizinini yapılandır
        if username == "ankora" {
            let _ = root_command("mkdir", &["-p", "/target/home/ankora"]);
            let _ = root_command("sh", &["-c", "cp -rT /target/etc/skel /target/home/ankora 2>/dev/null || true"]);
            let _ = root_command("chroot", &["/target", "chown", "-R", "ankora:ankora", "/home/ankora"]);
            let _ = root_command("chroot", &["/target", "usermod", "-aG", "sudo,audio,video,plugdev", "ankora"]);
            let _ = root_command("chroot", &["/target", "usermod", "-U", "ankora"]);
        } else {
            run_step("chroot", &["/target", "useradd", "-m", "-s", "/bin/bash", "-G", "sudo,audio,video,plugdev", username])?;
        }

        // 9. Parola Belirleme: Parola doğrudan STDIN borusundan beslenir
        let mut chpasswd_cmd = if sudo_available() {
            let mut c = Command::new("sudo");
            c.args(["-n", "chroot"]);
            c
        } else {
            Command::new("chroot")
        };
        let mut chpasswd_child = chpasswd_cmd
            .args(["/target", "chpasswd"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("chpasswd süreci başlatılamadı: {}", e))?;

        if let Some(mut stdin) = chpasswd_child.stdin.take() {
            let pair = format!("{}:{}\n", username, password);
            stdin.write_all(pair.as_bytes()).map_err(|e| format!("Parola stdin'e aktarılamadı: {}", e))?;
            drop(stdin);
        }
        let chpasswd_res = chpasswd_child.wait_with_output().map_err(|e| e.to_string())?;
        if !chpasswd_res.status.success() {
            cleanup_mounts();
            return Err("Kullanıcı parolası güncellenemedi.".to_string());
        }

        // 10. Canlı oturumun izleri kurulu sisteme taşımaz: rsync /etc'i de
        //     kopyaladığı için `ankora` hesabının herkese açık bilinen parolası
        //     ve şifresiz sudo yetkisi kurulan makinede parolasız root açardı.
        //     Önce otomatik giriş satırı kurulu kullanıcıya bağlanır, ancak
        //     ondan sonra canlı hesabın parolası kilitlenir.
        let inittab_path = "/target/etc/inittab";
        let mut inittab_yazildi = false;
        if let Ok(icerik) = fs::read_to_string(inittab_path) {
            let yeni_satir = if payload.autologin {
                format!("1:2345:respawn:/sbin/getty --autologin {} --noclear 38400 tty1 linux", username)
            } else {
                "1:2345:respawn:/sbin/getty 38400 tty1 linux".to_string()
            };
            let mut yeni = String::new();
            for satir in icerik.lines() {
                if (satir.contains("getty") && satir.contains("tty1")) {
                    yeni.push_str(&yeni_satir);
                    inittab_yazildi = true;
                } else {
                    yeni.push_str(satir);
                }
                yeni.push('\n');
            }
            if inittab_yazildi {
                let _ = root_write(inittab_path, &yeni);
            } else {
                let mut ek = icerik;
                ek.push('\n');
                ek.push_str(&yeni_satir);
                ek.push('\n');
                let _ = root_write(inittab_path, &ek);
            }
        }

        if username == "ankora" {
            // Canlı kullanıcı seçildiyse: parola korumalı standart sudoers
            let _ = root_write("/target/etc/sudoers.d/ankora", "ankora ALL=(ALL:ALL) ALL\n");
            let _ = root_command("chmod", &["0440", "/target/etc/sudoers.d/ankora"]);
        } else {
            let _ = root_command("rm", &["-f", "/target/etc/sudoers.d/ankora"]);
            // Kurulu sistem güvenliği: Kullanıcı sudo grubuna eklenir (parolalı tam yönetim).
            // Kullanıcıya sınırsız şifresiz NOPASSWD: ALL verilmez; yalnızca onaylı sistem yardımcıları NOPASSWD alır.
            let _ = root_command("chroot", &["/target", "usermod", "-aG", "sudo", &username]);
            let _ = root_command("chroot", &["/target", "gpasswd", "-d", "ankora", "sudo"]);
            let _ = root_command("chroot", &["/target", "sed", "-i", "/^ankora /d", "/etc/sudoers.d/ankora-updater"]);
            let upd_entry = format!("{} ALL=(root) NOPASSWD: /usr/local/bin/ayaz-update-helper, /usr/local/bin/ayaz-pkg-helper, /usr/local/bin/ankora-doctor, /bin/true, /usr/bin/true, /sbin/poweroff, /sbin/reboot, /sbin/shutdown\n", username);
            let _ = root_write("/target/etc/sudoers.d/ankora-updater", &upd_entry);
            let _ = root_command("chmod", &["0440", "/target/etc/sudoers.d/ankora-updater"]);
            if inittab_yazildi {
                // Otomatik giriş artık canlı hesaba bağlı değil: bilinen parola
                // geçersiz kılınır, hesap silinmez ki başka referanslar kırılmasın.
                let _ = root_command("chroot", &["/target", "usermod", "-L", "ankora"]);
            }
        }

        // 10b. Bölge / dil / saat kurulu sisteme taşınır: kurulum sihirbazındaki
        // seçimler (yoksa canlı oturumun değerleri) hedefe yazılır.
        let want_tz = payload.timezone.clone().filter(|t| is_valid_timezone(t)).unwrap_or_else(current_timezone);
        let want_kb = payload.keyboard_layout.clone().filter(|k| ALLOWED_KEYBOARDS.contains(&k.as_str())).unwrap_or_else(current_keyboard_layout);
        let want_lang = payload.language.clone().filter(|l| ALLOWED_LANGUAGES.contains(&l.as_str())).unwrap_or_else(current_language);
        let _ = root_write("/target/etc/timezone", &format!("{}\n", want_tz));
        let _ = root_command("ln", &["-sf", &format!("/usr/share/zoneinfo/{}", want_tz), "/target/etc/localtime"]);
        let _ = root_command("chroot", &["/target", "sh", "-c", "DEBIAN_FRONTEND=noninteractive dpkg-reconfigure -f noninteractive tzdata 2>/dev/null; true"]);
        let (kb_layout, kb_variant) = match want_kb.as_str() {
            "tr_f" => ("tr", "f"),
            other => (other, ""),
        };
        let _ = root_write("/target/etc/default/keyboard", &format!("XKBMODEL=\"pc105\"\nXKBLAYOUT=\"{}\"\nXKBVARIANT=\"{}\"\nXKBOPTIONS=\"\"\nBACKSPACE=\"guess\"\n", kb_layout, kb_variant));
        let lang_short = want_lang.split('.').next().unwrap_or(&want_lang);
        let _ = root_write("/target/etc/default/locale", &format!("LANG={}\nLANGUAGE={}:{}\nLC_ALL={}\n", want_lang, lang_short, lang_short.split('_').next().unwrap_or(lang_short), want_lang));
        let _ = root_command("chroot", &["/target", "sh", "-c", &format!("command -v update-locale >/dev/null && update-locale LANG={} 2>/dev/null; command -v locale-gen >/dev/null && locale-gen {} en_US.UTF-8 2>/dev/null; true", want_lang, want_lang)]);

        // ZRAM Takas Servisi ve Optimizasyonunu kurulu sisteme kur
        let _ = root_write("/target/etc/default/rcS", "# Ankora Linux 2.0 Hızlı Paralel Açılış\nCONCURRENCY=makefile\nUTC=yes\nVERBOSE=no\nFSCKFIX=no\n");
        let _ = root_write("/target/etc/sysctl.d/99-zram.conf", "vm.swappiness = 100\nvm.vfs_cache_pressure = 50\nvm.watermark_boost_factor = 0\nvm.dirty_background_ratio = 5\nvm.dirty_ratio = 10\n");
        let zram_script = "#!/bin/sh\ncase \"$1\" in\n  start)\n    modprobe zram num_devices=1 2>/dev/null || true\n    if [ -e /dev/zram0 ]; then\n      for alg in zstd lz4 lzo; do\n        if grep -q \"$alg\" /sys/block/zram0/comp_algorithm 2>/dev/null; then\n          echo \"$alg\" > /sys/block/zram0/comp_algorithm 2>/dev/null && break\n        fi\n      done\n      MEM_TOTAL_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}')\n      DISKSIZE=$(( MEM_TOTAL_KB * 1024 / 2 ))\n      echo \"$DISKSIZE\" > /sys/block/zram0/disksize 2>/dev/null || true\n      mkswap /dev/zram0 >/dev/null 2>&1 || true\n      swapon -p 100 /dev/zram0 2>/dev/null || true\n    fi\n    ;;\n  stop)\n    swapoff /dev/zram0 2>/dev/null || true\n    echo 1 > /sys/block/zram0/reset 2>/dev/null || true\n    ;;\n  restart)\n    $0 stop; $0 start;;\nesac\nexit 0\n";
        let _ = root_write("/target/etc/init.d/zram-swap", zram_script);
        let _ = root_command("chmod", &["0755", "/target/etc/init.d/zram-swap"]);
        let _ = root_command("chroot", &["/target", "update-rc.d", "zram-swap", "defaults", "05", "95"]);

        // 11. Grub & Temizlik (Hibrit EFI + BIOS desteği)
        let is_efi = Path::new("/sys/firmware/efi").is_dir();
        if is_efi {
            let _ = run_step("chroot", &["/target", "grub-install", "--target=x86_64-efi", "--efi-directory=/boot/efi", "--bootloader-id=ankora", "--recheck"]);
            let _ = root_command("chroot", &["/target", "grub-install", "--target=x86_64-efi", "--efi-directory=/boot/efi", "--bootloader-id=ankora", "--removable", "--recheck"]);
            let _ = root_command("chroot", &["/target", "grub-install", "--target=i386-pc", "--recheck", target]);
        } else {
            run_step("chroot", &["/target", "grub-install", "--target=i386-pc", "--recheck", target])?;
        }
        // 11b. Ankora önyükleyici görünümü: modern GRUB menüsü + açılış ekranı.
        // Tema ve varsayılanlar canlı sistemden (/usr/share/ayaz) hedefe
        // taşınır; eksiklerse kurulum durmaz, yalnızca varsayılan GRUB kalır.
        let grub_theme_src = "/usr/share/ayaz/grub-theme-ankora/theme.txt";
        let grub_default_src = "/usr/share/ayaz/ankora-grub-default";
        let plymouth_src_dir = "/usr/share/ayaz/plymouth-theme-ankora";
        let theme_ok = Path::new(grub_theme_src).is_file();
        if theme_ok {
            let _ = root_command("mkdir", &["-p", "/target/boot/grub/themes/ankora"]);
            let _ = root_command("cp", &[grub_theme_src, "/target/boot/grub/themes/ankora/theme.txt"]);
        }
        if Path::new(grub_default_src).is_file() {
            let _ = root_command("cp", &[grub_default_src, "/target/etc/default/grub"]);
        } else {
            let grub_defaults = "GRUB_DEFAULT=0\nGRUB_TIMEOUT_STYLE=menu\nGRUB_TIMEOUT=5\nGRUB_DISTRIBUTOR=\"Ankora Linux\"\nGRUB_CMDLINE_LINUX_DEFAULT=\"quiet splash loglevel=3\"\nGRUB_CMDLINE_LINUX=\"\"\nGRUB_GFXMODE=1920x1080,1366x768,auto\nGRUB_GFXPAYLOAD_LINUX=keep\nGRUB_DISABLE_OS_PROBER=false\nGRUB_DISABLE_RECOVERY=true\n";
            let with_theme = if theme_ok {
                format!("{}GRUB_THEME=/boot/grub/themes/ankora/theme.txt\n", grub_defaults)
            } else {
                grub_defaults.to_string()
            };
            let _ = root_write("/target/etc/default/grub", &with_theme);
        }
        // Plymouth açılış ekranı: tema hedefe kopyalanır, varsayılan yapılır.
        // initramfs yeniden derlemesi 12. adımda zaten çalışır.
        if Path::new(&format!("{}/ankora.plymouth", plymouth_src_dir)).is_file() {
            let _ = root_command("mkdir", &["-p", "/target/usr/share/plymouth/themes/ankora"]);
            let _ = root_command("sh", &["-c", "cp -r /usr/share/ayaz/plymouth-theme-ankora/* /target/usr/share/plymouth/themes/ankora/ 2>/dev/null || true"]);
            let _ = root_command("chroot", &["/target", "plymouth-set-default-theme", "-R", "ankora"]);
        }
        run_step("chroot", &["/target", "update-grub"])?;

        // 12. Sistem Temizliği: machine-id sıfırlama ve eski SSH anahtarlarının temizlenmesi
        let _ = root_command("rm", &["-f", "/target/etc/machine-id", "/target/var/lib/dbus/machine-id"]);
        let _ = root_command("chroot", &["/target", "dbus-uuidgen", "--ensure=/var/lib/dbus/machine-id"]);
        let _ = root_command("cp", &["/target/var/lib/dbus/machine-id", "/target/etc/machine-id"]);
        let _ = root_command("sh", &["-c", "rm -f /target/etc/ssh/ssh_host_* /target/var/lib/dhcp/* /target/root/.bash_history"]);
        let _ = root_command("sh", &["-c", "find /target/var/log -type f -delete 2>/dev/null; rm -rf /target/var/tmp/* 2>/dev/null; true"]);
        // Canlı paketler kurulu sistemde kalırsa live-config her açılışta
        // canlı kullanıcıyı ve otomatik girişi yeniden kurabilir.
        let _ = root_command("sh", &["-c", "chroot /target dpkg --purge live-config live-config-sysvinit live-boot live-boot-initramfs-tools live-tools 2>/dev/null; rm -f /target/etc/rcS.d/S*live-config* /target/etc/init.d/live-config*; true"]);
        let _ = root_command("chroot", &["/target", "update-initramfs", "-u", "-k", "all"]);
        let _ = root_command("sh", &["-c", "[ -x /target/usr/bin/ssh-keygen ] && chroot /target ssh-keygen -A; true"]);

        cleanup_mounts();

        Ok("Ankora Linux başarıyla kuruldu.".to_string())
    }

    #[cfg(not(target_os = "linux"))]
    {
        Ok(format!("Kurulum simülasyonu başarıyla tamamlandı: {} -> {}", target, username))
    }
}

// ============================================================================
// 8. GÜVENLİ UYGULAMA BAŞLATICI - GÜVENLİK BULGUSU #4
// ============================================================================
#[tauri::command]
async fn launch_application(exec: String) -> Result<String, String> {
    let clean = exec.trim();
    if clean.is_empty() {
        return Err("Uygulama komutu belirtilmedi.".to_string());
    }

    // 1. Kabuk kontrol karakterleri koruması
    let has_shell_metachars = clean.chars().any(|c| {
        matches!(c, ';' | '&' | '|' | '`' | '$' | '>' | '<' | '\\' | '(' | ')' | '\n' | '\r')
    });
    if has_shell_metachars {
        return Err("Güvenlik Hatası: Uygulama komutunda kabuk kontrol karakterleri tespit edildi.".to_string());
    }

    // 2. Argümanları güvenle ayrıştırma
    let parts: Vec<&str> = clean.split_whitespace().collect();
    if parts.is_empty() {
        return Err("Çalıştırılacak uygulama tespit edilemedi.".to_string());
    }

    let bin_name = parts[0];
    let args = &parts[1..];

    // 3. Dizin geçişi ve kara liste doğrulaması
    if bin_name.contains("..") {
        return Err("Güvenlik Hatası: Dizin geçişine ('..') izin verilmez.".to_string());
    }

    let base_bin = Path::new(bin_name)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(bin_name);

    if FORBIDDEN_LAUNCH_BINARIES.contains(&base_bin) {
        return Err(format!(
            "Güvenlik İlkesi İhlali: '{}' sistem aracı güvenlik nedeniyle doğrudan başlatılamaz.",
            base_bin
        ));
    }

    // 3b. Argümanlarda geçen ikili adlar da kara listeye tabidir.
    // `xterm -e /bin/sh` gibi zincirlerin önü burada kesilir. URL içeren
    // argümanlar atlanır; `https://site/init` yanlış pozitif üretmesin.
    for a in args {
        if a.contains("://") {
            continue;
        }
        let arg_bin = Path::new(*a)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(*a);
        if FORBIDDEN_LAUNCH_BINARIES.contains(&arg_bin) {
            return Err(format!(
                "Güvenlik İlkesi İhlali: '{}' argüman olarak taşınamaz.",
                arg_bin
            ));
        }
    }

    if bin_name.contains('/') {
        let allowed_prefixes = ["/usr/bin/", "/bin/", "/usr/local/bin/", "/usr/games/", "/opt/"];
        if !allowed_prefixes.iter().any(|prefix| bin_name.starts_with(prefix)) {
            return Err("Güvenlik Hatası: Uygulama yolu izin verilen sistem dizinlerinde değil.".to_string());
        }

        // Kanonik hedef kontrolü (symlink bypass önleme)
        if let Ok(canonical) = fs::canonicalize(bin_name) {
            let canon_base = canonical
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("");
            if FORBIDDEN_LAUNCH_BINARIES.contains(&canon_base) {
                return Err("Güvenlik İlkesi İhlali: Program kısayolu izin verilmeyen bir sistem aracına işaret ediyor.".to_string());
            }
        }
    } else {
        if !bin_name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.') {
            return Err("Güvenlik Hatası: Geçersiz uygulama adı karakterleri.".to_string());
        }
    }

    #[cfg(target_os = "linux")]
    {
        let dsp = std::env::var("DISPLAY").unwrap_or_else(|_| ":0".to_string());
        let _ = Command::new(bin_name)
            .args(args)
            .env("DISPLAY", dsp)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Uygulama başlatılamadı: {}", e))?;
    }

    Ok(format!("Uygulama çalıştırıldı: {}", clean))
}

// ============================================================================
// 9. DİĞER SİSTEM AYARLARI VE GERÇEK TELEMETRİ - BULGU #4
// ============================================================================
// /proc/stat ilk satırındaki kümülatif sayaçlar: (toplam, boşta).
fn read_cpu_counters() -> Option<(u64, u64)> {
    let s = fs::read_to_string("/proc/stat").ok()?;
    let line = s.lines().next()?;
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.first() != Some(&"cpu") {
        return None;
    }
    let vals: Vec<u64> = parts[1..].iter().filter_map(|v| v.parse().ok()).collect();
    if vals.len() < 4 {
        return None;
    }
    let total: u64 = vals.iter().sum();
    let idle = vals[3] + *vals.get(4).unwrap_or(&0);
    Some((total, idle))
}

// İki çağrı arasındaki farktan doluluk yüzdesi; ilk çağrıda 0.0 döner.
fn sample_cpu_percent() -> f64 {
    static PREV: Mutex<Option<(u64, u64)>> = Mutex::new(None);
    let cur = match read_cpu_counters() {
        Some(c) => c,
        None => return 0.0,
    };
    let mut prev = match PREV.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    let pct = match *prev {
        Some((pt, pi)) if cur.0 > pt => {
            let dt = cur.0 - pt;
            let di = cur.1.saturating_sub(pi);
            100.0 * (1.0 - (di as f64 / dt as f64))
        }
        _ => 0.0,
    };
    *prev = Some(cur);
    pct.clamp(0.0, 100.0)
}

// Kök bölünümün kullanımı: (kullanılan GB, toplam GB, %).
fn read_disk_usage() -> Option<(f64, f64, u8)> {
    let out = run_capture("df", &["-Pk", "/"])?;
    for line in out.lines().skip(1) {
        let f: Vec<&str> = line.split_whitespace().collect();
        if f.len() < 5 {
            continue;
        }
        let total_kb = f[1].parse::<u64>().ok()?;
        let used_kb = f[2].parse::<u64>().ok()?;
        let pct = f[4].trim_end_matches('%').parse::<u8>().unwrap_or(0);
        let g = 1024.0 * 1024.0;
        return Some((used_kb as f64 / g, total_kb as f64 / g, pct.min(100)));
    }
    None
}

#[tauri::command]
async fn get_system_telemetry() -> Result<SystemTelemetry, String> {
    // /proc ve /sys okumaları senkron; telemetri arka plan havuzuna alınır.
    tauri::async_runtime::spawn_blocking(collect_system_telemetry)
        .await
        .map_err(|e| format!("Telemetri okunamadı: {}", e))?
}

fn collect_system_telemetry() -> Result<SystemTelemetry, String> {
    #[cfg(target_os = "linux")]
    {
        // 1. Gerçek Bellek Tespiti (/proc/meminfo)
        let mut mem_total_mb: u64 = 8192;
        let mut mem_available_mb: u64 = 4096;

        if let Ok(meminfo) = fs::read_to_string("/proc/meminfo") {
            for line in meminfo.lines() {
                if line.starts_with("MemTotal:") {
                    if let Some(val) = line.split_whitespace().nth(1) {
                        mem_total_mb = val.parse::<u64>().unwrap_or(8388608) / 1024;
                    }
                } else if line.starts_with("MemAvailable:") {
                    if let Some(val) = line.split_whitespace().nth(1) {
                        mem_available_mb = val.parse::<u64>().unwrap_or(4194304) / 1024;
                    }
                }
            }
        }
        let memory_used_mb = mem_total_mb.saturating_sub(mem_available_mb);

        // 2. Gerçek Çalışma Süresi (/proc/uptime)
        let mut uptime_seconds: u64 = 0;
        if let Ok(uptime_str) = fs::read_to_string("/proc/uptime") {
            if let Some(first) = uptime_str.split_whitespace().next() {
                uptime_seconds = first.parse::<f64>().unwrap_or(0.0) as u64;
            }
        }

        // 3. Dağıtım / İşletim Sistemi (/etc/os-release)
        let mut os_name = "Devuan GNU/Linux 5 (daedalus)".to_string();
        if let Ok(os_rel) = fs::read_to_string("/etc/os-release") {
            for line in os_rel.lines() {
                if line.starts_with("PRETTY_NAME=") {
                    os_name = line.trim_start_matches("PRETTY_NAME=").trim_matches('"').to_string();
                    break;
                }
            }
        }

        // 4. Çekirdek Sürümü (/proc/version)
        let kernel = if let Ok(proc_ver) = fs::read_to_string("/proc/version") {
            proc_ver.split_whitespace().take(3).collect::<Vec<_>>().join(" ")
        } else {
            "Linux 6.1.0-22-amd64".to_string()
        };

        // 5. İnit Sistemi (/proc/1/comm)
        let init_comm = fs::read_to_string("/proc/1/comm").unwrap_or_default().trim().to_string();
        let init_system = if init_comm == "systemd" {
            "systemd".to_string()
        } else {
            "SysVinit (systemd-free)".to_string()
        };

        // 6. Pil (/sys/class/power_supply) — pil yoksa (masaüstü) None kalır.
        let mut battery_percent: Option<u8> = None;
        let mut battery_status: Option<String> = None;
        if let Ok(entries) = fs::read_dir("/sys/class/power_supply") {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if !name.starts_with("BAT") {
                    continue;
                }
                if let Ok(cap) = fs::read_to_string(entry.path().join("capacity")) {
                    battery_percent = cap.trim().parse::<u8>().ok();
                }
                if let Ok(st) = fs::read_to_string(entry.path().join("status")) {
                    battery_status = Some(st.trim().to_string());
                }
                break;
            }
        }

        // 7. Disk kullanımı (df -Pk /) — tek örnek, üç alana dağıtılır.
        let (disk_used_gb, disk_total_gb, disk_percent) = match read_disk_usage() {
            Some(d) => (d.0, d.1, Some(d.2)),
            None => (0.0, 0.0, None),
        };

        Ok(SystemTelemetry {
            os_name,
            kernel,
            init_system,
            memory_used_mb,
            memory_total_mb: mem_total_mb,
            cpu_cores: std::thread::available_parallelism().map(|p| p.get()).unwrap_or(4),
            uptime_seconds,
            battery_percent,
            battery_status,
            cpu_percent: sample_cpu_percent(),
            disk_percent,
            disk_used_gb,
            disk_total_gb,
        })
    }

    #[cfg(not(target_os = "linux"))]
    {
        Ok(SystemTelemetry {
            os_name: "Ankora Linux (Simulated Host)".to_string(),
            kernel: "Linux 6.1.0-22-amd64 (Dev Core)".to_string(),
            init_system: "SysVinit (systemd-free)".to_string(),
            memory_used_mb: 1140,
            memory_total_mb: 8192,
            cpu_cores: std::thread::available_parallelism().map(|p| p.get()).unwrap_or(4),
            uptime_seconds: 7200,
            battery_percent: None,
            battery_status: None,
            cpu_percent: 0.0,
            disk_percent: None,
            disk_used_gb: 0.0,
            disk_total_gb: 0.0,
        })
    }
}

#[tauri::command]
async fn set_brightness(level: u32) -> Result<String, String> {
    let clamped = level.clamp(20, 100);
    let ratio = clamped as f32 / 100.0;
    #[cfg(target_os = "linux")]
    {
        let brightness_str = format!("{:.2}", ratio);
        if let Ok(out) = Command::new("xrandr").output() {
            let stdout = String::from_utf8_lossy(&out.stdout);
            for line in stdout.lines() {
                if line.contains(" connected") {
                    if let Some(display_name) = line.split_whitespace().next() {
                        let _ = Command::new("xrandr")
                            .args(["--output", display_name, "--brightness", &brightness_str])
                            .output();
                        break;
                    }
                }
            }
        }
    }
    Ok(format!("Parlaklık ayarlandı: %{}", clamped))
}

#[tauri::command]
fn get_volume() -> Result<u32, String> {
    #[cfg(target_os = "linux")]
    {
        // 1. pactl ile PulseAudio / PipeWire kontrolü
        if let Ok(out) = Command::new("pactl").args(["get-sink-volume", "@DEFAULT_SINK@"]).output() {
            if out.status.success() {
                let s = String::from_utf8_lossy(&out.stdout);
                if let Some(pos) = s.find('%') {
                    let before = &s[..pos];
                    if let Some(num_str) = before.split_whitespace().last() {
                        if let Ok(v) = num_str.parse::<u32>() {
                            return Ok(v.min(100));
                        }
                    }
                }
            }
        }
        // 2. amixer ile ALSA Master kontrolü
        if let Ok(out) = Command::new("amixer").args(["sget", "Master"]).output() {
            if out.status.success() {
                let s = String::from_utf8_lossy(&out.stdout);
                for part in s.split('[') {
                    if let Some(pct_pos) = part.find("%]") {
                        if let Ok(v) = part[..pct_pos].trim().parse::<u32>() {
                            return Ok(v.min(100));
                        }
                    }
                }
            }
        }
        Ok(75)
    }
    #[cfg(not(target_os = "linux"))]
    {
        Ok(75)
    }
}

#[tauri::command]
fn set_volume(level: u32) -> Result<u32, String> {
    let clamped = level.min(100);
    #[cfg(target_os = "linux")]
    {
        let arg = format!("{}%", clamped);
        let _ = Command::new("pactl").args(["set-sink-volume", "@DEFAULT_SINK@", &arg]).output();
        let _ = Command::new("amixer").args(["sset", "Master", &arg]).output();
    }
    Ok(clamped)
}

#[tauri::command]
fn optimize_system_memory() -> Result<MemoryTrimResult, String> {
    #[cfg(target_os = "linux")]
    {
        let before_used = if let Ok(tele) = collect_system_telemetry() {
            tele.memory_used_mb
        } else {
            0
        };

        let _ = Command::new("sync").output();

        // 1. glibc malloc_trim çağrısı (işlem heap'ini anında çekirdeğe iade eder)
        #[cfg(target_env = "gnu")]
        unsafe {
            extern "C" {
                fn malloc_trim(pad: usize) -> i32;
            }
            malloc_trim(0);
        }

        // 2. Çekirdek önbellekleri (varsa root yetkisi ile)
        let drop_caches_ok = fs::write("/proc/sys/vm/drop_caches", "3").is_ok();
        let _ = fs::write("/proc/sys/vm/compact_memory", "1");

        let after = collect_system_telemetry().ok();
        let after_used = after.as_ref().map(|t| t.memory_used_mb).unwrap_or(before_used);
        let after_total = after.as_ref().map(|t| t.memory_total_mb).unwrap_or(8192);
        let freed = if before_used > after_used {
            before_used - after_used
        } else {
            0
        };

        Ok(MemoryTrimResult {
            success: true,
            freed_mb: freed,
            current_used_mb: after_used,
            current_total_mb: after_total,
            message: if freed > 0 {
                format!("Çekirdek ve işlemci bellek havuzlarından {} MB bellek serbest bırakıldı.", freed)
            } else {
                "Bellek önbellekleri senkronize edildi. Sistem zaten optimum düzeyde çalışıyor.".to_string()
            },
        })
    }

    #[cfg(not(target_os = "linux"))]
    {
        Ok(MemoryTrimResult {
            success: true,
            freed_mb: 52,
            current_used_mb: 110,
            current_total_mb: 8192,
            message: "Sistem ve uygulama bellek önbellekleri boşaltıldı (Simüle).".to_string(),
        })
    }
}

#[tauri::command]
fn check_first_run() -> Result<bool, String> {
    let path = get_ankora_config_dir().join("welcomed.lock");
    Ok(!path.exists())
}

#[tauri::command]
fn set_first_run_completed(dont_show_again: bool) -> Result<(), String> {
    if dont_show_again {
        let path = get_ankora_config_dir().join("welcomed.lock");
        let _ = fs::write(path, "ankora-v2-welcomed");
    }
    Ok(())
}

#[tauri::command]
async fn set_system_keyboard(layout: String) -> Result<String, String> {
    apply_keyboard_layout(layout.trim())
}

#[tauri::command]
async fn set_keyboard_layout(layout: String) -> Result<String, String> {
    apply_keyboard_layout(layout.trim())
}

fn apply_keyboard_layout(clean: &str) -> Result<String, String> {
    if !ALLOWED_KEYBOARDS.contains(&clean) {
        return Err("Geçersiz veya desteklenmeyen klavye haritası.".to_string());
    }
    // Kalıcılık: X11 ve konsol aynı haritayı kullanır. /etc yazılamazsa
    // (yetkisiz oturum) yalnızca o anki X oturumu değişir, hata yine de
    // kullanıcıya söylenir.
    let (xkb_layout, xkb_variant) = match clean {
        "tr_f" => ("tr", "f"),
        other => (other, ""),
    };
    let kb_conf = format!(
        "XKBMODEL=\"pc105\"\nXKBLAYOUT=\"{}\"\nXKBVARIANT=\"{}\"\nXKBOPTIONS=\"\"\nBACKSPACE=\"guess\"\n",
        xkb_layout, xkb_variant
    );
    let persist_ok = root_write("/etc/default/keyboard", &kb_conf).is_ok();
    if persist_ok {
        // Konsol haritasını da güncelle ( SysVinit: setupcon / console-setup ).
        let _ = root_command("sh", &["-c", "command -v setupcon >/dev/null && setupcon -k --force 2>/dev/null; service console-setup restart 2>/dev/null; true"]);
    }
    #[cfg(target_os = "linux")]
    {
        if clean == "tr_f" {
            let _ = Command::new("setxkbmap").args(["tr", "-variant", "f"]).output();
        } else {
            let _ = Command::new("setxkbmap").arg(clean).output();
        }
    }
    if persist_ok {
        Ok(format!("Klavye: {} (kalıcı)", clean))
    } else {
        Err("Klavye o anki oturumda değişti, ancak kalıcı kayıt için yönetici yetkisi gerekiyor.".to_string())
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct RegionSettings {
    pub timezone: String,
    pub local_time: String,
    pub keyboard_layout: String,
    pub language: String,
    pub available_timezones: Vec<String>,
    pub available_keyboards: Vec<String>,
    pub available_languages: Vec<String>,
}

#[tauri::command]
async fn get_region_settings() -> Result<RegionSettings, String> {
    let local_time = Command::new("date")
        .args(["+%Y-%m-%d %H:%M:%S %Z"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_default();
    let mut zones: Vec<String> = COMMON_TIMEZONES.iter().map(|s| s.to_string()).collect();
    let cur = current_timezone();
    if !zones.contains(&cur) {
        zones.insert(0, cur.clone());
    }
    Ok(RegionSettings {
        timezone: cur,
        local_time,
        keyboard_layout: current_keyboard_layout(),
        language: current_language(),
        available_timezones: zones,
        available_keyboards: ALLOWED_KEYBOARDS.iter().map(|s| s.to_string()).collect(),
        available_languages: ALLOWED_LANGUAGES.iter().map(|s| s.to_string()).collect(),
    })
}

#[tauri::command]
async fn set_timezone(timezone: String) -> Result<String, String> {
    let tz = timezone.trim().to_string();
    if !is_valid_timezone(&tz) {
        return Err("Geçersiz veya desteklenmeyen saat dilimi.".to_string());
    }
    // systemd yok (SysVinit): timedatectl çalışmaz. Klasik yöntem:
    // /etc/localtime sembolik bağı + /etc/timezone + tzdata yeniden yapılandırma.
    root_write("/etc/timezone", &format!("{}\n", tz))
        .map_err(|e| format!("Saat dilimi yazılamadı (yönetici yetkisi gerekiyor): {}", e))?;
    let link_out = root_command("ln", &["-sf", &format!("/usr/share/zoneinfo/{}", tz), "/etc/localtime"])
        .map_err(|e| format!("Saat dilimi bağlanamadı: {}", e))?;
    if !link_out.status.success() {
        return Err("Saat dilimi bağlanamadı (yönetici yetkisi gerekiyor).".to_string());
    }
    let _ = root_command("sh", &["-c", "DEBIAN_FRONTEND=noninteractive dpkg-reconfigure -f noninteractive tzdata 2>/dev/null; true"]);
    Ok(format!("Saat dilimi: {}", tz))
}

#[tauri::command]
async fn sync_time_ntp() -> Result<String, String> {
    // SysVinit'te systemd-timesyncd yoktur; chrony birincil, ntpdate yedek,
    // donanım saati son çaredir. En az biri başarısız olsa da güncel saat döndürülür.
    let _ = root_command("sh", &["-c", "command -v chronyc >/dev/null && chronyc -a makestep 2>/dev/null; command -v ntpdate >/dev/null && ntpdate -u pool.ntp.org 2>/dev/null; true"]);
    let date_out = Command::new("date")
        .args(["+%Y-%m-%d %H:%M:%S %Z"])
        .output()
        .map_err(|e| format!("Saat okunamadı: {}", e))?;
    Ok(String::from_utf8_lossy(&date_out.stdout).trim().to_string())
}

#[tauri::command]
async fn set_system_language(language: String) -> Result<String, String> {
    let lang = language.trim();
    if !ALLOWED_LANGUAGES.contains(&lang) {
        return Err("Geçersiz veya desteklenmeyen sistem dili.".to_string());
    }
    let short = lang.split('.').next().unwrap_or(lang);
    let locale_conf = format!("LANG={}\nLANGUAGE={}:{}\nLC_ALL={}\n", lang, short, short.split('_').next().unwrap_or(short), lang);
    root_write("/etc/default/locale", &locale_conf)
        .map_err(|e| format!("Sistem dili yazılamadı (yönetici yetkisi gerekiyor): {}", e))?;
    let _ = root_command("sh", &["-c", &format!("command -v update-locale >/dev/null && update-locale LANG={} LANGUAGE={} 2>/dev/null; command -v locale-gen >/dev/null && locale-gen {} en_US.UTF-8 2>/dev/null; true", lang, short, lang)]);
    Ok(format!("Sistem dili: {} (oturumu yeniden başlatınca uygulanır)", lang))
}

// ============================================================================
// ANKORA GÜNCELLEYİCİ (ANKORA DE UPDATE MANAGER)
// ============================================================================

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UpdateReleaseInfo {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: String,
    pub release_name: String,
    pub release_notes: String,
    pub download_url: Option<String>,
    pub published_at: String,
    pub package_size_bytes: u64,
    #[serde(default)]
    pub expected_sha256: Option<String>,
    #[serde(default)]
    pub sha256_url: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UpdateProgressPayload {
    pub percent: u8,
    pub stage: String,
    pub message: String,
}

#[derive(Deserialize, Debug)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

#[derive(Deserialize, Debug)]
struct GitHubRelease {
    tag_name: String,
    name: Option<String>,
    body: Option<String>,
    published_at: Option<String>,
    assets: Option<Vec<GitHubAsset>>,
}

pub fn parse_semver(v: &str) -> (u32, u32, u32) {
    let clean = v.trim().trim_start_matches('v').trim_start_matches('V');
    let mut parts = clean.split('.').filter_map(|s| s.parse::<u32>().ok());
    (
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
    )
}

pub fn is_newer_version(remote: &str, current: &str) -> bool {
    let r = parse_semver(remote);
    let c = parse_semver(current);
    r > c
}

fn process_github_release(release: GitHubRelease, current_ver: &str) -> UpdateReleaseInfo {
    let latest_tag = release.tag_name.trim();
    let has_update = is_newer_version(latest_tag, current_ver);

    let mut deb_url = None;
    let mut deb_size = 0u64;
    let mut sha256_url = None;
    let mut expected_sha256 = None;

    if let Some(assets) = release.assets {
        for asset in assets {
            let lower_name = asset.name.to_lowercase();
            if lower_name.ends_with(".deb") {
                deb_url = Some(asset.browser_download_url);
                deb_size = asset.size;
            } else if lower_name.ends_with(".sha256") || lower_name.ends_with(".sha256sum") || lower_name == "sha256sums" {
                sha256_url = Some(asset.browser_download_url);
            }
        }
    }

    if let Some(ref body) = release.body {
        for word in body.split_whitespace() {
            let clean = word.trim_matches(|c: char| !c.is_ascii_alphanumeric());
            if clean.len() == 64 && clean.chars().all(|c| c.is_ascii_hexdigit()) {
                expected_sha256 = Some(clean.to_lowercase());
                break;
            }
        }
    }

    UpdateReleaseInfo {
        has_update,
        current_version: current_ver.to_string(),
        latest_version: latest_tag.to_string(),
        release_name: release.name.unwrap_or_else(|| latest_tag.to_string()),
        release_notes: release.body.unwrap_or_else(|| "Sürüm notu bulunamadı.".to_string()),
        download_url: deb_url,
        published_at: release.published_at.unwrap_or_default(),
        package_size_bytes: deb_size,
        expected_sha256,
        sha256_url,
    }
}

// protocol_4 güncelleme istemcisi: sürüm beslemesinin JSON uç noktası.
// Yapılandırma dosyası yoksa/boşsa GitHub API'ye düşülür (önceki davranış).
// Uç nokta yalnız sürüm bilgisini besler; indirme adresi yine
// download_and_apply_de_update içinde Ankora-Linux deposuyla sınırlıdır.
fn protocol_4_endpoint(target_repo: &str) -> String {
    let default_url = format!("https://api.github.com/repos/{}/releases/latest", target_repo);
    let path = get_ankora_config_dir().join("update-endpoint");
    if let Ok(val) = fs::read_to_string(&path) {
        let val = val.trim();
        // Yalnızca https uç noktaları kabul edilir; boşluk taşıyamaz.
        if val.starts_with("https://") && !val.chars().any(char::is_whitespace) {
            return val.to_string();
        }
    }
    default_url
}

#[tauri::command]
async fn check_de_update(repo_override: Option<String>) -> Result<UpdateReleaseInfo, String> {
    let current_ver = env!("CARGO_PKG_VERSION");
    // Güvenlik: Yalnızca bilinen Ankora-Linux organizasyonu repoları kabul edilir
    let target_repo = match repo_override {
        Some(ref r) => {
            let parts: Vec<&str> = r.split('/').collect();
            if parts.len() == 2 && parts[0] == "Ankora-Linux" && parts[1].chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
                r.clone()
            } else {
                return Err("Güvenlik İlkesi İhlali: Yalnızca resmi Ankora-Linux deposundan güncelleme alınabilir.".to_string());
            }
        }
        None => "Ankora-Linux/Ayaz".to_string(),
    };

    let client = reqwest::Client::builder()
        .user_agent(format!("ayaz-updater/{}", current_ver))
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|e| format!("HTTP istemcisi başlatılamadı: {}", e))?;

    let url = protocol_4_endpoint(&target_repo);
    let resp = client.get(&url).send().await;

    match resp {
        Ok(response) => {
            if response.status() == reqwest::StatusCode::NOT_FOUND
                && url.starts_with("https://api.github.com/")
            {
                // Eğer Ankora-Linux/Ayaz reposunda henüz release yoksa, Ankora-Linux ana reposunu dene
                if target_repo == "Ankora-Linux/Ayaz" {
                    let fallback_url = "https://api.github.com/repos/Ankora-Linux/Ankora-Linux/releases/latest";
                    if let Ok(fallback_resp) = client.get(fallback_url).send().await {
                        if fallback_resp.status().is_success() {
                            if let Ok(release) = fallback_resp.json::<GitHubRelease>().await {
                                return Ok(process_github_release(release, current_ver));
                            }
                        }
                    }
                }

                return Ok(UpdateReleaseInfo {
                    has_update: false,
                    current_version: current_ver.to_string(),
                    latest_version: current_ver.to_string(),
                    release_name: "En Son Kararlı Sürüm".to_string(),
                    release_notes: format!(
                        "Ayaz Masaüstü Ortamı v{} şu anda en güncel sürümdür. Henüz yeni bir sürüm yayını bulunamadı.",
                        current_ver
                    ),
                    download_url: None,
                    published_at: String::new(),
                    package_size_bytes: 0,
                    expected_sha256: None,
                    sha256_url: None,
                });
            }

            if !response.status().is_success() {
                return Err(format!(
                    "GitHub API yanıt vermedi (HTTP {}). Lütfen internet bağlantınızı kontrol edin.",
                    response.status()
                ));
            }

            let release = response
                .json::<GitHubRelease>()
                .await
                .map_err(|e| format!("Sürüm verisi çözümlenemedi: {}", e))?;

            Ok(process_github_release(release, current_ver))
        }
        Err(e) => {
            Err(format!(
                "Güncelleme sunucusuna bağlanılamadı: {}. Lütfen internet bağlantınızı kontrol edin.",
                e
            ))
        }
    }
}

#[tauri::command]
async fn download_and_apply_de_update(
    window: tauri::Window,
    download_url: String,
    expected_sha256: Option<String>,
    sha256_url: Option<String>,
    expected_version: Option<String>,
) -> Result<String, String> {
    // Güvenlik doğrulaması: Yalnızca resmi Ankora-Linux deposunun release
    // alanından indirmeye izin ver. Adresin sahibi webview'e de emanet edilmez.
    if !download_url.starts_with("https://github.com/Ankora-Linux/") {
        return Err(
            "Güvenlik İlkesi İhlali: İndirme bağlantısı resmi Ankora-Linux deposuna ait değil."
                .to_string(),
        );
    }

    let _ = window.emit("update-progress", UpdateProgressPayload {
        percent: 10,
        stage: "connecting".to_string(),
        message: "Ayaz DE paketine bağlanılıyor...".to_string(),
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("İstemci hatası: {}", e))?;

    let res = client.get(&download_url).send().await
        .map_err(|e| format!("İndirme bağlantısı kurulamadı: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Paket indirilemedi (HTTP {})", res.status()));
    }

    let total_size = res.content_length().unwrap_or(0);

    let _ = window.emit("update-progress", UpdateProgressPayload {
        percent: 30,
        stage: "downloading".to_string(),
        message: if total_size > 0 {
            format!("Ayaz DE indiriliyor ({:.1} MB)...", total_size as f64 / 1_048_576.0)
        } else {
            "Ayaz DE paketi indiriliyor...".to_string()
        },
    });

    let bytes = res.bytes().await.map_err(|e| format!("Paket verisi indirilirken hata: {}", e))?;

    // SHA-256 Bütünlük ve İmza Kontrolü (Bulgu #5 Giderildi)
    let mut computed_hasher = Sha256::new();
    computed_hasher.update(&bytes);
    let computed_sha256 = format!("{:x}", computed_hasher.finalize());

    let mut target_sha256 = expected_sha256;
    if target_sha256.is_none() {
        if let Some(ref s_url) = sha256_url {
            if s_url.starts_with("https://github.com/Ankora-Linux/") {
                if let Ok(resp) = client.get(s_url).send().await {
                    if resp.status().is_success() {
                        if let Ok(txt) = resp.text().await {
                            for word in txt.split_whitespace() {
                                let c = word.trim_matches(|ch: char| !ch.is_ascii_alphanumeric());
                                if c.len() == 64 && c.chars().all(|ch| ch.is_ascii_hexdigit()) {
                                    target_sha256 = Some(c.to_lowercase());
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let exp = match target_sha256 {
        Some(exp) => exp,
        None => {
            return Err(
                "Güvenlik İlkesi İhlali: Güncelleme paketi için geçerli bir SHA-256 doğrulama özeti bulunamadı. \
                 Bütünlüğü doğrulanmamış paketlerin kurulumu engellendi."
                    .to_string(),
            );
        }
    };

    if computed_sha256.to_lowercase() != exp.to_lowercase() {
        return Err(format!(
            "Güvenlik İlkesi İhlali: İndirilen paketin SHA-256 bütünlük doğrulaması başarısız! \
            Hesaplanan: {}, Beklenen: {}. Paket değiştirilmiş veya bozulmuş olabilir; kurulum durduruldu.",
            computed_sha256, exp
        ));
    }

    #[cfg(target_os = "linux")]
    let deb_path = PathBuf::from("/var/cache/ayaz-updates/ayaz-update.deb");

    #[cfg(not(target_os = "linux"))]
    let deb_path = std::env::temp_dir().join("ayaz-update.deb");

    // Paket önce kullanıcının kendi özel geçici dizinine yazılır: normal bir
    // süreç /var/cache dizinine yazamaz. Root staging devri, helper'ın
    // --stage moduyla yapılır; paketin KOPYASI root tarafından alınıp özeti
    // yeniden doğrulanır, sahiplik doğrulaması bu kopya üzerinde geçerlidir.
    let tmp_dir = std::env::temp_dir().join(format!("ayaz-upd-{}", std::process::id()));
    fs::create_dir_all(&tmp_dir)
        .map_err(|e| format!("Geçici güncelleme dizini oluşturulamadı: {}", e))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&tmp_dir, fs::Permissions::from_mode(0o700));
    }
    let tmp_deb = tmp_dir.join("ayaz-update.deb");
    fs::write(&tmp_deb, &bytes)
        .map_err(|e| format!("Geçici güncelleme dosyası diske kaydedilemedi: {}", e))?;

    #[cfg(target_os = "linux")]
    {
        let helper_path = Path::new("/usr/local/bin/ayaz-update-helper");
        if !helper_path.exists() {
            let _ = fs::remove_dir_all(&tmp_dir);
            return Err(
                "Güvenlik İlkesi İhlali: /usr/local/bin/ayaz-update-helper bulunamadı. \
                 Paket staging dizinine yalnızca bu yardımcı üzerinden alınabilir."
                    .to_string(),
            );
        }
        let helper_str = helper_path.to_string_lossy().to_string();
        let stage_src = tmp_deb.to_string_lossy().to_string();
        let stage_sha = computed_sha256.to_lowercase();
        let stage_status = Command::new("sudo")
            .args([helper_str.as_str(), "--stage", stage_src.as_str(), stage_sha.as_str()])
            .status();
        let _ = fs::remove_dir_all(&tmp_dir);
        match stage_status {
            Ok(status) if status.success() => {}
            Ok(status) => {
                return Err(format!(
                    "Güncelleme paketi güvenli staging dizinine alınamadı (Çıkış Kodu: {}).",
                    status.code().unwrap_or(-1)
                ));
            }
            Err(e) => {
                return Err(format!("Güvenlik yardımcısı çalıştırılamadı: {}", e));
            }
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = fs::rename(&tmp_deb, &deb_path);
    }

    let _ = window.emit("update-progress", UpdateProgressPayload {
        percent: 80,
        stage: "installing".to_string(),
        message: "Ayaz Masaüstü Ortamı sisteme kuruluyor (dpkg)...".to_string(),
    });

    #[cfg(target_os = "linux")]
    {
        let helper_path = Path::new("/usr/local/bin/ayaz-update-helper");
        let deb_str = deb_path.to_string_lossy().to_string();

        // Yardımcıya beklenen sürüm de iletilir: kurulum sonunda kurulu
        // sürüm bu değerle doğrulanır, uyuşmazlıkta geri alma tetiklenir.
        let mut helper_args: Vec<String> = vec![
            "/usr/local/bin/ayaz-update-helper".to_string(),
            deb_str,
        ];
        if let Some(ref ev) = expected_version {
            let ev = ev.trim();
            if !ev.is_empty() {
                helper_args.push(ev.to_string());
            }
        }

        let install_status = if helper_path.exists() {
            Command::new("sudo")
                .args(&helper_args)
                .status()
        } else {
            return Err("Güvenlik İlkesi İhlali: /usr/local/bin/ayaz-update-helper bulunamadı. Güncelleme yalnızca doğrulanmış yardımcı üzerinden kurulabilir.".to_string());
        };

        match install_status {
            Ok(status) if status.success() => {
                let _ = window.emit("update-progress", UpdateProgressPayload {
                    percent: 100,
                    stage: "completed".to_string(),
                    message: "Ayaz Masaüstü Ortamı başarıyla güncellendi! Masaüstünü şimdi yeniden başlatabilirsiniz.".to_string(),
                });
                Ok("Ayaz DE başarıyla güncellendi.".to_string())
            }
            Ok(status) => {
                Err(format!("Kurulum başarısız oldu (Çıkış Kodu: {}).", status.code().unwrap_or(-1)))
            }
            Err(e) => {
                Err(format!("Kurulum yardımcısı çalıştırılamadı: {}", e))
            }
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        tokio::time::sleep(std::time::Duration::from_millis(600)).await;
        let _ = window.emit("update-progress", UpdateProgressPayload {
            percent: 100,
            stage: "completed".to_string(),
            message: "Simülasyon: Ayaz Masaüstü Ortamı başarıyla doğrulandı ve kuruldu.".to_string(),
        });
        Ok("Simülasyon güncellemesi tamamlandı.".to_string())
    }
}

#[tauri::command]
fn restart_desktop_process() -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        // Tam ikili yol eşlemesi ile sadece kendi sürecimizi sonlandır, başka eşleşmeler önlenir
        let _ = Command::new("pkill").args(["-x", "ayaz-de"]).spawn();
    }
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DirectoryItem {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size_str: String,
    pub ext: String,
    pub is_hidden: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DirectoryListing {
    pub current_path: String,
    pub items: Vec<DirectoryItem>,
    pub home_dir: String,
}

#[tauri::command]
async fn list_directory(path: Option<String>) -> Result<DirectoryListing, String> {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/home/ankora"));
    let target_path = match path {
        // Boş yol ev dizinidir; dolu ama var olmayan yol sessizce ev dizinine
        // düşürülmezdi — kullanıcı her klasörde aynı dosyaları görüyordu.
        Some(p) if !p.trim().is_empty() => {
            let target = PathBuf::from(p.trim());
            if !target.exists() {
                return Err(format!("Klasör bulunamadı: {}", p.trim()));
            }
            target
        }
        _ => home.clone(),
    };

    let canonical = fs::canonicalize(&target_path).unwrap_or(target_path);
    // GÜVENLİK: Kök gezilebilir, ancak korumalı donanım ve kök hesap listelenemez
    let canon_str = canonical.to_string_lossy().to_string();
    for r in &["/root", "/proc", "/sys", "/dev"] {
        if canon_str == *r || canon_str.starts_with(&format!("{}/", r)) {
            return Err("Güvenlik İlkesi İhlali: Bu sistem dizini listelenemez.".to_string());
        }
    }
    let mut items = Vec::new();

    if let Ok(entries) = fs::read_dir(&canonical) {
        for entry in entries.flatten() {
            let p = entry.path();
            let name = p.file_name().unwrap_or_default().to_string_lossy().to_string();
            let is_hidden = name.starts_with('.');
            let is_dir = p.is_dir();
            let ext = p.extension().unwrap_or_default().to_string_lossy().to_lowercase();
            let size_str = if is_dir {
                "-".to_string()
            } else if let Ok(meta) = entry.metadata() {
                let bytes = meta.len();
                if bytes < 1024 {
                    format!("{} B", bytes)
                } else if bytes < 1024 * 1024 {
                    format!("{:.1} KB", bytes as f64 / 1024.0)
                } else {
                    format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
                }
            } else {
                "-".to_string()
            };

            items.push(DirectoryItem {
                name,
                path: p.to_string_lossy().to_string(),
                is_dir,
                size_str,
                ext,
                is_hidden,
            });
        }
    }

    items.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(DirectoryListing {
        current_path: canonical.to_string_lossy().to_string(),
        items,
        home_dir: home.to_string_lossy().to_string(),
    })
}

#[tauri::command]
async fn create_folder(path: String) -> Result<String, String> {
    let clean = path.trim();
    if clean.is_empty() || clean.contains('\0') {
        return Err("Geçersiz klasör yolu.".to_string());
    }
    let p = Path::new(clean);
    let restricted = [
        "/bin", "/sbin", "/usr", "/etc", "/boot", "/dev", "/proc", "/sys",
        "/lib", "/lib64", "/var", "/opt", "/srv", "/root",
    ];
    for r in &restricted {
        if clean == *r || clean.starts_with(&format!("{}/", r)) {
            return Err("Bu sistem dizininde klasör oluşturulamaz.".to_string());
        }
    }
    fs::create_dir_all(p).map_err(|e| e.to_string())?;
    Ok(format!("Klasör oluşturuldu: {}", clean))
}

#[tauri::command]
async fn write_text_file(path: String, content: String) -> Result<String, String> {
    let clean = path.trim();
    if clean.is_empty() || clean.contains('\0') {
        return Err("Geçersiz dosya yolu.".to_string());
    }
    let p = Path::new(clean);
    let restricted = [
        "/bin", "/sbin", "/usr", "/etc", "/boot", "/dev", "/proc", "/sys",
        "/lib", "/lib64", "/var", "/opt", "/srv", "/root",
    ];
    for r in &restricted {
        if clean == *r || clean.starts_with(&format!("{}/", r)) {
            return Err("Bu sistem dizininde dosya oluşturulamaz.".to_string());
        }
    }
    if let Some(parent) = p.parent() {
        if !parent.exists() {
            let _ = fs::create_dir_all(parent);
        }
    }
    fs::write(p, content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(format!("Dosya kaydedildi: {}", clean))
}

#[tauri::command]
async fn open_path(path: String) -> Result<String, String> {
    let clean = path.trim();
    if clean.is_empty() || !Path::new(clean).exists() {
        return Err("Açılacak dosya bulunamadı.".to_string());
    }
    // GÜVENLİK: Kurulabilir/çalıştırılabilir paket dosyaları xdg-open'a
    // verilmez; .deb doğrudan dpkg, .desktop ise çalıştırma anlamına gelir.
    let lower = clean.to_lowercase();
    if lower.ends_with(".deb") || lower.ends_with(".run") {
        return Err(
            "Güvenlik Hatası: Paket dosyaları buradan doğrudan açılamaz; paketleri lütfen Ankora Mağaza üzerinden kurun."
                .to_string(),
        );
    }
    if lower.ends_with(".appimage") {
        #[cfg(target_os = "linux")]
        {
            let canonical = fs::canonicalize(clean).map_err(|_| "Geçersiz dosya yolu.".to_string())?;
            let canon_str = canonical.to_string_lossy().to_string();
            let home_str = dirs::home_dir()
                .unwrap_or_else(|| PathBuf::from("/home/ankora"))
                .to_string_lossy()
                .to_string();
            // AppImage yalnız kullanıcı ev dizini veya /tmp altından çalıştırılabilir
            if !canon_str.starts_with(&format!("{}/", home_str)) && !canon_str.starts_with("/tmp/") {
                return Err("Güvenlik Hatası: AppImage yalnızca kullanıcı çalışma alanından çalıştırılabilir.".to_string());
            }
            let _ = Command::new("chmod").args(["+x", &canon_str]).output();
            let dsp = std::env::var("DISPLAY").unwrap_or_else(|_| ":0".to_string());
            Command::new(&canon_str).env("DISPLAY", dsp).spawn().map_err(|e| e.to_string())?;
            return Ok(format!("AppImage başlatıldı: {}", canon_str));
        }
    }
    #[cfg(target_os = "linux")]
    {
        let dsp = std::env::var("DISPLAY").unwrap_or_else(|_| ":0".to_string());
        let _ = Command::new("xdg-open").arg(clean).env("DISPLAY", dsp).spawn().map_err(|e| e.to_string())?;
    }
    Ok(format!("Açıldı: {}", clean))
}

#[tauri::command]
async fn open_url(url: String) -> Result<bool, String> {
    let clean = url.trim();
    // Yalnızca http/https: file:, javascript: gibi şemalar xdg-open'a verilmez.
    if !clean.starts_with("http://") && !clean.starts_with("https://") {
        return Err("Yalnızca http/https adresleri açılabilir.".to_string());
    }
    #[cfg(target_os = "linux")]
    {
        let dsp = std::env::var("DISPLAY").unwrap_or_else(|_| ":0".to_string());
        Command::new("xdg-open")
            .arg(clean)
            .env("DISPLAY", dsp)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(true)
}

#[tauri::command]
async fn delete_file(path: String) -> Result<String, String> {
    let clean = path.trim();
    let p = Path::new(clean);
    if clean.is_empty() || !p.exists() {
        return Err("Silinecek dosya bulunamadı.".to_string());
    }
    // GÜVENLİK (İZİN LİSTESİ - ALLOWLIST):
    // Dosya silme işlemleri yalnızca kullanıcının kendi ev dizini altındaki
    // alt yollar (/home/<user>/*) veya /tmp/, /media/, /mnt/ ile sınırlandırılır.
    // Ev dizini kökü ($HOME) ve sistem dizinleri asla silinemez.
    let canonical = fs::canonicalize(p).map_err(|_| "Silinecek dosya bulunamadı.".to_string())?;
    let canon_str = canonical.to_string_lossy().to_string();
    let home_str = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/home/ankora"))
        .to_string_lossy()
        .to_string();

    let allowed_prefixes = [
        format!("{}/", home_str),
        "/tmp/".to_string(),
        "/media/".to_string(),
        "/mnt/".to_string(),
    ];

    let is_allowed = allowed_prefixes.iter().any(|prefix| canon_str.starts_with(prefix));
    if !is_allowed || canon_str == "/" || canon_str == "/home" || canon_str == home_str {
        return Err("Güvenlik İlkesi İhlali: Yalnızca kullanıcı çalışma alanındaki dosyalar silinebilir.".to_string());
    }

    // Sembolik bağlantı (symlink) güvenliği: Sembolik bağlantı ise hedef dizini değil,
    // yalnızca sembolik bağlantının kendisini kaldır (hedef dışarıyı gösteriyor olabilir).
    let meta = fs::symlink_metadata(p).map_err(|e| e.to_string())?;
    if meta.file_type().is_symlink() {
        fs::remove_file(p).map_err(|e| e.to_string())?;
        return Ok(format!("Sembolik bağlantı kaldırıldı: {}", clean));
    }

    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| e.to_string())?;
    } else {
        fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(format!("Silindi: {}", clean))
}

#[tauri::command]
fn system_poweroff() -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        let _ = if sudo_available() {
            Command::new("sudo").args(["-n", "/sbin/poweroff"]).spawn()
        } else {
            Command::new("/sbin/poweroff").spawn()
                .or_else(|_| Command::new("shutdown").args(["-h", "now"]).spawn())
                .or_else(|_| Command::new("init").arg("0").spawn())
        };
    }
    Ok("Sistem kapatılıyor.".to_string())
}

#[tauri::command]
fn system_reboot() -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        let _ = if sudo_available() {
            Command::new("sudo").args(["-n", "/sbin/reboot"]).spawn()
        } else {
            Command::new("/sbin/reboot").spawn()
                .or_else(|_| Command::new("shutdown").args(["-r", "now"]).spawn())
                .or_else(|_| Command::new("init").arg("6").spawn())
        };
    }
    Ok("Sistem yeniden başlatılıyor.".to_string())
}

#[tauri::command]
fn system_suspend() -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        let ok = Command::new("loginctl")
            .arg("suspend")
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        if !ok {
            let _ = Command::new("pm-suspend").status();
        }
    }
    Ok("Sistem askıya alınıyor.".to_string())
}

#[tauri::command]
fn system_logout() -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        let user = std::env::var("USER").unwrap_or_else(|_| "ankora".to_string());
        let _ = Command::new("pkill").args(["-u", &user, "xinit"]).status();
        let _ = Command::new("pkill").args(["-u", &user, "Xorg"]).status();
        let _ = Command::new("pkill").args(["-f", "ayaz"]).status();
    }
    Ok("Oturum kapatılıyor.".to_string())
}

#[derive(Serialize, Deserialize)]
struct ScreenshotResult {
    success: bool,
    file_path: String,
    file_name: String,
    image_b64: Option<String>,
}

#[tauri::command]
fn take_screenshot(
    mode: Option<String>,
    delay: Option<u32>,
    save_to_disk: Option<bool>,
    copy_clipboard: Option<bool>,
) -> Result<ScreenshotResult, String> {
    let mode = mode.unwrap_or_else(|| "fullscreen".to_string());
    let delay = delay.unwrap_or(0);
    let _save_to_disk = save_to_disk.unwrap_or(true);
    let copy_clipboard = copy_clipboard.unwrap_or(true);

    let home = std::env::var("HOME").unwrap_or_else(|_| "/home/ankora".to_string());
    let pic_dir = PathBuf::from(&home).join("Pictures").join("Screenshots");
    let _ = fs::create_dir_all(&pic_dir);

    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    let filename = format!("Ekran-Goruntusu_{}.png", now);
    let filepath = pic_dir.join(&filename);
    let filepath_str = filepath.to_string_lossy().to_string();

    #[cfg(target_os = "linux")]
    {
        let mut scrot = Command::new("scrot");
        if delay > 0 {
            scrot.args(["-d", &delay.to_string()]);
        }
        if mode == "window" {
            scrot.args(["-u", "-b"]);
        } else if mode == "region" {
            scrot.args(["-s", "-f"]);
        }
        scrot.arg(&filepath_str);

        let out = scrot.output().map_err(|e| format!("scrot çalıştırılamadı: {}", e))?;
        if !out.status.success() {
            return Err(format!("Ekran görüntüsü alınamadı: {}", String::from_utf8_lossy(&out.stderr)));
        }

        if copy_clipboard {
            let _ = Command::new("xclip")
                .args(["-selection", "clipboard", "-t", "image/png", "-i", &filepath_str])
                .output();
        }

        let b64 = if let Ok(bytes) = fs::read(&filepath) {
            Some(base64::engine::general_purpose::STANDARD.encode(&bytes))
        } else {
            None
        };

        Ok(ScreenshotResult {
            success: true,
            file_path: filepath_str,
            file_name: filename,
            image_b64: b64,
        })
    }

    #[cfg(not(target_os = "linux"))]
    {
        Ok(ScreenshotResult {
            success: true,
            file_path: filepath_str,
            file_name: filename,
            image_b64: None,
        })
    }
}

// ============================================================================
// 10. GERÇEK RADYO DENETİMİ (Wi-Fi / Bluetooth) — nmcli varsa o, yoksa rfkill
// ============================================================================
// Komutlar argümansız/sabit argümanlı çalıştırılır; kabuk yorumlaması yoktur.
fn run_capture(cmd: &str, args: &[&str]) -> Option<String> {
    let out = Command::new(cmd).args(args).output().ok()?;
    if !out.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&out.stdout).to_string())
}

// `rfkill list <tür>` çıktısında "Soft blocked: no" → etkin (engelli değil).
fn rfkill_enabled(list_output: &str) -> Option<bool> {
    for line in list_output.lines() {
        let t = line.trim();
        if t.starts_with("Soft blocked:") {
            return Some(t.ends_with("no"));
        }
    }
    None
}

#[tauri::command]
fn get_radio_state() -> RadioState {
    let mut state = RadioState {
        available: false,
        backend: String::new(),
        wifi_enabled: false,
        bluetooth_enabled: false,
        wifi_ssid: String::new(),
    };

    if let Some(wifi) = run_capture("nmcli", &["radio", "wifi"]) {
        let bt = run_capture("nmcli", &["radio", "bluetooth"]).unwrap_or_default();
        state.available = true;
        state.backend = "nmcli".to_string();
        state.wifi_enabled = wifi.trim() == "enabled";
        state.bluetooth_enabled = bt.trim() == "enabled";
        if state.wifi_enabled {
            if let Some(list) = run_capture("nmcli", &["-t", "-f", "ACTIVE,SSID", "dev", "wifi", "list"]) {
                for line in list.lines() {
                    let mut parts = line.splitn(2, ':');
                    let active = parts.next().unwrap_or("");
                    let ssid = parts.next().unwrap_or("");
                    if active == "yes" && !ssid.is_empty() {
                        state.wifi_ssid = ssid.to_string();
                        break;
                    }
                }
            }
        }
        return state;
    }

    if let Some(wifi_list) = run_capture("rfkill", &["list", "wifi"]) {
        state.available = true;
        state.backend = "rfkill".to_string();
        state.wifi_enabled = rfkill_enabled(&wifi_list).unwrap_or(false);
        if let Some(bt_list) = run_capture("rfkill", &["list", "bluetooth"]) {
            state.bluetooth_enabled = rfkill_enabled(&bt_list).unwrap_or(false);
        }
    }

    state
}

#[tauri::command]
fn set_radio_state(kind: String, enabled: bool) -> Result<RadioState, String> {
    let k = match kind.trim() {
        "wifi" => "wifi",
        "bluetooth" => "bluetooth",
        _ => return Err("Geçersiz radyo türü.".to_string()),
    };
    let onoff = if enabled { "on" } else { "off" };

    if run_capture("nmcli", &["radio", k, onoff]).is_some() {
        return Ok(get_radio_state());
    }
    let verb = if enabled { "unblock" } else { "block" };
    if run_capture("rfkill", &[verb, k]).is_some() {
        return Ok(get_radio_state());
    }
    Err("Ağ yöneticisi bulunamadı: sistemde nmcli veya rfkill yok.".to_string())
}

#[tauri::command]
fn scan_wifi_networks() -> Result<Vec<WifiNetwork>, String> {
    // Yeniden tarama isteği başarısız olsa bile mevcut liste okunur.
    let _ = run_capture("nmcli", &["dev", "wifi", "rescan"]);
    let out = run_capture("nmcli", &["-t", "-f", "ACTIVE,SSID,SIGNAL", "dev", "wifi", "list"])
        .ok_or_else(|| "Kablosuz tarama için NetworkManager (nmcli) kurulu olmalı.".to_string())?;
    let mut networks = Vec::new();
    for line in out.lines() {
        let mut parts = line.splitn(3, ':');
        let active = parts.next().unwrap_or("");
        // nmcli -t, özel karakterleri ters eğik çizgiyle kaçırır (":" -> "\:").
        let ssid = parts.next().unwrap_or("").replace("\\:", ":").replace("\\\\", "\\");
        let signal = parts.next().unwrap_or("").parse::<u8>().unwrap_or(0);
        if ssid.is_empty() {
            continue;
        }
        networks.push(WifiNetwork {
            ssid,
            signal,
            active: active == "yes",
        });
    }
    Ok(networks)
}

#[tauri::command]
fn wifi_connect(ssid: String, password: Option<String>) -> Result<String, String> {
    let clean = ssid.trim();
    // SSID tek argüman olarak geçilir (kabuk yok); IEEE sınırı 32 bayttır.
    if clean.is_empty() || clean.len() > 32 {
        return Err("Geçersiz ağ adı (SSID).".to_string());
    }
    let mut args = vec!["dev", "wifi", "connect", clean];
    let pass_str;
    if let Some(ref p) = password {
        let p_trimmed = p.trim();
        if !p_trimmed.is_empty() {
            pass_str = p_trimmed.to_string();
            args.push("password");
            args.push(&pass_str);
        }
    }
    let out = Command::new("nmcli").args(&args).output()
        .map_err(|_| "nmcli bulunamadı: kablosuz bağlantı için NetworkManager gerekli.".to_string())?;
    if out.status.success() {
        return Ok(format!("Bağlanıldı: {}", clean));
    }
    let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
    if err.contains("Secrets were required") || err.to_lowercase().contains("password") {
        return Err("Bu ağ için Wi-Fi parolası gerekli veya girilen parola hatalı.".to_string());
    }
    Err(if err.is_empty() {
        format!("Bağlanılamadı: {}", clean)
    } else {
        err
    })
}

#[tauri::command]
async fn get_processes() -> Result<Vec<ProcessInfo>, String> {
    tauri::async_runtime::spawn_blocking(read_processes)
        .await
        .map_err(|e| format!("Süreç listesi okunamadı: {}", e))?
}

fn read_processes() -> Result<Vec<ProcessInfo>, String> {
    let out = run_capture("ps", &["-eo", "pid=,user=,pcpu=,rss=,stat=,comm="])
        .ok_or_else(|| "Süreç listesi okunamadı (ps bulunamadı).".to_string())?;
    let mut list: Vec<ProcessInfo> = out
        .lines()
        .filter_map(|line| {
            let f: Vec<&str> = line.split_whitespace().collect();
            if f.len() < 6 {
                return None;
            }
            let status = match f[4].chars().next().unwrap_or('S') {
                'R' => "Çalışıyor",
                'S' => "Uyuyor",
                'D' => "Beklemede",
                'Z' => "Zombi",
                'T' | 't' => "Durduruldu",
                'I' => "Boşta",
                _ => "Bilinmiyor",
            };
            Some(ProcessInfo {
                pid: f[0].parse::<i32>().ok()?,
                user: f[1].to_string(),
                cpu: f[2].parse::<f64>().unwrap_or(0.0),
                // rss KB cinsinden; arayüz MB gösterir.
                mem_mb: f[3].parse::<f64>().unwrap_or(0.0) / 1024.0,
                status: status.to_string(),
                name: f[5..].join(" "),
            })
        })
        .collect();
    list.sort_by(|a, b| b.cpu.partial_cmp(&a.cpu).unwrap_or(std::cmp::Ordering::Equal));
    list.truncate(300);
    Ok(list)
}

#[tauri::command]
fn kill_process(pid: i32) -> Result<String, String> {
    if pid <= 1 {
        return Err("PID 1 (init) ve altındaki süreçler sonlandırılamaz.".to_string());
    }
    if pid == std::process::id() as i32 {
        return Err("Görev Yöneticisi kendi sürecini sonlandıramaz.".to_string());
    }
    let out = Command::new("kill")
        .args(["-TERM", &pid.to_string()])
        .output()
        .map_err(|_| "kill komutu çalıştırılamadı.".to_string())?;
    if out.status.success() {
        Ok(format!("SIGTERM gönderildi (PID {}).", pid))
    } else {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        Err(if err.is_empty() {
            format!("PID {} sonlandırılamadı.", pid)
        } else {
            err
        })
    }
}

#[tauri::command]
fn get_network_info() -> NetworkInfo {
    let mut info = NetworkInfo {
        interface: String::new(),
        ip: String::new(),
        prefix: 0,
        gateway: String::new(),
        dns: Vec::new(),
        connected: false,
    };

    #[cfg(target_os = "linux")]
    {
        // Örnek satır: "2: eth0    inet 192.168.1.105/24 brd ... scope global ..."
        if let Some(out) = run_capture("ip", &["-o", "-4", "addr", "show", "scope", "global"]) {
            for line in out.lines() {
                let mut parts = line.split_whitespace();
                let _idx = parts.next();
                let name = parts.next().unwrap_or("");
                let kind = parts.next().unwrap_or("");
                let cidr = parts.next().unwrap_or("");
                if name.is_empty() || kind != "inet" {
                    continue;
                }
                let mut it = cidr.split('/');
                let ip = it.next().unwrap_or("");
                if ip.is_empty() {
                    continue;
                }
                info.interface = name.to_string();
                info.ip = ip.to_string();
                info.prefix = it.next().unwrap_or("").parse::<u8>().unwrap_or(0);
                info.connected = true;
                break;
            }
        }
        if let Some(rt) = run_capture("ip", &["route", "show", "default"]) {
            if let Some(pos) = rt.find("via ") {
                let gw = rt[pos + 4..].split_whitespace().next().unwrap_or("");
                if !gw.is_empty() {
                    info.gateway = gw.to_string();
                }
            }
        }
        if let Ok(resolv) = fs::read_to_string("/etc/resolv.conf") {
            for line in resolv.lines() {
                if let Some(ns) = line.strip_prefix("nameserver") {
                    let ns = ns.trim();
                    if !ns.is_empty() {
                        info.dns.push(ns.to_string());
                    }
                }
            }
        }
    }

    info
}

// ============================================================================
// 12. X11 YEREL PENCERE YÖNETİMİ (EWMH / WMCTRL ENTEGRASYONU)
// ============================================================================
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeWindowInfo {
    pub id: String,
    pub title: String,
    pub app_name: String,
    pub is_active: bool,
}

#[tauri::command]
fn get_native_windows() -> Result<Vec<NativeWindowInfo>, String> {
    #[cfg(target_os = "linux")]
    {
        let out = match Command::new("wmctrl").args(["-l", "-x"]).output() {
            Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
            _ => return Ok(vec![]),
        };

        let active_num: Option<u64> = Command::new("xdotool")
            .arg("getactivewindow")
            .output()
            .ok()
            .and_then(|o| {
                let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
                s.parse::<u64>().ok()
            })
            .or_else(|| {
                Command::new("xprop")
                    .args(["-root", "_NET_ACTIVE_WINDOW"])
                    .output()
                    .ok()
                    .and_then(|o| {
                        let s = String::from_utf8_lossy(&o.stdout).to_string();
                        let hex_str = s.split('#').nth(1)?.trim();
                        let clean = hex_str.split(',').next()?.trim().trim_start_matches("0x");
                        u64::from_str_radix(clean, 16).ok()
                    })
            });

        let mut windows = Vec::new();
        for line in out.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 4 || parts[1] == "-1" {
                continue;
            }
            let win_id = parts[0].to_lowercase();
            let wm_class = parts[2];
            let title = parts[3..].join(" ");

            let lower_class = wm_class.to_lowercase();
            let lower_title = title.to_lowercase();
            if lower_class.contains("ayaz")
                || lower_class.contains("openbox")
                || lower_class.contains("desktop")
                || lower_class.contains("trayer")
                || lower_class.contains("dunst")
                || lower_title.contains("ayaz — ankora")
                || title == "Desktop"
            {
                continue;
            }

            let app_name = wm_class.split('.').last().unwrap_or(wm_class).to_string();
            let cur_num = u64::from_str_radix(win_id.trim_start_matches("0x"), 16).ok();
            let is_active = active_num.is_some() && cur_num == active_num;

            windows.push(NativeWindowInfo {
                id: parts[0].to_string(),
                title,
                app_name,
                is_active,
            });
        }
        Ok(windows)
    }
    #[cfg(not(target_os = "linux"))]
    {
        Ok(vec![])
    }
}

#[tauri::command]
fn activate_native_window(id: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("wmctrl").args(["-i", "-a", id.trim()]).spawn();
    }
    Ok(())
}

#[tauri::command]
fn close_native_window(id: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("wmctrl").args(["-i", "-c", id.trim()]).spawn();
    }
    Ok(())
}

#[tauri::command]
fn minimize_native_window(id: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let clean = id.trim();
        let _ = Command::new("wmctrl").args(["-i", "-r", clean, "-b", "add,hidden"]).spawn();
    }
    Ok(())
}

#[tauri::command]
fn minimize_all_windows() -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("wmctrl").args(["-k", "on"]).spawn();
    }
    Ok(())
}

#[tauri::command]
fn set_desktop_layer(above: bool) -> Result<bool, String> {
    #[cfg(target_os = "linux")]
    {
        if above {
            let _ = Command::new("wmctrl")
                .args(["-r", "Ayaz — Ankora", "-b", "remove,below"])
                .output();
            let _ = Command::new("wmctrl")
                .args(["-r", "Ayaz — Ankora", "-b", "add,above"])
                .output();
            let _ = Command::new("wmctrl")
                .args(["-a", "Ayaz — Ankora"])
                .output();
        } else {
            let _ = Command::new("wmctrl")
                .args(["-r", "Ayaz — Ankora", "-b", "remove,above"])
                .output();
            let _ = Command::new("wmctrl")
                .args(["-r", "Ayaz — Ankora", "-b", "add,below"])
                .output();
        }
    }
    Ok(true)
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DisplayModeEntry {
    pub mode: String,
    pub rates: Vec<String>,
    pub current: bool,
    pub preferred: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DisplayModesInfo {
    pub output: Option<String>,
    pub current_mode: Option<String>,
    pub current_rate: Option<String>,
    pub preferred_mode: Option<String>,
    pub modes: Vec<DisplayModeEntry>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DisplayApplyResponse {
    pub success: bool,
    pub revert_after: u32,
    pub message: String,
}

#[tauri::command]
fn get_display_modes() -> Result<DisplayModesInfo, String> {
    #[cfg(target_os = "linux")]
    {
        let out = match Command::new("xrandr").arg("--query").output() {
            Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
            _ => {
                return Ok(DisplayModesInfo {
                    output: None,
                    current_mode: None,
                    current_rate: None,
                    preferred_mode: None,
                    modes: vec![],
                });
            }
        };

        let mut output_name: Option<String> = None;
        let mut current_mode: Option<String> = None;
        let mut current_rate: Option<String> = None;
        let mut preferred_mode: Option<String> = None;
        let mut modes = Vec::new();

        for line in out.lines() {
            if output_name.is_none() {
                if line.contains(" connected") {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if let Some(name) = parts.first() {
                        output_name = Some(name.to_string());
                    }
                    for part in &parts {
                        if part.contains('x') && part.contains('+') {
                            if let Some(res) = part.split('+').next() {
                                current_mode = Some(res.to_string());
                            }
                        }
                    }
                }
                continue;
            }

            if line.starts_with("   ") || line.starts_with('\t') {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if let Some(m_name) = parts.first() {
                    if m_name.contains('x') {
                        let mut rates = Vec::new();
                        let mut is_preferred = false;
                        for tok in &parts[1..] {
                            if tok.contains('+') {
                                is_preferred = true;
                            }
                            let clean_rate = tok.replace('*', "").replace('+', "");
                            if !clean_rate.is_empty() {
                                rates.push(clean_rate.clone());
                                if tok.contains('*') {
                                    current_rate = Some(clean_rate);
                                }
                            }
                        }
                        let is_current = current_mode.as_deref() == Some(*m_name);
                        if is_preferred && preferred_mode.is_none() {
                            preferred_mode = Some(m_name.to_string());
                        }
                        modes.push(DisplayModeEntry {
                            mode: m_name.to_string(),
                            rates,
                            current: is_current,
                            preferred: is_preferred,
                        });
                    }
                }
            } else if !line.is_empty() && !line.starts_with(' ') {
                break;
            }
        }

        Ok(DisplayModesInfo {
            output: output_name,
            current_mode,
            current_rate,
            preferred_mode,
            modes,
        })
    }
    #[cfg(not(target_os = "linux"))]
    {
        Ok(DisplayModesInfo {
            output: None,
            current_mode: None,
            current_rate: None,
            preferred_mode: None,
            modes: vec![],
        })
    }
}

#[tauri::command]
fn set_display_mode(mode: String, rate: String, output: String) -> Result<DisplayApplyResponse, String> {
    #[cfg(target_os = "linux")]
    {
        let out_name = if !output.trim().is_empty() {
            output.trim().to_string()
        } else {
            let mut detected = String::new();
            if let Ok(o) = Command::new("xrandr").arg("--query").output() {
                let s = String::from_utf8_lossy(&o.stdout);
                for l in s.lines() {
                    if l.contains(" connected") {
                        if let Some(n) = l.split_whitespace().next() {
                            detected = n.to_string();
                            break;
                        }
                    }
                }
            }
            detected
        };

        if mode == "preferred" || mode == "auto" {
            let _ = Command::new("xrandr").args(["--output", &out_name, "--auto"]).output();
        } else if !rate.trim().is_empty() {
            let _ = Command::new("xrandr").args(["--output", &out_name, "--mode", mode.trim(), "--rate", rate.trim()]).output();
        } else {
            let _ = Command::new("xrandr").args(["--output", &out_name, "--mode", mode.trim()]).output();
        }

        Ok(DisplayApplyResponse {
            success: true,
            revert_after: 15,
            message: format!("Ekran çözünürlüğü ayarlandı: {}", mode),
        })
    }
    #[cfg(not(target_os = "linux"))]
    {
        Ok(DisplayApplyResponse {
            success: true,
            revert_after: 0,
            message: "Simülasyon modu".into(),
        })
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MonitorOutputInfo {
    pub name: String,
    pub connected: bool,
    pub is_primary: bool,
    pub current_mode: Option<String>,
    pub current_rate: Option<String>,
    pub position: Option<String>,
    pub modes: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MultiDisplayStatus {
    pub primary_output: Option<String>,
    pub monitors: Vec<MonitorOutputInfo>,
    pub connected_count: usize,
}

#[tauri::command]
fn get_all_monitors() -> Result<MultiDisplayStatus, String> {
    #[cfg(target_os = "linux")]
    {
        let out = match Command::new("xrandr").arg("--query").output() {
            Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
            _ => {
                return Ok(MultiDisplayStatus {
                    primary_output: None,
                    monitors: vec![],
                    connected_count: 0,
                });
            }
        };

        let mut monitors = Vec::new();
        let mut current_mon: Option<MonitorOutputInfo> = None;
        let mut primary_name: Option<String> = None;

        for line in out.lines() {
            if line.contains(" connected") || line.contains(" disconnected") {
                if let Some(mon) = current_mon.take() {
                    monitors.push(mon);
                }

                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.is_empty() {
                    continue;
                }
                let name = parts[0].to_string();
                let is_connected = line.contains(" connected") && !line.contains(" disconnected");
                let is_primary = line.contains(" primary");
                if is_primary {
                    primary_name = Some(name.clone());
                }

                let mut current_mode = None;
                let mut position = None;

                for tok in &parts {
                    if tok.contains('x') && tok.contains('+') {
                        let mut sub = tok.split('+');
                        if let Some(res) = sub.next() {
                            current_mode = Some(res.to_string());
                        }
                        let pos = sub.collect::<Vec<&str>>().join("+");
                        if !pos.is_empty() {
                            position = Some(pos);
                        }
                    }
                }

                current_mon = Some(MonitorOutputInfo {
                    name,
                    connected: is_connected,
                    is_primary,
                    current_mode,
                    current_rate: None,
                    position,
                    modes: Vec::new(),
                });
            } else if (line.starts_with("   ") || line.starts_with('\t')) && current_mon.is_some() {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if let Some(m_name) = parts.first() {
                    if m_name.contains('x') {
                        if let Some(ref mut mon) = current_mon {
                            if !mon.modes.contains(&m_name.to_string()) {
                                mon.modes.push(m_name.to_string());
                            }
                            for tok in &parts[1..] {
                                if tok.contains('*') {
                                    let clean = tok.replace('*', "").replace('+', "");
                                    mon.current_rate = Some(clean);
                                }
                            }
                        }
                    }
                }
            }
        }

        if let Some(mon) = current_mon {
            monitors.push(mon);
        }

        let connected_count = monitors.iter().filter(|m| m.connected).count();
        if primary_name.is_none() {
            primary_name = monitors.iter().find(|m| m.connected).map(|m| m.name.clone());
        }

        Ok(MultiDisplayStatus {
            primary_output: primary_name,
            monitors,
            connected_count,
        })
    }
    #[cfg(not(target_os = "linux"))]
    {
        Ok(MultiDisplayStatus {
            primary_output: Some("VGA-0".into()),
            monitors: vec![
                MonitorOutputInfo {
                    name: "VGA-0".into(),
                    connected: true,
                    is_primary: true,
                    current_mode: Some("1366x768".into()),
                    current_rate: Some("60.0".into()),
                    position: Some("0+0".into()),
                    modes: vec!["1366x768".into(), "1024x768".into()],
                }
            ],
            connected_count: 1,
        })
    }
}

#[tauri::command]
fn set_multi_monitor_layout(layout: String, primary: Option<String>, secondary: Option<String>) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        let pri = primary.unwrap_or_else(|| {
            if let Ok(info) = get_all_monitors() {
                info.primary_output.unwrap_or_else(|| "eDP-1".to_string())
            } else {
                "eDP-1".to_string()
            }
        });

        let sec = secondary.unwrap_or_else(|| {
            if let Ok(info) = get_all_monitors() {
                info.monitors.iter()
                    .find(|m| m.connected && m.name != pri)
                    .map(|m| m.name.clone())
                    .unwrap_or_else(|| "HDMI-1".to_string())
            } else {
                "HDMI-1".to_string()
            }
        });

        match layout.as_str() {
            "extend-right" => {
                let _ = Command::new("xrandr")
                    .args(["--output", &pri, "--auto", "--primary", "--output", &sec, "--auto", "--right-of", &pri])
                    .output();
                Ok(format!("Ekran sağa genişletildi: {} -> {}", pri, sec))
            }
            "extend-left" => {
                let _ = Command::new("xrandr")
                    .args(["--output", &pri, "--auto", "--primary", "--output", &sec, "--auto", "--left-of", &pri])
                    .output();
                Ok(format!("Ekran sola genişletildi: {} <- {}", sec, pri))
            }
            "mirror" => {
                let _ = Command::new("xrandr")
                    .args(["--output", &pri, "--auto", "--primary", "--output", &sec, "--auto", "--same-as", &pri])
                    .output();
                Ok(format!("Ekranlar klonlandı (Ayna modu): {} == {}", pri, sec))
            }
            "single-primary" => {
                let _ = Command::new("xrandr")
                    .args(["--output", &pri, "--auto", "--primary", "--output", &sec, "--off"])
                    .output();
                Ok(format!("Yalnızca birincil ekran etkinleştirildi: {}", pri))
            }
            "auto" | _ => {
                let _ = Command::new("xrandr").arg("--auto").output();
                Ok("Monitörler otomatik yapılandırıldı.".to_string())
            }
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        Ok(format!("Simüle çoklu ekran düzeni uygulandı: {}", layout))
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RemovableDriveEntry {
    pub name: String,
    pub label: String,
    pub mountpoint: Option<String>,
    pub size: String,
    pub fstype: String,
}

#[tauri::command]
fn get_removable_drives() -> Result<Vec<RemovableDriveEntry>, String> {
    #[cfg(target_os = "linux")]
    {
        let out = match Command::new("lsblk").args(["-J", "-o", "NAME,SIZE,LABEL,MOUNTPOINT,RM,TYPE,FSTYPE"]).output() {
            Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
            _ => return Ok(vec![]),
        };

        let parsed: serde_json::Value = match serde_json::from_str(&out) {
            Ok(v) => v,
            _ => return Ok(vec![]),
        };

        let mut drives = Vec::new();
        if let Some(blockdevices) = parsed.get("blockdevices").and_then(|v| v.as_array()) {
            for dev in blockdevices {
                let is_rm = dev.get("rm").and_then(|r| r.as_bool()).unwrap_or(false)
                    || dev.get("rm").and_then(|r| r.as_str()).map(|s| s == "1" || s == "true").unwrap_or(false);
                let dev_name = dev.get("name").and_then(|n| n.as_str()).unwrap_or("");
                if dev_name.starts_with("loop") || dev_name.starts_with("zram") || dev_name.starts_with("sr") {
                    continue;
                }

                let mut targets = Vec::new();
                if let Some(children) = dev.get("children").and_then(|c| c.as_array()) {
                    for child in children {
                        targets.push(child);
                    }
                } else if is_rm {
                    targets.push(dev);
                }

                for item in targets {
                    let name = item.get("name").and_then(|n| n.as_str()).unwrap_or("");
                    if name.is_empty() { continue; }
                    let size = item.get("size").and_then(|s| s.as_str()).unwrap_or("").to_string();
                    let label = item.get("label").and_then(|l| l.as_str()).unwrap_or("").to_string();
                    let fstype = item.get("fstype").and_then(|f| f.as_str()).unwrap_or("").to_string();
                    let mut mountpoint = item.get("mountpoint").and_then(|m| m.as_str()).map(|s| s.to_string());

                    if is_rm && mountpoint.is_none() && !fstype.is_empty() && fstype != "swap" {
                        let dev_path = format!("/dev/{}", name);
                        if let Ok(m_out) = Command::new("udisksctl").args(["mount", "-b", &dev_path, "--no-user-interaction"]).output() {
                            if m_out.status.success() {
                                let m_str = String::from_utf8_lossy(&m_out.stdout);
                                if let Some(idx) = m_str.find(" at ") {
                                    mountpoint = Some(m_str[idx + 4..].trim().to_string());
                                }
                            }
                        }
                    }

                    if is_rm || mountpoint.as_deref().map(|p| p.starts_with("/media") || p.starts_with("/mnt")).unwrap_or(false) {
                        drives.push(RemovableDriveEntry {
                            name: name.to_string(),
                            label: if label.is_empty() { name.to_string() } else { label },
                            mountpoint,
                            size,
                            fstype,
                        });
                    }
                }
            }
        }
        Ok(drives)
    }
    #[cfg(not(target_os = "linux"))]
    {
        Ok(vec![])
    }
}

#[tauri::command]
fn unmount_drive(device: String) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        let target = device.trim();
        let dev_arg = if target.starts_with('/') { target.to_string() } else { format!("/dev/{}", target) };
        let out = Command::new("udisksctl")
            .args(["unmount", "-b", &dev_arg, "--no-user-interaction"])
            .output();
        match out {
            Ok(o) if o.status.success() => Ok("Sürücü güvenle çıkarıldı".to_string()),
            _ => {
                let _ = Command::new("umount").arg(&dev_arg).output();
                Ok("Sürücü bağlantısı kesildi".to_string())
            }
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        Ok("Simüle edildi".to_string())
    }
}

#[tauri::command]
fn get_clipboard_text() -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        if let Ok(out) = Command::new("xclip").args(["-selection", "clipboard", "-o"]).output() {
            if out.status.success() {
                return Ok(String::from_utf8_lossy(&out.stdout).to_string());
            }
        }
    }
    Ok("".to_string())
}

#[tauri::command]
fn set_clipboard_text(text: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        use std::io::Write;
        if let Ok(mut child) = Command::new("xclip")
            .args(["-selection", "clipboard", "-i"])
            .stdin(std::process::Stdio::piped())
            .spawn()
        {
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(text.as_bytes());
            }
            let _ = child.wait();
        }
    }
    Ok(())
}

#[tauri::command]
fn list_installed_deb_packages() -> Result<Vec<String>, String> {
    #[cfg(target_os = "linux")]
    {
        if let Ok(out) = Command::new("dpkg-query").args(["-W", "-f=${Package}\n"]).output() {
            if out.status.success() {
                let s = String::from_utf8_lossy(&out.stdout);
                let pkgs: Vec<String> = s.lines().map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).collect();
                return Ok(pkgs);
            }
        }
    }
    Ok(vec![])
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct StorageStatsPayload {
    pub disk_total: u64,
    pub disk_used: u64,
    pub zram_total: u64,
    pub zram_used: u64,
}

#[tauri::command]
fn get_storage_stats() -> Result<StorageStatsPayload, String> {
    let mut stats = StorageStatsPayload {
        disk_total: 0,
        disk_used: 0,
        zram_total: 0,
        zram_used: 0,
    };

    #[cfg(target_os = "linux")]
    {
        if let Ok(out) = Command::new("df").args(["-B1", "/"]).output() {
            let s = String::from_utf8_lossy(&out.stdout);
            for line in s.lines().skip(1) {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 6 {
                    if let (Ok(tot), Ok(used)) = (parts[1].parse::<u64>(), parts[2].parse::<u64>()) {
                        stats.disk_total = tot;
                        stats.disk_used = used;
                        break;
                    }
                } else if parts.len() >= 5 {
                    if let (Ok(tot), Ok(used)) = (parts[0].parse::<u64>(), parts[1].parse::<u64>()) {
                        stats.disk_total = tot;
                        stats.disk_used = used;
                        break;
                    }
                }
            }
        }

        if let Ok(size_str) = fs::read_to_string("/sys/block/zram0/disksize") {
            stats.zram_total = size_str.trim().parse::<u64>().unwrap_or(0);
        }
        if let Ok(mm_str) = fs::read_to_string("/sys/block/zram0/mm_stat") {
            if let Some(first) = mm_str.split_whitespace().next() {
                stats.zram_used = first.parse::<u64>().unwrap_or(0);
            }
        }
    }

    Ok(stats)
}

#[tauri::command]
fn system_browser_available() -> Result<bool, String> {
    #[cfg(target_os = "linux")]
    {
        for cand in &["brave-browser", "google-chrome", "chromium", "firefox", "x-www-browser"] {
            if let Ok(out) = Command::new("which").arg(cand).output() {
                if out.status.success() {
                    return Ok(true);
                }
            }
        }
        if let Ok(out) = Command::new("xdg-mime").args(["query", "default", "x-scheme-handler/https"]).output() {
            let handler = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if handler.ends_with(".desktop") {
                return Ok(true);
            }
        }
        Ok(false)
    }
    #[cfg(not(target_os = "linux"))]
    {
        Ok(true)
    }
}

#[tauri::command]
fn set_cpu_governor(governor: Option<String>, profile: Option<String>) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        let mut gov = governor.or(profile).unwrap_or_default().trim().to_lowercase();
        if gov == "balanced" {
            gov = "schedutil".to_string();
            if let Ok(avail) = fs::read_to_string("/sys/devices/system/cpu/cpu0/cpufreq/scaling_available_governors") {
                for cand in &["schedutil", "ondemand", "conservative"] {
                    if avail.contains(cand) {
                        gov = cand.to_string();
                        break;
                    }
                }
            }
        }
        let valid_govs = ["performance", "powersave", "ondemand", "conservative", "schedutil"];
        if !valid_govs.contains(&gov.as_str()) {
            return Err("Geçersiz CPU profili".to_string());
        }

        if let Ok(entries) = fs::read_dir("/sys/devices/system/cpu") {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("cpu") && name[3..].chars().all(|c| c.is_ascii_digit()) {
                    let path = entry.path().join("cpufreq/scaling_governor");
                    if path.exists() {
                        let _ = root_command("sh", &["-c", &format!("echo {} > {}", gov, path.display())]);
                    }
                }
            }
        }
        Ok(format!("CPU profili ayarlandı: {}", gov))
    }
    #[cfg(not(target_os = "linux"))]
    {
        Ok("Simüle edildi".to_string())
    }
}

#[tauri::command]
fn set_dpms_timeout(seconds: Option<u32>, timeout: Option<u32>, value: Option<u32>) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        let secs = seconds.or(timeout).or(value).unwrap_or(0);
        if secs == 0 {
            let _ = Command::new("xset").args(["-dpms"]).output();
            let _ = Command::new("xset").args(["s", "off"]).output();
        } else {
            let s_str = secs.to_string();
            let _ = Command::new("xset").args(["+dpms"]).output();
            let _ = Command::new("xset").args(["dpms", &s_str, &s_str, &s_str]).output();
            let _ = Command::new("xset").args(["s", &s_str, &s_str]).output();
        }

        let home = std::env::var("HOME").unwrap_or_else(|_| "/home/ankora".to_string());
        let cfg_dir = Path::new(&home).join(".config/ankora");
        let _ = fs::create_dir_all(&cfg_dir);
        let _ = fs::write(cfg_dir.join("dpms_secs"), secs.to_string());

        Ok(format!("Ekran uyku zaman aşımı ayarlandı: {} sn", secs))
    }
    #[cfg(not(target_os = "linux"))]
    {
        Ok("Simüle edildi".to_string())
    }
}

#[tauri::command]
fn confirm_display_mode() -> Result<bool, String> {
    Ok(true)
}

#[tauri::command]
fn revert_display_mode(output: Option<String>, mode: Option<String>, rate: Option<String>) -> Result<bool, String> {
    #[cfg(target_os = "linux")]
    {
        let out_name = output.unwrap_or_default();
        if !out_name.is_empty() {
            if let Some(m) = mode {
                if let Some(r) = rate {
                    let _ = Command::new("xrandr").args(["--output", &out_name, "--mode", &m, "--rate", &r]).output();
                } else {
                    let _ = Command::new("xrandr").args(["--output", &out_name, "--mode", &m]).output();
                }
            } else {
                let _ = Command::new("xrandr").args(["--output", &out_name, "--auto"]).output();
            }
        }
    }
    Ok(true)
}

#[tauri::command]
fn set_display_scale(percent: Option<f32>) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        let pct = percent.unwrap_or(100.0).clamp(50.0, 300.0);
        let dpi = (96.0 * pct / 100.0).round() as u32;
        let _ = Command::new("xrandr").args(["--dpi", &dpi.to_string()]).output();
        Ok(format!("Ekran ölçeği ayarlandı: %{}", pct))
    }
    #[cfg(not(target_os = "linux"))]
    {
        Ok("Simüle edildi".to_string())
    }
}

#[tauri::command]
async fn install_flatpak_app(app_id: String) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        let id = app_id.trim();
        let out = Command::new("flatpak")
            .args(["install", "-y", "--noninteractive", "flathub", id])
            .output();
        match out {
            Ok(o) if o.status.success() => Ok(format!("{} Flatpak başarıyla kuruldu.", id)),
            Ok(o) => {
                let err = String::from_utf8_lossy(&o.stderr);
                Err(format!("Flatpak kurulum hatası: {}", err))
            }
            Err(e) => Err(format!("Flatpak çalıştırılamadı: {}", e)),
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        Ok(format!("{} simüle edildi", app_id))
    }
}

#[tauri::command]
async fn remove_flatpak_app(app_id: String) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        let id = app_id.trim();
        let out = Command::new("flatpak")
            .args(["uninstall", "-y", "--noninteractive", id])
            .output();
        match out {
            Ok(o) if o.status.success() => Ok(format!("{} Flatpak başarıyla kaldırıldı.", id)),
            Ok(o) => {
                let err = String::from_utf8_lossy(&o.stderr);
                Err(format!("Flatpak kaldırma hatası: {}", err))
            }
            Err(e) => Err(format!("Flatpak çalıştırılamadı: {}", e)),
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        Ok("Simüle edildi".into())
    }
}

#[tauri::command]
fn list_installed_flatpaks() -> Result<Vec<String>, String> {
    #[cfg(target_os = "linux")]
    {
        if let Ok(out) = Command::new("flatpak").args(["list", "--app", "--columns=application"]).output() {
            if out.status.success() {
                let s = String::from_utf8_lossy(&out.stdout);
                let apps: Vec<String> = s.lines().map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).collect();
                return Ok(apps);
            }
        }
    }
    Ok(vec![])
}

#[tauri::command]
async fn move_to_trash(path: String) -> Result<String, String> {
    let clean = path.trim();
    let p = Path::new(clean);
    if clean.is_empty() || !p.exists() {
        return Err("Dosya bulunamadı.".to_string());
    }
    let canonical = fs::canonicalize(p).map_err(|_| "Dosya bulunamadı.".to_string())?;
    let canon_str = canonical.to_string_lossy().to_string();
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/home/ankora"));
    let home_str = home.to_string_lossy().to_string();
    if canon_str == "/" || canon_str == "/home" || canon_str == home_str {
        return Err("Kritik sistem dizinleri çöpe taşınamaz.".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(out) = Command::new("gio").args(["trash", &canon_str]).output() {
            if out.status.success() {
                return Ok(format!("Çöp kutusuna taşındı: {}", clean));
            }
        }
    }

    let trash_dir = home.join(".local/share/Trash");
    let files_dir = trash_dir.join("files");
    let info_dir = trash_dir.join("info");
    let _ = fs::create_dir_all(&files_dir);
    let _ = fs::create_dir_all(&info_dir);

    let file_name = p.file_name().unwrap_or_default().to_string_lossy().to_string();
    let dest_file = files_dir.join(&file_name);
    let dest_info = info_dir.join(format!("{}.trashinfo", file_name));

    let info_content = format!("[Trash Info]\nPath={}\nDeletionDate=2026-01-01T00:00:00\n", canon_str);
    let _ = fs::write(&dest_info, info_content);

    if fs::rename(&canonical, &dest_file).is_err() {
        if p.is_dir() {
            let _ = Command::new("mv").args([&canon_str, &dest_file.to_string_lossy().to_string()]).output();
        } else {
            let _ = fs::copy(&canonical, &dest_file);
            let _ = fs::remove_file(&canonical);
        }
    }
    Ok(format!("Çöp kutusuna taşındı: {}", file_name))
}

#[tauri::command]
async fn list_trash() -> Result<Vec<DirectoryItem>, String> {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/home/ankora"));
    let trash_files = home.join(".local/share/Trash/files");
    let mut items = Vec::new();
    if trash_files.exists() {
        if let Ok(entries) = fs::read_dir(trash_files) {
            for entry in entries.flatten() {
                let p = entry.path();
                let name = entry.file_name().to_string_lossy().to_string();
                let is_dir = p.is_dir();
                let size = if is_dir { 0 } else { p.metadata().map(|m| m.len()).unwrap_or(0) };
                let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
                items.push(DirectoryItem {
                    name,
                    path: p.to_string_lossy().to_string(),
                    is_dir,
                    size_str: format_file_size(size),
                    ext,
                    is_hidden: false,
                });
            }
        }
    }
    items.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(items)
}

#[tauri::command]
async fn restore_trash_item(fileName: String) -> Result<String, String> {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/home/ankora"));
    let trash_dir = home.join(".local/share/Trash");
    let file_path = trash_dir.join("files").join(&fileName);
    let info_path = trash_dir.join("info").join(format!("{}.trashinfo", fileName));

    if !file_path.exists() {
        return Err("Geri yüklenecek dosya bulunamadı.".to_string());
    }

    let mut target_dest = home.join("Masaüstü").join(&fileName);
    if info_path.exists() {
        if let Ok(content) = fs::read_to_string(&info_path) {
            for line in content.lines() {
                if let Some(orig_path) = line.strip_prefix("Path=") {
                    let p = PathBuf::from(orig_path.trim());
                    if let Some(parent) = p.parent() {
                        if parent.exists() {
                            target_dest = p;
                            break;
                        }
                    }
                }
            }
        }
    }

    fs::rename(&file_path, &target_dest).map_err(|e| e.to_string())?;
    let _ = fs::remove_file(info_path);
    Ok(format!("Geri yüklendi: {}", target_dest.to_string_lossy()))
}

#[tauri::command]
async fn empty_trash() -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        if let Ok(out) = Command::new("gio").args(["trash", "--empty"]).output() {
            if out.status.success() {
                return Ok("Çöp kutusu tamamen boşaltıldı.".to_string());
            }
        }
    }
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/home/ankora"));
    let trash_files = home.join(".local/share/Trash/files");
    let trash_info = home.join(".local/share/Trash/info");
    if trash_files.exists() {
        let _ = fs::remove_dir_all(&trash_files);
        let _ = fs::create_dir_all(&trash_files);
    }
    if trash_info.exists() {
        let _ = fs::remove_dir_all(&trash_info);
        let _ = fs::create_dir_all(&trash_info);
    }
    Ok("Çöp kutusu temizlendi.".to_string())
}

#[tauri::command]
async fn extract_archive(archivePath: String, destDir: Option<String>) -> Result<String, String> {
    let p = Path::new(&archivePath);
    if !p.exists() {
        return Err("Arşiv dosyası bulunamadı.".to_string());
    }
    let target_dest = destDir.unwrap_or_else(|| {
        p.parent().unwrap_or_else(|| Path::new("/home/ankora")).to_string_lossy().to_string()
    });

    let lower = archivePath.to_lowercase();
    let res = if lower.ends_with(".zip") {
        Command::new("unzip").args(["-q", "-o", &archivePath, "-d", &target_dest]).output()
    } else if lower.ends_with(".tar.gz") || lower.ends_with(".tgz") {
        Command::new("tar").args(["-xzf", &archivePath, "-C", &target_dest]).output()
    } else if lower.ends_with(".tar.xz") || lower.ends_with(".txz") {
        Command::new("tar").args(["-xJf", &archivePath, "-C", &target_dest]).output()
    } else if lower.ends_with(".tar.bz2") {
        Command::new("tar").args(["-xjf", &archivePath, "-C", &target_dest]).output()
    } else if lower.ends_with(".7z") {
        Command::new("7z").args(["x", "-y", &archivePath, &format!("-o{}", target_dest)]).output()
    } else {
        Command::new("tar").args(["-xf", &archivePath, "-C", &target_dest]).output()
    };

    match res {
        Ok(out) if out.status.success() => Ok(format!("Arşiv çıkarıldı: {}", target_dest)),
        Ok(out) => Err(format!("Arşiv çıkarılamadı: {}", String::from_utf8_lossy(&out.stderr))),
        Err(e) => Err(format!("Arşiv aracı çalıştırılamadı (tar/unzip/7z): {}", e)),
    }
}

#[tauri::command]
async fn create_archive(sourcePath: String, archiveType: String) -> Result<String, String> {
    let p = Path::new(&sourcePath);
    if !p.exists() {
        return Err("Arşivlenecek dosya/klasör bulunamadı.".to_string());
    }
    let parent = p.parent().unwrap_or_else(|| Path::new("."));
    let file_name = p.file_name().unwrap_or_default().to_string_lossy().to_string();

    let out_archive = if archiveType == "zip" {
        format!("{}.zip", sourcePath)
    } else {
        format!("{}.tar.gz", sourcePath)
    };

    let res = if archiveType == "zip" {
        Command::new("zip").current_dir(parent).args(["-r", "-q", &out_archive, &file_name]).output()
    } else {
        Command::new("tar").current_dir(parent).args(["-czf", &out_archive, &file_name]).output()
    };

    match res {
        Ok(out) if out.status.success() => Ok(format!("Arşiv oluşturuldu: {}", out_archive)),
        Ok(out) => Err(format!("Arşiv oluşturma başarısız: {}", String::from_utf8_lossy(&out.stderr))),
        Err(e) => Err(format!("Arşivleme komutu çalıştırılamadı: {}", e)),
    }
}

#[tauri::command]
async fn move_path(sourcePath: String, destPath: String) -> Result<String, String> {
    let src = Path::new(&sourcePath);
    if !src.exists() {
        return Err("Kaynak dosya veya klasör bulunamadı.".to_string());
    }
    let mut dest = PathBuf::from(&destPath);
    if dest.is_dir() {
        if let Some(file_name) = src.file_name() {
            dest = dest.join(file_name);
        }
    }
    #[cfg(target_os = "linux")]
    {
        let out = Command::new("mv").args([sourcePath.clone(), dest.to_string_lossy().to_string()]).output();
        match out {
            Ok(o) if o.status.success() => return Ok(format!("Öge taşındı: {}", dest.to_string_lossy())),
            Ok(o) => return Err(format!("Taşıma hatası: {}", String::from_utf8_lossy(&o.stderr))),
            Err(e) => return Err(format!("mv komutu çalıştırılamadı: {}", e)),
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        fs::rename(src, &dest).map_err(|e| format!("Taşıma hatası: {}", e))?;
        Ok(format!("Öge taşındı: {}", dest.to_string_lossy()))
    }
}

#[tauri::command]
fn sync_desktop_theme(isDark: bool, _accent: String) -> Result<bool, String> {
    #[cfg(target_os = "linux")]
    {
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/home/ankora"));
        let theme_name = if isDark { "Adwaita-dark" } else { "Adwaita" };
        // İkon teması: FairyWren Ayaz seçkisi ISO ile kurulur; yoksa Papirus
        // paketinden devralınır. Papirus da yoksa GTK kendi yedeğine düşer.
        let fairywren_installed = fs::metadata("/usr/share/icons/FairyWren_Ayaz").is_ok();
        let icon_name = if fairywren_installed {
            "FairyWren_Ayaz"
        } else if isDark {
            "Papirus-Dark"
        } else {
            "Papirus"
        };
        let prefer_dark = if isDark { "1" } else { "0" };
        let color_scheme = if isDark { "prefer-dark" } else { "default" };

        // 1. GTK-3.0
        let gtk3_dir = home.join(".config/gtk-3.0");
        let _ = fs::create_dir_all(&gtk3_dir);
        let gtk3_ini = format!(
            "[Settings]\ngtk-theme-name = {}\ngtk-icon-theme-name = {}\ngtk-application-prefer-dark-theme = {}\ngtk-font-name = Sans 10\n",
            theme_name, icon_name, prefer_dark
        );
        let _ = fs::write(gtk3_dir.join("settings.ini"), gtk3_ini);

        // 2. GTK-4.0
        let gtk4_dir = home.join(".config/gtk-4.0");
        let _ = fs::create_dir_all(&gtk4_dir);
        let gtk4_ini = format!(
            "[Settings]\ngtk-theme-name = {}\ngtk-icon-theme-name = {}\ngtk-application-prefer-dark-theme = {}\n",
            theme_name, icon_name, prefer_dark
        );
        let _ = fs::write(gtk4_dir.join("settings.ini"), gtk4_ini);

        // 3. GTK-2.0
        let gtk2_content = format!(
            "gtk-theme-name=\"{}\"\ngtk-icon-theme-name=\"{}\"\n",
            theme_name, icon_name
        );
        let _ = fs::write(home.join(".gtkrc-2.0"), gtk2_content);

        // 4. xsettingsd
        let xsettings_dir = home.join(".config/xsettingsd");
        let _ = fs::create_dir_all(&xsettings_dir);
        let xsettings_conf = format!(
            "Net/ThemeName \"{}\"\nNet/IconThemeName \"{}\"\nGtk/ApplicationPreferDarkTheme {}\nGtk/CursorThemeName \"Adwaita\"\n",
            theme_name, icon_name, prefer_dark
        );
        let _ = fs::write(xsettings_dir.join("xsettingsd.conf"), xsettings_conf);
        let _ = Command::new("pkill").args(["-HUP", "xsettingsd"]).output();

        // 5. gsettings
        let _ = Command::new("gsettings").args(["set", "org.gnome.desktop.interface", "color-scheme", color_scheme]).output();
        let _ = Command::new("gsettings").args(["set", "org.gnome.desktop.interface", "gtk-theme", theme_name]).output();
        let _ = Command::new("gsettings").args(["set", "org.gnome.desktop.interface", "icon-theme", icon_name]).output();
    }
    Ok(true)
}

#[tauri::command]
fn set_native_workspace(index: u32) -> Result<bool, String> {
    #[cfg(target_os = "linux")]
    {
        let idx_str = index.to_string();
        let _ = Command::new("wmctrl").args(["-s", &idx_str]).output()
            .or_else(|_| Command::new("xdotool").args(["set_desktop", &idx_str]).output());
    }
    Ok(true)
}

fn format_file_size(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{} B", bytes)
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    }
}

// ----------------------------------------------------------------------------
// 1. SES AYGITLARI VE ÇIKIŞ SEÇİCİ (PULSEAUDIO / PIPEWIRE SINKS & SOURCES)
// ----------------------------------------------------------------------------
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDeviceItem {
    pub id: String,
    pub name: String,
    pub description: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDevicesResult {
    pub sinks: Vec<AudioDeviceItem>,
    pub sources: Vec<AudioDeviceItem>,
    pub default_sink: String,
    pub default_source: String,
}

#[tauri::command]
fn get_audio_devices() -> Result<AudioDevicesResult, String> {
    #[cfg(target_os = "linux")]
    {
        let mut sinks = Vec::new();
        let mut sources = Vec::new();
        let default_sink = Command::new("pactl")
            .args(["get-default-sink"])
            .output()
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default();
        let default_source = Command::new("pactl")
            .args(["get-default-source"])
            .output()
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default();

        if let Ok(out) = Command::new("pactl").args(["list", "sinks"]).output() {
            let text = String::from_utf8_lossy(&out.stdout);
            let mut cur_name = String::new();
            let mut cur_desc = String::new();
            for line in text.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("Name: ") {
                    cur_name = trimmed.strip_prefix("Name: ").unwrap_or("").trim().to_string();
                } else if trimmed.starts_with("Description: ") {
                    cur_desc = trimmed.strip_prefix("Description: ").unwrap_or("").trim().to_string();
                } else if trimmed.starts_with("Sink #") || trimmed.is_empty() {
                    if !cur_name.is_empty() {
                        let is_def = cur_name == default_sink;
                        sinks.push(AudioDeviceItem {
                            id: cur_name.clone(),
                            name: cur_name.clone(),
                            description: if cur_desc.is_empty() { cur_name.clone() } else { cur_desc.clone() },
                            is_default: is_def,
                        });
                        cur_name.clear();
                        cur_desc.clear();
                    }
                }
            }
            if !cur_name.is_empty() {
                let is_def = cur_name == default_sink;
                sinks.push(AudioDeviceItem {
                    id: cur_name.clone(),
                    name: cur_name.clone(),
                    description: if cur_desc.is_empty() { cur_name.clone() } else { cur_desc },
                    is_default: is_def,
                });
            }
        }

        if let Ok(out) = Command::new("pactl").args(["list", "sources"]).output() {
            let text = String::from_utf8_lossy(&out.stdout);
            let mut cur_name = String::new();
            let mut cur_desc = String::new();
            for line in text.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("Name: ") {
                    cur_name = trimmed.strip_prefix("Name: ").unwrap_or("").trim().to_string();
                } else if trimmed.starts_with("Description: ") {
                    cur_desc = trimmed.strip_prefix("Description: ").unwrap_or("").trim().to_string();
                } else if trimmed.starts_with("Source #") || trimmed.is_empty() {
                    if !cur_name.is_empty() {
                        let is_def = cur_name == default_source;
                        sources.push(AudioDeviceItem {
                            id: cur_name.clone(),
                            name: cur_name.clone(),
                            description: if cur_desc.is_empty() { cur_name.clone() } else { cur_desc.clone() },
                            is_default: is_def,
                        });
                        cur_name.clear();
                        cur_desc.clear();
                    }
                }
            }
            if !cur_name.is_empty() {
                let is_def = cur_name == default_source;
                sources.push(AudioDeviceItem {
                    id: cur_name.clone(),
                    name: cur_name.clone(),
                    description: if cur_desc.is_empty() { cur_name.clone() } else { cur_desc },
                    is_default: is_def,
                });
            }
        }

        if sinks.is_empty() {
            sinks.push(AudioDeviceItem {
                id: "default_speaker".to_string(),
                name: "Dahili Hoparlör".to_string(),
                description: "Sistem Varsayılan Ses Çıkışı".to_string(),
                is_default: true,
            });
        }
        if sources.is_empty() {
            sources.push(AudioDeviceItem {
                id: "default_mic".to_string(),
                name: "Dahili Mikrofon".to_string(),
                description: "Sistem Varsayılan Girişi".to_string(),
                is_default: true,
            });
        }

        Ok(AudioDevicesResult {
            sinks,
            sources,
            default_sink,
            default_source,
        })
    }
    #[cfg(not(target_os = "linux"))]
    {
        Ok(AudioDevicesResult {
            sinks: vec![AudioDeviceItem {
                id: "default_speaker".to_string(),
                name: "Dahili Hoparlör".to_string(),
                description: "Sistem Varsayılan Ses Çıkışı".to_string(),
                is_default: true,
            }],
            sources: vec![AudioDeviceItem {
                id: "default_mic".to_string(),
                name: "Dahili Mikrofon".to_string(),
                description: "Sistem Varsayılan Girişi".to_string(),
                is_default: true,
            }],
            default_sink: "default_speaker".to_string(),
            default_source: "default_mic".to_string(),
        })
    }
}

#[tauri::command]
fn set_default_audio_device(kind: String, deviceName: String) -> Result<bool, String> {
    #[cfg(target_os = "linux")]
    {
        let arg = if kind == "source" { "set-default-source" } else { "set-default-sink" };
        let out = Command::new("pactl").args([arg, &deviceName]).output();
        match out {
            Ok(o) if o.status.success() => Ok(true),
            Ok(o) => Err(format!("Aygıt değiştirilemedi: {}", String::from_utf8_lossy(&o.stderr))),
            Err(e) => Err(format!("pactl komutu çalıştırılamadı: {}", e)),
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (kind, deviceName);
        Ok(true)
    }
}

// ----------------------------------------------------------------------------
// 2. BLUETOOTH YÖNETİCİSİ (BLUEZ D-BUS & CLI)
// ----------------------------------------------------------------------------
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BluetoothDeviceItem {
    pub address: String,
    pub name: String,
    pub is_connected: bool,
    pub is_paired: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BluetoothStatusResult {
    pub is_available: bool,
    pub is_powered: bool,
    pub devices: Vec<BluetoothDeviceItem>,
}

#[tauri::command]
fn get_bluetooth_status() -> Result<BluetoothStatusResult, String> {
    #[cfg(target_os = "linux")]
    {
        let mut is_available = false;
        let mut is_powered = false;
        let mut devices = Vec::new();

        if let Ok(out) = Command::new("timeout").args(["1.5", "bluetoothctl", "show"]).output() {
            let text = String::from_utf8_lossy(&out.stdout);
            if !text.is_empty() && !text.contains("No default controller available") {
                is_available = true;
                if text.contains("Powered: yes") {
                    is_powered = true;
                }
            }
        }

        if is_available {
            if let Ok(out) = Command::new("timeout").args(["1.5", "bluetoothctl", "devices"]).output() {
                let text = String::from_utf8_lossy(&out.stdout);
                for line in text.lines() {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 3 && parts[0] == "Device" {
                        let address = parts[1].to_string();
                        let name = parts[2..].join(" ");
                        let is_conn = line.contains("(connected)");
                        devices.push(BluetoothDeviceItem {
                            address,
                            name,
                            is_connected: is_conn,
                            is_paired: true,
                        });
                    }
                }
            }
        }

        Ok(BluetoothStatusResult {
            is_available,
            is_powered,
            devices,
        })
    }
    #[cfg(not(target_os = "linux"))]
    {
        Ok(BluetoothStatusResult {
            is_available: false,
            is_powered: false,
            devices: Vec::new(),
        })
    }
}

#[tauri::command]
fn toggle_bluetooth(powered: bool) -> Result<bool, String> {
    #[cfg(target_os = "linux")]
    {
        let val = if powered { "on" } else { "off" };
        let _ = Command::new("timeout").args(["2", "bluetoothctl", "power", val]).output();
        let _ = Command::new("rfkill").args([if powered { "unblock" } else { "block" }, "bluetooth"]).output();
        Ok(powered)
    }
    #[cfg(not(target_os = "linux"))]
    {
        Ok(powered)
    }
}

#[tauri::command]
fn scan_bluetooth(enable: bool) -> Result<bool, String> {
    #[cfg(target_os = "linux")]
    {
        let val = if enable { "on" } else { "off" };
        let _ = Command::new("timeout").args(["2", "bluetoothctl", "scan", val]).output();
        Ok(enable)
    }
    #[cfg(not(target_os = "linux"))]
    {
        Ok(enable)
    }
}

#[tauri::command]
fn connect_bluetooth_device(address: String) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        let out = Command::new("timeout").args(["5", "bluetoothctl", "connect", &address]).output();
        match out {
            Ok(o) if o.status.success() => Ok(format!("{} aygıtına bağlanıldı.", address)),
            Ok(o) => Err(format!("Bağlantı hatası: {}", String::from_utf8_lossy(&o.stderr))),
            Err(e) => Err(format!("Komut hatası: {}", e)),
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        Ok(format!("{} aygıtına bağlanıldı (Simüle).", address))
    }
}

#[tauri::command]
fn disconnect_bluetooth_device(address: String) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        let out = Command::new("timeout").args(["3", "bluetoothctl", "disconnect", &address]).output();
        match out {
            Ok(o) if o.status.success() => Ok(format!("{} bağlantısı kesildi.", address)),
            Ok(o) => Err(format!("Hata: {}", String::from_utf8_lossy(&o.stderr))),
            Err(e) => Err(format!("Komut hatası: {}", e)),
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        Ok(format!("{} bağlantısı kesildi (Simüle).", address))
    }
}

// ----------------------------------------------------------------------------
// 3. EVRENSEL SPOTLIGHT ARAMASI (FAST FILE SEARCH)
// ----------------------------------------------------------------------------
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotlightSearchResult {
    pub name: String,
    pub path: String,
    pub ext: String,
    pub is_dir: bool,
    pub size_str: String,
}

#[tauri::command]
async fn spotlight_search_files(query: String) -> Result<Vec<SpotlightSearchResult>, String> {
    let clean_q = query.trim();
    if clean_q.is_empty() {
        return Ok(Vec::new());
    }

    let mut results = Vec::new();
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/home/ankora"));
    let search_roots = [
        home.join("Masaüstü"),
        home.join("Belgeler"),
        home.join("İndirilenler"),
        home.join("Resimler"),
        home.join("Müzik"),
        home.join("Videolar"),
        home.clone(),
    ];

    let q_lower = clean_q.to_lowercase();
    for root in &search_roots {
        if !root.exists() {
            continue;
        }
        if let Ok(entries) = fs::read_dir(root) {
            for entry in entries.flatten() {
                if results.len() >= 20 {
                    break;
                }
                let path = entry.path();
                let fname = entry.file_name().to_string_lossy().to_string();
                if fname.starts_with('.') {
                    continue;
                }
                if fname.to_lowercase().contains(&q_lower) {
                    let is_dir = path.is_dir();
                    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
                    let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                    let size_str = if is_dir { "Klasör".to_string() } else { format_file_size(size) };

                    if !results.iter().any(|r: &SpotlightSearchResult| r.path == path.to_string_lossy().as_ref()) {
                        results.push(SpotlightSearchResult {
                            name: fname,
                            path: path.to_string_lossy().to_string(),
                            ext,
                            is_dir,
                            size_str,
                        });
                    }
                }
            }
        }
        if results.len() >= 20 {
            break;
        }
    }

    Ok(results)
}

// ----------------------------------------------------------------------------
// 4. MASAÜSTÜ BİLDİRİM SUNUCUSU VE GEÇMİŞİ (DESKTOP NOTIFICATIONS)
// ----------------------------------------------------------------------------
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopNotificationItem {
    pub id: String,
    pub app_name: String,
    pub title: String,
    pub body: String,
    pub timestamp: String,
}

#[tauri::command]
fn get_system_notifications() -> Result<Vec<DesktopNotificationItem>, String> {
    let mut list = Vec::new();
    let path = Path::new("/tmp/ayaz-notifications.jsonl");
    if path.exists() {
        if let Ok(content) = fs::read_to_string(path) {
            for line in content.lines().rev().take(30) {
                if let Ok(item) = serde_json::from_str::<DesktopNotificationItem>(line) {
                    list.push(item);
                }
            }
        }
    }
    Ok(list)
}

#[tauri::command]
fn send_desktop_notification(title: String, body: String, appName: Option<String>) -> Result<bool, String> {
    let app = appName.unwrap_or_else(|| "Sistem".to_string());
    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("notify-send")
            .args(["-a", &app, &title, &body])
            .output();
    }
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    let now = format!("{:02}:{:02}", (secs / 3600 % 24), (secs / 60 % 60));
    let item = DesktopNotificationItem {
        id: format!("{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis()),
        app_name: app,
        title,
        body,
        timestamp: now,
    };
    if let Ok(json) = serde_json::to_string(&item) {
        if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open("/tmp/ayaz-notifications.jsonl") {
            let _ = writeln!(f, "{}", json);
        }
    }
    Ok(true)
}

#[tauri::command]
fn clear_system_notifications() -> Result<bool, String> {
    let path = Path::new("/tmp/ayaz-notifications.jsonl");
    if path.exists() {
        let _ = fs::write(path, "");
    }
    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("dunstctl").args(["history-clear"]).output();
        let _ = Command::new("dunstctl").args(["close-all"]).output();
    }
    Ok(true)
}

#[derive(Serialize, Deserialize, Clone)]
pub struct MprisStatus {
    pub is_active: bool,
    pub player_name: String,
    pub playback_status: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub art_url: String,
}

#[tauri::command]
fn get_mpris_status() -> Result<MprisStatus, String> {
    #[cfg(target_os = "linux")]
    {
        let out = Command::new("timeout")
            .args(["1.5", "playerctl", "-a", "metadata", "--format", "{{playerName}}|||{{status}}|||{{title}}|||{{artist}}|||{{album}}|||{{mpris:artUrl}}"])
            .output();
        if let Ok(o) = out {
            if o.status.success() {
                let stdout = String::from_utf8_lossy(&o.stdout);
                for line in stdout.lines() {
                    let parts: Vec<&str> = line.split("|||").collect();
                    if parts.len() >= 2 {
                        let player_name = parts.get(0).unwrap_or(&"").trim().to_string();
                        let playback_status = parts.get(1).unwrap_or(&"").trim().to_string();
                        let title = parts.get(2).unwrap_or(&"").trim().to_string();
                        let artist = parts.get(3).unwrap_or(&"").trim().to_string();
                        let album = parts.get(4).unwrap_or(&"").trim().to_string();
                        let art_url = parts.get(5).unwrap_or(&"").trim().to_string();
                        if !player_name.is_empty() {
                            return Ok(MprisStatus {
                                is_active: true,
                                player_name,
                                playback_status,
                                title: if title.is_empty() { "Bilinmeyen Parça".into() } else { title },
                                artist,
                                album,
                                art_url,
                            });
                        }
                    }
                }
            }
        }
    }
    Ok(MprisStatus {
        is_active: false,
        player_name: String::new(),
        playback_status: "Stopped".into(),
        title: String::new(),
        artist: String::new(),
        album: String::new(),
        art_url: String::new(),
    })
}

#[tauri::command]
fn send_mpris_command(command: String) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        let sub = match command.as_str() {
            "play-pause" => "play-pause",
            "play" => "play",
            "pause" => "pause",
            "next" => "next",
            "previous" => "previous",
            "stop" => "stop",
            _ => return Err("Geçersiz MPRIS komutu".into()),
        };
        let res = Command::new("timeout")
            .args(["2.0", "playerctl", sub])
            .output();
        match res {
            Ok(o) => {
                if o.status.success() {
                    Ok("Başarılı".into())
                } else {
                    Err("Oynatıcı yanıt vermedi".into())
                }
            }
            Err(e) => Err(format!("playerctl çalıştırılamadı: {}", e)),
        }
    }
    #[cfg(not(target_os = "linux"))]
    Ok("Simüle edildi".into())
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TrayItemInfo {
    pub id: String,
    pub title: String,
    pub icon_name: String,
    pub icon_path: String,
    pub tooltip: String,
    pub service: String,
}

#[tauri::command]
fn get_tray_items() -> Result<Vec<TrayItemInfo>, String> {
    let mut items = Vec::new();
    let tray_file = Path::new("/tmp/ayaz-tray-items.json");
    if tray_file.exists() {
        if let Ok(content) = fs::read_to_string(tray_file) {
            if let Ok(parsed) = serde_json::from_str::<Vec<TrayItemInfo>>(&content) {
                items = parsed;
            }
        }
    }
    Ok(items)
}

#[tauri::command]
fn activate_tray_item(service: String) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("dbus-send")
            .args([
                "--session",
                "--type=method_call",
                &format!("--dest={}", service),
                "/StatusNotifierItem",
                "org.kde.StatusNotifierItem.Activate",
                "int32:0",
                "int32:0",
            ])
            .output();
    }
    Ok("Aktifleştirildi".into())
}

#[tauri::command]
fn context_menu_tray_item(service: String) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("dbus-send")
            .args([
                "--session",
                "--type=method_call",
                &format!("--dest={}", service),
                "/StatusNotifierItem",
                "org.kde.StatusNotifierItem.ContextMenu",
                "int32:0",
                "int32:0",
            ])
            .output();
    }
    Ok("Menü açıldı".into())
}

#[derive(Serialize, Deserialize, Clone)]
pub struct OpenWithAppInfo {
    pub id: String,
    pub name: String,
    pub exec: String,
    pub icon: String,
    pub is_default: bool,
}

#[tauri::command]
fn get_open_with_apps(file_path: String) -> Result<Vec<OpenWithAppInfo>, String> {
    let mut apps = Vec::new();
    let p = Path::new(&file_path);
    if !p.exists() {
        return Err("Dosya bulunamadı".into());
    }

    #[cfg(target_os = "linux")]
    {
        let mime_out = Command::new("xdg-mime")
            .args(["query", "filetype", &file_path])
            .output();
        let mime_type = match mime_out {
            Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).trim().to_string(),
            _ => String::new(),
        };

        let def_app_out = Command::new("xdg-mime")
            .args(["query", "default", &mime_type])
            .output();
        let def_app = match def_app_out {
            Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).trim().to_string(),
            _ => String::new(),
        };

        let app_dirs = [
            "/usr/share/applications",
            "/usr/local/share/applications",
        ];

        for d in app_dirs {
            let dir_path = Path::new(d);
            if let Ok(entries) = fs::read_dir(dir_path) {
                for entry in entries.flatten() {
                    let ep = entry.path();
                    if ep.extension().and_then(|s| s.to_str()) == Some("desktop") {
                        if let Ok(content) = fs::read_to_string(&ep) {
                            let matches_mime = if !mime_type.is_empty() {
                                content.lines().any(|l| l.starts_with("MimeType=") && l.contains(&mime_type))
                            } else {
                                false
                            };

                            let file_name = ep.file_name().unwrap_or_default().to_string_lossy().to_string();
                            let is_default = !def_app.is_empty() && file_name == def_app;

                            if matches_mime || is_default {
                                let mut name = String::new();
                                let mut exec = String::new();
                                let mut icon = String::new();
                                let mut nodisplay = false;

                                for l in content.lines() {
                                    if l.starts_with("Name=") && name.is_empty() {
                                        name = l.trim_start_matches("Name=").to_string();
                                    } else if l.starts_with("Exec=") && exec.is_empty() {
                                        exec = l.trim_start_matches("Exec=").to_string();
                                        exec = exec.replace("%f", "").replace("%F", "").replace("%u", "").replace("%U", "").trim().to_string();
                                    } else if l.starts_with("Icon=") && icon.is_empty() {
                                        icon = l.trim_start_matches("Icon=").to_string();
                                    } else if l == "NoDisplay=true" {
                                        nodisplay = true;
                                    }
                                }

                                if !nodisplay && !name.is_empty() && !exec.is_empty() {
                                    apps.push(OpenWithAppInfo {
                                        id: file_name,
                                        name,
                                        exec,
                                        icon,
                                        is_default,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(apps)
}

#[tauri::command]
fn set_desktop_wallpaper(file_path: String) -> Result<String, String> {
    let p = Path::new(&file_path);
    if !p.exists() {
        return Err("Duvar kağıdı görseli bulunamadı".into());
    }

    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("feh")
            .args(["--bg-fill", &file_path])
            .output();
        let _ = Command::new("xwallpaper")
            .args(["--zoom", &file_path])
            .output();

        if let Ok(home) = std::env::var("HOME") {
            let conf_dir = Path::new(&home).join(".config/ankora");
            let _ = fs::create_dir_all(&conf_dir);
            let _ = fs::write(conf_dir.join("wallpaper"), &file_path);
        }
    }
    Ok("Duvar kağıdı uygulandı".into())
}

#[derive(Serialize, Deserialize, Clone)]
pub struct UsbDiskInfo {
    pub name: String,
    pub path: String,
    pub model: String,
    pub vendor: String,
    pub size_human: String,
    pub size_bytes: u64,
    pub is_removable: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct FlashProgress {
    pub percent: f32,
    pub status: String,
    pub message: String,
}

#[tauri::command]
fn get_usb_flash_targets() -> Result<Vec<UsbDiskInfo>, String> {
    let mut targets = Vec::new();

    #[cfg(target_os = "linux")]
    {
        let out = Command::new("lsblk")
            .args(["-J", "-b", "-o", "NAME,PATH,SIZE,TYPE,TRAN,MODEL,VENDOR,RM,MOUNTPOINT,ROTA"])
            .output()
            .map_err(|e| format!("lsblk çalıştırılamadı: {}", e))?;

        if !out.status.success() {
            return Err("lsblk komutu hata verdi".into());
        }

        let val: serde_json::Value = serde_json::from_slice(&out.stdout)
            .map_err(|e| format!("lsblk JSON ayrıştırılamadı: {}", e))?;

        if let Some(devices) = val.get("blockdevices").and_then(|v| v.as_array()) {
            for dev in devices {
                let dev_type = dev.get("type").and_then(|v| v.as_str()).unwrap_or("");
                if dev_type != "disk" {
                    continue;
                }

                let tran = dev.get("tran").and_then(|v| v.as_str()).unwrap_or("");
                let rm = dev.get("rm").map(|v| v.as_bool().unwrap_or(false) || v.as_i64() == Some(1)).unwrap_or(false);

                if tran != "usb" && !rm {
                    continue;
                }

                // Kök dizin kontrolü: Asla sistem diskini listeleme!
                let mut contains_system_mount = false;
                fn check_mounts(item: &serde_json::Value, has_sys: &mut bool) {
                    if let Some(mp) = item.get("mountpoint").and_then(|v| v.as_str()) {
                        if mp == "/" || mp == "/boot" || mp == "/home" || mp.starts_with("/live") {
                            *has_sys = true;
                        }
                    }
                    if let Some(children) = item.get("children").and_then(|v| v.as_array()) {
                        for c in children {
                            check_mounts(c, has_sys);
                        }
                    }
                }
                check_mounts(dev, &mut contains_system_mount);

                if contains_system_mount {
                    continue;
                }

                let name = dev.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let path = dev.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let model = dev.get("model").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
                let vendor = dev.get("vendor").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
                let size_bytes = dev.get("size").and_then(|v| v.as_u64()).unwrap_or(0);

                let size_human = format_file_size(size_bytes);

                let dev_path = if path.is_empty() { format!("/dev/{}", name) } else { path };
                targets.push(UsbDiskInfo {
                    name,
                    path: dev_path,
                    model: if model.is_empty() { "USB Sürücü".into() } else { model },
                    vendor,
                    size_human,
                    size_bytes,
                    is_removable: true,
                });
            }
        }
    }

    Ok(targets)
}

#[tauri::command]
fn flash_iso_to_usb(iso_path: String, target_device: String) -> Result<String, String> {
    let iso = Path::new(&iso_path);
    if !iso.exists() {
        return Err("ISO dosyası bulunamadı".into());
    }

    if !target_device.starts_with("/dev/") {
        return Err("Geçersiz hedef cihaz yolu".into());
    }

    let dev_name = target_device.strip_prefix("/dev/").unwrap_or("");
    if dev_name.is_empty() || !dev_name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        return Err("Geçersiz hedef cihaz biçimi".into());
    }

    if !Path::new(&target_device).exists() {
        return Err("Hedef aygıt sistemde bulunamadı".into());
    }

    for mnt in &["/", "/boot", "/home", "/etc"] {
        if let Ok(o) = Command::new("findmnt").args(["-n", "-o", "SOURCE", mnt]).output() {
            let root_src = String::from_utf8_lossy(&o.stdout);
            if root_src.contains(&target_device) {
                return Err("Kritik Güvenlik Uyarısı: Sistem kök diskine yazma engellendi!".into());
            }
        }
    }

    let progress_file = "/tmp/ankora-flasher.progress";
    let _ = fs::write(progress_file, "0.0:running:Yazma işlemi başlatılıyor...");

    let iso_p = iso_path.clone();
    let tgt = target_device.clone();

    std::thread::spawn(move || {
        // Güvenli ayırma (unmount): sh -c yerine doğrudan süreç çağrısı
        let _ = Command::new("umount").args(["-f", &tgt]).output();
        if let Ok(mounts) = fs::read_to_string("/proc/mounts") {
            for line in mounts.lines() {
                if let Some(dev) = line.split_whitespace().next() {
                    if dev.starts_with(&tgt) {
                        let _ = Command::new("umount").args(["-f", dev]).output();
                    }
                }
            }
        }

        let status = Command::new("dd")
            .arg(format!("if={}", iso_p))
            .arg(format!("of={}", tgt))
            .args(["bs=4M", "status=none", "conv=fsync"])
            .status();

        match status {
            Ok(s) if s.success() => {
                let _ = Command::new("sync").output();
                let _ = fs::write(progress_file, "100.0:done:ISO başarıyla USB belleğe yazdırıldı!");
            }
            Ok(_) => {
                let _ = fs::write(progress_file, "0.0:error:Yazma işlemi hata koduyla sonuçlandı.");
            }
            Err(e) => {
                let _ = fs::write(progress_file, format!("0.0:error:Hata: {}", e));
            }
        }
    });

    Ok("Yazma işlemi arka planda başlatıldı".into())
}

#[tauri::command]
fn get_flash_progress() -> Result<FlashProgress, String> {
    let progress_file = Path::new("/tmp/ankora-flasher.progress");
    if !progress_file.exists() {
        return Ok(FlashProgress {
            percent: 0.0,
            status: "idle".into(),
            message: "Bekleniyor".into(),
        });
    }

    let content = fs::read_to_string(progress_file).unwrap_or_default();
    let parts: Vec<&str> = content.splitn(3, ':').collect();
    if parts.len() == 3 {
        let percent: f32 = parts[0].parse().unwrap_or(0.0);
        let status = parts[1].to_string();
        let message = parts[2].to_string();
        Ok(FlashProgress { percent, status, message })
    } else {
        Ok(FlashProgress {
            percent: 0.0,
            status: "idle".into(),
            message: "Bekleniyor".into(),
        })
    }
}

#[tauri::command]
fn format_usb_drive(target_device: String, filesystem: String, label: String) -> Result<String, String> {
    if !target_device.starts_with("/dev/") {
        return Err("Geçersiz hedef cihaz yolu".into());
    }

    let dev_name = target_device.strip_prefix("/dev/").unwrap_or("");
    if dev_name.is_empty() || !dev_name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        return Err("Geçersiz hedef cihaz biçimi".into());
    }

    if !Path::new(&target_device).exists() {
        return Err("Hedef aygıt sistemde bulunamadı".into());
    }

    for mnt in &["/", "/boot", "/home", "/etc"] {
        if let Ok(o) = Command::new("findmnt").args(["-n", "-o", "SOURCE", mnt]).output() {
            let root_src = String::from_utf8_lossy(&o.stdout);
            if root_src.contains(&target_device) {
                return Err("Sistem kök sürücüsü biçimlendirilemez!".into());
            }
        }
    }

    // Güvenli ayırma
    let _ = Command::new("umount").args(["-f", &target_device]).output();
    if let Ok(mounts) = fs::read_to_string("/proc/mounts") {
        for line in mounts.lines() {
            if let Some(dev) = line.split_whitespace().next() {
                if dev.starts_with(&target_device) {
                    let _ = Command::new("umount").args(["-f", dev]).output();
                }
            }
        }
    }

    let clean_label = label.replace(|c: char| !c.is_alphanumeric() && c != '_' && c != '-', "");
    let safe_label = if clean_label.is_empty() { "ANKORA" } else { &clean_label };

    let status = match filesystem.to_lowercase().as_str() {
        "vfat" | "fat32" => Command::new("mkfs.vfat").args(["-F", "32", "-n", safe_label, &target_device]).status(),
        "ext4" => Command::new("mkfs.ext4").args(["-F", "-L", safe_label, &target_device]).status(),
        "ntfs" => Command::new("mkfs.ntfs").args(["-Q", "-L", safe_label, &target_device]).status(),
        _ => return Err("Desteklenmeyen dosya sistemi".into()),
    };

    match status {
        Ok(s) if s.success() => Ok(format!("{} başarıyla {} olarak biçimlendirildi.", target_device, filesystem.to_uppercase())),
        Ok(_) => Err("Biçimlendirme başarısız oldu. Sürücünün kullanımda olmadığından emin olun.".into()),
        Err(e) => Err(format!("Komut yürütülemedi: {}", e)),
    }
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct SystemSnapshotInfo {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub timestamp: u64,
    #[serde(default)]
    pub date_str: String,
    #[serde(default)]
    pub size_human: String,
    #[serde(default)]
    pub is_btrfs: bool,
}

// Kurtarma noktası yardımcısı: root-owned ayaz-pkg-helper (ankora-updater
// sudoers NOPASSWD). /var/backups altındaki TÜM yazımlar bu betikle yapılır;
// masaüstü oturumunun doğrudan yazması "Permission denied" üretiyordu.
pub const SNAP_HELPER: &str = "/usr/local/bin/ayaz-pkg-helper";

fn snap_helper(action: &str, arg: &str) -> Result<String, String> {
    if !Path::new(SNAP_HELPER).exists() {
        return Err("Kurtarma noktası yardımcısı (ayaz-pkg-helper) bulunamadı; sistem kurulumu eksik.".into());
    }
    let out = root_command(SNAP_HELPER, &[action, arg])
        .map_err(|e| format!("Yardımcı çalıştırılamadı: {}", e))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        let fallback = String::from_utf8_lossy(&out.stdout);
        let msg = if err.trim().is_empty() { fallback.trim() } else { err.trim() };
        return Err(if msg.is_empty() {
            "Kurtarma noktası işlemi başarısız oldu".to_string()
        } else {
            msg.to_string()
        });
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

#[tauri::command]
fn create_system_snapshot(name: String, description: String) -> Result<SystemSnapshotInfo, String> {
    let clean_name = name.chars().filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-').collect::<String>();
    let safe_name = if clean_name.is_empty() { "snapshot".to_string() } else { clean_name };

    let output = snap_helper("snapshot-create", &safe_name)?;
    let mut snap: SystemSnapshotInfo = serde_json::from_str(&output)
        .map_err(|e| format!("Kurtarma noktası yanıtı çözümlenemedi: {}", e))?;
    if snap.description.is_empty() {
        snap.description = description;
    }
    Ok(snap)
}

#[tauri::command]
fn list_system_snapshots() -> Result<Vec<SystemSnapshotInfo>, String> {
    let meta_file = Path::new("/var/backups/ankora-snapshots/snapshots.json");
    if meta_file.exists() {
        if let Ok(content) = fs::read_to_string(&meta_file) {
            if let Ok(snaps) = serde_json::from_str::<Vec<SystemSnapshotInfo>>(&content) {
                return Ok(snaps);
            }
        }
    }
    Ok(Vec::new())
}

#[tauri::command]
fn restore_system_snapshot(snapshot_id: String) -> Result<String, String> {
    if snapshot_id.is_empty() || snapshot_id.contains("..") || snapshot_id.contains('/') || snapshot_id.contains('\\') {
        return Err("Geçersiz snapshot kimliği".into());
    }
    if !snapshot_id.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-') {
        return Err("Geçersiz snapshot kimliği".into());
    }
    let _ = snap_helper("snapshot-restore", &snapshot_id)?;
    Ok("Sistem yapılandırması başarıyla geri yüklendi.".into())
}

#[tauri::command]
fn delete_system_snapshot(snapshot_id: String) -> Result<String, String> {
    if snapshot_id.is_empty() || snapshot_id.contains("..") || snapshot_id.contains('/') || snapshot_id.contains('\\') {
        return Err("Geçersiz snapshot kimliği".into());
    }
    if !snapshot_id.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-') {
        return Err("Geçersiz snapshot kimliği".into());
    }
    let _ = snap_helper("snapshot-delete", &snapshot_id)?;
    Ok("Kurtarma noktası silindi".into())
}

fn main() {
    let sys_path = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
    match std::env::var("PATH") {
        Ok(cur) if cur.contains("/usr/sbin") => {}
        Ok(cur) => std::env::set_var("PATH", format!("{}:{}", sys_path, cur)),
        Err(_) => std::env::set_var("PATH", sys_path),
    }
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            drag_window,
            scan_xdg_applications,
            install_deb_package,
            install_vendor_package,
            install_meb_certificate,
            get_xdg_user_dirs,
            get_app_icon,
            remove_deb_package,
            run_terminal_command,
            read_document_file,
            list_available_documents,
            query_local_ai,
            execute_agent_confirmed_action,
            save_ai_credential,
            has_ai_credential,
            delete_ai_credential,
            is_lock_configured,
            set_lock_credentials,
            verify_lock_credentials,
            lock_x11_session,
            unlock_x11_session,
            get_storage_devices,
            execute_system_installation,
            get_system_telemetry,
            set_brightness,
            get_volume,
            set_volume,
            optimize_system_memory,
            launch_application,
            check_first_run,
            set_first_run_completed,
            set_system_keyboard,
            set_keyboard_layout,
            get_region_settings,
            set_timezone,
            sync_time_ntp,
            set_system_language,
            check_de_update,
            download_and_apply_de_update,
            restart_desktop_process,
            list_directory,
            create_folder,
            write_text_file,
            open_path,
            open_url,
            delete_file,
            system_poweroff,
            system_reboot,
            system_suspend,
            system_logout,
            take_screenshot,
            get_radio_state,
            set_radio_state,
            scan_wifi_networks,
            wifi_connect,
            get_network_info,
            get_processes,
            kill_process,
            get_native_windows,
            activate_native_window,
            close_native_window,
            minimize_native_window,
            minimize_all_windows,
            set_desktop_layer,
            get_display_modes,
            set_display_mode,
            get_removable_drives,
            unmount_drive,
            get_clipboard_text,
            set_clipboard_text,
            list_installed_deb_packages,
            get_storage_stats,
            system_browser_available,
            set_cpu_governor,
            set_dpms_timeout,
            confirm_display_mode,
            revert_display_mode,
            set_display_scale,
            install_flatpak_app,
            remove_flatpak_app,
            list_installed_flatpaks,
            move_to_trash,
            list_trash,
            restore_trash_item,
            empty_trash,
            extract_archive,
            create_archive,
            move_path,
            sync_desktop_theme,
            set_native_workspace,
            get_audio_devices,
            set_default_audio_device,
            get_bluetooth_status,
            toggle_bluetooth,
            scan_bluetooth,
            connect_bluetooth_device,
            disconnect_bluetooth_device,
            spotlight_search_files,
            get_system_notifications,
            send_desktop_notification,
            clear_system_notifications,
            get_mpris_status,
            send_mpris_command,
            get_tray_items,
            activate_tray_item,
            context_menu_tray_item,
            get_open_with_apps,
            set_desktop_wallpaper,
            get_usb_flash_targets,
            flash_iso_to_usb,
            get_flash_progress,
            format_usb_drive,
            create_system_snapshot,
            list_system_snapshots,
            restore_system_snapshot,
            delete_system_snapshot,
            launch_interactive_terminal,
            get_all_monitors,
            set_multi_monitor_layout,
        ])
        .run(tauri::generate_context!())
        .expect("Ankora DE başlatılırken hata oluştu");
}

// ============================================================================
// BİRİM TESTLERİ (UNIT TESTS) - KOD KALİTESİ VE GÜVENLİK TESTLERİ
// ============================================================================
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_valid_disk_target() {
        // Geçerli tüm diskler
        assert!(is_valid_disk_target("/dev/sda"));
        assert!(is_valid_disk_target("/dev/sdb"));
        assert!(is_valid_disk_target("/dev/vda"));
        assert!(is_valid_disk_target("/dev/nvme0n1"));
        assert!(is_valid_disk_target("/dev/nvme1n1"));

        // Kesinlikle reddedilmesi gereken bölümler (partitions)
        assert!(!is_valid_disk_target("/dev/sda1"));
        assert!(!is_valid_disk_target("/dev/sda2"));
        assert!(!is_valid_disk_target("/dev/vda1"));
        assert!(!is_valid_disk_target("/dev/nvme0n1p1"));
        assert!(!is_valid_disk_target("/dev/nvme0n1p2"));

        // Geçersiz yollar ve karakterler
        assert!(!is_valid_disk_target("/dev/random"));
        assert!(!is_valid_disk_target("/dev/null"));
        assert!(!is_valid_disk_target("/etc/shadow"));
        assert!(!is_valid_disk_target("sda"));
    }

    #[test]
    fn test_is_valid_username() {
        assert!(is_valid_username("pars"));
        assert!(is_valid_username("ankora_user"));
        assert!(is_valid_username("user-1"));

        assert!(!is_valid_username(""));
        assert!(!is_valid_username("1user")); // Rakamla başlayamaz
        assert!(!is_valid_username("User"));  // Büyük harf içeremez
        assert!(!is_valid_username("user;rm")); // Tehlikeli karakter
    }

    #[test]
    fn test_is_valid_deb_package_name() {
        assert!(is_valid_deb_package_name("firefox-esr"));
        assert!(is_valid_deb_package_name("vlc"));
        assert!(is_valid_deb_package_name("libgtk-3-0"));
        assert!(is_valid_deb_package_name("g++"));

        assert!(!is_valid_deb_package_name("a"));
        assert!(!is_valid_deb_package_name("-firefox"));
        assert!(!is_valid_deb_package_name("pkg;rm -rf"));
    }

    #[test]
    fn test_forbidden_launch_binaries() {
        assert!(FORBIDDEN_LAUNCH_BINARIES.contains(&"sudo"));
        assert!(FORBIDDEN_LAUNCH_BINARIES.contains(&"su"));
        assert!(FORBIDDEN_LAUNCH_BINARIES.contains(&"pkexec"));
        assert!(FORBIDDEN_LAUNCH_BINARIES.contains(&"bash"));
        assert!(FORBIDDEN_LAUNCH_BINARIES.contains(&"dd"));
    }

    #[test]
    fn test_semver_and_updater() {
        assert_eq!(parse_semver("v2.0.0"), (2, 0, 0));
        assert_eq!(parse_semver("2.1.3"), (2, 1, 3));
        assert_eq!(parse_semver("V1.9.0"), (1, 9, 0));

        assert!(is_newer_version("v2.0.1", "2.0.0"));
        assert!(is_newer_version("2.1.0", "2.0.9"));
        assert!(is_newer_version("3.0.0", "2.9.9"));

        assert!(!is_newer_version("2.0.0", "2.0.0"));
        assert!(!is_newer_version("v2.0.0", "2.0.1"));
        assert!(!is_newer_version("1.9.9", "2.0.0"));
    }

    #[test]
    fn test_encrypted_vault_roundtrip() {
        let sample = b"{\"openai\":\"sk-secret-key-12345\"}";
        let enc = encrypt_vault_payload(sample);
        assert!(enc.starts_with(b"ANKORA_VAULT_V2\n"));
        let dec = decrypt_vault_payload(&enc).expect("Vault decryption failed");
        assert_eq!(dec, sample);
    }

    #[test]
    fn test_salted_pin_hash() {
        let salt = [42u8; 16];
        let h1 = compute_salted_pin_hash(&salt, "1234");
        let h2 = compute_salted_pin_hash(&salt, "1234");
        let h3 = compute_salted_pin_hash(&salt, "5678");
        assert_eq!(h1, h2);
        assert_ne!(h1, h3);
    }

    #[test]
    fn test_ssrf_ip_filtering() {
        let link_local: IpAddr = "169.254.169.254".parse().unwrap();
        assert!(is_private_or_restricted_ip(&link_local));

        let priv_10: IpAddr = "10.0.0.1".parse().unwrap();
        assert!(is_private_or_restricted_ip(&priv_10));

        let priv_192: IpAddr = "192.168.1.1".parse().unwrap();
        assert!(is_private_or_restricted_ip(&priv_192));

        let pub_ip: IpAddr = "8.8.8.8".parse().unwrap();
        assert!(!is_private_or_restricted_ip(&pub_ip));
    }

    #[test]
    fn test_directory_item_structure() {
        let item = DirectoryItem {
            name: "test.txt".to_string(),
            path: "/home/ankora/test.txt".to_string(),
            is_dir: false,
            size_str: "1.2 KB".to_string(),
            ext: "txt".to_string(),
            is_hidden: false,
        };
        assert_eq!(item.name, "test.txt");
        assert!(!item.is_dir);
        assert_eq!(item.ext, "txt");
    }

    #[test]
    fn test_terminal_command_whitelist() {
        assert!(is_terminal_command_permitted("uname -a").is_ok());
        assert!(is_terminal_command_permitted("free -h").is_ok());
        assert!(is_terminal_command_permitted("ls -la").is_ok());
        assert!(is_terminal_command_permitted("echo hello").is_ok());
        assert!(is_terminal_command_permitted("cat /etc/os-release").is_ok());

        assert!(is_terminal_command_permitted("sudo rm -rf /").is_err());
        assert!(is_terminal_command_permitted("cat /etc/shadow").is_err());
        assert!(is_terminal_command_permitted("ls; rm -rf /").is_err());
        assert!(is_terminal_command_permitted("whoami && id").is_err());
        assert!(is_terminal_command_permitted("bash").is_err());
        assert!(is_terminal_command_permitted("cat /etc/sudoers").is_err());
    }

    #[test]
    fn test_root_requiring_commands_not_in_terminal_whitelist() {
        // Root gerektiren komutlar terminalden doğrudan çalıştırılamaz;
        // kurulum ve bakım yalnızca onaylı yardımcılar üzerinden yapılır.
        assert!(is_terminal_command_permitted("apt-get update").is_err());
        assert!(is_terminal_command_permitted("apt-get upgrade -y").is_err());
        assert!(is_terminal_command_permitted("apt-get update && apt-get upgrade -y").is_err());
        assert!(is_terminal_command_permitted("echo 3 > /proc/sys/vm/drop_caches").is_err());
        // Temizlik ve durum komutları kullanıcı bağlamında zararsızdır.
        assert!(is_terminal_command_permitted("apt-get clean").is_ok());
        assert!(is_terminal_command_permitted("df -h / && free -m").is_ok());
    }

    #[test]
    fn test_pbkdf2_derivation() {
        let key = pbkdf2_hmac_sha256(b"password", b"salt", 100);
        let key2 = pbkdf2_hmac_sha256(b"password", b"salt", 100);
        let key3 = pbkdf2_hmac_sha256(b"password", b"salt2", 100);
        assert_eq!(key, key2);
        assert_ne!(key, key3);
    }

    #[test]
    fn test_icon_candidate_safety() {
        // Boş ve desteksiz adaylar dosya aramasını patlatmamalı.
        assert!(find_icon_file(&[]).is_none());
        assert!(find_icon_file(&["".to_string()]).is_none());
        assert!(find_icon_file(&["/etc/shadow".to_string()]).is_none());
        assert!(find_icon_file(&["kurulu-olmayan-ikon-xyz".to_string()]).is_none());
    }
}

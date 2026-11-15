# Ankora Linux 4.7.0 "Bora" & Ayaz DE: Güvenlik Mimarisi ve Tehdit Modeli (SECURITY.md)

Bu belge, **Ankora Linux 4.7.0 "Bora" (Devuan 6.0 Excalibur)** dağıtımı ve **Ayaz Desktop Environment (Ayaz DE, Tauri 2.0 + Rust + WebKitGTK 4.1)** için DevSecOps standartları, tehdit modeli (STRIDE), güvenlik sınırları ve güvenlik politikalarını tanımlar.

---

## 1. Güvenlik Tasarım İlkeleri

1. **En Az Ayrıcalık İlkesi (Principle of Least Privilege):** Canlı sistem ve kurulu sistem kullanıcılarına sınırsız `NOPASSWD: ALL` sudo yetkisi verilmez. `scripts/ankora-updater-sudoers` yalnızca dar kapsamlı güncelleme ve bakım komutlarına (`ayaz-update-helper --fetch-and-install https://github.com/Ankora-Linux/*`, `--check-and-apply`, `apt-update`, `apt-upgrade`, `mebcert`, `mebcert-remove`, `set-timezone *`, `set-keyboard *`, `set-language *`, `sync-ntp`, `drop-caches`, `suspend`, `ankora-doctor`, `ankora-ollama-install`, güç komutları) izin verir. Yerel `.deb` kurma/kaldırma (`install`, `remove`, `vendor`), USB yazdırma/biçimlendirme (`usb-flash`, `usb-format`) ve anlık görüntü (`snapshot-*`) işlemleri Polkit (`pkexec`) ile yönetici parolası gerektirir.
2. **Derinlemesine Savunma (Defense in Depth):** Tauri 2.0 capability izin modeli (`withGlobalTauri: false`), WebKitGTK sıkı CSP politikası (çıplak `https:` jokeri olmadan), çalışma anı `bwrap` WebKit sandbox denetimi, yol kanonikleştirme ve ikili/komut beyaz listeleri katmanlı olarak uygulanır.
3. **Doğrulanmış Dağıtım ve Güvenli Varsayılanlar:** Açılışta root hesabı kilitlidir. Güncelleyicinin kullanıcı dosya sahneleme modu (`--stage`) kalıcı olarak kapatılmıştır; güncellemeler yalnızca `--fetch-and-install` modunda doğrudan root izole dizininde (`0700`) indirilir, SHA-256 + GitHub Releases özet doğrulaması ve `gpgv` imza denetimi (`/etc/ankora/require-gpg-signature` varlığında zorunlu) ile kurulur.

---

## 2. Tehdit Modellemesi (STRIDE)

| Tehdit Kategorisi (STRIDE) | Risk Senaryosu | Uygulanan Güvenlik Kontrolleri |
|---|---|---|
| **S - Spoofing (Kimlik Sahteciliği)** | Yerel veya harici kaynakların sahte güncelleme ya da yetkisiz IPC çağrısı tetiklemesi | `withGlobalTauri: false`, `protocol_4_endpoint` için `https://api.github.com/repos/Ankora-Linux/` sınırlandırması, `--fetch-and-install` URL regex zorunluluğu ve `gpgv` imza doğrulaması. |
| **T - Tampering (Bütünlük İhlali)** | Paket, ISO, kilit dosyası veya anahtar kasasının değiştirilmesi | `SHA256SUMS` + `.sha256` + GPG `.asc` imzaları, `vendor_helium()` için sabitlenmiş GPG parmak izi (`BE677C1989D35EAB2C5F26C9351601AD01D6378E`), `devuan-keyring` GPG parmak izi denetimi, `/var/lib/ankora/` koruması ve PBKDF2-HMAC-SHA256 anahtar kasası. |
| **R - Repudiation (İnkar Edilebilirlik)** | Paket kurulumları ve sistem bakım işlemlerinin kayıtsız yürütülmesi | Yardımcı betikler (`ayaz-pkg-helper`, `ayaz-update-helper`) işlemleri sistem günlüklerine ve `/var/log` kayıtlarına işler; başarısız `.deb` yükseltmelerinde otomatik geri dönüş (`rollback`) uygulanır. |
| **I - Information Disclosure (Bilgi Sızması)** | Hassas sistem dosyalarının (`/etc/shadow`, SSH anahtarları, vault dosyaları) okunması | `SENSITIVE_FILE_PATTERNS` kara listesi, `ALLOWED_CAT_FILES` telemetri beyaz listesi, `validate_non_system_path` (`.vault_secret`, `vault.enc`, `/etc/ankora/update-endpoint` erişim engeli) ve daraltılmış CSP. |
| **D - Denial of Service (Hizmet Engelleme)** | PIN kaba kuvvet saldırısı, aşırı dosya okuma veya dahili diskin yanlışlıkla silinmesi | Kilit ekranında üstel bekleme cezası, dosya okuma ve yürütme çıktı sınırları, USB işlemlerinde `validate_usb_block_device` (`removable == 1` / `TRAN=usb`) zorunluluğu. |
| **E - Elevation of Privilege (Yetki Yükseltme)** | Sudoers, autostart/masaüstü girişleri veya çalıştırılabilir dosya yazımı ile root/kod çalıştırma | `--stage` kaldırması, wildcard sudoers temizliği, `write_text_file` betik/dotfile engeli, `set_file_permissions` çalıştırma biti engeli ve `execute_desktop_program` otomatik `chmod +x` kaldırması. |

---

## 3. Temel Güvenlik Mekanizmaları

### 3.1. WebKitGTK Sandbox ve Tauri 2.0 IPC
- `scripts/xinitrc`, `scripts/ayaz-session` ve `src-tauri/src/main.rs` açılışta `bwrap --ro-bind / / /bin/true` ile unprivileged user namespace desteğini sınar; desteklenen çekirdeklerde WebKitGTK sandbox etkin tutulur. Yalnızca container/kısıtlı VM ortamlarında `WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1` fallback'i uygulanır.
- `src-tauri/tauri.conf.json` ve `src/index.html` aynı sıkı CSP politikasını uygular: `script-src 'self' file:`, `object-src 'none'`; `img-src`, `connect-src` ve `frame-src` yönergelerinde çıplak `https:` jokeri yoktur.

### 3.2. Güvenli Terminal Motoru (Terminal Whitelist Engine)
- **Kesin İzin Listesi (`EXACT_ALLOWED_COMMANDS`):** Sistem telemetrisi (`uname -a`, `free -h`, `df -h`, `uptime`, `ls -la`) ve güvenli bakım eylemleri kabul edilir.
- **Parametreli İzin Listesi (`ALLOWED_UTILITIES`):** Yalnızca `ALLOWED_UTILITIES` içindeki komutlar, kabuk metakarakterleri içermemek ve `SENSITIVE_FILE_PATTERNS`'e dokunmamak koşuluyla çalıştırılır.
- **Yasaklı İkili Kara Listesi (`FORBIDDEN_LAUNCH_BINARIES`):** `sudo`, `su`, `pkexec`, `dd`, `bash`, `sh`, `passwd`, `chmod`, `curl`, `wget` gibi ikililer doğrudan çalıştırılamaz.

### 3.3. Kasa (Credential Vault) Kriptografisi
- **Rastgelelik:** Anahtar ve tuz (salt) üretiminde CSPRNG (`/dev/urandom`) kullanılır.
- **Anahtar Türetimi (KDF):** RFC 2898 / RFC 8018 uyumlu `pbkdf2_hmac_sha256` ile ana türetimde `60_000` tur, oturum anahtarı türetiminde `10_000` tur kullanılır.
- **Depo Koruması:** Kasa dosyaları (`.vault_secret`, `vault.enc`) kullanıcı dosya API'lerinden yalıtılmıştır.

### 3.4. Dosya Sistemi ve Yürütme Kısıtlamaları
- `validate_non_system_path`: `.vault_secret`, `vault.enc`, `/etc/ankora/update-endpoint`, `.config/autostart` ve `.local/share/applications` yollarını korur; kritik sistem dizinlerini ve `..` geçişlerini reddeder.
- `write_text_file`, `set_file_permissions` ve `set_file_executable`: `.sh`/`.py`/`.desktop`/dotfile yazımını ve dosya izinleriyle çalıştırma biti (`1/3/5/7`) eklenmesini engeller.
- `execute_desktop_program`: Dosyalara otomatik `chmod +x` vermez; yalnızca izinli `.desktop` kısayollarını ve gizli/`/tmp` dışı ELF `.AppImage` dosyalarını çalıştırır.

### 3.5. Çevre Birimi ve Paket Sağlayıcı Güvenliği
- `ayaz-pkg-helper.sh` içindeki `validate_usb_block_device`, `usb-flash` ve `usb-format` çağrılarında hedef diskin çıkarılabilir (`removable == 1`) veya USB taşıma (`TRAN == usb`) aygıtı olduğunu doğrular; dahili NVMe/SATA diskleri reddeder.
- `vendor_helium()`, Helium tarayıcı deposu GPG anahtarının beklenen `BE677C1989D35EAB2C5F26C9351601AD01D6378E` parmak izine sahip olduğunu doğrular.

---

## 4. Güvenlik Açığı Bildirimi (Vulnerability Disclosure)

Ankora Linux projesinde tespit ettiğiniz güvenlik açıklarını lütfen herkese açık bir sorun kaydı (issue) olarak açmak yerine:
- **E-posta:** `linuxankora@gmail.com` veya proje yöneticisine doğrudan iletiniz.
- Raporunuzda etkilenen bileşeni, yeniden üretim adımlarını (PoC) ve mümkünse önerilen yamayı belirtiniz.
- Güvenlik açıkları sorumlu bildirim (coordinated disclosure) ilkelerine uygun olarak incelenir ve 48 saat içinde yanıtlanır.

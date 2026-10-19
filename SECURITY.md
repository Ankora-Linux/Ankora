# Ankora Linux 3.3 & Ayaz DE — Güvenlik Mimarisi ve Tehdit Modeli (SECURITY.md)

Bu belge, **Ankora Linux 3.3 (Daedalus)** dağıtımı ve **Ayaz Desktop Environment (Ayaz DE)** için DevSecOps standartları, tehdit modeli (STRIDE), güvenlik sınırları ve güvenlik politikalarını tanımlar.

---

## 1. Güvenlik Tasarım İlkeleri

1. **En Az Ayrıcalık İlkesi (Principle of Least Privilege):** Canlı sistem (Live USB) ve kurulu sistem kullanıcılarına sınırsız `NOPASSWD: ALL` sudo yetkisi verilmez. Sistem yönetimi, yalnızca beyaz listedeki özel yetkili yardımcı betikler (`ayaz-pkg-helper`, `ayaz-update-helper`, `ankora-doctor`) ve yetkili sistem ikilileri üzerinden sınırlandırılmıştır.
2. **Derinlemesine Savunma (Defense in Depth):** WebKitGTK CSP, Tauri IPC token doğrulaması, Origin başlığı zorunluluğu, dosya yolu kanonikleştirme (canonicalization) ve ikili/komut beyaz listeleri katmanlı olarak uygulanır.
3. **Güvenli Varsayılanlar (Secure Defaults):** Sistem açılışında root hesabı kilitlidir. IPC portu yalnızca yerel loopback (`127.0.0.1:49152`) üzerinden dinler ve her oturum için CSPRNG ile 256-bit oturum belirteci (`X-Ayaz-Token`) üretilir.

---

## 2. Tehdit Modellemesi (STRIDE)

| Tehdit Kategorisi (STRIDE) | Risk Senaryosu | Uygulanan Güvenlik Kontrolleri |
|---|---|---|
| **S - Spoofing (Kimlik Sahteciliği)** | Web arayüzünün veya harici araçların IPC köprüsüne taklit istek atması | Sabit `Origin` zorunluluğu (`http://127.0.0.1:49152`), `X-Ayaz-Token` 256-bit CSPRNG doğrulaması ve sabit-zamanlı karşılaştırma (`constant_time_eq` / `hmac.compare_digest`). |
| **T - Tampering (Bütünlük İhlali)** | Kilit ekranı dosyasının silinmesi veya şifreli kimlik deposunun manipüle edilmesi | `lock.hash` dosyası `/var/lib/ankora/` altına taşınmış ve `delete_file` kapsamından çıkarılmıştır. Vault deposu HMAC-SHA256 Encrypt-then-MAC ile imzalanır. |
| **R - Repudiation (İnkar Edilebilirlik)** | Paket kurulumları ve sistem bakım işlemlerinin kayıtsız yürütülmesi | Yardımcı betikler (`ayaz-pkg-helper`, `ayaz-update-helper`) tüm işlemleri sistem günlüklerine (`syslog` / `/var/log`) kaydeder. |
| **I - Information Disclosure (Bilgi Sızması)** | `/etc/shadow`, SSH anahtarları veya kilit özetlerinin dosya okuma API'si ile sızdırılması | `SENSITIVE_FILE_PATTERNS` kara listesi ve `ALLOWED_CAT_FILES` telemetri beyaz listesi; mutlak yollarda kullanıcı `$HOME` dışı okumalar engellenir. |
| **D - Denial of Service (Hizmet Engelleme)** | PIN kaba kuvvet (brute-force) saldırısı veya bellek tüketimi | Üstel bekleme cezası (exponential backoff, 300 saniyeye kadar), 50 MB dosya okuma sınırı ve 1 MB IPC gövde sınırı. |
| **E - Elevation of Privilege (Yetki Yükseltme)** | Web arayüzünden veya terminalden sınırsız root kabuğu açılması | `EXACT_ALLOWED_COMMANDS` ve `ALLOWED_UTILITIES` beyaz listesi uygulanmıştır. `FORBIDDEN_LAUNCH_BINARIES` ve kabuk zincirleme metakarakterleri (`;`, `&`, `|`, `` ` ``, `$`) engellenir. |

---

## 3. Temel Güvenlik Mekanizmaları

### 3.1. Güvenli Terminal Motoru (Terminal Whitelist Engine)
Tauri ve kiosk arka uçlarında `run_terminal_command` çağrısı doğrudan keyfi komut çalıştırmaz.
- **Kesin İzin Listesi (`EXACT_ALLOWED_COMMANDS`):** Sistem telemetrisi (`uname -a`, `free -h`, `df -h`, `uptime`, `ls -la`) ve güvenli bakım eylemleri doğrudan kabul edilir.
- **Parametreli İzin Listesi (`ALLOWED_UTILITIES`):** Yalnızca `ALLOWED_UTILITIES` içindeki komutlar, tehlikeli metakarakterler içermemek ve `SENSITIVE_FILE_PATTERNS`'e dokunmamak koşuluyla çalıştırılabilir.
- **Yasaklı İkili Kara Listesi (`FORBIDDEN_LAUNCH_BINARIES`):** `sudo`, `su`, `pkexec`, `dd`, `bash`, `sh`, `passwd`, `chmod`, `curl`, `wget` vb. doğrudan çalıştırılamaz.

### 3.2. Kasa (Credential Vault) Kriptografisi
- **Rastgelelik:** Anahtar ve tuz (salt) üretiminde `/dev/urandom` (CSPRNG) kullanılır.
- **Anahtar Türetimi (KDF):** RFC 2898 / RFC 8018 uyumlu **PBKDF2-HMAC-SHA256** algoritması ile 60.000 tur türetim yapılır.
- **Şifreleme & Doğrulama:** Oturum anahtarları PBKDF2 (10.000 tur) ile türetilir; şifreli metin HMAC-SHA256 ile imzalanarak Encrypt-then-MAC modeliyle korunur.

### 3.3. Dosya Sistemi İzin Listesi (Path Traversal Koruması)
- `delete_file` ve dosya yönetimi eylemleri `fs::canonicalize` / `os.path.realpath` ile çözümlenir.
- Yalnızca `$HOME/*`, `/tmp/`, `/media/`, `/mnt/` yolları üzerindeki işlemlere izin verilir.
- `/`, `/home`, `/etc`, `/var`, `/usr` gibi kritik sistem yolları ve sembolik bağlantı tuzakları engellenir.

---

## 4. Güvenlik Açığı Bildirimi (Vulnerability Disclosure)

Ankora Linux projesinde tespit ettiğiniz güvenlik açıklarını lütfen herkese açık bir sorun kaydı (issue) olarak açmak yerine:
- **E-posta:** `linuxankora@gmail.com` veya proje yöneticisine doğrudan iletiniz.
- Raporunuzda etkilenen bileşeni, yeniden üretim adımlarını (PoC) ve mümkünse önerilen yamayı belirtiniz.
- Güvenlik açıkları sorumlu bildirim (coordinated disclosure) ilkelerine uygun olarak incelenir ve 48 saat içinde yanıtlanır.

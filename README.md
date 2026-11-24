<div align="center">
  <img src="assets/logo.png" alt="Ayaz DE Logo" width="200" style="border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.8);">
  <br><br>
  <h1>Ankora Linux 5.0</h1>
  <p><b>Resmî ana depo · 5.0.0 · Ayaz Desktop Environment (Ayaz DE)</b></p>

  <p>
    <img src="https://img.shields.io/badge/S%C3%9CR%C3%9CM-5.0.0-ffffff?style=for-the-badge&labelColor=111111" alt="Sürüm">
    <img src="https://img.shields.io/badge/HEDEF-ANKORA_LINUX-2563eb?style=for-the-badge&labelColor=111111" alt="Dağıtım">
  </p>
  <p>
    <a href="https://github.com/Ankora-Linux/Ankora/actions/workflows/ci.yml"><img src="https://github.com/Ankora-Linux/Ankora/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="https://github.com/Ankora-Linux/Ankora/actions/workflows/build-iso.yml"><img src="https://github.com/Ankora-Linux/Ankora/actions/workflows/build-iso.yml/badge.svg" alt="ISO Derleme"></a>
    <img src="https://img.shields.io/badge/%C3%87EK%C4%B0RDEK-TAURI_%2B_RUST-059669?style=flat-square&labelColor=111111" alt="Çekirdek">
    <img src="https://img.shields.io/badge/L%C4%B0SANS-GPL--3.0-41a013?style=flat-square&labelColor=111111" alt="Lisans">
  </p>

  <p><a href="https://ankora-linux.github.io/">Web sitesi</a> ·
     <a href="https://github.com/Ankora-Linux/Ankora/releases">Sürümler</a> ·
     <a href="CHANGELOG.md">Sürüm notları</a> ·
     <a href="HARDWARE.md">Donanım uyumu</a> ·
     <a href="https://www.instagram.com/ankoralinux/">Instagram</a> ·
     <a href="https://x.com/ankoralinux">X</a> ·
     <a href="https://www.youtube.com/@AnkoraLinux">YouTube</a></p>
</div>

## Ana depo

Bu depo, Ankora Linux projesinin resmî ana deposudur. Canlı ISO üretimi,
sistem paketleme, Ayaz DE geliştirme akışı ve dağıtım altyapısı burada
yönetilir.

Depoda yer alan temel bileşenler:

- **Ayaz Desktop Environment (Ayaz DE)**: Rust + WebKitGTK 4.1 (Tauri 2.0)
  üzerine kurulu, SysVinit tabanlı masaüstü ortamı
- **Ankora Yapay Zekâ Asistanı**: yerel Ollama ve bulut sağlayıcılarla
  çalışan, beyaz liste denetimli sistem ajanı
- **Yazılım Mağazası ve İç Güncelleme Kanalı**: Flathub/APT kaynakları
  birleştiren 378 paketlik mağaza ve yayımlanan `.deb` paketi üzerinden sürüm içi yükseltme
- **Devuan 6 Excalibur tabanlı sistem yapılandırmaları**: debootstrap düşük
  seviye hattı, GRUB/plymouth temaları, MEB okul sertifikasyon araçları,
  CUPS/SANE yazıcı ve tarayıcı altyapısı
- **ISO üretim betikleri ve doğrulama araçları**

Ayaz DE yalnız **Ankora Linux** ile dağıtılır. Tek kaynaklı ikili dosya
`/usr/bin/ayaz-de` (`/usr/bin/ayaz` bunun sembolik bağıdır) hem canlı ISO
içine yerleştirilir hem de yardımcı betikler ve sudoers tanımıyla birlikte
`ayaz-de-latest-amd64.deb` paketine derlenip GitHub Releases sayfasına yüklenir.
Kurulu `4.7.x` sistemler **Ayaz Güncelleyici** üzerinden sürüm içi güncelleme
alır; `4.6.x` (Daedalus) tabanından `4.7.0` (Excalibur) sürümüne geçiş için
temiz ISO kurulumu gerekir.

## Ayaz DE nedir?

Ayaz DE, Ankora Linux için geliştirilmiş hafif ve kiosk odaklı bir masaüstü
ortamıdır. GNOME ve KDE'nin aksine arayüz tamamen Rust + WebKitGTK 4.1
(Tauri 2.0) üzerine kurulur; pencere yönetimi, panel, başlat menüsü,
dosya yöneticisi, yazılım merkezi ve ayarlar tek bir yerel webview
kabuğunda yaşar. Sistem, kalıcı DOM ağacı yerine tembel görünüm devri
kullanır: kapatılan pencere 30 saniye sonra DOM'dan çıkarılır ve
kaynakları boşalır; yeniden açılışta geri takılır.

Boyut ve tepki hedefleri:

- Canlı sistem boştayken yaklaşık **750 MB RAM** (panel, pencereler ve
  sistem hizmetleri dahil).
- **4 GB altı** bellekte **Eco RAM+ (ZRAM)** kipi açılışta otomatik devreye
  girer; `zstd`/`lz4` sıkıştırmalı bellek takas alanı (RAM'in %50'si) ile sistem hafifletilir.
- Sistem dili tamamen Türkçedir; klavye düzeninde Türkçe, İngilizce,
  Almanca, Fransızca ve İngiliz (GB) seçenekleri sunulur.

## Özellikler

### Masaüstü

* **24 tam sistem teması ve 4 masaüstü yüzü (Klasik, Bakır, Bostan, Cıvata)**:
  Nordik Açık, Modern Grafit, Derin Gece, Kuzey Fjordu, Çam Ormanı,
  Kor Ateşi (Ember), Arktik Serinlik, Çınar, Meltem, Kor, Dem, Boğaz,
  Ayna, Cumhuriyet ve 10 editoryal tema (Matbaa, Bakır, Bostan, Hat,
  Konsol, Kesit, Fener, Cıvata, Mina, Meridyen). Ayrıca 4 farklı kabuk
  mimarisi (Klasik alt görev çubuğu, Yüz 2 Bakır zanaatkar dock, Yüz 3
  Bostan organik kapsül dock, Yüz 8 Cıvata endüstriyel üst bar + teknik
  dock) arasında anında geçiş yapılabilir; açık iç ve harici X11
  uygulamaları (Brave, VLC, LibreOffice vb.) tüm yüzlerin dock ve
  panellerinde listelenir.
* **19 arka plan**: Kobalt Dalgalar, Kozmik Küreler, Karlı Şafak ve
  Gece Zirve Yolu fotoğraf duvar kağıtları 24 sistem temasına varsayılan
  olarak eşlenmiştir; matrix, aurora, obsidian, topo, zenith, nordik ve
  Cumhuriyet dahil önceki 15 vektörel duvar kağıdı da Ayarlar içinden
  seçilebilir. Duvar kağıdı değiştirme Klasik, Bakır, Bostan ve Cıvata
  yüzlerinin tümünde çalışır.
* **Dinamik Ada (Dynamic Island)**: ekranın üstünde cam kapsül: MPRIS medya
  oynatıcı kontrolleri, bildirim tostları, indirme ilerlemesi, AI işlem mikro
  etkileşimi ve canlı CPU/RAM telemetrisi. Beş ayrı yoldan açılabilir/kapatılabilir:
  Ayarlar anahtarı, Hızlı Ayarlar karo, masaüstü sağ tık menüsü, kapsül
  sağ tık menüsü ("Gizle") ve kapsül içi düğme; her yol kalıcı yazılır.
* **Görev çubuğu ve başlat menüsü**: ortalanmış düzen; Sabitleme: Başlat
  menüsüne, Araç Çubuğuna, Masaüstüne.
* **Masaüstü kategori klasörleri**: 2x2 mini önizleme karoları, sürükle
  gruplama, sağ tık menüleri (aç/yeniden adlandır/sil/çıkar).
* **Dosya yöneticisi**: kes/kopyala/yapıştır ilerleme çubukları,
  özellikler/izinler penceresi, çoklu seçim, çıkarılabilir diskler,
  "Şuraya Kopyala"/yazdırma ve `.deb`/`.AppImage` grafik paket kurucu.
* **Canlı hava durumu widget'ı**: Open-Meteo (API anahtar gerektirmez),
  3 günlük şerit, şehir arama, anlık yenileme, 15 dakikalık önbellek.
* **Fatih Kalem 2 ve ETA dokunmatik tahta desteği**: FAZ 1/2/3 etkileşimli
  tahtalar için `eta-touchdrv` sürücü ve kalibrasyon aracı; Ada kontrol
  kartından, Mağazadan ve Başlat menüsünden başlatılır.
* **MEB Okul Sertifikası**: Mağaza'daki `meb-cert` eylemiyle kurulur;
  `mebcert-remove` kök sertifikayı sistem ve tarayıcı NSS
  depolarından (`~/.pki/nssdb`) eksiksiz kaldırır; profil klasörlerine
  sahte veri yazılmaz.

### Yazılım Mağazası ve Güncelleme

* **378 doğrulanmış paket**: okul/eğitim, bilim, geliştirme, medya, grafik,
  ağ, ofis ve sistem kategorilerinde; kaynak rozetleri (Flathub / Devuan APT /
  Sistem deposu), uygulama detay görünümü, mimari uyum tespiti.
* **Ayaz Güncelleyici**: GitHub Releases tabanlı: sürümü kontrol et,
  indir ve kur; `ayaz-update-helper --fetch-and-install` paketi doğrudan
  root izole dizininde indirir, SHA-256 ve isteğe bağlı `gpgv` imzasını
  doğrular, hata halinde önceki sürüme otomatik geri döner (rollback).
  Kurulu sistemin Ankora olduğu doğrulanmadan ağ sorgusu yapılmaz; `4.6.x`
  (Daedalus) tabanından `4.7.0` (Excalibur) sürümüne geçiş temiz ISO
  kurulumu gerektirir.

### Yapay Zekâ Ajanı

* **Sağlayıcılar:** Ollama (localhost, tek tıkla yerel model indirme),
  Google Gemini, Groq, OpenAI ve OpenRouter; seçim panelden yapılır.
* **Görüntü anlama ("Ekranı İzle", "Bak ve Anlat")**: Gemini, OpenAI ve
  OpenRouter görüntü girdisi kabul eder; Ollama ve Groq metin notu verir.
* **Beyaz liste denetimli eylemler**: 31 izinli komut (`apt-get clean`,
  `df -h` gibi) ve 15 ajan eylemi; her yürütme tek vuruşluk jeton ister,
  jeton başka eylemde yeniden kullanılamaz.
* **Kasa:** AI sağlayıcı anahtarları Rust tarafındaki şifreli kasada
  tutulur (`get_ai_credential`), düz localStorage'a yazılmaz.
* **Mini sohbet balonu ve Sistem Doktoru**: görev çubuğu ve yüzlerde sağ
  üst balon; dosya bırakma (özetle/kod analiz), Günün Planı widget'ı ve
  `ankora-doctor` ile tek tıkla sistem teşhis/onarım eylemi.

### Güvenlik

* **Kilit ekranı sertleştirmesi**: girişim sınırlayıcı, 30 saniyelik tek
  vuruşluk kilit açma yetkisi; `ankora_lock_on_startup` ile açılışta
  otomatik kilit.
* **Pano koruması**: kilitliyken pano sızıntısı engellenir.
* **Tauri 2.0 IPC ve sıkı CSP**: `withGlobalTauri: false`; `tauri.conf.json`
  ve `index.html` aynı CSP dizesini paylaşır (`script-src 'self' file:`,
  `object-src 'none'`; `img-src`, `connect-src`, `frame-src` beyaz listeli
  olup çıplak `https:` jokeri içermez).
* **Çalışma anı WebKitGTK sandbox denetimi**: `xinitrc`, `ayaz-session` ve
  `ayaz-de` açılışta `bubblewrap` (`bwrap --ro-bind / / /bin/true`) testini
  çalıştırır; unprivileged user namespace destekleyen çekirdeklerde WebKit
  sandbox açık tutulur, yalnızca desteklenmeyen kısıtlı ortamlarda devreden
  çıkarılır.
* **En az ayrıcalık & komut beyaz listesi**: 31 izinli komut; `sudo`, `su`,
  `pkexec`, `dd` gibi ikililerin yetkisiz çalıştırılmasına kapalıdır. Paket
  kurma/kaldırma, USB yazma/biçimlendirme ve anlık görüntü işlemleri için
  `pkexec` ile yönetici onayı istenir; USB yardımcıları yalnızca
  çıkarılabilir/USB taşıma aygıtlarına yazar (`validate_usb_block_device`).
* **Saldırı yüzeyi azaltma**: `ayaz-update-helper --stage` kalıcı olarak
  kapalıdır; `validate_non_system_path` (`.vault_secret`, `vault.enc`,
  `update-endpoint`, autostart/desktop yazım engeli), `set_file_permissions`
  (çalıştırma biti engeli), `execute_desktop_program` (otomatik `chmod +x`
  yok), MEB sertifikasında `CA:TRUE` denetimi, Helium için sabitlenmiş GPG
  parmak izi ve PBKDF2-HMAC-SHA256 anahtar kasası uygulanır.
* **Bağımlılık sağlığı ve imza bütünlüğü**: `reqwest` 0.12 (h2 >= 0.4.20,
  RUSTSEC-2026-0258 kapalı); CI hattında `cargo audit` çalıştırılır ve
  sürüm varlıkları `SHA256SUMS` + isteğe bağlı GPG `.asc` imzalarıyla yayınlanır.
* **Güvenlik geçmişi**: ayrıntılar `CHANGELOG.md` ve `SECURITY.md` dosyalarındadır.

### Sistem

* **Devuan 6.0 Excalibur** (SysVinit, Linux 6.12 LTS çekirdek hattı):
  systemd yok; X11 `nodm` ve Openbox oturum yönetimi, `https://pkgmaster.devuan.org/merged`
  depoları ve GPG parmak izi doğrulamalı `devuan-keyring`.
* **Hibrit canlı ISO**: aynı dosya hem BIOS (isohdpfx MBR) hem UEFI
  (GPT bas-dat) firmware'den başlatılabilir; derleme sonunda sistem
  alanı bayt düzeyinden doğrulanır ve CI'da QEMU BIOS/UEFI önyükleme duman
  testinden geçirilir.
* **GPU firmware ve çevre birimi desteği**: AMD/Radeon (`firmware-amd-graphics`,
  `/lib/firmware/radeon` ve `/lib/firmware/amdgpu`), Intel ve Wi-Fi firmware
  paketleri yerleşiktir. Yazıcılar için **CUPS** (`cups`, `printer-driver-gutenprint`,
  `system-config-printer`) ve tarayıcılar için **SANE** (`sane-utils`, `simple-scan`)
  ISO üretim hattında öntanımlı kurulur (ayrıntılar için bkz. [HARDWARE.md](HARDWARE.md)).
* **USB başlatma güvencesi**: hibrit derleme adımının sessiz CD-only
  fallback'i kaldırıldı; isohdpfx MBR veya efi.img eksikse derleme açık
  hatayla durur.

## İndir

En son sürüm [GitHub Releases sayfasında](https://github.com/Ankora-Linux/Ankora/releases/latest) yayımlanır:

| Asset | Amaç |
|---|---|
| `ankora-linux-<sürüm>-ayaz-amd64.iso` | Canlı ISO: USB'ye yazdırıp başlatılır |
| `ankora-linux-<sürüm>-ayaz-amd64.iso.sha256` | ISO SHA-256 bütünlük özeti |
| `ayaz-de-latest-amd64.deb` | 4.7.x serisi içi masaüstü ve yardımcı güncelleme paketi |
| `ayaz-de-latest-amd64.deb.sha256` | `.deb` SHA-256 bütünlük özeti |
| `SHA256SUMS` (+ isteğe bağlı `.asc` imzalar) | Birleşik sağlama toplamı ve GPG imza dosyaları |

Bütünlük ve (anahtar yayınlandığında) GPG imza doğrulaması:

```bash
sha256sum -c SHA256SUMS
# İsteğe bağlı GPG imza doğrulaması (imza dosyaları mevcutsa):
gpg --verify SHA256SUMS.asc SHA256SUMS
```

Not: `4.6.x` (Devuan 5 Daedalus / Tauri 1.5) kurulu sistemlerden `4.7.0`
(Devuan 6 Excalibur / Tauri 2.0) sürümüne yerinde `.deb` yükseltmesi
yapılmaz; lütfen canlı ISO ile temiz kurulum yapın.

## USB'ye yazdırma ve başlatma

ISO hibritleştirilmiştir: aynı imaj BIOS ve UEFI firmware'den başlatılabilir.
Yazdırmadan önce doğru disk harfini belirleyin (`lsblk -d -o NAME,SIZE,MODEL`)
ve yazdırma hedefinin başında bölüm numarası **olmayan** cihaz
(`/dev/sdX`, `/dev/sdb` gibi) kullandığınızdan emin olun:

```bash
# Uyarı: /dev/sdX yerine kendi cihazınızı yazın. Yanlış hedef diskteki
# tüm verileri siler.
sudo dd if=ankora-linux-4.7.0-ayaz-amd64.iso of=/dev/sdX bs=4M oflag=direct status=progress
sync
```

`dd` yerine Balena Etcher veya Rufus (ikisinde de **DD modunu** seçin)
görsel yazıcılar da kullanılabilir. ISO'yu dosya olarak kopyalamak değil,
**imaj yazdırma** şarttır; aksi takdirde önyükleme yapmaz.

Belleği cihaza taktıktan sonra bilgisayarın BIOS/UEFI önyükleme menüsünden
belleği seçin. Canlı sistemi başlatmak diskteki verilere dokunmaz;
kurulum istediğinizde masaüstündeki "Sistemi Kur" simgesi Ayaz Kurulum
Sihirbazı'nı açar ve adım adım yol gösterir.

## Sanal makinede çalıştırma

Canlı ISO, VirtualBox ve QEMU altında açılır. VirtualBox için önerilen
ayarlar:

| Ayar | Değer |
|---|---|
| Grafik denetleyicisi | VBoxSVGA veya VMSVGA (64 MB+ VRAM ile) |
| Video belleği | 64 MB veya üzeri |
| 3D hızlandırma | Kapalı |
| Bellek | 2048 MB veya üzeri |
| Önyükleme sırası | DVD/ISO ilk sırada; disket yok |

VMSVGA + 16 MB video belleği birleşiminde sanal GPU sürücüsü
kilitlenebiliyor. Belirtisi, Plymouth'tan sonra düz siyah ekran ve
Ctrl+Alt+F2'nin yanıt vermemesidir. Bu durumda makineyi kapatıp video
belleğini yükseltin ya da GRUB menüsünden **Güvenli Mod (Failsafe)**
(`nomodeset`) ile açın. Masaüstü başlatılamazsa hata,
`/tmp/ayaz.log` günlüğüyle birlikte bir terminal penceresinde gösterilir.

## Sürüm dağıtımı ve güncellenme akışı

```text
git tag v4.7.0
git push origin v4.7.0
```

`build-iso.yml` iş akışı tetiklenir ve sırasıyla:

1. Sürüm damgalarını doğrular (`tauri.conf.json` = `VERSION` = `Cargo.toml`
   = `Cargo.lock` = `package.json`).
2. Güvenlik ve bütünlük denetimini çalıştırır (`verify_all.py` + `verify_plymouth.py`).
3. Ayaz DE iç paketini derler (ISO içi enjeksiyon).
4. `build-iso.sh` ile hibrit canlı ISO'yu üretir (8 aşama) ve sonunda
   sistem alanını doğrular:
   - MBR 1. bölüm girişi önyüklenebilir (`0x80`, offset 446),
   - MBR 2. bölüm girişi EFI tipinde (`0xef`, offset 466),
   - LBA 1'de GPT imzası (`EFI PART`),
   - isohdpfx bootloader kodu ISO'nun ilk 432 baytında birebir.
5. ISO ve `.deb` için `.sha256`, birleşik `SHA256SUMS` ve (tanımlıysa GPG
   `.asc`) imza dosyalarını oluşturur, ISO'yu QEMU BIOS/UEFI önyükleme
   duman testinden geçirir ve GitHub Releases'a yükler. `releases/latest`
   güncellenir; kurulu `4.7.x` sistemlerindeki Ayaz Güncelleyici bu sürümü görür.

Kurulu `4.7.x` sistemler için uygun **sürüm içi yükseltme yolu**:
masaüstündeki Ayaz Güncelleyici -> Kontrol Et -> İndir -> Kur; `ayaz-update-helper --fetch-and-install`
paketi root yetkisiyle doğrudan GitHub Releases'tan çeker, SHA-256 ve
(etkinse `gpgv`) imzasını doğrulayıp kurar. `4.6.x` (Daedalus) -> `4.7.0`
(Excalibur) geçişi için temiz ISO kurulumu gerekir.

## Dizin yapısı

```text
Ankora/
├── .github/workflows/
│   ├── build-iso.yml            # Canlı ISO + DEB + QEMU test + imza iş akışı
│   └── ci.yml                   # Kalite denetimi (cargo check/clippy/audit, 5 dosya sürüm uyumu, sözleşme testleri)
├── assets/                      # Logo, duvar kağıdı önizlemeleri, masaüstü ekran görseli
├── scripts/
│   ├── ankora-doctor.sh         # Sistem doktoru ve hızlı onarım aracı
│   ├── ankora-grub-default      # Kurulum aracının /etc/default/grub yazımı
│   ├── ankora-updater-sudoers   # Dar kapsamlı sudoers güncelleme/bakım izinleri
│   ├── ayaz-ctl                 # Masaüstü ve X11 uyumluluk köprüsü
│   ├── ayaz-pkg-helper.sh       # Root yetkisiyle paket ve çıkarılabilir USB yardımcısı
│   ├── ayaz-session             # Ayaz DE oturum başlatıcı (openbox + ayaz-de)
│   ├── ayaz-session.desktop     # X11 oturum kaydı
│   ├── ayaz-update-helper.sh    # Doğrulanmış --fetch-and-install .deb güncelleyici + rollback
│   ├── ayaz.desktop             # Uygulama kısayolu (/usr/bin/ayaz-de)
│   ├── build-iso.sh             # Hibrit canlı ISO derleme betiği (8 aşama + doğrulama)
│   ├── build-on-windows.ps1     # Windows'tan ISO derleme yardımcısı
│   ├── eta-touchdrv             # Faz/eGalax dokunmatik tahta sürücü yardımcısı
│   ├── grub-theme-ankora/       # GRUB teması
│   ├── openbox-rc.xml           # X window yöneticisi yapılandırması
│   ├── package-deb.sh           # Tam Ayaz DE .deb paketleme (ikili + betikler + SHA256SUMS/.asc)
│   ├── plymouth-theme-ankora/   # Açılış splash teması
│   └── xinitrc                  # X oturum başlangıç betiği (/usr/bin/ayaz-de + bwrap denemesi)
├── src/                         # Arayüz
│   ├── app.js                   # Pencere yöneticisi, 378 paketlik mağaza, AI ajanı, Ada
│   ├── faces.js                 # 4 arayüz yüzü (Klasik, Bakır, Bostan, Cıvata) ve dock senkronu
│   ├── faces.css                # Yüzlere özel tasarım kuralları ve açık yüzey kontrastı
│   ├── index.html               # Masaüstü, pencereler, başlat menüsü, mağaza
│   ├── style.css                # Tasarım sistemi ve 24 tema
│   └── wallpaper-*.{svg,jpg}    # 15 vektörel SVG ve 4 varsayılan fotoğraf duvar kağıdı
├── src-tauri/                   # Rust arka ucu (Tauri 2.0)
│   ├── Cargo.toml
│   ├── tauri.conf.json          # Kiosk pencere kuralları, CSP, sürüm damgası
│   └── src/main.rs              # Sistem telemetrisi, IPC, güncelleyici ve güvenlik kalkanı
├── my-linux-orchestrator/       # Yapılandırma orkestratörü ve beceri tanımları
├── scratch/
│   ├── test_bridge_logic.py     # Tek kaynak arka uç, sudoers ve güvenlik sözleşme testleri
│   ├── test_store_data.js       # Mağaza veri doğrulama testi (378 paket)
│   ├── test_ui_comprehensive.py # Headless tarayıcıda 24 tema, 4 yüz, dock ve mağaza testi
│   └── verify_all.py            # ISO/GRUB/plymouth/kurulum betik yapısı denetimi
├── third_party/                 # Devuan keyring, Fatih Kalem 2, üçüncü parti paketler
├── AGENTS.md                    # Depo geliştirici kuralları ve oturum hafızası
├── CHANGELOG.md                 # Sürüm notları
├── HARDWARE.md                  # Desteklenen donanım ve akıllı tahta uyumluluk tablosu
├── LICENSE                      # GPL-3.0
├── SECURITY.md                  # Güvenlik mimarisi ve tehdit modeli
├── package.json
└── README.md
```

## Geliştirme ve derleme

### Gereksinimler

* Rust:
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```
* Node.js v18, v20 veya v22
* Debian/Devuan kütüphaneleri:
  ```bash
  sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev bubblewrap xdg-dbus-proxy
  ```

### Geliştirme modunda çalıştırma

```bash
cargo install tauri-cli --version "^2"
cargo tauri dev
```

Yapı değişimlerinde hızlı sözdizimi ve sözleşme kapısı:

```bash
node --check src/app.js
node --check src/faces.js
for f in scripts/*.sh scripts/ayaz-session scripts/xinitrc scripts/ayaz-ctl scripts/eta-touchdrv; do bash -n "$f"; done
python3 scratch/verify_all.py       # ISO/GRUB/plymouth/kurulum betik denetimi
python3 scratch/test_bridge_logic.py # Tek kaynak Tauri 2 ve güvenlik sözleşme testleri
node scratch/test_store_data.js     # Mağaza veri doğrulaması (378 paket)
```

### Üretim derlemesi (Canlı ISO)

```bash
sudo bash scripts/build-iso.sh
```

Betiğin işleyişi: apt düşük seviye araçlarını (debootstrap, xorriso,
mtools, grub-*) kendisi kurar ve doğrular; 8 aşamalı hat
aşağıdaki kapılara sahiptir: MBR bootloader kodu, UEFI efi.img ve GPT
yapısından biri üretilmezse derleme açık hatayla durur:

1. Host paketleri ve Devuan anahtarlık GPG parmak izi denetimi
2. debootstrap ile Devuan 6.0 Excalibur taban sistemi (`https://pkgmaster.devuan.org/merged`)
3. Ayaz DE Tauri 2.0 ikilisi (`/usr/bin/ayaz-de` + `/usr/bin/ayaz` sembolik bağı) kurulumu
4. GRUB BIOS/UEFI önyükleyicileri (grub-mkimage + grub-mkstandalone)
5. mksquashfs canlı dosya sistemi
6. EFI ve BIOS hibrit önyükleyici hazırlığı (isohdpfx MBR + efi.img)
7. Xorriso hibrit ISO üretimi (isohybrid + gpt-basdat)
8. Sistem alanı bayt doğrulaması + SHA256 özeti

ISO çıktısı `dist/ankora-linux-<sürüm>-ayaz-amd64.iso` dosyasıdır.
`ayaz-de-latest-amd64.deb` üretimi `scripts/package-deb.sh` tarafından
yapılır ve `build-iso` iş akışı her sürümle beraber `.sha256`, `SHA256SUMS`
ve (tanımlıysa) GPG `.asc` imzalarıyla birlikte Releases sayfasına yükler.

### Ayaz DE .deb paketi

```bash
sudo bash scripts/package-deb.sh
```

Derleme ortamından `/usr/bin/ayaz-de` ikilisini, `/usr/bin/ayaz` sembolik
bağını, oturum/sürücü betiklerini ve güncelleyici sudoers yapılandırmasını
paketler; `dist/ayaz-de-latest-amd64.deb`, `.sha256`, `SHA256SUMS` ve
(anahtar verilmişse) `.asc` imzalarını yazar. Bu asset `4.7.x` kurulu
sistemlerde Ayaz Güncelleyici için sürüm içi güncelleme kanalıdır.

### ISO derlemesini CI'dan tetikleme

Depoda yeni bir **etiket push edildiğinde** `build-iso.yml` otomatik
tetiklenir ve derlemeyi etiketin işaret ettiği commit'ten yapar. Sürüm
damgaları (`tauri.conf.json` = `VERSION` = `Cargo.toml` = `Cargo.lock` = `package.json`)
uyuşmazsa iş başlangıçta durur.

Sürüm damgası her sürümde beş dosyada da güncellenmelidir:
`src-tauri/tauri.conf.json` (tek kaynak), `VERSION`, `src-tauri/Cargo.toml`,
`src-tauri/Cargo.lock`, `package.json`. CI bu beşi karşılaştırır ve uyuşmazlıkta işi durdurur.

## Test ve doğrulama

`scratch/verify_all.py`, ISO üretim hattının kritik kapılarını süzer:
grub.cfg sözdizimi ve tema yapısı, plymouth sprite API kuralları, kurulum
betikleri, dokunmatik tahta sürücü kancaları, CUPS/SANE yazıcı-tarayıcı
paketleri, GRUB tema kalabalığı ve font kapıları, ISO hibrit satırları.

`node scratch/test_store_data.js` mağaza veri bütünlüğünü doğrular:
378 benzersiz kayıt, zorunlu alanlar (isim, kategori, kaynak, kurulum yolu,
boyut), kategori geçerliliği ve öne çıkan eşleşmeleri.

## Web sitesi ve topluluk

- Site: [https://ankora-linux.github.io/](https://ankora-linux.github.io/)
  (indirme, kurulum, güvenlik ve SSS sayfaları; site deposu açık kodlu).
- Hata bildirimi: depo GitHub **Issues** sekmesi.
- Güvenlik açığı bildirimi: `linuxankora@gmail.com` adresine e-posta
  gönderin; duyarlı bildirimleri genel Issues'ta açmayın.
- Sosyal medya: [Instagram](https://www.instagram.com/ankoralinux/) ·
  [X](https://x.com/ankoralinux) ·
  [YouTube](https://www.youtube.com/@AnkoraLinux).

## Lisans

Bu proje GNU General Public License v3.0 ile lisanslıdır; tam metin
`LICENSE` dosyasındadır.

Ankora Linux projesinin ana deposu olarak bu repo, proje için merkezî
geliştirme ve dağıtım noktasıdır.

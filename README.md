<div align="center">
  <img src="assets/logo.png" alt="Ayaz DE Logo" width="200" style="border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.8);">
  <br><br>
  <h1>Ankora Linux</h1>
  <p><b>Resmî ana depo · Ayaz Desktop Environment (Ayaz DE)</b></p>

  <p>
    <img src="https://img.shields.io/badge/S%C3%9CR%C3%9CM-4.0.0-ffffff?style=for-the-badge&labelColor=111111" alt="Sürüm">
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
     <a href="https://www.instagram.com/ankoralinux/">Instagram</a> ·
     <a href="https://x.com/ankoralinux">X</a> ·
     <a href="https://www.youtube.com/@AnkoraLinux">YouTube</a></p>
</div>

## Ana depo

Bu depo, Ankora Linux projesinin resmî ana deposudur. Canlı ISO üretimi,
sistem paketleme, Ayaz DE geliştirme akışı ve dağıtım altyapısı burada
yönetilir.

Depoda yer alan temel bileşenler:

- **Ayaz Desktop Environment (Ayaz DE)** — Rust + WebKitGTK (Tauri 1.5)
  üzerine kurulu, SysVinit tabanlı masaüstü ortamı
- **Ankora Yapay Zekâ Asistanı** — yerel Ollama ve bulut sağlayıcılarla
  çalışan, beyaz liste denetimli sistem ajanı
- **Yazılım Mağazası ve İç Güncelleme Kanalı** — Flathub/APT kaynakları
  birleştiren mağaza ve yayımlanan Debian paketi üzerinden yükseltme
- **Devuan tabanlı sistem yapılandırmaları** — debootstrap düşük seviye
  hattı, GRUB/plymouth temaları, MEB okul sertifikasyon araçları
- **ISO üretim betikleri ve doğrulama araçları**

Ayaz DE yalnız **Ankora Linux** ile dağıtılır. ISO içi paket derleme
sırasında üretilir; amacı canlı sisteme `ayaz-de` ikilisini ve masaüstü
güncelleyicisinin paket kimliğini enjekte etmektir. Ayrıca her sürümle
`ayaz-de-latest-amd64.deb` GitHub Releases sayfasına yüklenir: kurulu
Ankora sistemlerindeki **Ayaz Güncelleyici** bu paketle içeriden
yükseltme yapar; böylece dağıtım yalnız ISO ile sınırlı kalmaz, kurulu
sistemler de içeriden yükseltilebilir.

## Ayaz DE nedir?

Ayaz DE, Ankora Linux için geliştirilmiş hafif ve kiosk odaklı bir masaüstü
ortamıdır. GNOME ve KDE'nin aksine arayüz tamamen Rust + WebKitGTK
(Tauri 1.5) üzerine kurulur; pencere yönetimi, panel, başlat menüsü,
dosya yöneticisi, yazılım merkezi ve ayarlar tek bir yerel webview
kabuğunda yaşar. Sistem, kalıcı DOM ağacı yerine tembel görünüm devri
kullanır: kapatılan pencere 30 saniye sonra DOM'dan çıkarılır ve
kaynakları boşalır; yeniden açılışta geri takılır.

Boyut ve tepki hedefleri:

- Canlı sistem boştayken yaklaşık **750 MB RAM** (panel, pencereler ve
  sistem hizmetleri dahil).
- **4 GB altı** bellekte **Eco RAM kipi** ilk açılışta otomatik devreye
  girer; servis azaltımı ve bellek temizliği ile sistem hafifletilir.
- Sistem dili tamamen Türkçedir; klavye düzeninde Türkçe, İngilizce,
  Almanca, Fransızca ve İngiliz (GB) seçenekleri sunulur.

## Özellikler

### Masaüstü

* **14 tam sistem teması** — Nordik Açık, Modern Grafit, Derin Gece,
  Kuzey Fjordu, Çam Ormanı, Kor Ateşi (Ember), Arktik Serinlik, Çınar,
  Meltem, Kor, Dem, Boğaz, Ayna ve 29 Ekim özel **Cumhuriyet** teması.
  Her tema; cam değişkenleri, vurgu rengi, eşleşen ikon seti ve duvar
  kağıdı tek paket olarak gelir; tema seçici kartından tek tıkla
  değiştirilir.
* **15 arka plan** — matrix, aurora, obsidian, topo, zenith, nordik ve
  Cumhuriyet dahil; 14 vektörel SVG ek 1 fotoğraf arka
  plan (Ayaz Dağı).
* **Dinamik Ada (Dynamic Island)** — ekranın üstünde cam kapsül: bildirim
  tostları, indirme ilerlemesi, AI işlem mikro etkileşimi ve canlı
  CPU/RAM telemetrisi. Beş ayrı yoldan açılabilir/kapatılabilir:
  Ayarlar anahtarı, Hızlı Ayarlar karo, masaüstü sağ tık menüsü, kapsül
  sağ tık menüsü ("Gizle") ve kapsül içi düğme; her yol kalıcı yazılır.
* **Görev çubuğu ve başlat menüsü** — ortalanmış düzen; Windows 11 ve
  Chrome OS Flex esinli. Sabitleme: Başlat menüsüne, Araç Çubuna,
  Masaüstüne.
* **Masaüstü kategori klasörleri** — 2x2 mini önizleme karoları, sürükle
  gruplama, sağ tık menüleri (aç/yeniden adlandır/sil/çıkar).
* **Dosya yöneticisi** — kes/kopyala/yapıştır ilerleme çubukları,
  özellikler/izinler penceresi, çoklu seçim, removable diskler,
  "Şuraya Kopyala"/yazdırma.
* **Canlı hava durumu widget'ı** — Open-Meteo (API anahtar gerektirmez),
  3 günlük şerit, şehir arama, anlık yenileme, 15 dakikalık önbellek.
* **Fatih Kalem 2 akıllı tahta çizim aracı** — okul ve ekran çizim/not
  senaryoları; Ada kontrol kartından, Mağazadan ve Başlat menüsünden
  başlatılır.
* **MEB Okul Sertifikası** — Mağaza'daki `meb-cert` eylemiyle kurulur;
  `mebcert-remove` kök sertifikayı sistem ve tarayıcı NSS
  depolarından (`~/.pki/nssdb`) eksiksiz kaldırır; profil klasörlerine
  sahte veri yazılmaz.

### Yazılım Mağazası ve Güncelleme

* **278 doğrulanmış paket** — eğitim, bilim, geliştirme, medya, ofis ve
  sistem kategorilerinde; kaynak rozetleri (Flathub / Devuan APT / Sistem
  deposu), uygulama detay görünümü, mimari uyum tespiti.
* **Ayaz Güncelleyici** — GitHub Releases tabanlı: sürümü kontrol et,
  indir, yükleyiciyi çalıştır; işlemler terminale ihtiyaç duymadan güvenli
  sudoers katmanı üzerinden yapılır. Kurulu sistemin Ankora olduğu
  doğrulanmadan ağ sorgusu yapılmaz.

### Yapay Zekâ Ajanı

* **Sağlayıcılar:** Ollama (localhost), Google Gemini, Groq, OpenAI ve
  OpenRouter; seçim panelden yapılır.
* **Görüntü anlama ("Ekranı İzle", "Bak ve Anlat")** — Gemini, OpenAI ve
  OpenRouter görüntü girdisi kabul eder; Ollama ve Groq metin notu verir.
* **Beyaz liste denetimli eylemler** — 31 izinli komut (`apt-get clean`,
  `df -h` gibi) ve 15 ajan eylemi; her yürütme tek vuruşluk jeton ister,
  jeton başka eylemde yeniden kullanılamaz.
* **Kasa:** AI sağlayıcı anahtarları Rust tarafındaki şifreli kasada
  tutulur (`get_ai_credential`), düz localStorage'a yazılmaz.
* **Mini sohbet balonu** — görev çubuğu üzerinde cam balon; dosya bırakma
  (özetle/kod analiz), Günün Planı widget'ı ve doğal dil görev planı
  kartı.

### Güvenlik

* **Kilit ekranı sertleştirmesi** — girişim sınırlayıcı, 30 saniyelik tek
  vuruşluk kilit açma yetkisi; `ankora_lock_on_startup` ile açılışta
  otomatik kilit.
* **Pano koruması** — kilitliyken pano sızıntısı engellenir.
* **IPC çerçevesi** — Origin denetimi + 256-bit token + zaman-sabitli
  karşılaştırma; 50 kötü denemede kalıcı blok.
* **Komut beyaz listesi** — 31 izinli komut; `sudo`, `su`, `pkexec`,
  `dd` gibi 59 ikili dosyanın yetkisiz çalıştırılmasına kapalıdır.
* **Saldırı yüzeyi azaltma** — sembolik bağ üzerine yazma ataklarının
  durdurulması, yürütme çıktısı boyut sınırları (DoS), MEB sertifikasına
  CA:TRUE Basic Constraints doğrulaması, Tauri CSP sıkılaştırması
  (`object-src 'none'`), snapshot/backup yedek izinleri 0700/0600.
* **Bağımlılık sağlığı** — reqwest 0.12 (h2 >= 0.4.20, RUSTSEC-2026-0258
  kapalı); `cargo audit` taramasında açık sayısı 0.
* **4.0.0 güvenlik paketi** — 14 tarama bulgusu kapatıldı; ayrıntı
  `CHANGELOG.md` içindeki 4.0.0 maddesindedir.

### Sistem

* **Devuan 5.0 Daedalus** (SysVinit) tabanlı — systemd yok;
  X11 `nodm` oturum yönetimi.
* **Hibrit canlı ISO** — aynı dosya hem BIOS (isohdpfx MBR) hem UEFI
  (GPT bas-dat) firmware'den başlatılabilir; derleme sonunda sistem
  alanı bayt düzeyinden doğrulanır (aşağıda).
* **USB başlatma güvencesi** — hibrit derleme adımının sessiz CD-only
  fallback'i kaldırıldı; isohdpfx MBR veya efi.img eksikse derleme açık
  hatayla durur.

## İndir

En son sürüm [GitHub Releases sayfasında](https://github.com/Ankora-Linux/Ankora/releases/latest) yayımlanır:

| Asset | Amaç |
|---|---|
| `ankora-linux-<sürüm>-ayaz-amd64.iso` | Canlı ISO — USB'ye yazdırıp başlatılır |
| `ankora-linux-<sürüm>-ayaz-amd64.iso.sha256` | Bütünlük özeti |
| `ayaz-de-latest-amd64.deb` | Ayaz Güncelleyici ile içeriden yükseltme paketi |

Bütünlük doğrulaması (ISO ile aynı dizindeyken):

```bash
sha256sum -c ankora-linux-4.0.0-ayaz-amd64.iso.sha256
```

## USB'ye yazdırma ve başlatma

ISO hibritleştirilmiştir: aynı imaj BIOS ve UEFI firmware'den başlatılabilir.
Yazdırmadan önce doğru disk harfini belirleyin (`lsblk -d -o NAME,SIZE,MODEL`)
ve yazdırma hedefinin başında bölüm numarası **olmayan** cihaz
(`/dev/sdX`, `/dev/sdb` gibi) kullandığınızdan emin olun:

```bash
# Uyarı: /dev/sdX yerine kendi cihazınızı yazın. Yanlış hedef diskteki
# tüm verileri siler.
sudo dd if=ankora-linux-4.0.0-ayaz-amd64.iso of=/dev/sdX bs=4M oflag=direct status=progress
sync
```

`dd` yerine Balena Etcher veya Rufus (ikisinde de **DD modunu** seçin)
görsel yazıcılar da kullanılabilir. ISO'yu dosya olarak kopyalamak değil,
**imaj yazdırma** şarttır; aksi takdirde önyükleme yapmaz.

Belleği cihaza taktıktan sonra bilgisayarın BIOS/UEFI önyükleme menüsünden
belleği seçin. Canlı sistemi başlatmak diskteki verilere dokunmaz;
kurulum istediğinizde masaüstündeki "Sistemi Kur" simgesi Ayaz Kurulum
Sihirbazı'nı açar ve adım adım yol gösterir.

## Sürüm dağıtımı ve güncellenme akışı

```text
git tag v4.0.0
git push origin v4.0.0
```

`build-iso.yml` iş akışı tetiklenir ve sırasıyla:

1. Sürüm damgalarını doğrular (`tauri.conf.json` = `VERSION` = `Cargo.toml`
   = `package.json`).
2. Güvenlik ve bütünlük denetimini çalıştırır (SAST + `cargo audit`).
3. Ayaz DE iç paketini derler (ISO içi enjeksiyon).
4. `build-iso.sh` ile hibrit canlı ISOyu üretir (8 aşama) ve sonunda
   sistem alanını doğrular:
   - MBR 1. bölüm girişi önyüklenebilir (`0x80`, offset 446),
   - MBR 2. bölüm girişi EFI tipinde (`0xef`, offset 466),
   - LBA 1'de GPT imzası (`EFI PART`),
   - isohdpfx bootloader kodu ISO'nun ilk 432 baytında birebir.
5. ISO + `.sha256` + `ayaz-de-latest-amd64.deb` paketini GitHub Releases'a
   yükler. `releases/latest` güncellenir; kurulu Ankora sistemlerindeki
   Ayaz Güncelleyici bu sürümü görür.

Kurulu sistemler için uygun **iç yükseltme yolu**: masaüstündeki Ayaz
Güncelleyici → Kontrol Et → İndir → Kur; her adım ayaz-update-helper
sudoers katmanı üzerinden doğrulanmış `.deb` kurar.

## Dizin yapısı

```text
Ankora/
├── .github/workflows/
│   ├── build-iso.yml            # Canlı ISO derleme iş akışı (etiket tetiklemeli)
│   └── ci.yml                   # Kalite denetimi (node --check, bash -n, sürüm uyum örnekleri)
├── assets/                      # Logo, duvar kağıdı önizlemeleri, masaüstü ekran görseli
├── scripts/
│   ├── ankora-doctor.sh         # Sistem doktoru ve hızlı onarım aracı
│   ├── ankora-grub-default      # Kurulum aracının /etc/default/grub yazımı
│   ├── ankora-updater-sudoers   # Güncelleyici helper için sudoers izni
│   ├── ayaz-ctl                 # Masaüstü ve X11 uyumluluk köprüsü
│   ├── ayaz-pkg-helper.sh       # Root yetkisiyle paket kurma yardımcısı
│   ├── ayaz-session             # Ayaz DE oturum başlatıcı (openbox + ayaz)
│   ├── ayaz-session.desktop     # X11 oturum kaydı
│   ├── ayaz-update-helper.sh    # Şifresiz güvenli .deb kurulum yardımcısı
│   ├── ayaz.desktop             # Uygulama kısayolu
│   ├── build-iso.sh             # Hibrit canlı ISO derleme betiği (8 aşama + doğrulama)
│   ├── build-on-windows.ps1     # Windows'tan ISO derleme yardımcısı
│   ├── eta-touchdrv*            # Faz/eGalax dokunmatik tahta sürücü yardımcısı
│   ├── grub-theme-ankora/       # GRUB teması
│   ├── openbox-rc.xml           # X window yöneticisi yapılandırması
│   ├── package-deb.sh           # Ayaz DE .deb paketleme (release asset)
│   ├── plymouth-theme-ankora/   # Açılış splash teması
│   └── xinitrc                  # X oturum başlangıç betiği
├── src/                         # Arayüz
│   ├── app.js                   # Pencere yöneticisi, güncelleyici, AI ajanı, Ada
│   ├── index.html               # Masaüstü, pencereler, başlat menüsü, mağaza
│   ├── style.css                # Monokrom cam tasarım sistemi ve 14 tema
│   └── wallpaper-*.svg          # Vektörel duvar kağıtları (14 SVG; ek 1 fotoğraf arka plan assets/ içinde)
├── src-tauri/                   # Rust arka ucu
│   ├── Cargo.toml
│   ├── tauri.conf.json          # Kiosk pencere kuralları, CSP, sürüm damgası
│   └── src/main.rs              # Sistem telemetrisi, IPC, güncelleme motoru
├── my-linux-orchestrator/       # Yapılandırma orkestratörü ve beceri tanımları
├── scratch/
│   ├── test_store_data.js       # Mağaza veri doğrulama testi (278 paket)
│   └── verify_all.py            # ISO/GRUB/plymouth/kur betik yapısı denetimi
├── third_party/                 # Devuan keyring, Fatih Kalem 2, üçüncü parti paketler
├── AGENTS.md                    # Depo geliştirici kuralları ve oturum hafızası
├── CHANGELOG.md                 # Sürüm notları
├── LICENSE                      # GPL-3.0
├── package.json
└── README.md
```

## Geliştirme ve derleme

### Gereksinimler

* Rust:
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```
* Node.js v18 veya v20
* Debian/Devuan kütüphaneleri:
  ```bash
  sudo apt-get install -y libwebkit2gtk-4.0-dev build-essential curl wget file libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
  ```

### Geliştirme modunda çalıştırma

```bash
cargo install tauri-cli --version "^1.5"
cargo tauri dev
```

Yapı değişimlerinde hızlı sözdizimi kapısı:

```bash
node --check src/app.js
bash -n scripts/build-iso.sh
python3 scratch/verify_all.py    # ISO/GRUB/plymouth/kurulum betik denetimi
node scratch/test_store_data.js  # Mağaza veri doğrulaması
```

### Üretim derlemesi (Canlı ISO)

```bash
sudo bash scripts/build-iso.sh
```

Betiğin işleyişi: apt düşük seviye araçlarını (debootstrap, xorriso,
mtools, grub-*) kendisi kurar ve doğrular; 8 aşamalı hat
aşağıdaki kapılara sahiptir — MBR bootloader kodu, UEFI efi.img ve GPT
yapısından biri üretilmezse derleme açık hatayla durur:

1. Host paketleri ve Devuan anahtarlık denetimi
2. debootstrap ile Devuan 5.0 Daedalus taban sistemi
3. Ayaz DE iç paketi enjeksiyonu
4. GRUB BIOS/UEFI önyükleyicileri (grub-mkimage + grub-mkstandalone)
5. mksquashfs canlı dosya sistemi
6. EFI ve BIOS hibrit önyükleyici hazırlığı (isohdpfx MBR + efi.img)
7. Xorriso hibrit ISO üretimi (isohybrid + gpt-basdat)
8. Sistem alanı bayt doğrulaması + SHA256 özeti

ISO çıktısı `dist/ankora-linux-<sürüm>-ayaz-amd64.iso` dosyasıdır.
`ayaz-de-latest-amd64.deb` üretimi `scripts/package-deb.sh` Tarafından
yapılır ve build-iso iş akışı her sürümle beraber releases'a yükler.

### Ayaz DE .deb paketi

```bash
sudo bash scripts/package-deb.sh
```

Derleme ortamından Ayaz DE ikilisini paketler ve
`ayaz-de-latest-amd64.deb` çıktısını yazar. Bu asset Ayaz Güncelleyici
için dış güncelleme kanalıdır; her sürümde aynı sabit adla yayınlanır,
böylece kurulu sistemler sorgusuz bulur.

### ISO derlemesini CI'dan tetikleme

Depoda yeni bir **etiket push edildiğinde** `build-iso.yml` otomatik
tetiklenir ve derlemeyi etiketin işaret ettiği commit'ten yapar. Sürüm
damgaları (`tauri.conf.json` = `VERSION` = `Cargo.toml` = `package.json`)
uyuşmazsa iş başlangıçta durur.

Sürüm damgası her sürümde dört dosyada da güncellenmelidir:
`src-tauri/tauri.conf.json` (tek kaynak), `VERSION`, `Cargo.toml`,
`package.json`. CI bu dördü karşılaştırır ve uyuşmazlıkta işi durdurur.

## Test ve doğrulama

`scratch/verify_all.py`, ISO üretim hattının kritik kapılarını süzer:
grub.cfg sözdizimi ve tema yapısı, plymouth sprite API kuralları, kurulum
betikleri, dokunmatik tahta sürücü kancaları, GRUB tema kalabalığı ve
font kapıları, ISO hibrit satırları — ayrıntı betiğin maddelerinde.

`node scratch/test_store_data.js` mağaza veri bütünlüğünü doğrular:
278 kayıt, zorunlu alanlar (isim, kategori, kaynak, kurulum yolu,
boyut), kategori geçerliliği ve öne çıkan eşleşmeleri.

## Web sitesi ve topluluk

- Site: [https://ankora-linux.github.io/](https://ankora-linux.github.io/)
  — indirme, kurulum, güvenlik ve SSS sayfaları; site deposu açık kodlu.
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

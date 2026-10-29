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
</div>

## Ana depo

Bu repository, Ankora Linux projesinin resmî ana deposudur. Tüm canlı ISO üretimi, sistem paketleme, Ayaz DE geliştirme akışı ve dağıtım altyapısı burada yönetilir.

Bu depoda yer alan temel bileşenler:

- Ayaz Desktop Environment (Ayaz DE)
- Ankora Linux için masaüstü arayüzü ve güvenlik katmanı
- Devuan tabanlı sistem yapılandırmaları
- ISO üretim betikleri ve yardımcı araçlar

Ayaz DE, yalnız **Ankora Linux** ile dağıtılır: arayüzü ayrı bir `.deb`
paket olarak dış dünyaya sunulmaz. ISO içi paket, yalnızca canlı sisteme
`ayaz-de` ikilisini ve masaüstü güncelleyicisinin paket kimliğini
enjekte etmek için derlem sırasında üretilir.

## Ayaz DE nedir?

Ayaz DE, Ankora Linux için geliştirilmiş, SysVinit tabanlı hafif ve kiosk odaklı bir masaüstü ortamıdır. GNOME ve KDE'nin aksine arayüzü Rust + WebKitGTK (Tauri 1.5) üzerine kurulur. Boşta RAM kullanımı yaklaşık 80–120 MB civarındadır.

## Özellikler

* Gereksiz arka plan servisleri olmadan çalışır; boşta yaklaşık 80–120 MB RAM kullanır.
* Ayaz Güncelleyici, sistemi masaüstünden günceller; kurulum ve güncelleme işlemleri terminale ihtiyaç duymadan yapılır.
* Yapay zeka ajanı Ollama (localhost), Google Gemini ve Groq ile çalışır; `apt-get clean`, `df -h` gibi işlemlerin onaylı çalıştırılmasını sağlar.
* 13 tema (Nordik Açık, Modern Grafit, Derin Gece, Kuzey Fjordu, Çam Ormanı, Kor Ateşi, Arktik Serinlik, Çınar, Meltem, Kor, Dem, Boğaz, Ayna) ve 14 vektörel monokrom duvar kağıdı içerir.
* Görev çubuğu ve başlat menüsü ortalanır; düzen Windows 11 ve Chrome OS Flex'ten esinlenir.
* İkili kara liste, `sudo`, `su`, `pkexec`, `dd` gibi araçların yetkisiz çalıştırılmasını engeller.
* Belge görüntüleyici, hardlink ve path traversal saldırılarına karşı korunur; PDF, Markdown ve metin dosyalarını açar.
* Devuan SysVinit ve X11 `nodm` oturum yönetimiyle uyumludur.

## Dizin yapısı

```text
Ayaz/
├── .github/workflows/
│   └── build-iso.yml            # Ankora Linux canlı ISO derleme iş akışı (manuel/etiket tetiklemeli)
├── assets/                      # Logo ve masaüstü önizleme görselleri
├── scripts/
│   ├── ankora-updater-sudoers   # Helper'lar için sudoers izni
│   ├── ayaz-pkg-helper.sh       # Root yetkisiyle paket kurma yardımcısı
│   ├── ayaz-update-helper.sh    # Şifresiz güvenli .deb kurulum yardımcısı
│   ├── ayaz-session.desktop     # X11 oturum kaydı
│   ├── ayaz.desktop             # Uygulama kısayolu
│   ├── build-iso.sh             # Hibrit canlı ISO derleme betiği
│   ├── build-on-windows.ps1     # Windows'tan ISO derleme yardımcısı
│   ├── package-deb.sh           # ISO içi paketleme (dış dağıtım yok)
│   └── xinitrc                  # X oturum başlangıç betiği
├── src/                         # Arayüz
│   ├── app.js                   # Pencere yöneticisi, güncelleyici, yapay zeka ajanı
│   ├── index.html               # Masaüstü, pencereler ve başlat menüsü
│   ├── style.css                # Monokrom cam tasarımı ve temalar
│   └── wallpaper-*.svg          # Monokrom duvar kağıtları
├── src-tauri/                   # Rust arka ucu
│   ├── Cargo.toml
│   ├── tauri.conf.json          # Kiosk pencere kuralları ve CSP
│   └── src/main.rs              # Sistem telemetrisi, IPC, güncelleme motoru
├── my-linux-orchestrator/       # Yapılandırma orkestratörü ve beceri tanımları
├── third_party/                 # Üçüncü parti paketler ve keyring'ler
├── AGENTS.md
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

### Üretim derlemesi (Canlı ISO)

```bash
sudo bash scripts/build-iso.sh
```

ISO, `dist/ankora-linux-4.0.0-ayaz-amd64.iso` dizininde oluşur. Ayaz DE bu
ISO ile dağıtılır; ayrıca `scripts/package-deb.sh` çıktısı
`ayaz-de-latest-amd64.deb` olarak GitHub Releases sayfasına da yüklenir
(kurulu sistemlerdeki Ayaz Güncelleyici bu paketle içeriden yükseltme yapar).

### USB'ye yazdırma (önyükleme için)

ISO hibritleştirilmiştir: aynı dosya hem BIOS hem UEFI firmware'den
USB diskten başlatılabilir. Yazdırma önce BIOS uyumunun bozulmaması için
şaşı yapılmalıdır:

```bash
# Disk harfini doğru öğren: lsblk ; ardından (sdb EŞLEŞTİRMESİ KENDİNE GÖRE)
sudo dd if=dist/ankora-linux-4.0.0-ayaz-amd64.iso of=/dev/sdX bs=4M oflag=direct status=progress
sync
```

`dd` yerine Balena Etcher / feather de kullanılabilir; ISO'yu dosya
olarak kopyalama (extract) değil, imaj yazdırma yöntemi şarttır.

## Sürüm dağıtımı

Depoda yeni bir etiket push edildiğinde:

```bash
git tag v4.0.0
git push origin v4.0.0
```

`build-iso.yml` iş akışı ISO'yu derler ve GitHub Releases sayfasına
yükler. Release içerikleri: canlı ISO, sha256 özeti ve
`ayaz-de-latest-amd64.deb` (iç güncelleme kanalı). Güncellemeler kurulu
Ankora sistemlerinde masaüstündeki Ayaz Güncelleyici ile kurulur.

## Lisans

Bu proje GNU General Public License v3.0 ile lisanslıdır; tam metin `LICENSE` dosyasındadır.

Ankora Linux projesinin ana deposu olarak bu repo, proje için merkezî geliştirme ve dağıtım noktasıdır.

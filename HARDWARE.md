# Ankora Linux Donanım Uyumluluk Rehberi (v4.5.2)

Bu belge, Ankora Linux (Devuan Daedalus 5.0 tabanlı, SysVinit init sistemi ve Ayaz DE masaüstü ortamı) için hedeflenen donanım profillerini ve her birinin doğrulama durumunu listeler.

> **Doğrulama durumu (2026-11-10):** v4.5.2 ISO içeriği denetlendi (247 radeon, 530 amdgpu firmware dosyası; hibrit MBR + UEFI imzası). Gerçek donanımda açılış ve diske kurulum henüz uçtan uca doğrulanmadı. Aşağıdaki tablolar destek hedefidir; bir cihazda test ettiyseniz sonucu GitHub Issues üzerinden bildirin, tablo güncellenir.

---

## 1. Etkileşimli Akıllı Tahtalar (FATİH Projesi)

Ankora Linux; okullardaki FAZ 1, FAZ 2 ve FAZ 3 etkileşimli tahtaların kızılötesi (IR) ve kapasitif dokunmatik çerçevelerini `scripts/xinitrc` ve `scripts/ayaz-session` içindeki otomatik algılama kurallarıyla kutudan çıktığı gibi çalıştırır.

| Tahta Nesli | Üretici | Dokunmatik Çerçeve | Yazılım Desteği | Donanımda Doğrulandı |
| :--- | :--- | :--- | :--- | :--- |
| **FAZ 1** | Vestel | IR / eGalax (USB HID) | `eta-touchdrv` ad eşleşmesi + udev/Xorg kuralları | Hayır |
| **FAZ 2** | Vestel | IR, çoklu dokunmatik | `eta-touchdrv` + `xinput-calibrator` | Hayır |
| **FAZ 3** | Arçelik / Vestel | IR / kapasitif HID | `eta-touchdrv` + `xinput-calibrator`, UEFI önyükleme | Hayır |

### Akıllı Tahta Yazılımları
* **Fatih Kalem 2 (`fatih-kalem`)**: ISO içinde yerleşik gelir; ekran üzerindeki her pencerenin üstüne çizim, fosforlu kalem ve şekil ekler.
* **MEB Sertifikası (`meb-cert`)**: Yazılım Mağazası > Okul & Eğitim sekmesinden tek tıkla sistem ve tarayıcı sertifika deposuna kurulur.
* **OpenBoard, GeoGebra, Scratch 3, GCompris, Stellarium**: Yazılım Mağazası üzerinden doğrudan kurulabilir.

---

## 2. Ekran Kartları (GPU) ve Görüntü Sürücüleri

Canlı ISO imajında açık kaynak Mesa sürücüleri ve ikili (binary) çekirdek firmware paketleri (`firmware-linux-free`, `firmware-linux-nonfree`, `firmware-amd-graphics`, `firmware-misc-nonfree`) birlikte yer alır.

| GPU Ailesi | Örnek Modeller | Çekirdek / Mesa Sürücüsü | Firmware / Durum |
| :--- | :--- | :--- | :--- |
| **AMD / ATI Eski Nesil (TeraScale)** | Mobility Radeon HD 4300, HD 4350, HD 4500, HD 5450 | `radeon` + Mesa `r600` | `/lib/firmware/radeon` ISO içinde doğrulanır, boşsa derleme durur. 4.5.1 HD 4300'de konsolda donuyordu (firmware eksikti); 4.5.2 açılışı henüz donanımda denenmedi. |
| **AMD GCN / RDNA** | Radeon RX 400/500, Vega APU, RX 6000 | `amdgpu` + Mesa `radeonsi` | `/lib/firmware/amdgpu` yerleşik; donanımsal hızlandırma açık. |
| **Intel Entegre GPU** | GMA 4500, HD 2000/3000/4000, UHD 600, Iris Xe | `i915` + Mesa `crocus` / `iris` | Ek paket gerektirmez; tam KMS ve WebKitGTK uyumu. |
| **NVIDIA (Eski ve Orta Nesil)** | GeForce GT 210, GT 710, GTX 750/960/1050 | `nouveau` (açık kaynak) | Canlı oturumda `nouveau` ile açılır. Görüntü sorunu yaşanırsa önyükleme menüsünden **Güvenli Grafik (nomodeset)** seçilebilir. |

---

## 3. Düşük Bellekli Bilgisayarlar ve ZRAM Politikası

Ankora Linux, eski masaüstü ve dizüstü bilgisayarlarda bellek darboğazını önlemek için sıkıştırılmış RAM takas alanı (**ZRAM**) kullanır:

* **Algoritma önceliği**: `zstd` > `lz4` > `lzo`
* **Boyut oranı**: Toplam fiziksel RAM'in `%50`'si (`DISKSIZE = MemTotal / 2`), takas önceliği `100`.
* **Devreye girme**: SysVinit açılışında `/etc/init.d/zram-swap` servisi tüm sistemlerde ZRAM takas alanını kurar. Ayrıca `ayaz-session` ve `.xinitrc`, 4 GB altı RAM'e sahip cihazlarda ZRAM kapalıysa oturum açılışında otomatik olarak başlatır.

| Bellek Miktarı | Öneri |
| :--- | :--- |
| **2 GB RAM** | Canlı oturum açılır; ağır harici uygulamalar (tarayıcı + ofis) aynı anda zorlar. |
| **4 GB RAM** | Tüm yüzler ve günlük kullanım için önerilen alt sınır. |
| **8 GB+ RAM** | Yerel AI (Ollama) modelleri için gerekli. |

Boşta bellek tüketimi bu sürüm için ölçülmedi.

---

## 4. Yazıcı, Tarayıcı ve Çevre Birimleri

Bir sonraki ISO derlemesinden itibaren yazdırma ve belge tarama altyapısı hazır gelir (yayınlanmış 4.5.2 ISO'sunda henüz yok):

* **Yazıcı Desteği (CUPS)**: `cups`, `cups-client`, `cups-bsd`, `printer-driver-gutenprint` ve `system-config-printer` kurulu gelir. `cups` SysVinit servisi açılışta etkindir; `ankora` kullanıcısı `lp` grubuna üyedir.
* **Tarayıcı Desteği (SANE)**: `sane-utils`, `libsane1` ve `simple-scan` (Belge Tarayıcı) kurulu gelir; `ankora` kullanıcısı `scanner` grubuna üyedir.
* **Kablosuz Ağ ve Ses**: `firmware-iwlwifi`, `firmware-realtek`, `firmware-atheros`, `firmware-brcm80211`, PipeWire / PulseAudio ve Bluetooth (`bluez`, `blueman`) yerleşiktir.

---

## 5. Sanal Makine Ayarları (QEMU / KVM, VirtualBox, VMware)

Ayaz DE oturum başlatıcısı (`scripts/xinitrc` ve `scripts/ayaz-session`), DMI kimliklerinden sanal makine ortamını otomatik algılar ve sanal GPU sürücülerindeki (VMSVGA / QXL) DRI çökmelerini önlemek için `LIBGL_ALWAYS_SOFTWARE=1` (Mesa `llvmpipe`) değişkenini devreye alır.

| Sanallaştırma Platformu | Önerilen Görüntü Denetleyicisi | Önerilen Bellek / CPU | Notlar |
| :--- | :--- | :--- | :--- |
| **QEMU / KVM (virt-manager)** | `Virtio` veya `VGA` (`std`) | En az 2048 MB RAM, 2 vCPU | UEFI (OVMF) ve klasik BIOS önyüklemesi desteklenir. |
| **Oracle VirtualBox** | `VMSVGA` (128 MB VRAM, 3B hızlandırma kapalı) | En az 2048 MB RAM, 2 vCPU | `xrandr` düşük çözünürlüğü otomatik olarak `1280x800` veya `1024x768` seviyesine yükseltir. |
| **VMware Workstation / Player** | Varsayılan SVGA | En az 2048 MB RAM, 2 vCPU | Fiziksel disk kurulumu için en az 16 GB sanal disk önerilir. |

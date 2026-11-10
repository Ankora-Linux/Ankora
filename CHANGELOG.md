# Ankora Linux — Sürüm Notları


## 4.6.0 (2026-11-10)

### Sürüm ve Sistem Bilgisi Güncellemesi
- **4.6.0 Taban Sürümü**: Sistem sürümü resmi olarak 4.6.0'a yükseltildi. Ayarlar, Telemetri, Terminal, Kiosk raporları ve Hakkında pencerelerindeki eski 3.6 ve 3.7 sabit metinleri temizlendi. Canlı telemetri motoru dinamik olarak `/etc/os-release` ve `UpdaterManager` sürümünü yansıtır.

### Uygulama Menüsü ve XDG Entegrasyonu
- **Sistem Uygulamaları Menü Görünürlüğü (PulseAudio vb.)**: İlk taramadaki filtre mantığı düzeltildi; PulseAudio Ses Denetimi (pavucontrol), GParted ve önceden kurulu gelen tüm geçerli XDG uygulamaları Başlat Menüsündeki yüklü uygulamalar listesine ve arama motoruna dahil edildi. Masaüstü temizliği (`on_desktop: false`) korunurken menü erişimi eksiksiz hale getirildi.

### Tema ve Arayüz Kontrastı
- **Açılır Menü (Select/Dropdown) Renk Çakışması Giderildi**: Açık temalarda (Açık, Kutup, Çınar, Meltem, Yüz 3 Bostan, Yüz 8 Cıvata) açılır menü ve seçeneklerin beyaz arka plan üstünde beyaz kalarak okunamaz hale gelmesi engellendi; evrensel yüksek kontrastlı zıt renk kuralları tanımlandı. Ses giriş ve çıkış aygıtı seçicilerindeki satır içi beyaz renk zorlaması kaldırıldı.

### Bildirim Merkezi
- **Tümünü Temizle Kararlılığı**: Bildirim merkezinde "Tümünü Temizle" tıklandığında son temizlenen bildirimlerin arka plan yoklamasında yeniden ekrana gelmesi sorunu giderildi; silinen bildirim kimlikleri ve temizleme zaman damgası korunarak yalnızca yeni gelen sistem bildirimlerinin listelenmesi sağlandı.

### Paket Yöneticisi ve Ayaz Güncelleyici
- **Güvenlik İlkesi ve Root Yetkisi İyileştirmeleri**: Sudoers yapılandırmasına `%sudo` grubu NOPASSWD erişimi eklendi; farklı kullanıcı adlarıyla yapılan kurulumlarda şifresiz güncelleme ve bakım yardımcılarının çalışması garanti altına alındı.
- **Ayaz Güncelleyici Staging ve Sudo Entegrasyonu**: Rust backend'indeki güncelleme çağrısına `-n` ve `--stage` adımları entegre edildi, `/bin/true` ve `/usr/bin/true` üzerinden tam yollu sudo kontrolü sağlandı.

### Masaüstü Widget Saat Uygulamacığı
- **Takılmayan Senkronize Saat**: Masaüstü saat widget'ı tek seferlik gecikmeli zamanlayıcı yerine saniyelik kaymasız döngüye ve görev çubuğu saatiyle doğrudan senkronizasyona bağlandı. Sekme/ekran odak değişimlerinde anlık uyanma sağlandı, saat takılması sorunu çözüldü.

## Yayınlanmamış (Önceki İyileştirmeler)

### Arayüz, Dock ve Harici X11 Pencere Entegrasyonu
- **Yüz 8 (Cıvata) ve Yüz 3 (Bostan) Masaüstü Izgarası**: `XdgDesktopEngine._gridSize()` artık `getBoundingClientRect()` ile gerçek kullanılabilir yüksekliği hesaplar; Yüz 8'de üst saat/hava kartı nedeniyle oluşan dikey simge taşması giderildi. Yüz 3 ve Yüz 8 açık zeminlerinde masaüstü SVG/IMG simgeleri koyu mürekkep konturu (`#26321f` / `#161309`) ile çizilir.
- **Mağaza Açık Yüz ve Açık Tema Kontrastı**: `#win-store .store-source-selector`, `.store-source-btn`, `.store-filter-btn` ve `.store-search-box` bileşenleri Yüz 3 (Bostan), Yüz 8 (Cıvata) ve tüm `body.is-light-theme` / `body.theme-light` açık temalarda yüzey paletine bağlandı.
- **Tüm Yüzlerde Harici Uygulama (Brave, VLC vb.) Dock/Panel Sekmeleri**: Açık iç pencereler ve harici X11 pencereleri (`WindowManager.nativeWindows`) Yüz 2 (Bakır), Yüz 3 (Bostan) ve Yüz 8 (Cıvata) alt dock'larında ve Cıvata üst barında dinamik listelenir; tıklanınca odaklanır veya küçültülür, orta tık ve sağ tık menüsüyle kapatılır. `wmctrl -l -x` ayrıştırmasında `client_machine` makine adının pencere başlığına karışması düzeltildi, Openbox alt kenar boşluğu `<bottom>68</bottom>` olarak güncellendi.

### Yazılım Mağazası (378 Paket) ve Sistem Altyapısı (CUPS, SANE, ZRAM)
- **Mağaza Kataloğu (278 -> 378 Paket)**: Okul/eğitim, geliştirici, medya, grafik, ağ, ofis ve sistem kategorilerine 100 yeni doğrulanmış Debian/Devuan APT ve Flathub paketi eklendi. "Tüm Paketler" (`data-cat="all"`) görünümünün 378 paketin tamamını kart olarak çizmesi sağlandı.
- **Yazıcı ve Tarayıcı Desteği (CUPS + SANE)**: ISO kurulumuna `cups`, `cups-client`, `cups-bsd`, `printer-driver-gutenprint`, `system-config-printer`, `sane-utils`, `libsane1` ve `simple-scan` eklendi; `ankora` kullanıcısı `lp` ve `scanner` gruplarına dahil edildi.
- **ZRAM Politikası Eşitlemesi**: `scripts/build-iso.sh` (`/etc/init.d/zram-swap`), `scripts/ayaz-session` ve `scripts/xinitrc` genelinde ZRAM sıkıştırma algoritması önceliği (`zstd > lz4 > lzo`) ve boyut oranı (`MemTotal / 2`) eşitlendi.
- **Donanım Uyumluluk Rehberi ve CI**: `HARDWARE.md` eklendi; `ci.yml` 5 sürüm dosyasının tamamını (`tauri.conf.json`, `Cargo.toml`, `Cargo.lock`, `package.json`, `VERSION`) denetler, `build-iso.yml` sürüm notlarını `CHANGELOG.md` içinden çıkarır.

## 4.5.2 (2026-11-08)

### Kritik: AMD/Radeon GPU firmware
- ISO, GPU firmware olmadan derleniyordu. `firmware-linux-nonfree`, `firmware-amd-graphics` ve `firmware-radeon` tek bir `apt-get install` satirindaydi; daedalus deposunda bulunmayan `firmware-radeon` adi komutun tamamini dusuruyor, `2>/dev/null || true` da hatayi yutuyordu.
- Sonuc: `/lib/firmware/radeon` ve `/lib/firmware/amdgpu` dizinleri bos kaliyordu. Radeon (r600/HD 4000 serisi) kartlarda surucu firmware beklemeden init etmedigi icin acilis konsolda kilitleniyor, masaustu hic acilmiyordu.
- Paketler artik tek tek kuruluyor, hata gizlenmiyor. Kurulumdan sonra firmware dizinleri dogrulaniyor; ikisi de bos ise derleme acik hatayla duruyor.

### Dogrulama
- ISO icindeki squashfs denetlendi: 4.5.1 imajinda `firmware-amd-graphics` kurulu degildi, `/lib/firmware/radeon` yoktu. Bu surumde derleme bunu yakalar.

## 4.5.1 (2026-11-07)

### Güvenlik
- CSP sıkılaştırıldı: `script-src` içinden `'unsafe-inline'` ve `'unsafe-eval'` kaldırıldı (`index.html` + `tauri.conf.json` senkron). İki satır içi `onclick` bağlantısı kaldırıldı, iptal düğmesi `app.js` içinde bağlandı.
- 36 boş `innerHTML` ataması `replaceChildren()` ile değiştirildi.
- Masaüstü simge listesinde `.`, `..` ve gizli dosyalar filtreleniyor.

### Arayüz
- Yüz 2 (Bakır), 3 (Bostan) ve 8 (Cıvata) için sağ üstte, yüz paletine uyan küçük `Ankora AI` balonu eklendi. Bu yüzlerde görev çubuğu gizli olduğu için AI'a giriş noktası kalmıyordu.
- Yüz 2: masaüstü simgeleri 36 px'lik üst panelin altında kalıyordu, ızgara 46 px'e indirildi; meta notu sol alta taşındı.
- Mağaza penceresi açık yüzlerde koyu kalıyordu; yüz 3 ve 8 için pencere kapsamında yüzey/metin değişkenleri eşitlendi, vitrin kartı ve birincil düğme yüz paletine bağlandı.
- 55 `transition: all` bildirimi açık özellik listelerine çevrildi.
- README sürüm rozeti 4.5.0'a çekildi.

### ISO ve başlatma
- `.xinitrc` artık tek kaynaktan üretiliyor: `build-iso.sh` içindeki kopya heredoc kaldırıldı, depodaki `scripts/xinitrc` chroot'a kuruluyor. Dokunmatik ped ayarları ve FAZ/Arçelik desenleri iki dosyada ayrışamaz.
- `.xinitrc` içine WebKit2 typelib ön kontrolü eklendi: 4.0 ve 4.1 typelib'lerinin ikisi de yoksa `/tmp/ayaz.log` dosyasına okunur uyarı yazılır, sessiz siyah ekran yerine xterm hata penceresi açılır.
- ISO paket listesine `gir1.2-webkit2-4.1` eklendi; Python köprüsü 4.0 bulamazsa 4.1'e düşer.
- `dist/ayaz-de-latest-amd64.deb` kaynaktan eskiyse `build-iso.sh` önce yeniden derler.

### Test
- Arayüz duman testi taşınabilir hale getirildi: `tempfile` ile geçici dizin, `CHROME_BIN`/chromium/chrome keşfi, 8 s + 20 s iki deneme, utf-8 çözümleme ve stderr kuyruğu raporu.

---

## 4.5.0 (2026-11-03)

### 🎵 MPRIS+ Medya Entegrasyonu (Dinamik Ada + Bildirim Merkezi + Bakır/Bostan/Cıvata Panelleri)
- **Dinamik Ada**: Çalan medyada şarkı adı, sanatçı, albüm kapağı, duraklat/öniçi/sonraki kontrolleri, canlı ses dalgası animasyonu ve parça ilerleme çubuğu (1 sn yumuşak interpolasyon).
- **Bildirim Merkezi Kartı**: Aynı kontroller, ilerleme çubuğu ve birden fazla oynatıcı (Chromium, Brave, Spotify, VLC, mpv) arasında seçim yapan **oynatıcı çipleri** (seçim `ankora_mpris_player` anahtarıyla kalıcı).
- **Akıllı Filtreleme**: Yalnız **Playing > Paused** durumundaki oynatıcı gösterilir; Stopped/durdurulanlar eskimiş metadata taşımadığı için gizlenir. Komutlar seçili oynatıcıya hedeflenir (`playerctl -p <name>`).
- **Yüz Panelleri (Bakır/Bostan/Cıvata)**: Üst panellere entegre medya şeridi — önceki/oynat/sonraki + başlık/sanatçı + ilerleme çubuğu; her yüzün paletiyle (bakır/yeşil/mürekkep) renklendirilmiş, açık temalarda kontrast düzeltmesi.

### 🤖 Yerel AI Kurulum Sihirbazı (Ollama)
- ISO içine `/usr/local/bin/ankora-ollama-install` yardımcısı eklendi (GitHub resmî `ollama-linux-amd64.tgz` + sha256 doğrulama, `/usr/local` kurulum, **SysVinit `ollama` servisi** otomatik etkinleştirme).
- AI Ayarları → "Yerel Modeller (Ollama)" bölümüne **"Ollama'yı Kur"** düğmesi (offline görünür, kurulum sonrası servis denetlenip model listesi yüklenir).
- **Varsayılan model** `qwen2.5:0.5b` öneri listesine eklendi (4 GB ve altı RAM için optimize).
- Önerilen modeller: `qwen2.5:0.5b` (398 MB), `qwen2.5-coder:1.5b` (986 MB), `llama3.2:1b` (1.3 GB), `gemma2:2b` (1.6 GB).

### ⚡ ZRAM Desteği (Eco RAM+)
- 4 GB altı bellekli cihazlarda açılışta otomatik `lz4`/`zstd` sıkıştırmalı ZRAM takas havuzu (`ayaz-session`, `xinitrc`, `build-iso` entegrasyonu).
- *Not: Init scripti henüz RAM eşiğini gözetmiyor (boyut politikası init=RAM/2, session=RAM); 4.5.1'de iyileştirilecek.*

### 📦 Görsel Paket Yükleyici (.deb + .AppImage)
- Çift tıklanan `.deb` / `.AppImage` dosyaları için **win-pkg-installer** grafik arayüzü.
- **Backend IPC**: `inspect_package_file` (meta: ad, sürüm, mimari, boyut, **bağımlılıklar Depends**), `install_local_deb_package`, `install_appimage`.
- Kurulum öncesi bağımlılık listesi gösterilir; hata ayrıntısı pencere içi `<pre>` kutusunda okunur (toast yerine).
- **AppImage kalıcı kurulum**: `~/.local/bin` kopyası + `0755` + `~/.local/share/applications/*.desktop` menü girişi; ikinci tık "Uygulamayı Başlat".

### 🩺 Sistem Doktoru Eylemi
- Ankora AI mini popover'ına "Sistem Doktoru" hızlı çipi.
- `ankora-doctor` raporuyla sistem sorunlarını analiz edip **tek tıkla güvenli onarım onay kartı** sunar.

### 🔧 İkon Çözümleyici ve Yüzler Düzeltmeleri
- **IconResolver**: Eksik `getIconSvg` metodu, menu/taskbar pin ikon yükseltmeleri, doğrudan alias eşlemeleri (`files`→`org.gnome.Nautilus`, `terminal`→`utilities-terminal`, vb.).
- **Yüz 3 (Bostan) / Yüz 8 (Cıvata)**: Dev saat hero alanında canlı hava durumu senkronizasyonu.
- **🐛 DÜZELTME**: Bakır/Bostan panellerinde görev çubuğuna uygulama sabitlendiğinde ikon **devasa/bozuk görünüyordu** — nedeni: pin kaydı yalnız `id/name/exec` taşıyor, gerçek ikon yükseltmesi 512 px SVG/PNG gelince 34×32 px düğmeyi aşıyordu.
  - `AppPinManager.toggleTaskbarPin` artık tam kayıt (`icon/exec/cat/deb/flatpak`) yazar; yeniden çizimde yer tutucu yerine uygulamanın kendi glifi gelir.
  - Panel pin düğmesi: `.taskbar-pin-icon` sarmalayıcı, `max-width/height: 17px`, `object-fit: contain` — 512 px ikon bile 17×17 kutuda kalır.
  - Yüz 2/3 dock: `.face-dock-app img/.real-app-icon` → `max 22×22` / `20×20` px.
  - Başlat menüsü sabitleme kartı: `.pinned-icon-box .real-app-icon` → `max 22×22` px.
  - Headless regression testleri eklendi (`scratch/test_ui_comprehensive.py`).

---

## 4.0.1 (2026-10-29)
...
## 4.0.1 (2026-10-29)
- Siyah Ekran Güvencesi: Canlı oturumda masaüstü (`ayaz`) başlatılamazsa ekran artık sessiz siyah kalmıyor. Hata günlüğü `/tmp/ayaz.log` dosyasına yazılıp xterm penceresinde son 60 satır gösteriliyor ve kabuk açılıyor. Otomatik `startx` yeniden deneme döngüsü `/tmp/ankora-desktop-failed` işaretiyle kırılıyor; kullanıcı `rm /tmp/ankora-desktop-failed && startx` ile bilinçli olarak yeniden deniyor.
- VT Kaçışı: tty1 otomatik girişinde `startx -- -keeptty` yerine `startx` kullanılıyor. Önceki davranışta siyah ekranda kalan kullanıcı Ctrl+Alt+F2 ile metin konsoluna geçemiyordu.
- Ses Sunucusu: `pulseaudio --start` arka planda başlatılıyor; ses sunucusu takılsa bile oturum başlatmayı bloklamıyor.
- Sanal Makine Notu: VirtualBox'ta VMSVGA + 16 MB VRAM birleşiminde sanal GPU kilitlenmesi (guest %0 CPU, ACPI yanıtsız) gözlendi. Önerilen ayar VBoxSVGA veya VMSVGA + VRAM ≥ 64 MB, 3D kapalı. Kurtarma için GRUB "Güvenli Mod (Failsafe)" (`nomodeset`) girdisi kullanılabilir.

## 4.0.0 (2026-10-29)
- Sanal Makine ve Fiziksel Donanım Ekran Çizim Düzeltmesi (Siyah Ekran Çözümü): WebKitGTK 2.40/2.50+ sürümlerinde sanal makine ve düşük donanım ortamlarında boş/siyah ekrana neden olan tüm engeller giderildi: Sanal makine (VirtualBox, QEMU, KVM, VMware) DMI tespiti ile otomatik `LIBGL_ALWAYS_SOFTWARE=1` ve yazılımsal rasterizer (llvmpipe) devreye alındı, fiziksel GPU'larda (Intel, AMD, Nvidia) tam donanım hızlandırması korundu; WebKitWebProcess sandbox çökmesini engelleyen `WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1` ve `kernel.unprivileged_userns_clone=1` eklendi; bubblewrap ve xdg-dbus-proxy chroot paketlerine dahil edildi; pencere boyutu tam ekran ekran geometrisi ile Openbox öncesi garantiye alındı; yerel dosya ve WebKit CSP'sine `file:` şeması entegre edildi. Kurulum aracı 4.0 damgasıyla güncellendi.
- Cumhuriyet Teması (29 Ekim özel): Bayrak kırmızısı zeminli, ay-yıldız beyazı metinli koyu tema; eşleşen vektörel duvar kağıdı ve tema seçici kartı ile birlikte gelir. Monokrom cam tasarım sisteminin palet varyantıdır.
- Güvenlik Sertleştirmeleri: 14 tarama bulgusu kapatıldı — kilit ekranı girişim sınırlayıcı ve tek kullanımlık kilit açma yetkisi (30 sn), pano sızıntısının kilitliyken engellenmesi, sembolik bağ üzerine yazma ataklarının durdurulması, polkit ajan denetimli pkexec geçidi, IPC'de Origin + 256-bit token + zaman-sabitli karşılaştırma + 50 denemede kalıcı blok, komut yürütmede katmanlı beyaz liste, çıktı boyutu DoS sınırları, MEB sertifikasına CA:TRUE Basic Constraints doğrulaması, CSP sıkılaştırması (object-src 'none').
- Bağımlılık Güvenliği: reqwest 0.12'ye yükseltildi; h2 (RUSTSEC-2026-0258, unbounded empty DATA frames DoS) kapatıldı. cargo-audit taramasında açık sayısı 0.
- USB Başlatma Güvencesi: Hibrit ISO derlemesinin sessiz CD-only fallback'i kaldırıldı; isohdpfx MBR eksikse veya hibrit xorriso adımı başarısızsa derleme açık hatayla durur. Derleme sonunda xorriso report_system_area ile isohybrid MBR + UEFI gpt-basdat bayrakları otomatik doğrulanır. UEFI efi.img mtools yokluğunda boş üretilemez (fatal). README'ye USB'ye yazdırma talimatı eklendi.
- boot.cfg spor adımları: early-bios.cfg aramasına --no-floppy eklendi; sürüm dizgeleri CARGO_PKG_VERSION'dan türetildi (4.0.0'dan itibaren otomatik).
## 3.7.0 (2026-10-28)
- Dinamik Ada (Ayaz Dynamic Island): Ekranın üst-ortasında akıcı cam kapsül; bildirimler, indirme ilerlemesi, AI işlem nabzı ve canlı CPU/RAM göstergesiyle sistemi yormayan dinamik durum alanı; Ayarlar'dan açılıp kapatılabilir
- Fatih Kalem 2 Entegrasyonu: Etkileşimli akıllı tahta ve ekran çizim/not alma kalemi sisteme entegre edildi; Dinamik Ada kontrol kartından, Yazılım Mağazasından ve Başlat menüsünden tek tıkla başlatılabilir
- Ankora Mağaza (Yazılım Merkezi): Modern cam tasarım sistemi ile baştan aşağı yenilendi; paket kaynak rozetleri (Flathub, APT, Sistem), vitrin hero alanı, akıcı hover geçişleri ve yüksek kontrastlı kurulum butonları eklendi
- Masaüstü Kategori Klasörleri: Android/iOS benzeri 2x2 mini önizleme karoları, modern overlay pencere görünümü, uygulamayı klasör üzerine sürükleyerek gruplama, sağ tık seçenekleri ve tek tıkla masaüstüne çıkarma (eject) desteği
- Canlı Hava Durumu Widget'ı: Open-Meteo entegrasyonu (API anahtarsız), 3 günlük tahmin şeridi, anlık şehir arama, yerel önbellek, anlık yenileme düğmesi ve 15 dakikalık periyodik otomatik güncelleme
- Açılışta Kilit Güvenliği: Ayarlar üzerinden açılıp kapatılabilen, PIN ayarlandığında sistem açılışında otomatik devreye giren kilit ekranı koruması
- AI Sistem Asistanı & Görev Çubuğu Mini Sohbeti: Gemini düzeninde avatar+gövde satırları, görev çubuğu üzerinde cam mini AI sohbet balonu, ekrandan anlık görüntü alarak analiz eden "Bak ve Anlat" vizyon gözü, balona dosya bırakma (özetleme/kod analizi) ve Günün Planı widget'ı
- MEB Okul Sertifikası Tam Temizleme: `mebcert-remove` betiği ve arayüz IPC entegrasyonu ile kök sertifikanın sistem ve tarayıcı NSS depolarından eksiksiz kaldırılması
- Tembel Render Düzeltmesi: Kapatılan pencereler 30 sn sonra DOM'dan çıkarıldığında yeniden açılamama sorunu giderildi
- 16 IPC Komutu Eşitlemesi: Canlı ISO kabuğu ve Rust çekirdeğine eksik komutlar (dosya izinleri, sembolik bağlar, kullanıcı yönetimi, depolama sorguları) eklendi
- Güvenlik ve Kimlik Kasası: AI sağlayıcı anahtarları ve hassas veriler Rust tarafındaki şifreli kasaya taşındı; snapshot yedek izinleri 0700/0600 olarak sıkılaştırıldı
- Dağıtım ve Güncelleyici: GitHub Release iş akışına `ayaz-de-latest-amd64.deb` paketi dahil edildi; Ayaz DE tespiti kilidi ile güncelleme doğrulaması güvenli hale getirildi
## 3.6.0 (2026-10-25)
- Düşük RAM (< 4 GB) sistemlerde Eco RAM Modu ilk açılışta varsayılan açık (kullanıcı tercihi yoksa)
- Tembel render: kapatılan pencere 30 sn sonra DOM'dan çıkarılır, iframe kaynakları boşaltılır; yeniden açılışta geri takılır
- Görev çubuğu / başlat menüsü cam zemini ve masaüstü zemini tema değişkenlerine bağlandı
- Yeni temalar: Çınar, Meltem, Kor, Dem, Boğaz; her biri eşleşen duvar kağıdı + ikon seti + vurgu paketiyle
- Duvar kağıdı sayısı 13'e çıktı; tema seçici paketleri Ayarlar'dan tek tıkla değişiyor

## 3.5.0 (2026-10-24)
- Ayaz DE: dosya yöneticisi sağ-tık menüsü, menü çubuğu (Dosya/Düzen/Görünüm), kopyala-yapıştır canlı ilerleme, özellikler/izinler, yazdırma ve "şuraya kopyala"
- Uygulama sabitleme: Başlat menüsüne Sabitle, Araç Çubuna Ekle, Masaüstüne Ekle, Kaldır (sağ tık)
- Güncelleyici repo hedefi düzeltildi (eski 3.4.0 kurulumları 3.5'i görebilir)
- Kapatma/Yeniden Başlatma: sudo NOPASSWD + loginctl polkit zinciri (root şifresi gerekmez)
- Removable/dahili disklerin dosya yöneticisinde görünmesi (udisks otomatik bağlama)
- Aktif oturum kullanıcısı tespit düzeltmesi (SUDO_USER fallback)
- Düşük çözünürlükte Başlat menüsü taşma düzeltmesi
- Repo altyapısı: CI, şablonlar, Dependabot, BUILD-ISO dinamik sürüm

## 3.4.0 (2026-10-20)
- Ayaz DE 3.4: tam sistem teması, bildirim/disk/kullanıcı/apt düzeltmeleri
- Uygulama menüsü düzenleyici, simge sıralama, 8 ikon seti
- RAM optimizasyonu; ISO doğrulama toplamı (SHA256SUMS-3.4.txt)

## 3.3.0 (2026-10-19)
- AI asistan geliştirmeleri, güvenlik sıkılaştırmaları ve sistem onarımları
- Ayaz Güncelleyici: GitHub Releases tabanlı güncelleme kanalı

## 3.2.0 (2026-10-19)
- Sürüm damgaları tutarlılaştırıldı; paketleme akışı düzeltildi

## 3.1.0 (2026-10-18)
- Gerçek donanım açılışı + Wi-Fi firmware kapsama

## 2.0.9 (2026-10-17)
- GRUB menü regresyonu düzeltmesi + kurtarma noktası yetki hatası

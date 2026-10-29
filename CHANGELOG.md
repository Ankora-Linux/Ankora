# Ankora Linux — Sürüm Notları

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

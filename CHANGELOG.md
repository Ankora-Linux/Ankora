# Ankora Linux — Sürüm Notları

## 3.7.0 (2026-10-26)
- Tembel render pencere açılış hatası düzeltildi: 30 sn sonra sökülen pencereler sorunsuz yeniden açılıyor
- 16 IPC komutu Canlı ISO kabuğuna ve Rust çekirdeğine eşitlendi (Dosya Yöneticisi kopyalama, izinler, sembolik bağlar, kullanıcı yönetimi)
- Nordik Açık (theme-light) ve koyu temalarda görev çubuğu/başlat menüsü cam kontrastı ve renk geçişleri düzeltildi
- Sistem kapatma/yeniden başlatma düğmeleri onaylı diyaloğa bağlandı; ani kapanma engellendi
- USB yazdırıcı (Flasher) ve biçimlendiricideki çökme ve güvenlik açıkları giderildi; sistem diskleri korumaya alındı
- Kurtarma noktaları (snapshot) izinleri 0700/0600 olarak sıkılaştırıldı; hassas dosya ifşası önlendi
- MEB okul ağı kök sertifikası kurulumu tarayıcı NSS veritabanlarıyla tam uyumlu hale getirildi
- ETA dokunmatik sürücüsünde dizüstü touchpad çakışması önlendi ve kalibrasyon koruması eklendi
- Ankora Doctor aracı terminalden ve AI ajanından tam yetkiyle onarım yapacak şekilde güncellendi
- Ayaz Güncelleyici indirme ve doğrulama boru hattı GitHub Releases ile tam uyumlu hale getirildi
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

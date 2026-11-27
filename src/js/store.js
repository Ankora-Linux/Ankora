// Ayaz DE Modülü: store.js
// Ankora Yazılım Mağazası kataloğu ve paket yönetimi
(() => {
  'use strict';

  // ============================================================================
  // 3. YAZILIM MAĞAZASI (GERÇEK DEBIAN .DEB & XDG ENTEGRASYONU)
  // ============================================================================
  const StoreManager = {
    packages: [
      // 0. FLATHUB MODERN UYGULAMALAR (SANDBOX)
      { id: 'flatpak-spotify', name: 'Spotify Müzik & Podcast', flatpak: 'com.spotify.Client', desc: 'Milyonlarca şarkı, albüm ve podcast dinleme akış platformu', cat: 'media', size: '180 MB', featured: true, installed: false },
      { id: 'flatpak-discord', name: 'Discord Sesli & Yazılı Sohbet', flatpak: 'com.discordapp.Discord', desc: 'Oyuncular ve topluluklar için kristal netliğinde sesli ve yazılı iletişim', cat: 'net', size: '120 MB', installed: false },
      { id: 'flatpak-vscode', name: 'Visual Studio Code IDE', flatpak: 'com.visualstudio.code', desc: 'Gelişmiş eklenti ve hata ayıklama destekli modern kod editörü', cat: 'dev', size: '240 MB', featured: true, installed: false },
      { id: 'flatpak-telegram', name: 'Telegram Desktop', flatpak: 'org.telegram.desktop', desc: 'Hızlı, şifreli ve senkronize bulut mesajlaşma istemcisi', cat: 'net', size: '85 MB', featured: true, installed: false },
      { id: 'flatpak-heroic', name: 'Heroic Games Launcher (Epic & GOG)', flatpak: 'com.heroicgameslauncher.hgl', desc: 'Epic Games ve GOG kütüphaneleri için açık kaynak Linux başlatıcı', cat: 'util', size: '110 MB', installed: false },
      { id: 'flatpak-lutris', name: 'Lutris Açık Oyun Yöneticisi', flatpak: 'net.lutris.Lutris', desc: 'Tüm emülatör, Windows ve Linux oyunlarını tek çatıda toplayan kütüphane', cat: 'util', size: '95 MB', installed: false },
      { id: 'flatpak-onlyoffice', name: 'ONLYOFFICE Desktop Editors', flatpak: 'org.onlyoffice.desktopeditors', desc: 'Microsoft Office belgeleriyle %100 uyumlu modern ofis paketi', cat: 'office', size: '320 MB', installed: false },
      { id: 'flatpak-obsidian', name: 'Obsidian Not & Bilgi Tabanı', flatpak: 'md.obsidian.Obsidian', desc: 'Markdown tabanlı, bağlantılı ikinci beyin ve kişisel not bankası', cat: 'office', size: '130 MB', installed: false },
      { id: 'flatpak-zoom', name: 'Zoom Video Konferans', flatpak: 'us.zoom.Zoom', desc: 'Ders, toplantı ve görüntülü görüşme için resmî Zoom masaüstü istemcisi', cat: 'net', size: '260 MB', installed: false },

      // 1. POPÜLER & TEMEL UYGULAMALAR (FLAGSHIP)
      { id: 'firefox-esr', name: 'Firefox ESR Web Tarayıcısı', deb: 'firefox-esr', desc: 'Mozilla güvenli, gizlilik odaklı ve hızlı web tarayıcısı', cat: 'net', size: '78 MB', featured: true, installed: false },
      { id: 'chromium', name: 'Chromium Web Tarayıcı', deb: 'chromium', desc: 'Google açık kaynak motorlu yüksek performanslı modern tarayıcı', cat: 'net', size: '124 MB', featured: true, installed: false },
      { id: 'vlc', name: 'VLC Media Player', deb: 'vlc', desc: 'Tüm ses ve video formatlarını sorunsuz oynatan evrensel medya oynatıcısı', cat: 'media', size: '64 MB', featured: true, installed: false },
      { id: 'mpv', name: 'MPV Video Oynatıcı', deb: 'mpv', desc: 'Donanım hızlandırmalı, düşük sistem kaynağı tüketen minimalist oynatıcı', cat: 'media', size: '22 MB', installed: false },
      { id: 'gimp', name: 'GIMP Profesyonel Görsel Düzenleyici', deb: 'gimp', desc: 'Katman, fırça ve filtre destekli açık kaynak Photoshop alternatifi', cat: 'graphics', size: '112 MB', installed: false },
      { id: 'inkscape', name: 'Inkscape Vektörel Çizim & İllüstrasyon', deb: 'inkscape', desc: 'SVG standartlarında profesyonel vektör grafik ve logo tasarım stüdyosu', cat: 'graphics', size: '98 MB', installed: false },
      { id: 'blender', name: 'Blender 3D Modelleme & Animasyon', deb: 'blender', desc: 'Endüstri standardı 3D modelleme, render, VFX ve animasyon paketi', cat: 'graphics', size: '310 MB', installed: false },
      { id: 'libreoffice', name: 'LibreOffice Eksiksiz Ofis Paketi', deb: 'libreoffice', desc: 'Kelime işlemci (Writer), hesap tablosu (Calc) ve sunum (Impress)', cat: 'office', size: '340 MB', featured: true, installed: false },
      { id: 'audacity', name: 'Audacity Ses Kayıt & Düzenleyici', deb: 'audacity', desc: 'Çok kanallı profesyonel podcast, müzik ve ses düzenleme aracı', cat: 'media', size: '42 MB', installed: false },
      { id: 'obs-studio', name: 'OBS Studio Canlı Yayın & Ekran Kaydedici', deb: 'obs-studio', desc: 'YouTube/Twitch canlı yayın ve ekran yakalama yazılımı', cat: 'media', size: '92 MB', installed: false },
      { id: 'kdenlive', name: 'Kdenlive Video Kurgu & Montaj', deb: 'kdenlive', desc: 'Çok kanallı profesyonel zaman çizelgeli video montaj stüdyosu', cat: 'media', size: '115 MB', installed: false },
      { id: 'geany', name: 'Geany Hafif Kod Editörü & IDE', deb: 'geany', desc: 'Hızlı açılan, sözdizimi renklendirmeli ve derleme destekli kod editörü', cat: 'dev', size: '14 MB', installed: false },
      { id: 'gparted', name: 'GParted Disk & Bölüm Yöneticisi', deb: 'gparted', desc: 'Sabit disk ve USB bölümlerini görsel olarak biçimlendirme ve boyutlandırma', cat: 'sys', size: '24 MB', installed: false },
      { id: 'transmission-gtk', name: 'Transmission Torrent İndirici', deb: 'transmission-gtk', desc: 'Sistemi yormayan sade ve güvenli BitTorrent istemcisi', cat: 'net', size: '10 MB', installed: false },
      { id: 'filezilla', name: 'FileZilla FTP/SFTP İstemcisi', deb: 'filezilla', desc: 'Sunuculara güvenli dosya yükleme ve indirme arayüzü', cat: 'net', size: '16 MB', installed: false },
      { id: 'flameshot', name: 'Flameshot Gelişmiş Ekran Görüntüsü', deb: 'flameshot', desc: 'Ekran kesiti alıp ok, metin ve bulanıklık ekleyen pratik araç', cat: 'graphics', size: '18 MB', installed: false },
      { id: 'evince', name: 'Evince PDF & Belge Okuyucu', deb: 'evince', desc: 'PDF, PostScript ve e-kitapları anında açan hafif görüntüleyici', cat: 'office', size: '18 MB', featured: true, installed: false },
      { id: 'htop', name: 'Htop Renkli Süreç Monitörü', deb: 'htop', desc: 'İşlemci çekirdekleri, bellek ve çalışan süreçleri canlı izleme', cat: 'sys', size: '2 MB', installed: false },
      { id: 'btop', name: 'Btop Zengin Donanım Monitörü', deb: 'btop', desc: 'Modern görsel grafiklerle donanım yükünü gösteren monitör', cat: 'sys', size: '6 MB', installed: false },
      { id: 'git', name: 'Git Kaynak Kod Sürüm Kontrolü', deb: 'git', desc: 'Yazılım geliştiriciler için endüstri standardı kod versiyon kontrol sistemi', cat: 'dev', size: '36 MB', installed: false },
      { id: 'python3', name: 'Python 3 Programlama Dili', deb: 'python3', desc: 'Modern yapay zeka, veri analitiği ve otomasyon dili', cat: 'dev', size: '16 MB', installed: false },
      { id: 'p7zip-full', name: '7-Zip Yüksek Sıkıştırmalı Arşivleyici', deb: '7zip', desc: 'ZIP, 7z, TAR ve RAR arşivlerini açma ve sıkıştırma aracı', cat: 'util', size: '5 MB', installed: false },
      { id: 'brave', name: 'Brave Hızlı & Gizli Tarayıcı', deb: 'brave-browser', vendor: 'brave', desc: 'Reklam ve izleyici engelleyicisi yerleşik; resmî deposundan kurulur', cat: 'net', size: '150 MB', featured: true, installed: false },
      { id: 'helium', name: 'Helium Hafif Web Tarayıcı', deb: 'helium-bin', vendor: 'helium', desc: 'ungoogle-chromium temelli, gizlilik odaklı hafif masaüstü tarayıcısı', cat: 'net', size: '130 MB', installed: false },
      { id: 'timeshift', name: 'Timeshift Sistem Yedekleme & Anlık Görüntü', deb: 'timeshift', desc: 'Sistem kararsızlığına karşı tek tıkla geri dönüş ve kurtarma noktası oluşturucu', cat: 'sys', size: '15 MB', installed: false },
      { id: 'steam', name: 'Steam Dijital Oyun Platformu', flatpak: 'com.valvesoftware.Steam', desc: 'Valve resmi Linux oyun mağazası, Proton ve topluluk kütüphanesi', cat: 'util', size: '350 MB', installed: false },
      { id: 'wine', name: 'Wine Windows Uyumluluk Katmanı', deb: 'wine', desc: 'Windows programlarını ve oyunlarını emülasyonsuz yerel hızda çalıştırma', cat: 'util', size: '140 MB', installed: false },
      { id: 'fastfetch', name: 'Fastfetch Sistem Bilgi Kartı', deb: 'fastfetch', desc: 'Terminal açılışında dağıtım logosu ve donanım özetini gösteren modern hızlı araç', cat: 'sys', size: '2 MB', installed: false },
      { id: 'antigravity', name: 'Antigravity Yapay Zekâ IDE', deb: 'antigravity', vendor: 'antigravity', desc: 'Google’ın ajan öncesi dönem için tasarladığı ajan destekli kod editörü', cat: 'dev', size: '420 MB', installed: false },
      { id: 'opencode-desktop', name: 'OpenCode Masaüstü (AI Kod Ajanı)', deb: '', extUrl: 'https://opencode.ai', desc: 'Terminal, masaüstü ve IDE eklentisi olarak çalışan açık kaynak yapay zekâ kod ajanı', cat: 'dev', size: 'Site', installed: false },

      // 1b. OKUL & EĞİTİM (sınıfta doğrudan işe yarar)
      { id: 'fatih-kalem', name: 'Fatih Kalem 2 (Akıllı Tahta)', deb: 'fatih-kalem', desc: 'Etkileşimli tahtalar için ekran kalemi; ekrandaki her şeyin üzerine çizim, ders notu ve vurgu yapma aracı', cat: 'office', school: true, size: '2 MB', featured: true, installed: false },
      { id: 'meb-cert', name: 'MEB Okul Ağı Sertifikası', action: 'meb-cert', desc: 'Okul internetindeki güvenlik uyarılarını bitirir; resmi MEB adresinden indirip sistem ve tarayıcı güven deposuna kurar', cat: 'net', school: true, size: '1 MB', featured: true, installed: false },
      { id: 'scratch', name: 'Scratch 3 (Güncel Sürüm)', flatpak: 'edu.mit.Scratch', desc: 'Blok tabanlı kodlama ile oyun ve animasyon yapmayı öğreten güncel Scratch masaüstü sürümü', cat: 'dev', school: true, size: '180 MB', featured: true, installed: false },
      { id: 'gcompris', name: 'GCompris Eğitim Paketi', deb: 'gcompris-qt', desc: '2-10 yaş için 100ü aşkın eğitsel etkinlik: okuma, matematik, fen ve bilgisayar kullanımı', cat: 'util', school: true, size: '95 MB', featured: true, installed: false },
      { id: 'tuxmath', name: 'TuxMath Matematik Oyunu', deb: 'tuxmath', desc: 'Dört işlemi arcade oyunuyla öğreten eğlenceli matematik alıştırması', cat: 'util', school: true, size: '18 MB', installed: false },
      { id: 'stellarium', name: 'Stellarium planetaryumu', deb: 'stellarium', desc: 'Fen ve astronomi dersleri için gerçek zamanlı gökyüzü ve gezegen simülasyonu', cat: 'graphics', school: true, size: '110 MB', installed: false },
      { id: 'geogebra', name: 'GeoGebra Matematik', flatpak: 'org.geogebra.GeoGebra', desc: 'Geometri, cebir ve grafik çizimleri için ders standardı etkileşimli matematik aracı', cat: 'office', school: true, size: '120 MB', installed: false },
      { id: 'tuxtype', name: 'TuxTyping Klavye Öğretmeni', deb: 'tuxtype', desc: 'On parmak hızlı yazmayı oyunla öğreten klavye alıştırma programı', cat: 'util', school: true, size: '22 MB', installed: false },


      // 2. ORTAM & MEDYA (MEDIA)
      { id: 'handbrake', name: 'HandBrake Video Dönüştürücü', deb: 'handbrake', desc: 'Videoları optimize edilmiş modern biçimlere (H.264, H.265, AV1) dönüştürücü', cat: 'media', size: '36 MB', installed: false },
      { id: 'ffmpeg', name: 'FFmpeg Multimedya Çatısı', deb: 'ffmpeg', desc: 'Her türlü ses ve video biçimini çözme, kodlama ve dönüştürme kiti', cat: 'media', size: '48 MB', installed: false },
      { id: 'sox', name: 'SoX Ses İşleme Çatısı', deb: 'sox', desc: 'Ses dosyalarını dönüştürme ve efekt uygulama komut satırı isviçre çakısı', cat: 'media', size: '6 MB', installed: false },
      { id: 'rhythmbox', name: 'Rhythmbox Müzik Çalar', deb: 'rhythmbox', desc: 'Müzik koleksiyonu yönetimi, internet radyoları ve podcast oynatıcısı', cat: 'media', size: '28 MB', installed: false },
      { id: 'clementine', name: 'Clementine Müzik Çalar', deb: 'clementine', desc: 'Hızlı arama ve zengin müzik arşivi düzenleme yetenekli çalar', cat: 'media', size: '34 MB', installed: false },
      { id: 'audacious', name: 'Audacious Hafif Müzik Çalar', deb: 'audacious', desc: 'Winamp benzeri arayüzü ve düşük RAM kullanımıyla bilinen ses oynatıcı', cat: 'media', size: '12 MB', installed: false },
      { id: 'shotcut', name: 'Shotcut Video Editörü', deb: 'shotcut', desc: '4K destekli, çok formatlı timeline video montaj yazılımı', cat: 'media', size: '86 MB', installed: false },
      { id: 'peek', name: 'Peek GIF Kaydedici', deb: 'peek', desc: 'Seçili masaüstü alanını anında yüksek kaliteli animasyonlu GIF olarak kaydetme', cat: 'media', size: '8 MB', installed: false },
      { id: 'flac', name: 'FLAC Kayıpsız Ses Kodlayıcı', deb: 'flac', desc: 'Stüdyo kalitesinde kayıpsız ses sıkıştırma araç kiti', cat: 'media', size: '3 MB', installed: false },
      { id: 'vorbis-tools', name: 'Ogg Vorbis Ses Araçları', deb: 'vorbis-tools', desc: 'Ogg formatında ses kodlama, etiketleme ve oynatma araçları', cat: 'media', size: '4 MB', installed: false },

      // 3. GRAFİK & TASARIM (GRAPHICS)
      { id: 'krita', name: 'Krita Dijital Boyama', deb: 'krita', desc: 'İllüstratörler ve konsept sanatçıları için çizim ve doku fırçaları', cat: 'graphics', size: '140 MB', installed: false },
      { id: 'darktable', name: 'Darktable Fotoğraf İşleme', deb: 'darktable', desc: 'Fotoğrafçılar için profesyonel RAW görüntü geliştirme ve kataloglama', cat: 'graphics', size: '64 MB', installed: false },
      { id: 'rawtherapee', name: 'RawTherapee RAW Geliştirici', deb: 'rawtherapee', desc: 'Yüksek bit derinliğinde tahribatsız RAW fotoğraf renk laboratuvarı', cat: 'graphics', size: '52 MB', installed: false },
      { id: 'imagemagick', name: 'ImageMagick Görsel Kiti', deb: 'imagemagick', desc: 'Toplu resim boyutlandırma, dönüştürme ve işleme komut satırı aracı', cat: 'graphics', size: '36 MB', installed: false },
      { id: 'graphviz', name: 'Graphviz Grafik Çizici', deb: 'graphviz', desc: 'DOT dili ile ağ şemaları, algoritmik diyagramlar ve soy ağaçları çizme', cat: 'graphics', size: '14 MB', installed: false },
      { id: 'scrot', name: 'Scrot Ekran Yakalayıcı', deb: 'scrot', desc: 'X11 ekran görüntüsü alma komut satırı aracı', cat: 'graphics', size: '1 MB', installed: false },
      { id: 'feh', name: 'Feh Hafif Resim Görüntüleyici', deb: 'feh', desc: 'Düşük bellek tüketen hızlı fotoğraf slayt ve masaüstü aracı', cat: 'graphics', size: '3 MB', installed: false },
      { id: 'viewnior', name: 'Viewnior Hızlı Görsel Görüntüleyici', deb: 'viewnior', desc: 'Zarif ve sade GTK fotoğraf albümü görüntüleyicisi', cat: 'graphics', size: '4 MB', installed: false },
      { id: 'dia', name: 'Dia Teknik Diyagram Çizici', deb: 'dia', desc: 'UML, elektronik devre ve ağ mimarisi çizim yazılımı', cat: 'graphics', size: '26 MB', installed: false },
      { id: 'mypaint', name: 'MyPaint Dijital Eskiz', deb: 'mypaint', desc: 'Basınca duyarlı sonsuz tuval eskiz ve fırça simülasyonu', cat: 'graphics', size: '30 MB', installed: false },

      // 4. AĞ & İNTERNET (NET)
      { id: 'thunderbird', name: 'Thunderbird E-Posta İstemcisi', deb: 'thunderbird', desc: 'E-posta, takvim, adres defteri ve RSS besleme yöneticisi', cat: 'net', size: '82 MB', installed: false },
      { id: 'qbittorrent', name: 'qBittorrent İndirme Yöneticisi', deb: 'qbittorrent', desc: 'Reklamsız, açık kaynaklı, hafif BitTorrent dosya paylaşım istemcisi', cat: 'net', size: '28 MB', installed: false },
      { id: 'curl', name: 'cURL Veri Aktarım Aracı', deb: 'curl', desc: 'HTTP, HTTPS, FTP ve onlarca protokol üzerinden veri çekme aracı', cat: 'net', size: '4 MB', installed: false },
      { id: 'wget', name: 'Wget Ağ İndiricisi', deb: 'wget', desc: 'Web sitelerinden dosya ve ayna indirme komut satırı aracı', cat: 'net', size: '3 MB', installed: false },
      { id: 'aria2', name: 'Aria2 Hızlı İndirici', deb: 'aria2', desc: 'Çoklu bağlantı ve parçalı yüksek hızlı indirme motoru', cat: 'net', size: '6 MB', installed: false },
      { id: 'nmap', name: 'Nmap Ağ Güvenlik Tarayıcısı', deb: 'nmap', desc: 'Ağ keşfi, port tarama ve güvenlik açıklarını teftiş etme aracı', cat: 'net', size: '28 MB', installed: false },
      { id: 'wireshark', name: 'Wireshark Paket Analizörü', deb: 'wireshark', desc: 'Canlı ağ trafiğini yakalayan ve protokol seviyesinde analiz eden araç', cat: 'net', size: '62 MB', installed: false },
      { id: 'tcpdump', name: 'Tcpdump Ağ Dinleyici', deb: 'tcpdump', desc: 'Komut satırında paket başlıklarını yakalayıp filtreleme aracı', cat: 'net', size: '3 MB', installed: false },
      { id: 'netcat-openbsd', name: 'Netcat Ağ Soket Aracı', deb: 'netcat-openbsd', desc: 'TCP ve UDP soketleri üzerinden doğrudan veri okuma ve yazma', cat: 'net', size: '1 MB', installed: false },
      { id: 'iperf3', name: 'iPerf3 Bant Genişliği Testi', deb: 'iperf3', desc: 'Ağ verimini ve maksimum TCP/UDP bant genişliğini ölçen araç', cat: 'net', size: '2 MB', installed: false },
      { id: 'whois', name: 'Whois Sorgulayıcı', deb: 'whois', desc: 'Alan adı ve IP bloğu tescil kayıtlarını RFC standardında sorgulama', cat: 'net', size: '1 MB', installed: false },
      { id: 'mtr-tiny', name: 'MTR Ağ Tanı Aracı', deb: 'mtr-tiny', desc: 'Ping ve traceroute yeteneklerini tek raporda birleştiren teşhis aracı', cat: 'net', size: '2 MB', installed: false },
      { id: 'dnsutils', name: 'DNS Araçları (Dig / Nslookup)', deb: 'bind9-dnsutils', desc: 'Alan adı sunucusu kayıtlarını ayrıntılı sorgulama ve test kiti', cat: 'net', size: '4 MB', installed: false },
      { id: 'openssh-client', name: 'OpenSSH Güvenli Kabuk İstemcisi', deb: 'openssh-client', desc: 'Uzak sunuculara şifreli terminal erişimi ve tünelleme', cat: 'net', size: '8 MB', installed: false },

      // 5. OFİS & ÜRETKENLİK (OFFICE)
      { id: 'libreoffice-writer', name: 'LibreOffice Writer', deb: 'libreoffice-writer', desc: 'DOCX ve ODT belgeleri için profesyonel kelime işlemci', cat: 'office', size: '88 MB', installed: false },
      { id: 'libreoffice-calc', name: 'LibreOffice Calc', deb: 'libreoffice-calc', desc: 'XLSX ve ODS tabloları için gelişmiş formül ve grafik hesap tablosu', cat: 'office', size: '76 MB', installed: false },
      { id: 'libreoffice-impress', name: 'LibreOffice Impress', deb: 'libreoffice-impress', desc: 'Etkileyici görsel geçişlere sahip sunum hazırlama yazılımı', cat: 'office', size: '54 MB', installed: false },
      { id: 'zathura', name: 'Zathura Minimalist PDF Okuyucu', deb: 'zathura', desc: 'Vim klavye kısayollarına sahip düşük bellek tüketen PDF okuyucu', cat: 'office', size: '6 MB', installed: false },
      { id: 'calibre', name: 'Calibre E-Kitap Yöneticisi', deb: 'calibre', desc: 'EPUB, MOBI ve PDF kütüphane arşivi ve format dönüştürücüsü', cat: 'office', size: '110 MB', installed: false },
      { id: 'xournalpp', name: 'Xournal++ Not Alma & El Yazısı', deb: 'xournalpp', desc: 'Kalem desteği ile PDF üzerine çizim ve serbest el yazısı not aracı', cat: 'office', size: '24 MB', featured: true, installed: false },
      { id: 'tesseract-ocr', name: 'Tesseract OCR Optik Karakter Tanıma', deb: 'tesseract-ocr', desc: 'Taranan görsel ve resimlerden metinleri otomatik çıkaran yapay zeka aracı', cat: 'office', size: '32 MB', installed: false },
      { id: 'pandoc', name: 'Pandoc Evrensel Belge Dönüştürücü', deb: 'pandoc', desc: 'Markdown, LaTeX, DOCX, HTML ve PDF arasında biçim dönüştürme', cat: 'office', size: '44 MB', installed: false },
      { id: 'ghostscript', name: 'Ghostscript PDF/PS İşleme Motoru', deb: 'ghostscript', desc: 'PDF sıkıştırma, birleştirme ve PostScript yorumlayıcı aracı', cat: 'office', size: '36 MB', installed: false },

      // 6. SİSTEM & YÖNETİM (SYS)
      { id: 'iotop', name: 'Iotop Disk Girdi/Çıktı Monitörü', deb: 'iotop', desc: 'Hangi sürecin diski ne kadar okuyup yazdığını canlı izleyen araç', cat: 'sys', size: '2 MB', installed: false },
      { id: 'iftop', name: 'Iftop Ağ Bant Genişliği Monitörü', deb: 'iftop', desc: 'Ağ bağlantılarında IP bazında anlık veri transferi takipçisi', cat: 'sys', size: '2 MB', installed: false },
      { id: 'ncdu', name: 'Ncdu Disk Alan Analizörü', deb: 'ncdu', desc: 'Dizinlerin diskte ne kadar yer kapladığını hızla gösteren konsol aracı', cat: 'sys', size: '1 MB', installed: false },
      { id: 'screenfetch', name: 'Screenfetch Hızlı Sistem Özeti', deb: 'screenfetch', desc: 'Donanım, çekirdek ve masaüstü ortamı bilgilerini terminalde gösteren hafif araç', cat: 'sys', size: '2 MB', installed: false },
      { id: 'inxi', name: 'Inxi Donanım Raporlama Aracı', deb: 'inxi', desc: 'İşlemci, ekran kartı, anakart ve ses yongaları hakkında ayrıntılı rapor', cat: 'sys', size: '3 MB', installed: false },
      { id: 'lshw', name: 'Lshw Donanım Listesi', deb: 'lshw', desc: 'Tüm donanım bileşenlerini XML veya JSON biçiminde döken teftiş aracı', cat: 'sys', size: '4 MB', installed: false },
      { id: 'pciutils', name: 'PCI Araçları (lspci)', deb: 'pciutils', desc: 'Anakart üzerindeki tüm PCI ve PCIe donanımlarını listeleme', cat: 'sys', size: '2 MB', installed: false },
      { id: 'usbutils', name: 'USB Araçları (lsusb)', deb: 'usbutils', desc: 'Bağlı tüm harici USB aygıtlarını ve veriyolu hızlarını listeleme', cat: 'sys', size: '2 MB', installed: false },
      { id: 'smartmontools', name: 'S.M.A.R.T. Disk Sağlık Denetleyicisi', deb: 'smartmontools', desc: 'SSD ve sabit disklerin ömür, sıcaklık ve hata sektörlerini takip etme', cat: 'sys', size: '3 MB', installed: false },
      { id: 'memtest86+', name: 'Memtest86+ RAM Test Aracı', deb: 'memtest86+', desc: 'Bellek donanımında kararsızlık ve hücre bozulmalarını tarama', cat: 'sys', size: '2 MB', installed: false },
      { id: 'sysstat', name: 'Sysstat Sistem İstatistikleri (sar/iostat)', deb: 'sysstat', desc: 'İşletim sistemi performans sayaçları ve geçmiş kullanım loglayıcı', cat: 'sys', size: '5 MB', installed: false },
      { id: 'glances', name: 'Glances Kapsamlı Sistem Gözlemcisi', deb: 'glances', desc: 'Web tabanlı veya konsolda çalışan istemci-sunucu sistem monitörü', cat: 'sys', size: '14 MB', installed: false },
      { id: 'flatpak', name: 'Flatpak Uygulama Mağazası', deb: 'flatpak', desc: 'Sandbox içinde çalışan evrensel Linux uygulama mağazası altyapısı', cat: 'sys', size: '26 MB', installed: false },
      { id: 'synaptic', name: 'Synaptic Grafik Paket Yöneticisi', deb: 'synaptic', desc: 'Depo paketlerini gruplar hâlinde arayıp kurup kaldırabileceğiniz klasik arayüz', cat: 'sys', size: '12 MB', installed: false },

      // 7. ARAÇLAR & YARDIMCILAR (UTIL)
      { id: 'tmux', name: 'Tmux Terminal Çoklayıcı', deb: 'tmux', desc: 'Tek terminal penceresinde bölünmüş paneller ve kalıcı arka plan oturumları', cat: 'util', size: '4 MB', installed: false },
      { id: 'screen', name: 'GNU Screen Oturum Yöneticisi', deb: 'screen', desc: 'Kopmayan SSH oturumları ve arka plan terminal yönetimi', cat: 'util', size: '3 MB', installed: false },
      { id: 'zsh', name: 'Zsh Gelişmiş Kabuk', deb: 'zsh', desc: 'Gelişmiş sekme tamamlama, tema ve eklenti destekli güçlü kabuk', cat: 'util', size: '12 MB', installed: false },
      { id: 'fish', name: 'Fish Akıllı Etkileşimli Kabuk', deb: 'fish', desc: 'Yazarken syntax highlighting ve otomatik öneriler sunan modern kabuk', cat: 'util', size: '16 MB', installed: false },
      { id: 'unrar-free', name: 'Unrar Çıkarıcı', deb: 'unrar-free', desc: 'RAR arşiv paketlerini dizine açma ve çıkarma aracı', cat: 'util', size: '1 MB', installed: false },
      { id: 'zip', name: 'Zip Arşivleyici', deb: 'zip', desc: 'Standart ZIP arşivleri oluşturma ve şifreleme komut satırı aracı', cat: 'util', size: '2 MB', installed: false },
      { id: 'unzip', name: 'Unzip Arşiv Açıcı', deb: 'unzip', desc: 'ZIP arşivlerini hızlıca dışa aktarma aracı', cat: 'util', size: '2 MB', installed: false },
      { id: 'tar', name: 'GNU Tar Arşiv Paketi', deb: 'tar', desc: 'Bant arşivi ve dosya paketleme standart UNIX yazılımı', cat: 'util', size: '3 MB', installed: false },
      { id: 'rsync', name: 'Rsync Hızlı Dosya Eşitleyici', deb: 'rsync', desc: 'Delta algoritması ile yalnızca değişen baytları aktaran senkronizasyon aracı', cat: 'util', size: '3 MB', installed: false },
      { id: 'tree', name: 'Tree Dizin Ağacı Çizici', deb: 'tree', desc: 'Dizin ve alt dosyaları renkli ağaç grafiği şeklinde listeleme', cat: 'util', size: '1 MB', installed: false },
      { id: 'fzf', name: 'FZF Komut Satırı Bulanık Arama', deb: 'fzf', desc: 'Dosyalar, komut geçmişi ve metinler arasında gerçek zamanlı fuzzy arama', cat: 'util', size: '4 MB', installed: false },
      { id: 'ripgrep', name: 'Ripgrep Hızlı Metin Tarayıcı (rg)', deb: 'ripgrep', desc: 'Büyük kod depolarında saniyeler içinde regex arayan Rust tabanlı araç', cat: 'util', size: '6 MB', installed: false },
      { id: 'bat', name: 'Bat Renkli Cat Alternatifi', deb: 'bat', desc: 'Git entegrasyonlu ve sözdizimi renklendirmeli dosya okuyucu', cat: 'util', size: '5 MB', installed: false },
      { id: 'fd-find', name: 'FD Hızlı Dosya Arama', deb: 'fd-find', desc: 'Find komutuna kıyasla kat kat hızlı ve kullanıcı dostu arama aracı', cat: 'util', size: '3 MB', installed: false },
      { id: 'midnight-commander', name: 'Midnight Commander (MC)', deb: 'mc', desc: 'Klasik Norton Commander tarzı çift panelli konsol dosya yöneticisi', cat: 'util', size: '10 MB', installed: false },
      { id: 'ranger', name: 'Ranger Konsol Dosya Yöneticisi', deb: 'ranger', desc: 'Vim tuş takımı ve önizleme panellerine sahip terminal dosya tarayıcısı', cat: 'util', size: '6 MB', installed: false },

      // 8. KATEGORİ GENİŞLETMESİ — mağaza kapsamı genişletildi (oyun, ses, disk, güvenlik, iletişim)
      // 8a. OYUNLAR
      { id: 'supertuxkart', name: 'SuperTuxKart Yarış Oyunu', deb: 'supertuxkart', desc: 'Serbest ve açık kaynak, aile dostu karting yarış oyunu', cat: 'util', size: '600 MB', installed: false },
      { id: 'supertux', name: 'SuperTux 2D Platform Oyunu', deb: 'supertux', desc: 'Tux kahramanlı, klasik yan kaydırmalı platform macerası', cat: 'util', size: '120 MB', installed: false },
      { id: '0ad', name: "0 A.D. Strateji Oyunu", deb: '0ad', desc: 'Antik savaş temalı, açık kaynak gerçek zamanlı strateji', cat: 'util', size: '900 MB', installed: false },
      { id: 'flatpak-openboard', name: 'Openboard Eğitim Tahtası', flatpak: 'ch.openboard.OpenBoard', desc: 'Ders için etkileşimli akıllı tahta yazılımı', cat: 'dev', size: '150 MB', installed: false },

      // 8b. SES & PRODÜKSİYON
      { id: 'ardour', name: 'Ardour Profesyonel DAW', deb: 'ardour', desc: 'Çok kanallı kayıt ve miksaj için endüstri seviyesi dijital ses iş istasyonu', cat: 'media', size: '130 MB', installed: false },
      { id: 'rosegarden', name: 'Rosegarden MIDI Stüdyosu', deb: 'rosegarden', desc: 'MIDI dizme ve nota yazımı için müzik stüdyosu', cat: 'media', size: '40 MB', installed: false },

      // 8c. DİSK & SİSTEM ARAÇLARI
      { id: 'gnome-disk-utility', name: 'GNOME Disks (Diskler)', deb: 'gnome-disk-utility', desc: 'Diskleri bölümlendirme, biçimlendirme ve SMART durumunu görsel arayüzden yönetme', cat: 'sys', size: '12 MB', installed: false },
      { id: 'baobab', name: 'Baobab Disk Kullanım Analizi', deb: 'baobab', desc: 'Disk alanını halka grafikli görselleştirip büyük klasörleri bulma', cat: 'sys', size: '6 MB', installed: false },
      { id: 'bleachbit', name: 'BleachBit Sistem Temizleyici', deb: 'bleachbit', desc: 'Gereksiz önbellek ve geçmiş dosyalarını güvenle temizleyen araç', cat: 'sys', size: '5 MB', installed: false },

      // 8d. GÜVENLİK & AĞ
      { id: 'torbrowser-launcher', name: 'Tor Browser Başlatıcısı', deb: 'torbrowser-launcher', desc: 'Tor Browser kurulumunu ve güncellemelerini yöneten başlatıcı', cat: 'net', size: '4 MB', installed: false },
      { id: 'nextcloud-desktop', name: 'Nextcloud Masaüstü Eşitleme', deb: 'nextcloud-desktop', desc: 'Kendi bulut sunucunuzla dosya senkronizasyon istemcisi', cat: 'net', size: '30 MB', installed: false },
      { id: 'remmina', name: 'Remmina Uzak Masaüstü İstemcisi', deb: 'remmina', desc: 'RDP, VNC ve SSH oturumlarını tek arayüzden yönetme', cat: 'net', size: '18 MB', installed: false },
      { id: 'flatpak-flatseal', name: 'Flatseal Flatpak İzin Yöneticisi', flatpak: 'com.github.tchx84.Flatseal', desc: 'Flatpak uygulamalarının sandbox izinlerini görsel denetleme', cat: 'sys', size: '12 MB', installed: false },

      // 8e. İLETİŞİM & GÜNLÜK İŞLER
      { id: 'flatpak-signal', name: 'Signal Private Messenger', flatpak: 'org.signal.Signal', desc: 'Uçtan uca şifreli, gizlilik odaklı mesajlaşma uygulaması', cat: 'net', size: '160 MB', installed: false },
      { id: 'evolution', name: 'Evolution E-Posta & Ajanda', deb: 'evolution', desc: 'E-posta, takvim, görev ve kişi yönetiminin tamamını içeren istemci', cat: 'office', size: '110 MB', installed: false },
      { id: 'anki', name: 'Anki Bilgi Kartları (Öğrenme)', flatpak: 'net.ankiweb.Anki', desc: 'Aralıklı tekrar yöntemiyle kelime ve ders çalışma aracı', cat: 'office', size: '140 MB', installed: false },
      { id: 'ghostwriter', name: 'ghostwriter Odaklanmış Metin Düzenleyici', deb: 'ghostwriter', desc: 'Markdown için bölümsüz, odaklanmış yazma ortamı', cat: 'office', size: '8 MB', installed: false },

      // 8f. GELİŞTİRME & GRAFİK
      { id: 'flatpak-freecad', name: 'FreeCAD 3D CAD', flatpak: 'org.freecad.FreeCAD', desc: 'Makine tasarımı ve teknik çizim için açık kaynak 3B CAD', cat: 'dev', size: '450 MB', installed: false },

      // 9. KAPSAM GENİŞLETMESİ II — toplam 40 yeni uygulama (mağaza derinliği)
      // 9a. MEDYA & SES (8)
      { id: 'openshot', name: 'OpenShot Video Düzenleyici', deb: 'openshot-qt', desc: 'Sürükle-bırak zaman çizgeli, yeni başlayan dostu video kurgu yazılımı', cat: 'media', size: '95 MB', installed: false },
      { id: 'celluloid', name: 'Celluloid Hafif Video Oynatıcı', deb: 'celluloid', desc: 'mpv motorlu, temiz GTK arayüzlü modern film oynatıcı', cat: 'media', size: '9 MB', installed: false },
      { id: 'smplayer', name: 'SMPlayer Gelişmiş Oynatıcı', deb: 'smplayer', desc: 'Altyazı arama, hız ayarı ve oynatma konumu hatırlama destekli çalar', cat: 'media', size: '18 MB', installed: false },
      { id: 'kodi', name: 'Kodi Medya Merkezi', deb: 'kodi', desc: 'Filmler, diziler ve müzikler için kütüphane tabanlı medya merkezi', cat: 'media', size: '120 MB', installed: false },
      { id: 'strawberry', name: 'Strawberry Müzik Koleksiyonu', deb: 'strawberry', desc: 'koleksiyon yönetimine odaklı modern müzik çalar', cat: 'media', size: '30 MB', installed: false },
      { id: 'gpodder', name: 'gPodder Podcast Yöneticisi', deb: 'gpodder', desc: 'Podcast aboneliği, indirme ve senkronizasyon istemcisi', cat: 'media', size: '12 MB', installed: false },
      { id: 'flatpak-easyeffects', name: 'EasyEffects Ses İşleme', flatpak: 'com.github.wwmm.easyeffects', desc: 'Giriş/çıkış için ekolayzer, kompresör ve limiter ile sistem sesini işleyin', cat: 'media', size: '40 MB', installed: false },
      { id: 'easytag', name: 'EasyTAG Müzik Etiket Düzenleyici', deb: 'easytag', desc: 'MP3 ve FLAC dosyaların toplu etiketleme ve albüm kapağı aracı', cat: 'media', size: '9 MB', installed: false },

      // 9b. GRAFİK & TİPOGRAFİ (5)
      { id: 'kolourpaint', name: 'KolourPaint Boyama Aracı', deb: 'kolourpaint', desc: 'Paint tarzı basit ve hızlı resim düzenleme aracı', cat: 'graphics', size: '11 MB', installed: false },
      { id: 'fontforge', name: 'FontForge Yazı Tipi Düzenleyici', deb: 'fontforge', desc: 'Kendi yazı tiplerini tasarlayıp TTF/OTF olarak çıkarır', cat: 'graphics', size: '40 MB', installed: false },
      { id: 'scribus', name: 'Scribus Masaüstü Yayıncılık', deb: 'scribus', desc: 'Broşür, dergi ve dergi plakı için profesyonel sayfa dizgisi', cat: 'graphics', size: '85 MB', installed: false },
      { id: 'digikam', name: 'digiKam Fotoğraf Kütüphanesi', deb: 'digikam', desc: 'Yüz tanıma ve etiketli, büyük fotoğraf koleksiyonlu koleksiyon arayüzü', cat: 'graphics', size: '220 MB', installed: false },
      { id: 'geeqie', name: 'Geeqie Hızlı Görsel Tarayıcı', deb: 'geeqie', desc: 'hafif, okunabilir arayüzlü hızlı görsel görüntüleyici', cat: 'graphics', size: '10 MB', installed: false },

      // 9c. DİSK & SİSTEM (9)
      { id: 'lm-sensors', name: 'LM-Sensors Donanım Sensörleri', deb: 'lm-sensors', desc: 'CPU sıcaklığı, fan hızı ve voltaj değerlerini okuma kiti', cat: 'sys', size: '2 MB', installed: false },
      { id: 'gsmartcontrol', name: 'GSmartControl Disk Taraması', deb: 'gsmartcontrol', desc: 'Disk S.M.A.R.T. değerlerini grafik arayüzden inceleme aracı', cat: 'sys', size: '6 MB', installed: false },
      { id: 'testdisk', name: 'TestDisk & PhotoRec Veri Kurtarma', deb: 'testdisk', desc: 'Silinmiş bölümleri onarır, kaybolan dosyaları kurtarır', cat: 'sys', size: '6 MB', installed: false },
      { id: 'clonezilla', name: 'Clonezilla Disk Klonlama', deb: 'clonezilla', desc: 'Bütün diski ya da bölümleri imaj hâlinde klonlama aracı', cat: 'sys', size: '230 MB', installed: false },
      { id: 'seahorse', name: 'Seahorse GPG & Anahtar Yöneticisi', deb: 'seahorse', desc: 'Dosya, e-posta, SSH ve PGP anahtarları için grafiksel şifreleme aracı', cat: 'sys', size: '6 MB', installed: false },
      { id: 'cryptsetup', name: 'Cryptsetup LUKS Araçları', deb: 'cryptsetup', desc: 'LUKS şifreli bölümleri oluşturma ve açma araç seti', cat: 'sys', size: '8 MB', installed: false },
      { id: 'borgbackup', name: 'BorgBackup Dedüp Yedek', deb: 'borgbackup', desc: 'Dedüpülasyonlu, şifreli, sıkıştırılmış yedekleme çözümü', cat: 'sys', size: '9 MB', installed: false },
      { id: 'duplicity', name: 'Duplicity Şifreli Yedek', deb: 'duplicity', desc: 'Şifreli artımlı yedeği uzak sunuculara yedekleme aracı', cat: 'sys', size: '7 MB', installed: false },
      { id: 'grsync', name: 'Grsync rsync Grafik Arayüzü', deb: 'grsync', desc: 'rsync görevlerini profil olarak kaydedip tek tıkla çalıştırma', cat: 'sys', size: '4 MB', installed: false },

      // 9d. İLETİŞİM & AĞ (6)
      { id: 'gajim', name: 'Gajim XMPP Sohbet', deb: 'gajim', desc: 'Açık standart XMPP mesajlaşma istemcisine modern arayüz', cat: 'net', size: '16 MB', installed: false },
      { id: 'hexchat', name: 'HexChat IRC İstemcisi', deb: 'hexchat', desc: 'Kanal favorileri ve eklentilerle zengin klasik IRC istemcisi', cat: 'net', size: '12 MB', installed: false },
      { id: 'mumble', name: 'Mumble Düşük Gecikmeli Sesli', deb: 'mumble', desc: 'Oyun toplulukları için düşük gecikmeli sesli konuşma yazılımı', cat: 'net', size: '14 MB', installed: false },
      { id: 'twinkle', name: 'Twinkle VoIP & SIP Telefon', deb: 'twinkle', desc: 'SIP protokolü üzerinden ücretsiz sesli arama ve iletişim istemcisi', cat: 'net', size: '18 MB', installed: false },
      { id: 'syncthing', name: 'Syncthing Cihazlar Arası Eşitleme', deb: 'syncthing', desc: 'Web arayüzlü, sunucusuz sürekli dosya senkronizasyonu', cat: 'net', size: '30 MB', installed: false },
      { id: 'weechat', name: 'WeeChat Modüler Sohbet', deb: 'weechat', desc: 'Eklenti sistemi güçlendirmesine açık terminal sohbeti', cat: 'net', size: '7 MB', installed: false },

      // 9e. BİLGİSAYAR & MATEMATİK (6)
      { id: 'neovim', name: 'Neovim Modüler Düzenleyici', deb: 'neovim', desc: 'Lua eklenti ekosistemiyle zenginleşen Vim akışına uygun editör', cat: 'dev', size: '15 MB', installed: false },
      { id: 'emacs', name: 'GNU Emacs Genişletilebilir Editör', deb: 'emacs', desc: 'Org-modu, Magit ve yüzlerce paketle genişletilebilir editör', cat: 'dev', size: '110 MB', installed: false },
      { id: 'meld', name: 'Meld Dosya Karşılaştırma', deb: 'meld', desc: 'Dosya ve klasörleri yan yana karşılaştırma ve birleştirme aracı', cat: 'dev', size: '10 MB', installed: false },
      { id: 'gnome-builder', name: 'GNOME Builder IDE', deb: 'gnome-builder', desc: 'GTK/GNOME projesi için entegre geliştirme ortamı', cat: 'dev', size: '35 MB', installed: false },
      { id: 'zeal', name: 'Zeal Çevrimdışı Dokümantasyon', deb: 'zeal', desc: '150 dil için çevrimdışı API dokümantasyon tarayıcısı', cat: 'dev', size: '12 MB', installed: false },
      { id: 'gdb', name: 'GNU Debugger (GDB)', deb: 'gdb', desc: 'C/C++/Rust programlarını gdb hata ayıklama ortamı', cat: 'dev', size: '7 MB', installed: false },

      // 9f. BİLİM & VERİ & OFİS (6)
      { id: 'valgrind', name: 'Valgrind Bellek Analizör', deb: 'valgrind', desc: 'Bellek sızması ve veri yarışı çakışmaları bulucu', cat: 'dev', size: '50 MB', installed: false },
      { id: 'octave', name: 'GNU Octave Bilimsel Hesap', deb: 'octave', desc: 'Matlab uyumlu sözdizimli matris ve sayısal hesap ortamı', cat: 'dev', size: '190 MB', installed: false },
      { id: 'wxmaxima', name: 'wxMaxima Cebirsel Hesap', deb: 'wxmaxima', desc: 'maxima sembolik matematik motorunun grafik arayüzü', cat: 'office', size: '14 MB', installed: false },
      { id: 'maxima', name: 'Maxima Sembolik Matematik', deb: 'maxima', desc: 'Türev, integral ve denklem çözümü motoru', cat: 'office', size: '220 MB', installed: false },
      { id: 'gnuplot', name: 'Gnuplot Fonksiyon Çizim', deb: 'gnuplot', desc: 'Bilimsel veri ve fonksiyon grafikleri çizim aracı', cat: 'dev', size: '12 MB', installed: false },
      { id: 'sqlitebrowser', name: 'DB Browser for SQLite', deb: 'sqlitebrowser', desc: 'SQLite veritabanlarını tablo görünümünde inceleme ve düzenleme', cat: 'dev', size: '10 MB', installed: false },

      // 10. YENİ EKLENEN PROFESYONEL VE EĞİTİM UYGULAMALARI (100)
      { id: 'rocs', name: 'Rocs Çizge Kuramı ve Algoritma', deb: 'rocs', desc: 'Veri yapıları, çizge (graph) teorisi ve algoritma görselleştirme laboratuvarı', cat: 'office', school: true, size: '8 MB', installed: false },
      { id: 'kalzium', name: 'Kalzium Periyodik Tablo', deb: 'kalzium', desc: 'Kapsamlı kimyasal elementler tablosu ve molekül hesaplayıcı', cat: 'office', size: '12 MB', installed: false },
      { id: 'marble', name: 'Marble Dünya Atlası', deb: 'marble', desc: '3B sanal dünya küresi, harita ve coğrafi keşif aracı', cat: 'office', size: '35 MB', installed: false },
      { id: 'kstars', name: 'KStars Masaüstü Planetaryum', deb: 'kstars', desc: 'Gece gökyüzü simülasyonu ve gelişmiş teleskop kontrol yazılımı', cat: 'office', size: '65 MB', installed: false },
      { id: 'step', name: 'Step Fizik Simülatörü', deb: 'step', desc: 'Kuvvetler, yerçekimi ve dalgalar için etkileşimli fizik laboratuvarı', cat: 'office', size: '8 MB', installed: false },
      { id: 'kmplot', name: 'KmPlot Fonksiyon Çizici', deb: 'kmplot', desc: 'Matematiksel fonksiyonlar, türev ve integral grafik çizim aracı', cat: 'office', size: '4 MB', installed: false },
      { id: 'kbruch', name: 'KBruch Kesir Alıştırmaları', deb: 'kbruch', desc: 'Kesirli sayılarla hesaplama ve aritmetik pratik yazılımı', cat: 'office', size: '4 MB', installed: false },
      { id: 'kturtle', name: 'KTurtle Eğitici Programlama', deb: 'kturtle', desc: 'Çocuklar ve yeni başlayanlar için Logo tabanlı kodlama ortamı', cat: 'office', size: '3 MB', installed: false },
      { id: 'kig', name: 'Kig Geometri Tasarımcısı', deb: 'kig', desc: 'Geometrik şekiller ve matematiksel ispatlar için etkileşimli çizim', cat: 'office', size: '6 MB', installed: false },
      { id: 'avogadro', name: 'Avogadro Moleküler Editör', deb: 'avogadro', desc: 'Kimya, biyokimya ve malzeme bilimi için 3B molekül modelleyici', cat: 'office', size: '18 MB', installed: false },
      { id: 'chemtool', name: 'Chemtool Kimyasal Çizici', deb: 'chemtool', desc: '2B organik kimya molekül yapıları ve reaksiyon çizim kiti', cat: 'office', size: '3 MB', installed: false },
      { id: 'scilab', name: 'Scilab Bilimsel Hesaplama', deb: 'scilab', desc: 'Mühendislik ve fen bilimleri için sayısal algoritma ve simülasyon', cat: 'office', size: '95 MB', installed: false },
      { id: 'gpredict', name: 'Gpredict Uydu Takip & Yörünge', deb: 'gpredict', desc: 'Yapay uyduları, ISS yörüngesini ve geçiş saatlerini gerçek zamanlı izleme aracı', cat: 'office', size: '12 MB', installed: false },
      { id: 'cantor', name: 'Cantor Matematik Arayüzü', deb: 'cantor', desc: 'Maxima, Octave, R ve Python için çalışma sayfası arayüzü', cat: 'office', size: '12 MB', installed: false },
      { id: 'kalgebra', name: 'KAlgebra Grafik & Sembolik Hesap', deb: 'kalgebra', desc: '2B/3B fonksiyon grafiği ve cebirsel ifadeler için bilimsel matematik aracı', cat: 'office', size: '6 MB', installed: false },
      { id: 'git-gui', name: 'Git GUI Grafik Yöneticisi', deb: 'git-gui', desc: 'Git işleme (commit) ve dal yönetimi için görsel arayüz', cat: 'dev', size: '3 MB', installed: false },
      { id: 'codeblocks', name: 'Code::Blocks C/C++ IDE', deb: 'codeblocks', desc: 'Genişletilebilir eklenti mimarisine sahip C/C++ geliştirme ortamı', cat: 'dev', size: '28 MB', installed: false },
      { id: 'kcachegrind', name: 'KCachegrind Profil Analizi', deb: 'kcachegrind', desc: 'Valgrind çağrı grafiği görselleştirme ve performans optimizasyonu', cat: 'dev', size: '6 MB', installed: false },
      { id: 'glade', name: 'Glade GTK Arayüz Tasarımcısı', deb: 'glade', desc: 'Linux masaüstü GUI uygulamaları için sürükle-bırak form tasarımcısı', cat: 'dev', size: '12 MB', installed: false },
      { id: 'poedit', name: 'Poedit Çeviri Editörü', deb: 'poedit', desc: 'Gettext (.po/.mo) yerelleştirme ve dil çeviri yönetim aracı', cat: 'dev', size: '18 MB', installed: false },
      { id: 'hexedit', name: 'Hexedit İkili Dosya Editörü', deb: 'hexedit', desc: 'Hızlı terminal tabanlı onaltılık (hexadecimal) dosya görüntüleyici', cat: 'dev', size: '1 MB', installed: false },
      { id: 'dhex', name: 'DHex Karşılaştırmalı Hex Editör', deb: 'dhex', desc: 'İkili dosya farklarını yan yana inceleme ve düzenleme aracı', cat: 'dev', size: '1 MB', installed: false },
      { id: 'iaito', name: 'iaito / Radare2 Tersine Mühendislik', flatpak: 'org.radare.iaito', desc: 'Gelişmiş ikili kod inceleme, disassembly ve hata ayıklama arayüzü', cat: 'dev', size: '85 MB', installed: false },
      { id: 'cloc', name: 'CLOC Kod Satır Sayacı', deb: 'cloc', desc: 'Onlarca dilde kaynak kod, yorum ve boş satırları sayma aracı', cat: 'dev', size: '1 MB', installed: false },
      { id: 'shellcheck', name: 'ShellCheck Betik Analizcisi', deb: 'shellcheck', desc: 'Bash ve sh betikleri için statik hata ve güvenlik denetleyicisi', cat: 'dev', size: '15 MB', installed: false },
      { id: 'cmake', name: 'CMake Derleme Yöneticisi', deb: 'cmake', desc: 'C/C++ projeleri için endüstri standardı çapraz derleme sistemi', cat: 'dev', size: '32 MB', installed: false },
      { id: 'ninja-build', name: 'Ninja Derleme Motoru', deb: 'ninja-build', desc: 'Hıza odaklanmış küçük ve ultra hızlı kaynak kod derleme sistemi', cat: 'dev', size: '2 MB', installed: false },
      { id: 'flatpak-dbeaver', name: 'DBeaver Evrensel DB Yöneticisi', flatpak: 'io.dbeaver.DBeaverCommunity', desc: 'MySQL, PostgreSQL, SQLite ve Oracle destekli gelişmiş SQL editörü', cat: 'dev', size: '130 MB', installed: false },
      { id: 'flatpak-postman', name: 'Postman API Geliştirme', flatpak: 'com.getpostman.Postman', desc: 'REST, GraphQL ve WebSocket API tasarım ve test platformu', cat: 'dev', size: '160 MB', installed: false },
      { id: 'flatpak-godot', name: 'Godot Oyun Motoru', flatpak: 'org.godotengine.Godot', desc: 'Hafif, güçlü ve açık kaynaklı 2B/3B profesyonel oyun geliştirme motoru', cat: 'dev', size: '85 MB', installed: false },
      { id: 'abiword', name: 'AbiWord Kelime İşlemci', deb: 'abiword', desc: 'Sistem kaynaklarını yormayan hafif ve verimli metin belgesi editörü', cat: 'office', size: '14 MB', installed: false },
      { id: 'gnumeric', name: 'Gnumeric Hesap Tablosu', deb: 'gnumeric', desc: 'Yüksek matematiksel hassasiyete sahip hızlı elektronik tablo aracı', cat: 'office', size: '16 MB', installed: false },
      { id: 'pdfarranger', name: 'PDF Arranger Sayfa Düzenleyici', deb: 'pdfarranger', desc: 'PDF sayfalarını birleştirme, bölme, döndürme ve yeniden sıralama aracı', cat: 'office', size: '4 MB', installed: false },
      { id: 'qpdf', name: 'QPDF Yapısal PDF Dönüştürücü', deb: 'qpdf', desc: 'PDF dosyalarını doğrulama, şifreleme ve optimize etme komut satırı aracı', cat: 'office', size: '2 MB', installed: false },
      { id: 'lyx', name: 'LyX Görsel Belge İşlemci', deb: 'lyx', desc: 'LaTeX gücünü WYSIWYM görsel kolaylığıyla birleştiren belge motoru', cat: 'office', size: '48 MB', installed: false },
      { id: 'texmaker', name: 'Texmaker LaTeX Editörü', deb: 'texmaker', desc: 'Entegre PDF görüntüleyicili modern ve eksiksiz LaTeX IDE', cat: 'office', size: '24 MB', installed: false },
      { id: 'gummi', name: 'Gummi Hafif LaTeX Editörü', deb: 'gummi', desc: 'Anlık iki panelli canlı PDF önizlemeli hızlı LaTeX yazarı', cat: 'office', size: '6 MB', installed: false },
      { id: 'cherrytree', name: 'CherryTree Hiyerarşik Notlar', deb: 'cherrytree', desc: 'Zengin metin, sözdizimi vurgulu kod ve şifreli veri tabanlı not defteri', cat: 'office', size: '18 MB', installed: false },
      { id: 'rednotebook', name: 'RedNotebook Günlük & Ajanda', deb: 'rednotebook', desc: 'Takvim navigasyonlu, etiketli ve arama destekli kişisel günlük', cat: 'office', size: '8 MB', installed: false },
      { id: 'zim', name: 'Zim Masaüstü Wiki', deb: 'zim', desc: 'Notlar, yapılacaklar ve belgeler için yerel bağlantılı masaüstü wiki', cat: 'office', size: '6 MB', installed: false },
      { id: 'basket', name: 'BasKet Not Pedleri', deb: 'basket', desc: 'Fikirler, resimler, bağlantılar ve görevler için sepet düzenleyici', cat: 'office', size: '12 MB', installed: false },
      { id: 'speedcrunch', name: 'SpeedCrunch Bilimsel Hesap', flatpak: 'org.speedcrunch.SpeedCrunch', desc: '50 basamak hassasiyetli, otomatik tamamlamalı modern hesap makinesi', cat: 'office', size: '45 MB', installed: false },
      { id: 'qalculate-gtk', name: 'Qalculate! Çok Yönlü Hesaplayıcı', deb: 'qalculate-gtk', desc: 'Birim dönüşümleri, para birimleri ve denklem çözme motoru', cat: 'office', size: '8 MB', installed: false },
      { id: 'flatpak-joplin', name: 'Joplin Şifreli Not Defteri', flatpak: 'net.cozic.joplin_desktop', desc: 'Uçtan uca şifreli, bulut eşitlemeli Markdown not alma uygulaması', cat: 'office', size: '140 MB', installed: false },
      { id: 'flatpak-zotero', name: 'Zotero Akademik Kaynakça', flatpak: 'org.zotero.Zotero', desc: 'Araştırma makaleleri, alıntılar ve akademik kaynak kütüphanesi', cat: 'office', size: '120 MB', installed: false },
      { id: 'mixxx', name: 'Mixxx Profesyonel DJ Mikseri', deb: 'mixxx', desc: 'Çift güverte, beat senkronizasyonu ve MIDI denetleyici destekli DJ stüdyosu', cat: 'media', size: '65 MB', installed: false },
      { id: 'lmms', name: 'LMMS Müzik Üretim Stüdyosu', deb: 'lmms', desc: 'Sentezleyiciler, ritimler ve efektlerle eksiksiz dijital ses iş istasyonu', cat: 'media', size: '45 MB', installed: false },
      { id: 'musescore3', name: 'MuseScore 3 Nota Yazım', deb: 'musescore3', desc: 'Müzik notasyonu oluşturma, dinleme ve yüksek kaliteli nota basımı', cat: 'media', size: '75 MB', installed: false },
      { id: 'soundconverter', name: 'SoundConverter Ses Dönüştürücü', deb: 'soundconverter', desc: 'WAV, FLAC, MP3, OGG ve AAC formatları arasında hızlı toplu dönüştürme', cat: 'media', size: '3 MB', installed: false },
      { id: 'asunder', name: 'Asunder Ses CD Aktarıcı', deb: 'asunder', desc: 'Müzik CD parçalarını FLAC, MP3 veya Ogg formatında diske kaydetme', cat: 'media', size: '2 MB', installed: false },
      { id: 'brasero', name: 'Brasero Disk Yazıcı', deb: 'brasero', desc: 'Veri, ses ve video CD/DVD diskleri oluşturma ve ISO kalıbı yazma', cat: 'media', size: '12 MB', installed: false },
      { id: 'guvcview', name: 'Guvcview Kamera Yakalayıcı', deb: 'guvcview', desc: 'UVC uyumlu web kameraları için gelişmiş görüntü ve ses kayıt yazılımı', cat: 'media', size: '4 MB', installed: false },
      { id: 'cheese', name: 'Cheese Fotoğraf Kabini', deb: 'cheese', desc: 'Web kamerası ile eğlenceli filtrelerle fotoğraf ve video çekme', cat: 'media', size: '14 MB', installed: false },
      { id: 'simplescreenrecorder', name: 'SimpleScreenRecorder Ekran Kaydedici', deb: 'simplescreenrecorder', desc: 'Oyun ve masaüstü aktiviteleri için düşük işlemci kullanımlı ekran kaydedici', cat: 'media', size: '8 MB', installed: false },
      { id: 'mp3wrap', name: 'MP3Wrap MP3 Birleştirici', deb: 'mp3wrap', desc: 'Birden fazla MP3 dosyasını yeniden kodlamadan tek bir dosyada toplama', cat: 'media', size: '1 MB', installed: false },
      { id: 'id3v2', name: 'ID3v2 Etiket Düzenleyici', deb: 'id3v2', desc: 'Ses dosyalarının sanatçı, albüm ve parça bilgilerini düzenleme aracı', cat: 'media', size: '1 MB', installed: false },
      { id: 'pavucontrol', name: 'PulseAudio / PipeWire Ses Denetimi', deb: 'pavucontrol', desc: 'Uygulama bazlı ses giriş ve çıkış aygıtları mikser arayüzü', cat: 'media', size: '4 MB', installed: false },
      { id: 'pasystray', name: 'Pasystray Ses Tepsisi', deb: 'pasystray', desc: 'Sistem tepsisinden ses seviyesi ve aygıt yönlendirme kontrolü', cat: 'media', size: '2 MB', installed: false },
      { id: 'sayonara', name: 'Sayonara Hızlı Müzik Çalar', deb: 'sayonara', desc: 'Düşük bellek tüketimli, kütüphane ve dinamik çalma listeli modern müzik çalar', cat: 'media', size: '16 MB', installed: false },
      { id: 'flatpak-vlc', name: 'VLC Media Player Sandboxed', flatpak: 'org.videolan.VLC', desc: 'Flathub izole ortamında çalışan tüm formatları destekleyen medya oynatıcı', cat: 'media', size: '95 MB', installed: false },
      { id: 'pinta', name: 'Pinta Çizim Editörü', flatpak: 'com.github.PintaProject.Pinta', desc: 'Paint.NET benzeri katmanlı, efektli ve basit kullanımlı çizim yazılımı', cat: 'graphics', size: '65 MB', installed: false },
      { id: 'synfigstudio', name: 'Synfig 2B Animasyon', flatpak: 'org.synfig.SynfigStudio', desc: 'Film kalitesinde 2B vektörel animasyon ve karakter kuklası oluşturma', cat: 'graphics', size: '160 MB', installed: false },
      { id: 'openscad', name: 'OpenSCAD Katı 3B CAD', deb: 'openscad', desc: 'Kod yazarak 3 boyutlu CAD modelleri ve 3D yazıcı tasarımları üretme', cat: 'graphics', size: '25 MB', installed: false },
      { id: 'librecad', name: 'LibreCAD 2B Mühendislik Çizimi', deb: 'librecad', desc: 'Mimari ve mekanik projeler için hassas 2B teknik CAD çizim aracı', cat: 'graphics', size: '32 MB', installed: false },
      { id: 'sweethome3d', name: 'Sweet Home 3D Ev Tasarımı', deb: 'sweethome3d', desc: 'Ev planı çizimi, mobilya yerleşimi ve 3 boyutlu iç mekan gezintisi', cat: 'graphics', size: '55 MB', installed: false },
      { id: 'shotwell', name: 'Shotwell Fotoğraf Koleksiyonu', deb: 'shotwell', desc: 'Dijital fotoğrafları içe aktarma, kırpma, kırmızı göz düzeltme ve albümleme', cat: 'graphics', size: '16 MB', installed: false },
      { id: 'gthumb', name: 'gThumb Hızlı Resim Düzenleyici', deb: 'gthumb', desc: 'Toplu dosya adlandırma, format dönüştürme ve görsel tarayıcı', cat: 'graphics', size: '18 MB', installed: false },
      { id: 'optipng', name: 'OptiPNG Kayıpsız PNG Sıkıştırıcı', deb: 'optipng', desc: 'PNG görsellerini kalite kaybı olmadan boyutunu küçültme aracı', cat: 'graphics', size: '1 MB', installed: false },
      { id: 'jpegoptim', name: 'Jpegoptim JPEG Optimize Edici', deb: 'jpegoptim', desc: 'JPEG fotoğraflarını kayıplı veya kayıpsız sıkıştırarak yer kazanma', cat: 'graphics', size: '1 MB', installed: false },
      { id: 'exiftool', name: 'ExifTool Metadata Yöneticisi', deb: 'libimage-exiftool-perl', desc: 'Fotoğraf ve dosyalardaki EXIF, GPS ve kamera bilgilerini okuma/yazma', cat: 'graphics', size: '8 MB', installed: false },
      { id: 'deluge', name: 'Deluge BitTorrent İstemcisi', deb: 'deluge', desc: 'Web arayüzü ve masaüstü istemcisi destekli hafif torrent yöneticisi', cat: 'net', size: '18 MB', installed: false },
      { id: 'pidgin', name: 'Pidgin Çoklu Sohbet İstemcisi', deb: 'pidgin', desc: 'XMPP, IRC ve anlık mesajlaşma protokollerini tek pencerede birleştirme', cat: 'net', size: '16 MB', installed: false },
      { id: 'traceroute', name: 'Traceroute Ağ Yolu İzleyici', deb: 'traceroute', desc: 'Paketlerin internet üzerindeki yönlendirici duraklarını ve gecikmelerini ölçme', cat: 'net', size: '1 MB', installed: false },
      { id: 'fping', name: 'fPing Çoklu Sunucu Yoklayıcı', deb: 'fping', desc: 'Aynı anda yüzlerce ağ cihazına hızlı ICMP eko istekleri gönderme', cat: 'net', size: '1 MB', installed: false },
      { id: 'hping3', name: 'Hping3 Ağ Güvenlik Test Aracı', deb: 'hping3', desc: 'Özel TCP/UDP/ICMP paketleri hazırlama ve güvenlik duvarı denetleme', cat: 'net', size: '2 MB', installed: false },
      { id: 'etherape', name: 'EtherApe Grafiksel Ağ Monitörü', deb: 'etherape', desc: 'Ağ trafiğini renkli protokol düğümleriyle grafiksel olarak izleme', cat: 'net', size: '3 MB', installed: false },
      { id: 'vnstat', name: 'vnStat Ağ Trafik Günlüğü', deb: 'vnstat', desc: 'Günlük, aylık ve anlık ağ tüketimini arka planda kaydeden sayaç', cat: 'net', size: '2 MB', installed: false },
      { id: 'speedtest-cli', name: 'Speedtest CLI Hız Testi', deb: 'speedtest-cli', desc: 'Komut satırından Ookla altyapısıyla indirme ve yükleme hızı testi', cat: 'net', size: '1 MB', installed: false },
      { id: 'socat', name: 'Socat İki Yönlü Ağ Aktarıcı', deb: 'socat', desc: 'Soketler, borular ve seri aygıtlar arasında veri aktarımı ve port yönlendirme', cat: 'net', size: '2 MB', installed: false },
      { id: 'macchanger', name: 'Macchanger MAC Değiştirici', deb: 'macchanger', desc: 'Ağ bağdaştırıcılarının donanım MAC adresini anonimleştirme aracı', cat: 'net', size: '1 MB', installed: false },
      { id: 'openvpn', name: 'OpenVPN Güvenli Ağ İstemcisi', deb: 'openvpn', desc: 'Kurumsal ve kişisel VPN sunucularına şifreli sanal tünel bağlantısı', cat: 'net', size: '4 MB', installed: false },
      { id: 'wireguard', name: 'WireGuard Hızlı VPN İstemcisi', deb: 'wireguard-tools', desc: 'Modern kriptografiyle çalışan ultra hızlı ve hafif VPN protokolü', cat: 'net', size: '2 MB', installed: false },
      { id: 'flatpak-element', name: 'Element Matrix Messenger', flatpak: 'im.riot.Riot', desc: 'Merkeziyetsiz, uçtan uca şifreli sesli ve yazılı iletişim istemcisi', cat: 'net', size: '130 MB', installed: false },
      { id: 'flatpak-rustdesk', name: 'RustDesk Uzak Masaüstü', flatpak: 'com.rustdesk.RustDesk', desc: 'Kendi sunucunuzu kurabileceğiniz güvenli ve hızlı uzak kontrol aracı', cat: 'net', size: '45 MB', installed: false },
      { id: 'flatpak-slack', name: 'Slack İşbirliği & Mesajlaşma', flatpak: 'com.slack.Slack', desc: 'Takımlar, kanallar ve iş yerleri için iletişim ve dosya paylaşım aracı', cat: 'net', size: '150 MB', installed: false },
      { id: 'lshw-gtk', name: 'lshw-gtk Donanım Analizi', deb: 'lshw-gtk', desc: 'İşlemci, bellek, anakart ve PCI/USB aygıtlarını grafik ağaçta inceleme aracı', cat: 'sys', size: '4 MB', installed: false },
      { id: 'gufw', name: 'Gufw Güvenlik Duvarı Yöneticisi', deb: 'gufw', desc: 'UFW güvenlik duvarı kurallarını ve ağ bağlantı izinlerini kolayca yönetme arayüzü', cat: 'sys', size: '5 MB', installed: false },
      { id: 'clamav', name: 'ClamAV Güvenlik Motoru', deb: 'clamav', desc: 'Dosya, posta ve indirme güvenliği için açık kaynaklı virüs tarayıcı', cat: 'sys', size: '45 MB', installed: false },
      { id: 'chkrootkit', name: 'Chkrootkit Rootkit Denetleyicisi', deb: 'chkrootkit', desc: 'Sistem çekirdeği ve süreçlerde gizli rootkit izlerini tespit etme aracı', cat: 'sys', size: '2 MB', installed: false },
      { id: 'rkhunter', name: 'Rootkit Hunter Bütünlük Denetimi', deb: 'rkhunter', desc: 'Sistem dosyaları hash doğrulaması ve şüpheli ikilileri tarama kiti', cat: 'sys', size: '5 MB', installed: false },
      { id: 'powertop', name: 'PowerTOP Enerji Teşhis Aracı', deb: 'powertop', desc: 'Dizüstü bilgisayarlarda güç tüketimini ve uykudan uyandıran süreçleri izleme', cat: 'sys', size: '2 MB', installed: false },
      { id: 'tlp', name: 'TLP Gelişmiş Güç Yöneticisi', deb: 'tlp', desc: 'Linux çekirdeği için otomatik pil ömrü uzatma ve enerji tasarrufu paketi', cat: 'sys', size: '2 MB', installed: false },
      { id: 'linux-cpupower', name: 'cpupower İşlemci Hız Profili', deb: 'linux-cpupower', desc: 'İşlemci frekans ölçeklendirmesini ve performans/powersave modunu ayarlama', cat: 'sys', size: '2 MB', installed: false },
      { id: 'lsscsi', name: 'lsscsi Depolama Aygıtları Dökümü', deb: 'lsscsi', desc: 'SATA, NVMe ve SCSI disklerin detaylı donanım mimarisi listesi', cat: 'sys', size: '1 MB', installed: false },
      { id: 'dmidecode', name: 'Dmidecode BIOS & SMBIOS Okuyucu', deb: 'dmidecode', desc: 'Anakart modeli, BIOS sürümü ve RAM yuvalarının donanım dökümü', cat: 'sys', size: '1 MB', installed: false },
      { id: 'ethtool', name: 'Ethtool Ethernet Sürücü Denetimi', deb: 'ethtool', desc: 'Ağ kartı hızını (100M/1G/10G), dubleks modunu ve donanım boşaltmalarını kontrol etme', cat: 'sys', size: '1 MB', installed: false },
      { id: 'wipe', name: 'Wipe Güvenli Veri İmha Aracı', deb: 'wipe', desc: 'Gizli dosyaları ve disk sektörlerini DoD standardında geri getirilemez silme', cat: 'sys', size: '1 MB', installed: false },
      { id: 'srm', name: 'Secure Delete Güvenli Silici', deb: 'secure-delete', desc: 'Bellek, takas alanı ve dosyalardaki verileri kurtarılamaz biçimde temizleme', cat: 'sys', size: '1 MB', installed: false },
      { id: 'dosfstools', name: 'Dosfstools FAT32 Onarım Araçları', deb: 'dosfstools', desc: 'FAT16 ve FAT32 USB belleklerini biçimlendirme ve fsck ile onarma kiti', cat: 'sys', size: '2 MB', installed: false },
      { id: 'ntfs-3g', name: 'NTFS-3G Dosya Sistemi Desteği', deb: 'ntfs-3g', desc: 'Windows disk bölümlerini tam okuma ve yazma desteğiyle bağlama sürücüsü', cat: 'sys', size: '3 MB', installed: false },

      // 11. KAPSAM GENİŞLETMESİ III: OKUL, ROBOTİK, YAZICI/TARAYICI VE UZMANLIK PAKETLERİ (100)
      // 11a. OKUL, FEN, DİL & ROBOTİK (16)
      { id: 'thonny', name: 'Thonny Python IDE (Eğitim)', deb: 'thonny', desc: 'Öğrenciler ve öğretmenler için adım adım değişken izlemeli Python geliştirme ortamı', cat: 'dev', school: true, size: '24 MB', installed: false },
      { id: 'idle', name: 'IDLE Python Eğitim IDE', deb: 'idle', desc: 'Okullarda Python programlamaya giriş için sade, etkileşimli kabuk ve betik editörü', cat: 'dev', school: true, size: '12 MB', installed: false },
      { id: 'arduino', name: 'Arduino IDE Robotik Kodlama', deb: 'arduino', desc: 'Arduino mikrodenetleyici kartlarını programlama ve seri port izleme ortamı', cat: 'dev', school: true, size: '145 MB', installed: false },
      { id: 'fritzing', name: 'Fritzing Elektronik Devre Tasarımı', deb: 'fritzing', desc: 'Breadboard devre şeması kurma, sensör bağlantısı ve PCB baskı devre çizim aracı', cat: 'dev', school: true, size: '78 MB', installed: false },
      { id: 'kicad', name: 'KiCad Elektronik Şema & PCB Stüdyosu', deb: 'kicad', desc: 'Çok katmanlı elektronik devre şeması, 3B bileşen görüntüleme ve PCB tasarım paketi', cat: 'dev', school: true, size: '380 MB', installed: false },
      { id: 'logisim', name: 'Logisim Mantık Devresi Simülatörü', deb: 'logisim', desc: 'Okullar ve mühendislik dersleri için görsel dijital devre tasarımı ve simülasyon aracı', cat: 'dev', school: true, size: '14 MB', installed: false },
      { id: 'gperiodic', name: 'GPeriodic Kimya Element Tablosu', deb: 'gperiodic', desc: 'Atom ağırlıkları, erime noktaları ve elektron dizilimleriyle hafif periyodik cetvel', cat: 'office', school: true, size: '2 MB', installed: false },
      { id: 'kanagram', name: 'Kanagram Kelime Bulmaca Oyunu', deb: 'kanagram', desc: 'Harfleri karışık verilen kelimeleri çözerek kelime dağarcığını geliştiren eğitim oyunu', cat: 'util', school: true, size: '9 MB', installed: false },
      { id: 'khangman', name: 'KHangMan Kelime Tahmin Oyunu', deb: 'khangman', desc: 'Kategorilere ayrılmış sözcüklerle dil ve imla pratiği sağlayan sınıf oyunu', cat: 'util', school: true, size: '8 MB', installed: false },
      { id: 'kwordquiz', name: 'KWordQuiz Kelime ve Kavram Kartları', deb: 'kwordquiz', desc: 'Yabancı dil ve ders terimlerini çoktan seçmeli ve soru-cevap kartlarıyla çalışma aracı', cat: 'office', school: true, size: '6 MB', installed: false },
      { id: 'parley', name: 'Parley Dil ve Kelime Eğitmeni', deb: 'parley', desc: 'Ezber kartları, eş anlamlılar ve telaffuz testleriyle dil öğrenim yazılımı', cat: 'office', school: true, size: '14 MB', installed: false },
      { id: 'ktouch', name: 'KTouch On Parmak Klavye Kursu', deb: 'ktouch', desc: 'Hız ve doğruluk grafikleriyle adım adım on parmak daktilo eğitim programı', cat: 'util', school: true, size: '11 MB', installed: false },
      { id: 'klavaro', name: 'Klavaro Dokunmatik Yazım Öğretmeni', deb: 'klavaro', desc: 'F ve Q klavye düzenlerini destekleyen hafif on parmak klavye alıştırma aracı', cat: 'util', school: true, size: '4 MB', installed: false },
      { id: 'minuet', name: 'Minuet Müzik Kulağı Eğitimi', deb: 'minuet', desc: 'Akorlar, aralıklar, gamlar ve ritim egzersizleriyle müzik dersi yazılımı', cat: 'media', school: true, size: '28 MB', installed: false },
      { id: 'kgeography', name: 'KGeography Coğrafya ve Harita Testi', deb: 'kgeography', desc: 'Ülkeler, başkentler, bayraklar ve kıtalar üzerinde etkileşimli harita sınavları', cat: 'office', school: true, size: '16 MB', installed: false },
      { id: 'LabPlot', name: 'LabPlot Bilimsel Veri ve Grafik Analizi', deb: 'labplot', desc: 'Deney verilerini görselleştirme, eğri uydurma ve istatistiksel grafik çizim stüdyosu', cat: 'office', school: true, size: '34 MB', installed: false },

      // 11b. YAZICI, TARAYICI, PDF & OFİS ARAÇLARI (14)
      { id: 'simple-scan', name: 'Belge Tarayıcı (Simple Scan)', deb: 'simple-scan', desc: 'SANE uyumlu tarayıcılardan tek tıkla çok sayfalı PDF ve görsel tarama uygulaması', cat: 'office', size: '5 MB', installed: false },
      { id: 'system-config-printer', name: 'Yazıcı ve CUPS Yöneticisi', deb: 'system-config-printer', desc: 'USB ve ağ yazıcılarını otomatik bulma, sürücü tanıtma ve kuyruk yönetim arayüzü', cat: 'sys', size: '6 MB', installed: false },
      { id: 'xsane', name: 'XSane Gelişmiş Tarayıcı Arayüzü', deb: 'xsane', desc: 'Renk kalibrasyonu, DPI ayarı ve çoklu sayfa yakalama destekli tarayıcı yazılımı', cat: 'graphics', size: '8 MB', installed: false },
      { id: 'gscan2pdf', name: 'gscan2pdf OCR Destekli Tarama', deb: 'gscan2pdf', desc: 'Kağıt belgeleri tarayıp Tesseract OCR ile aranabilir PDF belgesine dönüştürme', cat: 'office', size: '9 MB', installed: false },
      { id: 'okular', name: 'Okular Evrensel Belge Okuyucu', deb: 'okular', desc: 'PDF, EPUB, DjVu ve çizgi romanlarda vurgulama, not alma ve dijital imza desteği', cat: 'office', size: '38 MB', installed: false },
      { id: 'atril', name: 'Atril Hafif Belge Görüntüleyici', deb: 'atril', desc: 'MATE masaüstünün hızlı açılan PDF, PostScript ve DjVu okuyucusu', cat: 'office', size: '12 MB', installed: false },
      { id: 'qpdfview', name: 'qpdfview Sekmeli PDF Okuyucu', deb: 'qpdfview', desc: 'Düşük bellek tüketen, sekme ve yer imi destekli hızlı PDF görüntüleyici', cat: 'office', size: '4 MB', installed: false },
      { id: 'foliate', name: 'Foliate Modern E-Kitap Okuyucu', deb: 'foliate', desc: 'EPUB, Mobipocket ve Kindle kitapları için sözlük ve not destekli okuma arayüzü', cat: 'office', size: '9 MB', installed: false },
      { id: 'fbreader', name: 'FBReader E-Kitap Kütüphanesi', deb: 'fbreader', desc: 'Eski donanımlarda bile anında açılan hafif e-kitap okuyucu', cat: 'office', size: '6 MB', installed: false },
      { id: 'homebank', name: 'HomeBank Kişisel Muhasebe ve Bütçe', deb: 'homebank', desc: 'Gelir-gider takibi, banka hesapları ve kategori bazlı bütçe grafikleri', cat: 'office', size: '8 MB', installed: false },
      { id: 'gnucash', name: 'GnuCash Çift Kayıtlı Muhasebe', deb: 'gnucash', desc: 'Küçük işletmeler ve kişisel finans için fatura, mizan ve bilanço yazılımı', cat: 'office', size: '68 MB', installed: false },
      { id: 'osmo', name: 'Osmo Kişisel Ajanda ve Takvim', deb: 'osmo', desc: 'İnternet bağlantısı gerektirmeyen yerel takvim, görev listesi ve kişi rehberi', cat: 'office', size: '3 MB', installed: false },
      { id: 'focuswriter', name: 'FocusWriter Dikkat Dağıtmayan Yazar', deb: 'focuswriter', desc: 'Tam ekran daktilo sesi, günlük kelime hedefi ve zamanlayıcılı metin yazarı', cat: 'office', size: '14 MB', installed: false },
      { id: 'goldendict', name: 'GoldenDict Çevrimdışı Çoklu Sözlük', deb: 'goldendict', desc: 'StarDict, Babylon ve Wikipedia paketlerini tek pencerede arayan kapsamlı sözlük', cat: 'office', size: '16 MB', installed: false },

      // 11c. YAZILIM GELİŞTİRME & MÜHENDİSLİK (16)
      { id: 'qtcreator', name: 'Qt Creator C++/QML IDE', deb: 'qtcreator', desc: 'Masaüstü ve gömülü sistemler için görsel arayüz tasarımcılı C++ geliştirme ortamı', cat: 'dev', size: '95 MB', installed: false },
      { id: 'lazarus', name: 'Lazarus Free Pascal RAD IDE', deb: 'lazarus', desc: 'Delphi uyumlu sürükle-bırak form tasarımcılı hızlı yerel uygulama geliştirici', cat: 'dev', size: '160 MB', installed: false },
      { id: 'bluefish', name: 'Bluefish Web ve HTML Editörü', deb: 'bluefish', desc: 'HTML, CSS, PHP ve JavaScript projeleri için hızlı çoklu dosya web editörü', cat: 'dev', size: '8 MB', installed: false },
      { id: 'cudatext', name: 'CudaText Hızlı Kod Editörü', flatpak: 'io.github.cudatext.CudaText-Qt', desc: '200den fazla dil için sözdizimi vurgulu, çoklu imleçli hafif kod düzenleyici', cat: 'dev', size: '38 MB', installed: false },
      { id: 'gitg', name: 'gitg Grafiksel Git Depo Tarayıcısı', deb: 'gitg', desc: 'Commit geçmişini, dalları ve satır farklarını görsel ağaç olarak inceleme aracı', cat: 'dev', size: '7 MB', installed: false },
      { id: 'gitk', name: 'gitk Klasik Git Geçmiş Görüntüleyici', deb: 'gitk', desc: 'Büyük kod depolarında hızlı dal ve tarihçe inceleme aracı', cat: 'dev', size: '2 MB', installed: false },
      { id: 'tig', name: 'Tig Konsol Git Arayüzü', deb: 'tig', desc: 'Terminal içinde etkileşimli git log, diff ve blame gezgini', cat: 'dev', size: '2 MB', installed: false },
      { id: 'subversion', name: 'Apache Subversion (SVN)', deb: 'subversion', desc: 'Merkezi sürüm kontrol sistemi istemcisi ve depo yönetim araçları', cat: 'dev', size: '6 MB', installed: false },
      { id: 'mercurial', name: 'Mercurial (hg) Dağıtık Sürüm Kontrolü', deb: 'mercurial', desc: 'Büyük ölçekli kod tabanları için hızlı dağıtık kaynak kontrol sistemi', cat: 'dev', size: '12 MB', installed: false },
      { id: 'strace', name: 'strace Sistem Çağrısı İzleyici', deb: 'strace', desc: 'Çalışan süreçlerin Linux çekirdeğine yaptığı sistem çağrılarını ve sinyalleri teşhis etme', cat: 'dev', size: '2 MB', installed: false },
      { id: 'ltrace', name: 'ltrace Dinamik Kütüphane İzleyici', deb: 'ltrace', desc: 'Programların paylaşımlı kütüphane (.so) fonksiyon çağrılarını yakalama aracı', cat: 'dev', size: '1 MB', installed: false },
      { id: 'cppcheck', name: 'Cppcheck C/C++ Statik Analiz', deb: 'cppcheck', desc: 'C ve C++ kodlarında bellek taşması ve tanımsız davranışları derleme öncesi bulma', cat: 'dev', size: '6 MB', installed: false },
      { id: 'clang-format', name: 'Clang-Format Kod Biçimlendirici', deb: 'clang-format', desc: 'C, C++, Java ve JavaScript kodlarını kurumsal stil kurallarına göre otomatik hizalama', cat: 'dev', size: '5 MB', installed: false },
      { id: 'meson', name: 'Meson Modern Derleme Sistemi', deb: 'meson', desc: 'Ninja arka ucuyla çalışan hızlı ve okunabilir proje yapılandırma motoru', cat: 'dev', size: '4 MB', installed: false },
      { id: 'autoconf', name: 'GNU Autoconf Yapılandırma Üretici', deb: 'autoconf', desc: 'UNIX kaynak paketleri için taşınabilir configure betikleri üreten derleme aracı', cat: 'dev', size: '3 MB', installed: false },
      { id: 'pkg-config', name: 'pkg-config Derleme Bayrak Çözücü', deb: 'pkg-config', desc: 'C/C++ kütüphanelerinin başlık ve bağlayıcı bayraklarını derleyiciye bildiren araç', cat: 'dev', size: '1 MB', installed: false },

      // 11d. SES, VİDEO & MEDYA (14)
      { id: 'qmmp', name: 'Qmmp Winamp Tarzı Müzik Çalar', deb: 'qmmp', desc: 'Klasik Winamp görünüm temalarını ve 10 bant ekolayzeri destekleyen ses oynatıcı', cat: 'media', size: '14 MB', installed: false },
      { id: 'elisa', name: 'Elisa Modern Müzik Çalar', deb: 'elisa', desc: 'Albüm kapakları, sanatçı görünümü ve yerel indeksleme destekli müzik oynatıcı', cat: 'media', size: '18 MB', installed: false },
      { id: 'kwave', name: 'Kwave Ses Dalga Düzenleyici', deb: 'kwave', desc: 'WAV, OGG ve MP3 ses kayıtlarını kesme, birleştirme ve tayf analizi yapma aracı', cat: 'media', size: '15 MB', installed: false },
      { id: 'hydrogen', name: 'Hydrogen Davul Makinesi ve Ritim Stüdyosu', deb: 'hydrogen', desc: 'Örneklem tabanlı profesyonel davul dizici ve ritim kompozisyon yazılımı', cat: 'media', size: '24 MB', installed: false },
      { id: 'qsynth', name: 'Qsynth FluidSynth MIDI Sentezleyici', deb: 'qsynth', desc: 'SoundFont (.sf2/.sf3) destekli gerçek zamanlı MIDI ses sentezleyici arayüzü', cat: 'media', size: '4 MB', installed: false },
      { id: 'qjackctl', name: 'QjackCtl JACK Ses Yönlendirici', deb: 'qjackctl', desc: 'Düşük gecikmeli profesyonel ses stüdyosu bağlantıları ve yama paneli yöneticisi', cat: 'media', size: '5 MB', installed: false },
      { id: 'vokoscreen-ng', name: 'vokoscreenNG Ders ve Ekran Kaydedici', deb: 'vokoscreen-ng', desc: 'Kamera penceresi, büyüteç ve tıklama vurgusuyla ders videosu kaydetme aracı', cat: 'media', school: true, size: '9 MB', installed: false },
      { id: 'kazam', name: 'Kazam Pratik Ekran Kaydı ve Görüntüsü', deb: 'kazam', desc: 'Masaüstü videosu ve mikrofon sesini tek tıkla MP4/WebM olarak kaydeden hafif araç', cat: 'media', size: '4 MB', installed: false },
      { id: 'mediainfo-gui', name: 'MediaInfo Ses ve Video Teknik Analizi', deb: 'mediainfo-gui', desc: 'Video dosyalarının kodek, bit hızı, kare hızı ve ses kanalı verilerini inceleme', cat: 'media', size: '5 MB', installed: false },
      { id: 'mkvtoolnix-gui', name: 'MKVToolNix Matroska Video Birleştirici', deb: 'mkvtoolnix-gui', desc: 'MKV videolarına yeniden kodlama yapmadan altyazı ve ses izi ekleme/çıkarma', cat: 'media', size: '26 MB', installed: false },
      { id: 'subtitleeditor', name: 'Subtitle Editor Altyazı Stüdyosu', deb: 'subtitleeditor', desc: 'SRT ve ASS altyazılarının zamanlamasını ses dalga formu üzerinde senkronize etme', cat: 'media', size: '8 MB', installed: false },
      { id: 'gaupol', name: 'Gaupol Altyazı Çeviri ve Düzeltme', deb: 'gaupol', desc: 'Altyazı dosyalarında toplu süre kaydırma, hız düzeltme ve metin çevirisi aracı', cat: 'media', size: '5 MB', installed: false },
      { id: 'kid3-qt', name: 'Kid3 Gelişmiş Müzik Etiketleyici', deb: 'kid3-qt', desc: 'ID3v1, ID3v2, FLAC ve Ogg ses etiketlerini dosya adlarından otomatik doldurma', cat: 'media', size: '9 MB', installed: false },
      { id: 'cdparanoia', name: 'cdparanoia Hatasız Ses CD Okuyucu', deb: 'cdparanoia', desc: 'Çizik ses CDlerinden hata düzeltmeli dijital ses verisi çıkarma aracı', cat: 'media', size: '2 MB', installed: false },

      // 11e. GRAFİK, FOTOĞRAF & 3B TASARIM (12)
      { id: 'hugin', name: 'Hugin Panorama Fotoğraf Birleştirici', deb: 'hugin', desc: 'Çoklu fotoğrafları dikişsiz 360 derece panoramik görüntülere dönüştürme stüdyosu', cat: 'graphics', size: '48 MB', installed: false },
      { id: 'luminance-hdr', name: 'Luminance HDR Yüksek Dinamik Aralık', deb: 'luminance-hdr', desc: 'Farklı pozlamalı fotoğraflardan HDR görüntü üretme ve ton eşleme yazılımı', cat: 'graphics', size: '22 MB', installed: false },
      { id: 'enblend', name: 'Enblend Görüntü Harmanlayıcı', deb: 'enblend', desc: 'Fotoğraf birleşim çizgilerini renk ve parlaklık geçişleriyle görünmez kılma aracı', cat: 'graphics', size: '6 MB', installed: false },
      { id: 'nomacs', name: 'nomacs Hızlı ve Şık Resim Görüntüleyici', flatpak: 'org.nomacs.ImageLounge', desc: 'RAW, PSD ve ZIP içi görselleri açabilen, yan yana fotoğraf karşılaştırma destekli gezgin', cat: 'graphics', size: '48 MB', installed: false },
      { id: 'ristretto', name: 'Ristretto Hafif Resim Görüntüleyici', deb: 'ristretto', desc: 'Düşük donanımlı bilgisayarlar için anında açılan sade fotoğraf görüntüleyici', cat: 'graphics', size: '3 MB', installed: false },
      { id: 'mirage', name: 'Mirage Hızlı GTK Görsel Tarayıcı', deb: 'mirage', desc: 'Kırpma, yeniden boyutlandırma ve küçük resim şeridine sahip hızlı resim açıcı', cat: 'graphics', size: '2 MB', installed: false },
      { id: 'gpick', name: 'Gpick Gelişmiş Renk Seçici ve Palet', deb: 'gpick', desc: 'Ekrandan piksel rengi alma, HEX/RGB/HSL dönüşümü ve uyumlu renk paleti üretici', cat: 'graphics', size: '4 MB', installed: false },
      { id: 'gcolor3', name: 'Gcolor3 Renk Seçici ve Palet', deb: 'gcolor3', desc: 'Ekrandan piksel rengi alma, HEX/RGB/HSV dönüşümü ve kişisel renk paleti oluşturucu', cat: 'graphics', size: '2 MB', installed: false },
      { id: 'potrace', name: 'Potrace Bitmapten Vektöre Dönüştürücü', deb: 'potrace', desc: 'Taranmış siyah-beyaz çizimleri ve logoları pürüzsüz SVG/EPS vektörlerine çevirme', cat: 'graphics', size: '1 MB', installed: false },
      { id: 'birdfont', name: 'BirdFont Vektörel Yazı Tipi Editörü', deb: 'birdfont', desc: 'Özel SVG vektör çizimlerinden TTF, OTF ve EOT yazı tipleri üretme aracı', cat: 'graphics', size: '12 MB', installed: false },
      { id: 'pngquant', name: 'pngquant Akıllı PNG Boyut Küçültücü', deb: 'pngquant', desc: 'Alfa saydamlığını koruyarak PNG dosyalarını %70e kadar küçülten sıkıştırıcı', cat: 'graphics', size: '1 MB', installed: false },
      { id: 'webp', name: 'WebP Görsel Dönüştürme Araçları (cwebp)', deb: 'webp', desc: 'PNG ve JPEG resimleri modern WebP formatına dönüştürme ve açma kiti', cat: 'graphics', size: '2 MB', installed: false },

      // 11f. AĞ, SUNUCU & GÜVENLİ İLETİŞİM (14)
      { id: 'putty', name: 'PuTTY SSH, Telnet ve Seri Konsol', deb: 'putty', desc: 'Ağ anahtarlarına, yönlendiricilere ve seri portlara bağlanma arayüzü', cat: 'net', size: '5 MB', installed: false },
      { id: 'vinagre', name: 'TightVNC / xtightvncviewer Uzak Ekran', deb: 'xtightvncviewer', desc: 'Uzak bilgisayarların ekranına VNC protokolüyle düşük gecikmeli bağlanma istemcisi', cat: 'net', size: '2 MB', installed: false },
      { id: 'tigervnc-viewer', name: 'TigerVNC Yüksek Hızlı VNC İstemcisi', deb: 'tigervnc-viewer', desc: 'Şifreli ve sıkıştırmalı uzak masaüstü bağlantı görüntüleyicisi', cat: 'net', size: '4 MB', installed: false },
      { id: 'x11vnc', name: 'x11vnc Mevcut Ekranı Paylaşma Sunucusu', deb: 'x11vnc', desc: 'Açık olan X11 masaüstü oturumunu ağ üzerinden öğretmen veya teknik desteğe açma', cat: 'net', school: true, size: '3 MB', installed: false },
      { id: 'veyon-service', name: 'Veyon Sınıf Laboratuvar Yönetimi', deb: 'veyon-master', desc: 'Bilgisayar laboratuvarında öğrenci ekranlarını izleme ve ders yayınlama sistemi', cat: 'net', school: true, size: '35 MB', installed: false },
      { id: 'liferea', name: 'Liferea Haber ve RSS Okuyucu', deb: 'liferea', desc: 'Blogları, haber sitelerini ve podcast yayınlarını çevrimdışı okuma desteğiyle takip etme', cat: 'net', size: '7 MB', installed: false },
      { id: 'claws-mail', name: 'Claws Mail Hızlı E-Posta İstemcisi', deb: 'claws-mail', desc: 'Düşük bellekli sistemlerde bile saniyede açılan hafif POP3/IMAP e-posta istemcisi', cat: 'net', size: '12 MB', installed: false },
      { id: 'geary', name: 'Geary Konuşma Odaklı E-Posta', deb: 'geary', desc: 'E-postaları sohbet dizisi şeklinde gruplayan temiz ve sade masaüstü posta istemcisi', cat: 'net', size: '18 MB', installed: false },
      { id: 'mutt', name: 'Mutt Konsol E-Posta İstemcisi', deb: 'mutt', desc: 'Klavye kısayolları ve GPG şifrelemesiyle çalışan güçlü terminal posta okuyucu', cat: 'net', size: '4 MB', installed: false },
      { id: 'irssi', name: 'Irssi Terminal IRC Sohbet İstemcisi', deb: 'irssi', desc: 'Düşük kaynak tüketen, Perl betikleriyle özelleştirilebilir konsol IRC programı', cat: 'net', size: '3 MB', installed: false },
      { id: 'lftp', name: 'LFTP Gelişmiş Dosya Transfer Aracı', deb: 'lftp', desc: 'FTP, FTPS, HTTP ve SFTP sunucularıyla otomatik dizin eşitleme ve kuyruk aktarımı', cat: 'net', size: '3 MB', installed: false },
      { id: 'sshfs', name: 'SSHFS Uzak Klasör Bağlayıcı', deb: 'sshfs', desc: 'Uzak SSH sunucularındaki dizinleri yerel bir klasörmüş gibi dosya yöneticisine bağlama', cat: 'net', size: '1 MB', installed: false },
      { id: 'avahi-discover', name: 'Avahi Yerel Ağ Servis Keşfedici', deb: 'avahi-discover', desc: 'Yerel ağdaki mDNS/Zeroconf yazıcıları, dosya paylaşımlarını ve cihazları listeleme', cat: 'net', size: '2 MB', installed: false },
      { id: 'wavemon', name: 'wavemon Kablosuz Ağ Sinyal Analizörü', deb: 'wavemon', desc: 'Wi-Fi sinyal kalitesini, gürültü seviyesini ve kanal yoğunluğunu canlı ölçen konsol aracı', cat: 'net', size: '1 MB', installed: false },

      // 11g. SİSTEM, DONANIM & GÜNLÜK YARDIMCILAR (14)
      { id: 'psensor', name: 'Psensor Grafiksel Sıcaklık Monitörü', deb: 'psensor', desc: 'İşlemci, ekran kartı ve sabit disk sıcaklıklarını canlı çizgi grafiklerle izleme', cat: 'sys', size: '3 MB', installed: false },
      { id: 'arandr', name: 'ARandR Ekran ve Projeksiyon Düzeni', deb: 'arandr', desc: 'Çoklu monitör, akıllı tahta ve projeksiyon çözünürlük/konum ayarlarını görsel yapma', cat: 'sys', school: true, size: '2 MB', installed: false },
      { id: 'lxrandr', name: 'LXRandR Hızlı Monitör Ayarlayıcı', deb: 'lxrandr', desc: 'İkinci ekranı ve projeksiyonu tek tıkla yansıtma veya genişletme aracı', cat: 'sys', size: '1 MB', installed: false },
      { id: 'gdebi', name: 'GDebi .deb Paket Kurucu', deb: 'gdebi', desc: 'İndirilen yerel .deb paketlerini bağımlılıklarını otomatik çözerek kuran arayüz', cat: 'sys', size: '3 MB', installed: false },
      { id: 'aptitude', name: 'Aptitude Konsol Paket Yöneticisi', deb: 'aptitude', desc: 'Gelişmiş bağımlılık çözücülü etkileşimli terminal paket yönetim arayüzü', cat: 'sys', size: '6 MB', installed: false },
      { id: 'exfatprogs', name: 'exFAT Büyük USB Disk Desteği', deb: 'exfatprogs', desc: '64 GB üstü exFAT biçimli USB bellek ve SD kartları oluşturma ve onarma araçları', cat: 'sys', size: '1 MB', installed: false },
      { id: 'partclone', name: 'Partclone Bölüm Yedekleme Motoru', deb: 'partclone', desc: 'Yalnızca dolu disk bloklarını okuyarak hızlı bölüm imajı alma ve geri yükleme aracı', cat: 'sys', size: '3 MB', installed: false },
      { id: 'nvme-cli', name: 'nvme-cli NVMe SSD Yönetim Aracı', deb: 'nvme-cli', desc: 'M.2 NVMe disklerin sağlık yüzdesi, sıcaklık ve donanım yazılımı bilgilerini okuma', cat: 'sys', size: '2 MB', installed: false },
      { id: 'hdparm', name: 'hdparm SATA Disk Hız ve Güç Aracı', deb: 'hdparm', desc: 'Sabit disk okuma hızı testi ve uyku süresi parametrelerini yapılandırma', cat: 'sys', size: '1 MB', installed: false },
      { id: 'keepassxc', name: 'KeePassXC Şifre Kasası Yöneticisi', deb: 'keepassxc', desc: 'Parolaları çevrimdışı AES-256 şifreli veritabanında güvenle saklama ve otomatik doldurma', cat: 'util', size: '28 MB', installed: false },
      { id: 'galculator', name: 'Galculator Bilimsel ve Cebirsel Hesap', deb: 'galculator', desc: 'Standart, bilimsel, finansal ve programcı (HEX/BIN) modlarına sahip hesap makinesi', cat: 'util', size: '3 MB', installed: false },
      { id: 'xarchiver', name: 'Xarchiver Hafif Arşiv Yöneticisi', deb: 'xarchiver', desc: '7z, ZIP, RAR, TAR.GZ veXZ arşivlerini görsel pencerede açma ve oluşturma aracı', cat: 'util', size: '4 MB', installed: false },
      { id: 'engrampa', name: 'Engrampa Arşiv ve Sıkıştırma Yöneticisi', deb: 'engrampa', desc: 'Şifreli arşivleri, çok parçalı paketleri ve ISO dosyalarını açan görsel arşivci', cat: 'util', size: '8 MB', installed: false },
      { id: 'onboard', name: 'Onboard Dokunmatik Ekran Klavyesi', deb: 'onboard', desc: 'Akıllı tahtalar ve dokunmatik ekranlar için özelleştirilebilir Türkçe ekran klavyesi', cat: 'util', school: true, size: '9 MB', installed: false },

      // --- v4.7 Genişletilmiş Doğrulanmış Flatpak Uygulamaları (19 Adet) ---
      { id: 'flatpak-zen-browser', name: 'Zen Browser Modern Gizlilik Tarayıcısı', flatpak: 'app.zen_browser.zen', desc: 'Firefox tabanlı, dikey sekmeli ve yüksek gizlilik odaklı modern web tarayıcısı', cat: 'net', featured: true, size: '135 MB', installed: false },
      { id: 'flatpak-floorp', name: 'Floorp Özelleştirilebilir Tarayıcı', flatpak: 'one.ablaze.floorp', desc: 'Güçlü sekme yönetimi ve yan panel desteği sunan Firefox tabanlı hızlı tarayıcı', cat: 'net', size: '125 MB', installed: false },
      { id: 'flatpak-firefox', name: 'Firefox Quantum (Flatpak Güncel Sürüm)', flatpak: 'org.mozilla.firefox', desc: 'En güncel Firefox masaüstü sürümünü sandbox korumasıyla çalıştıran Flatpak paketi', cat: 'net', size: '115 MB', installed: false },
      { id: 'flatpak-bitwarden', name: 'Bitwarden Açık Kaynak Parola Yöneticisi', flatpak: 'com.bitwarden.desktop', desc: 'Uçtan uca şifreli parola kasası, otomatik doldurma ve cihazlar arası eşitleme', cat: 'sys', size: '95 MB', installed: false },
      { id: 'flatpak-bottles', name: 'Bottles Windows Uygulama Kapsayıcısı', flatpak: 'com.usebottles.bottles', desc: 'Windows program ve oyunlarını izole Wine/Proton ortamlarında tek tıkla çalıştırır', cat: 'util', featured: true, size: '180 MB', installed: false },
      { id: 'flatpak-prism', name: 'Prism Launcher (Minecraft Açık Başlatıcı)', flatpak: 'org.prismlauncher.PrismLauncher', desc: 'Mod paketleri, çoklu sürüm ve profil yönetimi destekli açık kaynak Minecraft başlatıcısı', cat: 'util', size: '85 MB', installed: false },
      { id: 'flatpak-vscodium', name: 'VSCodium Açık Kaynak Kod Editörü', flatpak: 'com.vscodium.codium', desc: 'Telemetrisiz, saf açık kaynak VS Code derlemesi; eklenti ve Git entegrasyonlu IDE', cat: 'dev', featured: true, size: '145 MB', installed: false },
      { id: 'flatpak-obs', name: 'OBS Studio (Flatpak Güncel Sürüm)', flatpak: 'com.obsproject.Studio', desc: 'En güncel eklenti ve donanım kodlayıcı desteğiyle canlı yayın ve ekran kaydı stüdyosu', cat: 'media', size: '190 MB', installed: false },
      { id: 'flatpak-blender', name: 'Blender 3D Modelleme (Flatpak Güncel)', flatpak: 'org.blender.Blender', desc: 'En son Cycles, Geometry Nodes ve heykel araçlarıyla güncel Blender 3D sürümü', cat: 'graphics', size: '380 MB', installed: false },
      { id: 'flatpak-krita', name: 'Krita Dijital Çizim (Flatpak)', flatpak: 'org.kde.krita', desc: 'Güncel fırça motoru, PSD ve animasyon desteğiyle dijital resim ve konsept sanat aracı', cat: 'graphics', size: '210 MB', installed: false },
      { id: 'flatpak-gimp', name: 'GIMP Görsel Editör (Flatpak Güncel)', flatpak: 'org.gimp.GIMP', desc: 'Tahribatsız düzenleme ve kapsamlı eklenti desteği sunan güncel GIMP Flatpak sürümü', cat: 'graphics', size: '175 MB', installed: false },
      { id: 'flatpak-warehouse', name: 'Warehouse Flatpak Uygulama Yöneticisi', flatpak: 'io.github.flattool.Warehouse', desc: 'Kurulu Flatpak uygulamalarını yönetme, artık veri temizleme ve sürüm geri alma aracı', cat: 'sys', size: '25 MB', installed: false },
      { id: 'flatpak-extension-manager', name: 'Extension Manager Eklenti Yöneticisi', flatpak: 'com.mattjakeman.ExtensionManager', desc: 'Masaüstü kabuk eklentilerini tarayıp tek tıkla kurma, güncelleme ve yapılandırma aracı', cat: 'sys', size: '20 MB', installed: false },
      { id: 'flatpak-mission-center', name: 'Mission Center Modern Sistem İzleyici', flatpak: 'io.missioncenter.MissionCenter', desc: 'CPU, GPU, RAM, disk ve ağ kullanımını grafiklerle gösteren modern performans monitörü', cat: 'sys', size: '55 MB', installed: false },
      { id: 'flatpak-blanket', name: 'Blanket Odaklanma ve Ortam Sesleri', flatpak: 'com.rafaelmardojai.Blanket', desc: 'Ders çalışırken veya kod yazarken yağmur, kafe ve doğa seslerini karıştırıp dinleyin', cat: 'media', school: true, size: '18 MB', installed: false },
      { id: 'flatpak-localsend', name: 'LocalSend Yerel Ağ Dosya Paylaşımı', flatpak: 'org.localsend.localsend_app', desc: 'İnternet gerekmeden aynı Wi-Fi ağındaki telefon ve bilgisayarlara anında dosya gönderir', cat: 'net', featured: true, size: '38 MB', installed: false },
      { id: 'flatpak-teams', name: 'Teams for Linux (Microsoft Teams)', flatpak: 'com.github.IsmaelMartinez.teams_for_linux', desc: 'Okul, sınıf ve ekip toplantıları için topluluk yapımı hafif Microsoft Teams istemcisi', cat: 'office', school: true, size: '110 MB', installed: false },
      { id: 'flatpak-freetube', name: 'FreeTube Reklamsız YouTube İstemcisi', flatpak: 'io.freetubeapp.FreeTube', desc: 'Hesap açmadan abonelikleri yerel tutan, gizlilik odaklı masaüstü video oynatıcısı', cat: 'media', size: '95 MB', installed: false },
      { id: 'flatpak-anydesk', name: 'AnyDesk Uzak Masaüstü Bağlantısı', flatpak: 'com.anydesk.Anydesk', desc: 'Düşük gecikmeli uzaktan destek ve bilgisayar kontrolü için hızlı uzak masaüstü aracı', cat: 'net', size: '45 MB', installed: false },

      // --- v4.7 Devuan Excalibur Doğrulanmış Ek APT Paketleri (162 Adet) ---
      // Oyun & Yardımcılar / Eğitim
      { id: 'luanti', name: 'Luanti (Minetest) Açık Kaynak Voxel Oyunu', deb: 'luanti', desc: 'Modlanabilir açık kaynak blok dünyası ve çok oyunculu hayatta kalma oyunu', cat: 'util', featured: true, size: '65 MB', installed: false },
      { id: 'wesnoth', name: 'Battle for Wesnoth Strateji Oyunu', deb: 'wesnoth', desc: 'Zengin senaryo ve çevrimiçi savaşlara sahip sıra tabanlı fantastik strateji oyunu', cat: 'util', size: '420 MB', installed: false },
      { id: 'openttd', name: 'OpenTTD Ulaşım ve Şehir İmparatorluğu', deb: 'openttd', desc: 'Demiryolu, kara, deniz ve hava taşımacılığı üzerine kurulu klasik ekonomi simülasyonu', cat: 'util', size: '24 MB', installed: false },
      { id: 'extremetuxracer', name: 'Extreme Tux Racer Kayak Oyunu', deb: 'extremetuxracer', desc: 'Penguen Tux ile karlı pistlerden hızla kaydığınız klasik 3D arcade yarış oyunu', cat: 'util', size: '45 MB', installed: false },
      { id: 'frozen-bubble', name: 'Frozen Bubble Balon Patlatma', deb: 'frozen-bubble', desc: 'Tek veya çok oyunculu renkli balon eşleştirme ve klasik Linux bulmaca oyunu', cat: 'util', size: '28 MB', installed: false },
      { id: 'gnuchess', name: 'GNU Chess Satranç Motoru', deb: 'gnuchess', desc: 'Açık kaynaklı klasik satranç motoru ve yapay zekâ rakibi', cat: 'util', size: '6 MB', installed: false },
      { id: 'pychess', name: 'PyChess Görsel Satranç Masaüstü', deb: 'pychess', desc: 'Farklı zorluk seviyeleri, çevrimiçi maçlar ve bulmaca modu içeren GTK satranç', cat: 'util', school: true, size: '16 MB', installed: false },
      { id: 'aisleriot', name: 'AisleRiot Kart ve Solitaire Koleksiyonu', deb: 'aisleriot', desc: 'Klondike, Spider ve FreeCell dahil 80i aşkın klasik masa kart oyunu bir arada', cat: 'util', size: '14 MB', installed: false },
      { id: 'gnome-mines', name: 'GNOME Mayın Tarlası', deb: 'gnome-mines', desc: 'Özelleştirilebilir tahta boyutlarıyla klasik mantık ve mayın bulma oyunu', cat: 'util', size: '5 MB', installed: false },
      { id: 'gnome-sudoku', name: 'GNOME Sudoku Bulmaca', deb: 'gnome-sudoku', desc: 'Dört zorluk seviyesi, not alma ve ipucu destekli temiz Sudoku oyunu', cat: 'util', size: '6 MB', installed: false },
      { id: 'gnome-mahjongg', name: 'GNOME Mahjongg Taş Eşleştirme', deb: 'gnome-mahjongg', desc: 'Farklı taş dizilimleri ve zamanlayıcılı klasik tek kişilik taş eşleştirme oyunu', cat: 'util', size: '8 MB', installed: false },
      { id: 'kpat', name: 'KPatience (KPat) Kart Oyunları', deb: 'kpat', desc: 'Yüksek çözünürlüklü destelerle Spider, Klondike, Yukon ve Forty & Eight oyunları', cat: 'util', size: '15 MB', installed: false },
      { id: 'dosbox', name: 'DOSBox Retro MS-DOS Emülatörü', deb: 'dosbox', desc: 'Klasik MS-DOS oyun ve yazılımlarını modern Linux üzerinde tam uyumlulukla çalıştırır', cat: 'util', size: '12 MB', installed: false },
      { id: 'scummvm', name: 'ScummVM Klasik Macera Oyun Motoru', deb: 'scummvm', desc: 'Point-and-click klasik macera oyunlarını yüksek çözünürlükle yeniden oynatır', cat: 'util', size: '35 MB', installed: false },
      { id: 'retroarch', name: 'RetroArch Çoklu Konsol Emülatörü', deb: 'retroarch', desc: 'Libretro çekirdekleriyle onlarca retro oyun konsolunu tek arayüzde çalıştırır', cat: 'util', size: '75 MB', installed: false },
      { id: 'mgba-qt', name: 'mGBA Game Boy Advance Emülatörü', deb: 'mgba-qt', desc: 'Yüksek doğruluklu, kayıt durumlu ve gamepad destekli GBA/GBC emülatörü', cat: 'util', size: '14 MB', installed: false },
      { id: 'desmume', name: 'DeSmuME Nintendo DS Emülatörü', deb: 'desmume', desc: 'Çift ekran ve mikro-ölçekleme destekli açık kaynak Nintendo DS öykünücüsü', cat: 'util', size: '18 MB', installed: false },
      { id: 'hedgewars', name: 'Hedgewars Kirpi Savaşı Arcade', deb: 'hedgewars', desc: 'Worms tarzı, ağ üzerinden de oynanabilen sıra tabanlı mizahi topçu oyunu', cat: 'util', size: '190 MB', installed: false },
      { id: 'warzone2100', name: 'Warzone 2100 Gerçek Zamanlı Strateji', deb: 'warzone2100', desc: 'Birim tasarımı ve teknoloji ağacıyla öne çıkan 3D gerçek zamanlı bilim kurgu RTS', cat: 'util', size: '165 MB', installed: false },
      { id: 'freeciv', name: 'Freeciv Medeniyet Strateji Oyunu', deb: 'freeciv', desc: 'Antik çağdan uzay çağına şehir kurup imparatorluk yönettiğiniz sıra tabanlı strateji', cat: 'util', size: '48 MB', installed: false },
      { id: 'teeworlds', name: 'Teeworlds Çok Oyunculu 2D Nişancı', deb: 'teeworlds', desc: 'Hızlı tempolu, kancalı ve retro grafikli çevrimiçi 2D arena oyunu', cat: 'util', size: '16 MB', installed: false },
      { id: 'neverball', name: 'Neverball & Neverputt 3D Beceri', deb: 'neverball', desc: 'Zemini eğerek topu engellerden geçirip hedefe ulaştırdığınız 3D fizik oyunu', cat: 'util', size: '42 MB', installed: false },
      { id: 'pingus', name: 'Pingus Penguen Bulmaca Oyunu', deb: 'pingus', desc: 'Lemmings esintili, penguenlere kazma ve merdiven görevleri vererek kurtarma oyunu', cat: 'util', school: true, size: '26 MB', installed: false },
      { id: 'winetricks', name: 'Winetricks Wine Bağımlılık Yardımcısı', deb: 'winetricks', desc: 'Wine içine DirectX, .NET ve Windows yazı tiplerini kolayca kuran yardımcı araç', cat: 'util', size: '4 MB', installed: false },
      { id: 'playonlinux', name: 'PlayOnLinux Wine Sürüm Yöneticisi', deb: 'playonlinux', desc: 'Her Windows programı ve oyunu için ayrı Wine ön eki ve sürümü yönetir', cat: 'util', size: '24 MB', installed: false },
      { id: 'blinken', name: 'Blinken Hafıza ve Ses Oyunu', deb: 'blinken', desc: 'Renkli ışık ve ses dizilerini ezberleyip tekrar etmeye dayalı eğitim oyunu', cat: 'util', school: true, size: '9 MB', installed: false },
      { id: 'klettres', name: 'KLettres Alfabe ve Hece Eğitici', deb: 'klettres', desc: 'Çocuklara farklı dillerde harf ve telaffuz öğreten KDE eğitim uygulaması', cat: 'util', school: true, size: '34 MB', installed: false },
      { id: 'kiten', name: 'Kiten Japonca Sözlük ve Kanji Aracı', deb: 'kiten', desc: 'Okunuş ve çizim sayısına göre arama yapabilen öğrenci dostu Japonca sözlük', cat: 'util', school: true, size: '18 MB', installed: false },

      // Geliştirici Araçları & Bilim
      { id: 'tuxpaint', name: 'Tux Paint Çocuk Çizim Stüdyosu', deb: 'tuxpaint', desc: 'İlkokul öğrencileri için sesli efektli, fırçalı ve damgalı güvenli çizim tahtası', cat: 'graphics', school: true, size: '85 MB', installed: false },
      { id: 'qgis', name: 'QGIS Coğrafi Bilgi Sistemi (CBS)', deb: 'qgis', desc: 'Harita oluşturma, uydu görüntüsü ve mekânsal veri analizi profesyonel yazılımı', cat: 'dev', school: true, size: '410 MB', installed: false },
      { id: 'r-base', name: 'R İstatistiksel Programlama Dili', deb: 'r-base', desc: 'Veri bilimi, istatistiksel modelleme ve akademik grafik çizimi için R ortamı', cat: 'dev', school: true, size: '78 MB', installed: false },
      { id: 'rkward', name: 'RKWard Görsel R Veri Analizi IDE', deb: 'rkward', desc: 'R programlama dili için tablo editörlü ve grafik arayüzlü veri bilimi stüdyosu', cat: 'dev', school: true, size: '45 MB', installed: false },
      { id: 'spyder', name: 'Spyder Bilimsel Python IDE', deb: 'spyder', desc: 'Değişken gezgini, IPython konsolu ve çizim penceresiyle MATLAB tarzı Python IDE', cat: 'dev', school: true, size: '185 MB', installed: false },
      { id: 'jupyter-notebook', name: 'Jupyter Notebook Etkileşimli Defter', deb: 'jupyter-notebook', desc: 'Canlı kod, denklem, grafik ve veri anlatımını birleştiren web tabanlı Python defteri', cat: 'dev', school: true, size: '65 MB', installed: false },
      { id: 'ngspice', name: 'ngspice Elektronik Devre Simülatörü', deb: 'ngspice', desc: 'SPICE tabanlı analog, dijital ve karışık sinyal elektronik devre benzetim motoru', cat: 'dev', school: true, size: '28 MB', installed: false },
      { id: 'solvespace', name: 'SolveSpace Parametrik 2D/3D CAD', deb: 'solvespace', desc: '3D yazıcı ve mekanik parça tasarımı için hafif parametrik CAD çizim aracı', cat: 'dev', size: '14 MB', installed: false },
      { id: 'kate', name: 'Kate Gelişmiş Çoklu Belge Editörü', deb: 'kate', desc: 'LSP, bölünmüş ekran, terminal eklentili güçlü KDE metin ve kod düzenleyicisi', cat: 'dev', size: '38 MB', installed: false },
      { id: 'kdevelop', name: 'KDevelop Çok Dilli IDE', deb: 'kdevelop', desc: 'C, C++, Python, PHP ve CMake projeleri için anlamsal kod tamamlayıcılı IDE', cat: 'dev', size: '115 MB', installed: false },
      { id: 'mousepad', name: 'Mousepad Hızlı ve Hafif Metin Editörü', deb: 'mousepad', desc: 'Sözdizimi renklendirmeli, anında açılan sade XFCE not ve kod düzenleyicisi', cat: 'dev', size: '6 MB', installed: false },
      { id: 'micro', name: 'Micro Modern Terminal Metin Editörü', deb: 'micro', desc: 'Ctrl+C/V kısayolları ve fare destekli sezgisel uçbirim kod editörü', cat: 'dev', size: '8 MB', installed: false },
      { id: 'vim-gtk3', name: 'GVim (Vim GTK3) Grafik Kod Editörü', deb: 'vim-gtk3', desc: 'Menü, pano ve fare entegrasyonuna sahip masaüstü pencereli Vim editörü', cat: 'dev', size: '22 MB', installed: false },
      { id: 'nodejs', name: 'Node.js JavaScript Çalışma Zamanı', deb: 'nodejs', desc: 'V8 motoru üzerinde sunucu, masaüstü ve otomasyon betikleri çalıştıran JS ortamı', cat: 'dev', size: '48 MB', installed: false },
      { id: 'npm', name: 'npm JavaScript Paket Yöneticisi', deb: 'npm', desc: 'Node.js ekosistemindeki kütüphane ve geliştirici araçlarını kuran paket yöneticisi', cat: 'dev', size: '35 MB', installed: false },
      { id: 'rustc', name: 'Rustc Resmi Rust Derleyicisi', deb: 'rustc', desc: 'Bellek güvenli ve yüksek performanslı sistem yazılımları geliştirmek için Rust derleyicisi', cat: 'dev', size: '130 MB', installed: false },
      { id: 'cargo', name: 'Cargo Rust Paket ve Derleme Aracı', deb: 'cargo', desc: 'Rust projelerini derleme, test etme ve bağımlılıkları yönetme aracı', cat: 'dev', size: '32 MB', installed: false },
      { id: 'golang-go', name: 'Go (Golang) Programlama Dili ve Derleyicisi', deb: 'golang-go', desc: 'Hızlı derlenen, eşzamanlılık odaklı modern Go dili araç takımı', cat: 'dev', size: '110 MB', installed: false },
      { id: 'default-jdk', name: 'OpenJDK Java Geliştirme Kiti (JDK)', deb: 'default-jdk', desc: 'Java uygulamalarını derlemek ve çalıştırmak için resmi açık kaynak JDK paketi', cat: 'dev', size: '240 MB', installed: false },
      { id: 'php', name: 'PHP Sunucu ve CLI Betik Dili', deb: 'php', desc: 'Web uygulamaları ve arka plan komut satırı araçları için PHP yorumlayıcısı', cat: 'dev', size: '35 MB', installed: false },
      { id: 'ruby', name: 'Ruby Nesne Yönelimli Programlama Dili', deb: 'ruby', desc: 'Esnek sözdizimine sahip yüksek üretkenlikli Ruby yorumlayıcısı', cat: 'dev', size: '24 MB', installed: false },
      { id: 'gcc', name: 'GCC GNU C Derleyicisi', deb: 'gcc', desc: 'Linux çekirdeği ve sistem yazılımları için endüstri standardı GNU C derleyicisi', cat: 'dev', size: '85 MB', installed: false },
      { id: 'gpp', name: 'G++ GNU C++ Derleyicisi', deb: 'g++', desc: 'Modern C++ standartlarını tam destekleyen GNU C++ derleyicisi', cat: 'dev', size: '95 MB', installed: false },
      { id: 'clang', name: 'Clang LLVM C/C++ Derleyicisi', deb: 'clang', desc: 'Hızlı teşhis mesajları ve statik analiz sunan LLVM tabanlı derleyici', cat: 'dev', size: '125 MB', installed: false },
      { id: 'llvm', name: 'LLVM Derleyici Altyapı Araçları', deb: 'llvm', desc: 'Ara kod optimizasyonu, bağlayıcı ve kod üretimi altyapı paketi', cat: 'dev', size: '140 MB', installed: false },
      { id: 'make', name: 'GNU Make Proje Derleme Otomasyonu', deb: 'make', desc: 'Makefile kurallarıyla C/C++ ve karmaşık projeleri otomatik derler', cat: 'dev', size: '4 MB', installed: false },
      { id: 'sqlite3', name: 'SQLite3 Komut Satırı Veritabanı Aracı', deb: 'sqlite3', desc: 'Sunucu gerektirmeyen dosya tabanlı SQLite veritabanlarını sorgulama ve yönetme', cat: 'dev', size: '5 MB', installed: false },
      { id: 'postgresql', name: 'PostgreSQL İlişkisel Veritabanı Sunucusu', deb: 'postgresql', desc: 'ACID uyumlu, JSON ve vektör uzantılarını destekleyen kurumsal veritabanı', cat: 'dev', size: '72 MB', installed: false },
      { id: 'mariadb-server', name: 'MariaDB Açık Kaynak SQL Veritabanı', deb: 'mariadb-server', desc: 'MySQL uyumlu, yüksek hızlı ve topluluk güdümlü ilişkisel veritabanı sunucusu', cat: 'dev', size: '95 MB', installed: false },
      { id: 'redis-server', name: 'Redis Bellek İçi Veri ve Önbellek Sunucusu', deb: 'redis-server', desc: 'Mikrosaniye gecikmeli anahtar-değer deposu, kuyruk ve önbellek motoru', cat: 'dev', size: '16 MB', installed: false },
      { id: 'jq', name: 'jq Komut Satırı JSON İşleyici', deb: 'jq', desc: 'API çıktısı ve JSON dosyalarını uçbirimden filtreleyip dönüştüren hızlı araç', cat: 'dev', size: '3 MB', installed: false },
      { id: 'httpie', name: 'HTTPie Kullanıcı Dostu API Test İstemcisi', deb: 'httpie', desc: 'Renkli sözdizimli ve JSON destekli modern HTTP/REST uçbirim istemcisi', cat: 'dev', size: '12 MB', installed: false },
      { id: 'gh', name: 'GitHub CLI (gh) Resmi Uçbirim Aracı', deb: 'gh', desc: 'Pull Request, Issue, Release ve GitHub Actions işlerini uçbirimden yönetin', cat: 'dev', size: '24 MB', installed: false },
      { id: 'lazygit', name: 'Lazygit Görsel Terminal Git Arayüzü', deb: 'lazygit', desc: 'Dal değiştirme, commit parçalama ve rebase işlemlerini hızlandıran TUI arayüz', cat: 'dev', size: '18 MB', installed: false },
      { id: 'git-lfs', name: 'Git LFS Büyük Dosya Depolama Uzantısı', deb: 'git-lfs', desc: '3D model, ses, video ve ikili varlıkları Git depolarında verimli sürümleme', cat: 'dev', size: '14 MB', installed: false },
      { id: 'kdiff3', name: 'KDiff3 3 Yönlü Dosya & Klasör Karşılaştırıcı', deb: 'kdiff3', desc: 'Kod çakışmalarını ve üçlü sürüm farklarını satır bazında görsel birleştirme', cat: 'dev', size: '19 MB', installed: false },
      { id: 'doxygen', name: 'Doxygen Otomatik Kod Dokümantasyon Üretici', deb: 'doxygen', desc: 'C++, Rust, Python ve Java yorumlarından HTML/PDF teknik doküman üretir', cat: 'dev', size: '28 MB', installed: false },
      { id: 'ansible', name: 'Ansible Ajan Gerektirmeyen Otomasyon', deb: 'ansible', desc: 'SSH üzerinden birden çok Linux sunucu ve laboratuvar PCsini yapılandırır', cat: 'dev', size: '54 MB', installed: false },
      { id: 'qemu-system-x86', name: 'QEMU x86_64 Donanım Sanallaştırıcı', deb: 'qemu-system-x86', desc: 'KVM hızlandırmalı sanal makine çekirdeği; ISO ve disk kalıplarını önyükler', cat: 'dev', size: '88 MB', installed: false },
      { id: 'virt-manager', name: 'Virt-Manager Sanal Makine Yöneticisi', deb: 'virt-manager', desc: 'QEMU/KVM sanal makinelerini oluşturma, SPICE ekran ve anlık görüntü yönetimi', cat: 'dev', size: '42 MB', installed: false },
      { id: 'adb', name: 'ADB Android Hata Ayıklama Köprüsü', deb: 'adb', desc: 'USB veya Wi-Fi üzerinden Android cihazlara APK kurma, log ve kabuk erişimi', cat: 'dev', size: '8 MB', installed: false },
      { id: 'fastboot', name: 'Fastboot Android Bootloader Aracı', deb: 'fastboot', desc: 'Android cihazların önyükleyici bölümlerini kontrol etme ve imaj yazma aracı', cat: 'dev', size: '6 MB', installed: false },

      // Medya & Ses
      { id: 'haruna', name: 'Haruna Modern MPV Video Oynatıcı', deb: 'haruna', desc: 'YouTube/yt-dlp entegrasyonlu, çalma listeli ve donanım hızlandırmalı video oynatıcı', cat: 'media', size: '34 MB', installed: false },
      { id: 'lollypop', name: 'Lollypop Modern GTK Müzik Çalar', deb: 'lollypop', desc: 'Albüm kapakları, sanatçı biyografileri ve dinamik parti modlu müzik koleksiyonu', cat: 'media', size: '26 MB', installed: false },
      { id: 'amberol', name: 'Amberol Minimalist Ses & Müzik Oynatıcı', deb: 'amberol', desc: 'Albüm kapağı rengine uyum sağlayan hafif, zarif yerel müzik çalar', cat: 'media', size: '18 MB', installed: false },
      { id: 'quodlibet', name: 'Quod Libet Büyük Arşiv Müzik Çalar', deb: 'quodlibet', desc: 'Binlerce şarkıyı düzenli ifadelerle arayan ve etiket düzenleyen güçlü oynatıcı', cat: 'media', size: '22 MB', installed: false },
      { id: 'cmus', name: 'cmus Ultra Hafif Terminal Müzik Çalar', deb: 'cmus', desc: 'Neredeyse sıfır RAM kullanan, Vi tuş takımlı ve gapless oynatmalı ses çalar', cat: 'media', size: '4 MB', installed: false },
      { id: 'pitivi', name: 'Pitivi Doğrusal Olmayan Video Editörü', deb: 'pitivi', desc: 'GStreamer tabanlı, kesme, efekt ve kolay kurgu odaklı sade video düzenleyici', cat: 'media', size: '45 MB', installed: false },
      { id: 'flowblade', name: 'Flowblade Hızlı Çok Kanallı Video Kurgu', deb: 'flowblade', desc: 'Çok kanallı zaman çizelgesi ve filtrelerle profesyonel video montaj stüdyosu', cat: 'media', size: '52 MB', installed: false },
      { id: 'yt-dlp', name: 'yt-dlp Gelişmiş Medya & Video İndirici', deb: 'yt-dlp', desc: 'Binlerce video platformundan çevrimdışı ders ve medya indiren güçlü CLI aracı', cat: 'media', size: '12 MB', installed: false },
      { id: 'streamlink', name: 'Streamlink Canlı Yayın Oynatıcı Köprüsü', deb: 'streamlink', desc: 'Canlı yayın akışlarını tarayıcı yükü olmadan doğrudan VLC veya MPVye aktarır', cat: 'media', size: '10 MB', installed: false },
      { id: 'picard', name: 'MusicBrainz Picard Akıllı MP3 Etiketleyici', deb: 'picard', desc: 'Ses parmak iziyle albüm, sanatçı ve kapak bilgilerini otomatik doldurur', cat: 'media', size: '24 MB', installed: false },
      { id: 'k3b', name: 'K3b Gelişmiş CD/DVD/ISO Yazıcı', deb: 'k3b', desc: 'Önyüklenebilir ISO, ses CDsi ve veri diski yazdırmak için klasik KDE optik aracı', cat: 'media', size: '38 MB', installed: false },
      { id: 'xfburn', name: 'Xfburn Hafif CD/DVD Yazma Aracı', deb: 'xfburn', desc: 'Hızlı veri diski ve ISO imajı yakma için minimalist XFCE optik yazıcı', cat: 'media', size: '9 MB', installed: false },
      { id: 'kamoso', name: 'Kamoso Web Kamerası Fotoğraf & Video', deb: 'kamoso', desc: 'Webcam ile efektli fotoğraf çekme ve hızlı video kaydı uygulaması', cat: 'media', size: '14 MB', installed: false },
      { id: 'musescore', name: 'MuseScore Nota Yazım ve Beste Stüdyosu', deb: 'musescore', desc: 'Çok sesli partisyon yazma, MIDI çalma ve müzik dersleri için nota editörü', cat: 'media', school: true, size: '145 MB', installed: false },
      { id: 'tuxguitar', name: 'TuxGuitar Gitar Tab ve Nota Editörü', deb: 'tuxguitar', desc: 'GuitarPro (GP3/GP4/GP5) dosyalarını açan, çok kanallı tab düzenleyici', cat: 'media', school: true, size: '28 MB', installed: false },
      { id: 'sonic-pi', name: 'Sonic Pi Canlı Kodlama Müzik Stüdyosu', deb: 'sonic-pi', desc: 'Ruby kodları yazarak gerçek zamanlı elektronik müzik ve ritim üretme eğitim aracı', cat: 'media', school: true, size: '120 MB', installed: false },
      { id: 'zynaddsubfx', name: 'ZynAddSubFX Profesyonel Synthesizer', deb: 'zynaddsubfx', desc: 'Gerçek zamanlı polifonik ses sentezleyici, efektler ve MIDI kontrol desteği', cat: 'media', size: '22 MB', installed: false },

      // Grafik & Tasarım
      { id: 'gwenview', name: 'Gwenview Hızlı Resim Görüntüleyici', deb: 'gwenview', desc: 'Kırpma, döndürme, EXIF bilgisi ve slayt gösterisi sunan KDE görsel izleyici', cat: 'graphics', size: '28 MB', installed: false },
      { id: 'loupe', name: 'Loupe Modern GPU Destekli Fotoğraf İzleyici', deb: 'loupe', desc: 'Yüksek DPI ve kaydırma jestleriyle ultra akıcı yeni nesil resim görüntüleyici', cat: 'graphics', size: '14 MB', installed: false },
      { id: 'nsxiv', name: 'nsxiv Çok Hafif Klavye Odaklı Resim İzleyici', deb: 'nsxiv', desc: 'Anında açılan, küçük resim ızgaralı ve X11 uyumlu minimalist görüntüleyici', cat: 'graphics', size: '3 MB', installed: false },
      { id: 'ksnip', name: 'Ksnip Çok Yönlü Ekran Görüntüsü Editörü', deb: 'ksnip', desc: 'Seçili pencere yakalama, numaralı adım işaretleri ve bulanıklaştırma araçları', cat: 'graphics', size: '15 MB', installed: false },
      { id: 'shutter', name: 'Shutter Gelişmiş Ekran Yakalama & Çizim', deb: 'shutter', desc: 'Zamanlayıcılı ekran görüntüsü alma ve dahili ok/vurgulayıcı düzenleme aracı', cat: 'graphics', size: '32 MB', installed: false },
      { id: 'pencil2d', name: 'Pencil2D 2D El Çizimi Animasyon Stüdyosu', deb: 'pencil2d', desc: 'Bitmap ve vektör katmanlarla kare kare geleneksel 2D çizgi film yapım aracı', cat: 'graphics', school: true, size: '24 MB', installed: false },
      { id: 'mtpaint', name: 'mtPaint Piksel Sanatı ve İkon Editörü', deb: 'mtpaint', desc: 'Düşük bellek tüketen, piksel düzeyinde çizim ve palet kontrolü sunan resim aracı', cat: 'graphics', size: '7 MB', installed: false },
      { id: 'meshlab', name: 'MeshLab 3D Ağ (Mesh) İşleme Stüdyosu', deb: 'meshlab', desc: 'STL/OBJ/PLY 3D taramalarını temizleme, basitleştirme ve onarma yazılımı', cat: 'graphics', size: '48 MB', installed: false },
      { id: 'wings3d', name: 'Wings 3D Poligon Modelleme Editörü', deb: 'wings3d', desc: 'Sağ tık menüleri ve UV kaplama araçlarıyla klasik bölünmüş yüzey 3D modelleyici', cat: 'graphics', size: '26 MB', installed: false },
      { id: 'prusa-slicer', name: 'PrusaSlicer 3D Yazıcı Dilimleyici', deb: 'prusa-slicer', desc: 'STL/3MF modellerini destek yapıları ve G-Code katmanlarına dönüştürür', cat: 'graphics', school: true, size: '95 MB', installed: false },
      { id: 'cura', name: 'UltiMaker Cura 3D Baskı Hazırlama', deb: 'cura', desc: 'Okul ve maker atölyelerindeki tüm 3D yazıcı profilleriyle uyumlu dilimleyici', cat: 'graphics', school: true, size: '155 MB', installed: false },

      // İnternet & Ağ
      { id: 'falkon', name: 'Falkon Hafif Qt Web Tarayıcısı', deb: 'falkon', desc: 'Dahili reklam engelleyici ve düşük RAM tüketimi sunan hızlı web tarayıcısı', cat: 'net', size: '36 MB', installed: false },
      { id: 'epiphany-browser', name: 'GNOME Web (Epiphany) Sade Tarayıcı', deb: 'epiphany-browser', desc: 'WebKit motorlu, web uygulaması sabitlemeli ve izleyici engelleyicili tarayıcı', cat: 'net', size: '32 MB', installed: false },
      { id: 'ktorrent', name: 'KTorrent Gelişmiş BitTorrent İstemcisi', deb: 'ktorrent', desc: 'Sıralı indirme, bant genişliği zamanlama ve RSS besleme destekli KDE torrent aracı', cat: 'net', size: '24 MB', installed: false },
      { id: 'fragments', name: 'Fragments Modern GTK Torrent İstemcisi', deb: 'fragments', desc: 'Transmission çekirdekli, temiz ve kolay kullanımlı sade torrent indirme aracı', cat: 'net', size: '18 MB', installed: false },
      { id: 'nicotine', name: 'Nicotine+ Soulseek P2P Dosya Paylaşımı', deb: 'nicotine', desc: 'Soulseek ağı için açık kaynak, hızlı ve modern GTK grafik istemcisi', cat: 'net', size: '16 MB', installed: false },
      { id: 'uget', name: 'uGet Çoklu Bağlantılı İndirme Yöneticisi', deb: 'uget', desc: 'İndirmeleri sıraya alma, duraklatma ve aria2 hızlandırma destekli yönetici', cat: 'net', size: '12 MB', installed: false },
      { id: 'persepolis', name: 'Persepolis Download Manager (aria2 GUI)', deb: 'persepolis', desc: 'Çok parçacıklı aria2 motoruyla hızlı dosya ve tarayıcı indirme yöneticisi', cat: 'net', size: '22 MB', installed: false },
      { id: 'dino-im', name: 'Dino Modern Şifreli XMPP Mesajlaşma', deb: 'dino-im', desc: 'OMEMO uçtan uca şifreleme ve dosya paylaşımı sunan modern GTK sohbet istemcisi', cat: 'net', size: '14 MB', installed: false },
      { id: 'konversation', name: 'Konversation Görsel IRC Sohbet İstemcisi', deb: 'konversation', desc: 'Çoklu sunucu, kanal günlüğü ve SSL destekli klasik KDE IRC istemcisi', cat: 'net', size: '22 MB', installed: false },
      { id: 'krdc', name: 'KRDC Uzak Masaüstü (RDP & VNC) İstemcisi', deb: 'krdc', desc: 'Windows RDP ve Linux VNC sunucularına sekmeli tam ekran bağlantı aracı', cat: 'net', size: '18 MB', installed: false },
      { id: 'rclone', name: 'rclone Bulut Depolama Eşitleme Aracı', deb: 'rclone', desc: 'Google Drive, S3, WebDAV ve 50+ bulut depolamayı yerelle senkronize eder', cat: 'net', size: '28 MB', installed: false },
      { id: 'rclone-browser', name: 'Rclone Browser Görsel Bulut Yöneticisi', deb: 'rclone-browser', desc: 'rclone bulut disklerini sürükle-bırak ve bağlama düğmeleriyle yöneten arayüz', cat: 'net', size: '14 MB', installed: false },
      { id: 'zenmap', name: 'Zenmap Nmap Görsel Ağ Tarayıcı', deb: 'zenmap', desc: 'Nmap port taramalarını topoloji haritası ve profillerle gösteren ağ analiz aracı', cat: 'net', size: '24 MB', installed: false },
      { id: 'tor', name: 'Tor Anonim Yönlendirme Servisi', deb: 'tor', desc: 'Ağ trafiğini çok katmanlı şifreli yönlendirme düğümleri üzerinden anonimleştirir', cat: 'net', size: '18 MB', installed: false },
      { id: 'privoxy', name: 'Privoxy Gizlilik Odaklı Web Vekil Sunucusu', deb: 'privoxy', desc: 'HTTP başlıklarını temizleyen ve yerel filtreleme sunan hafif vekil sunucu', cat: 'net', size: '6 MB', installed: false },

      // Ofis & Yazı
      { id: 'libreoffice-draw', name: 'LibreOffice Draw Vektör & Diyagram', deb: 'libreoffice-draw', desc: 'Akış şeması, broşür, teknik çizim ve PDF metin düzenleme ofis bileşeni', cat: 'office', school: true, size: '45 MB', installed: false },
      { id: 'libreoffice-math', name: 'LibreOffice Math Formül Editörü', deb: 'libreoffice-math', desc: 'Bilimsel denklemler, kesirler ve matrisleri Writer belgelerine ekleyen araç', cat: 'office', school: true, size: '22 MB', installed: false },
      { id: 'libreoffice-base', name: 'LibreOffice Base Masaüstü Veritabanı', deb: 'libreoffice-base', desc: 'Formlar, sorgular ve raporlar içeren MS Access alternatifi ofis bileşeni', cat: 'office', size: '38 MB', installed: false },
      { id: 'calligra', name: 'Calligra Eksiksiz Ofis & Tasarım Paketi', deb: 'calligra', desc: 'Words, Sheets ve Stage bileşenlerini içeren hafif KDE ofis ve yayıncılık takımı', cat: 'office', size: '130 MB', installed: false },
      { id: 'pdfsam', name: 'PDFsam Basic PDF Bölme ve Birleştirme', deb: 'pdfsam', desc: 'Büyük PDF dosyalarını sayfa aralığına göre bölen, döndüren ve birleştiren araç', cat: 'office', school: true, size: '52 MB', installed: false },
      { id: 'mupdf', name: 'MuPDF Ultra Hızlı Belge & PDF Okuyucu', deb: 'mupdf', desc: 'Büyük teknik PDF, EPUB ve XPS dosyalarını milisaniyede açan hafif görüntüleyici', cat: 'office', size: '12 MB', installed: false },
      { id: 'sigil', name: 'Sigil EPUB E-Kitap Editörü', deb: 'sigil', desc: 'EPUB2 ve EPUB3 dijital kitapları bölüm, meta veri ve CSS ile oluşturup düzenler', cat: 'office', size: '32 MB', installed: false },
      { id: 'planner', name: 'Planner Proje Planlama & Gantt Şeması', deb: 'planner', desc: 'Görev bağımlılıkları, kaynak dağılımı ve Gantt zaman çizelgesi yöneticisi', cat: 'office', size: '16 MB', installed: false },
      { id: 'kmymoney', name: 'KMyMoney Kişisel Finans & Muhasebe', deb: 'kmymoney', desc: 'Bütçe planlama, banka hesap takibi ve kategori raporları sunan finans yazılımı', cat: 'office', size: '38 MB', installed: false },
      { id: 'skrooge', name: 'Skrooge Gelir-Gider ve Portföy Takip', deb: 'skrooge', desc: 'QIF/OFX/CSV içe aktarmalı ve grafik raporlu esnek kişisel finans yöneticisi', cat: 'office', size: '34 MB', installed: false },
      { id: 'keepass2', name: 'KeePass 2 Yerel Şifre Kasası', deb: 'keepass2', desc: 'AES-256 ve ChaCha20 şifreli .kdbx parola kasalarıyla uyumlu klasik kasa aracı', cat: 'office', size: '24 MB', installed: false },
      { id: 'apostrophe', name: 'Apostrophe Odak Modlu Markdown Editörü', deb: 'apostrophe', desc: 'Dikkati dağıtmayan canlı önizlemeli ve Pandoc dışa aktarımlı yazı uygulaması', cat: 'office', school: true, size: '18 MB', installed: false },
      { id: 'gnome-calendar', name: 'GNOME Takvim & Ders Programı', deb: 'gnome-calendar', desc: 'Yerel ve CalDAV takvimlerini eşitleyen aylık ve haftalık takvim uygulaması', cat: 'office', size: '12 MB', installed: false },
      { id: 'gnome-clocks', name: 'GNOME Saatler, Alarm ve Kronometre', deb: 'gnome-clocks', desc: 'Dünya saatleri, ders çalışma zamanlayıcısı, alarm ve kronometre bir arada', cat: 'office', size: '9 MB', installed: false },
      { id: 'gnome-calculator', name: 'GNOME Bilimsel ve Finans Hesap Makinesi', deb: 'gnome-calculator', desc: 'Temel, gelişmiş, finans, programlama ve birim dönüştürme modları sunar', cat: 'office', size: '11 MB', installed: false },
      { id: 'kcalc', name: 'KCalc Bilimsel & İstatistik Hesaplayıcı', deb: 'kcalc', desc: 'Trigonometri, lojik kapılar ve 64-bit programcı görünümü içeren KDE hesap makinesi', cat: 'office', size: '10 MB', installed: false },

      // Sistem & Araçlar
      { id: 'cpu-x', name: 'CPU-X Detaylı İşlemci & Anakart Bilgisi', deb: 'cpu-x', desc: 'CPU önbellekleri, anakart BIOS, RAM hızı ve GPU bilgisini gösteren CPU-Z benzeri', cat: 'sys', size: '14 MB', installed: false },
      { id: 'hardinfo2', name: 'HardInfo2 Donanım Kıyaslama & Raporlama', deb: 'hardinfo2', desc: 'Donanım envanteri çıkarıp CPU/GPU benchmark testleri koşan grafik teşhis aracı', cat: 'sys', size: '16 MB', installed: false },
      { id: 'conky-all', name: 'Conky Masaüstü Canlı Sistem İzleyici', deb: 'conky-all', desc: 'Masaüstünde CPU, RAM, disk ve ağ durumunu şeffaf widget olarak gösterir', cat: 'sys', size: '8 MB', installed: false },
      { id: 'atop', name: 'atop Gelişmiş Sistem ve Disk İzleyici', deb: 'atop', desc: 'Geçmişe dönük CPU, bellek, disk I/O ve ağ darboğazlarını kaydeden terminal izleyici', cat: 'sys', size: '4 MB', installed: false },
      { id: 'nmon', name: 'nmon Tek Ekran Performans Monitörü', deb: 'nmon', desc: 'CPU çekirdekleri, bellek ve disk I/O grafiklerini canlı izleyen hafif TUI aracı', cat: 'sys', size: '3 MB', installed: false },
      { id: 'deja-dup', name: 'Déjà Dup Otomatik Kişisel Yedekleme', deb: 'deja-dup', desc: 'Şifreli ve artımlı kullanıcı dosyası yedeklerini yerel disk veya buluta alır', cat: 'sys', size: '18 MB', installed: false },
      { id: 'backintime-qt', name: 'Back In Time (Qt) Zaman Makinesi Yedekleyici', deb: 'backintime-qt', desc: 'Rsync ve sabit bağlantılarla dosya sisteminin saatlik/günlük anlık görüntülerini alır', cat: 'sys', size: '14 MB', installed: false },
      { id: 'luckybackup', name: 'luckyBackup Görsel Yedekleme & Eşitleme', deb: 'luckybackup', desc: 'Güvenli simülasyon modlu, profilli ve zamanlanmış rsync yedekleme yöneticisi', cat: 'sys', size: '16 MB', installed: false },
      { id: 'vorta', name: 'Vorta (BorgBackup GUI) Şifreli Yedekleme', deb: 'vorta', desc: 'Tekilleştirmeli ve şifreli BorgBackup depolarını kolay arayüzle otomatik yönetir', cat: 'sys', size: '24 MB', installed: false },
      { id: 'gnome-system-monitor', name: 'GNOME Sistem İzleyici & Süreç Yöneticisi', deb: 'gnome-system-monitor', desc: 'Süreçleri sonlandırma, CPU grafikleri ve dosya sistemi doluluklarını izleme aracı', cat: 'sys', size: '12 MB', installed: false },
      { id: 'xfce4-taskmanager', name: 'XFCE Task Manager Ultra Hafif Görev Yöneticisi', deb: 'xfce4-taskmanager', desc: 'Düşük kaynaklı makinelerde çalışan süreçleri ve bellek kullanımını anlık izler', cat: 'sys', size: '5 MB', installed: false },
      { id: 'thunar', name: 'Thunar Hızlı ve Hafif Dosya Yöneticisi', deb: 'thunar', desc: 'Toplu yeniden adlandırma, USB bağlama ve eklenti destekli klasik XFCE dosya yöneticisi', cat: 'sys', size: '18 MB', installed: false },
      { id: 'dolphin', name: 'Dolphin Gelişmiş Çift Panelli Dosya Yöneticisi', deb: 'dolphin', desc: 'Bölünmüş görünüm, gömülü terminal ve ağ paylaşımlarıyla güçlü KDE dosya yöneticisi', cat: 'sys', size: '36 MB', installed: false },
      { id: 'nemo', name: 'Nemo Çift Panelli GTK Dosya Yöneticisi', deb: 'nemo', desc: 'Çift panel, gelişmiş bağlam menüsü ve tam yol çubuğuna sahip zengin dosya yöneticisi', cat: 'sys', size: '28 MB', installed: false },
      { id: 'pcmanfm', name: 'PCManFM Çok Hafif Dosya Yöneticisi', deb: 'pcmanfm', desc: 'Sekmeli tarama ve saniyede açılan arayüzüyle eski bilgisayar dostu dosya yöneticisi', cat: 'sys', size: '10 MB', installed: false },
      { id: 'krusader', name: 'Krusader İki Panelli İleri Dosya Yöneticisi', deb: 'krusader', desc: 'Total Commander tarzı çift panel, arşiv içi gezinme ve FTP destekli yönetici', cat: 'sys', size: '28 MB', installed: false },
      { id: 'doublecmd-gtk', name: 'Double Commander Çift Panelli Yönetici', deb: 'doublecmd-gtk', desc: 'Çoklu sekme, yerleşik hex görüntüleyici ve toplu adlandırmalı iki panelli dosya aracı', cat: 'sys', size: '26 MB', installed: false },
      { id: 'tilix', name: 'Tilix Bölünmüş Pencere Terminal Emülatörü', deb: 'tilix', desc: 'Ekranı yatay ve dikey bölmelere ayırabilen GTK3 döşemeli uçbirim uygulaması', cat: 'sys', size: '16 MB', installed: false },
      { id: 'terminator', name: 'Terminator Çoklu Izgara Terminal', deb: 'terminator', desc: 'Tek pencerede birden çok terminali ızgara yapısında gruplayıp eşzamanlı yönetir', cat: 'sys', size: '14 MB', installed: false },
      { id: 'alacritty', name: 'Alacritty GPU Hızlandırmalı Terminal', deb: 'alacritty', desc: 'Rust ve OpenGL ile yazılmış ultra düşük gecikmeli modern terminal emülatörü', cat: 'sys', size: '18 MB', installed: false },
      { id: 'kitty', name: 'Kitty GPU Destekli Görsel Terminal', deb: 'kitty', desc: 'Terminal içi görüntü gösterimi, ligatür ve sekme destekli hızlı terminal', cat: 'sys', size: '32 MB', installed: false },
      { id: 'konsole', name: 'Konsole KDE Gelişmiş Terminal', deb: 'konsole', desc: 'Profil yönetimi, SSH yer imleri ve bölünmüş görünüm sunan KDE uçbirim uygulaması', cat: 'sys', size: '22 MB', installed: false },
      { id: 'guake', name: 'Guake F12 Açılır Üst Terminal', deb: 'guake', desc: 'Tek kısayolla ekranın üstünden aşağı açılıp gizlenen pratik geliştirici uçbirimi', cat: 'sys', size: '12 MB', installed: false },
      { id: 'copyq', name: 'CopyQ Gelişmiş Pano Geçmişi Yöneticisi', deb: 'copyq', desc: 'Kopyalanan metin, resim ve komutları aranabilir sekmelerde saklayıp kısayolla yapıştırır', cat: 'sys', size: '18 MB', installed: false },
      { id: 'partitionmanager', name: 'KDE Partition Manager Disk Bölümlendirici', deb: 'partitionmanager', desc: 'SSD/HDD bölümlerini oluşturma, boyutlandırma, ext4/FAT32/NTFS biçimlendirme aracı', cat: 'sys', size: '24 MB', installed: false },
      { id: 'filelight', name: 'Filelight Etkileşimli Disk Haritası', deb: 'filelight', desc: 'Diskteki yer kaplayan klasörleri dairesel grafiklerle gösteren alan analiz aracı', cat: 'sys', size: '14 MB', installed: false },
      { id: 'qdirstat', name: 'QDirStat Disk Alanı Analizi ve Temizlik', deb: 'qdirstat', desc: 'Ağaç haritasıyla büyük dosya ve klasörleri tespit edip güvenli silen araç', cat: 'sys', size: '12 MB', installed: false },
      { id: 'solaar', name: 'Solaar Logitech Kablosuz Aygıt Yöneticisi', deb: 'solaar', desc: 'Unifying ve Bolt alıcılarla bağlı fare/klavye pil durumu ve DPI ayarlarını yönetir', cat: 'sys', size: '11 MB', installed: false },
      { id: 'piper', name: 'Piper Oyun Faresi DPI & LED Ayarlayıcı', deb: 'piper', desc: 'Logitech, Roccat ve SteelSeries oyuncu farelerinin tuş ve DPI profillerini ayarlar', cat: 'sys', size: '14 MB', installed: false },
      { id: 'deskflow', name: 'Deskflow Ortak Klavye & Fare KVM', deb: 'deskflow', desc: 'Aynı yerel ağdaki Linux, Windows ve macOS bilgisayarları tek klavye-fareyle yönetir', cat: 'sys', size: '18 MB', installed: false },
      { id: 'gnome-boxes', name: 'GNOME Boxes Tek Tık Sanal Makine', deb: 'gnome-boxes', desc: 'ISO dosyalarından zahmetsizce Linux veya Windows sanal makinesi kuran sade araç', cat: 'sys', size: '48 MB', installed: false },
      { id: 'hplip-gui', name: 'HP Aygıt Yöneticisi (HPLIP Toolbox)', deb: 'hplip-gui', desc: 'HP yazıcı ve tarayıcı kurulumu, mürekkep seviyesi takibi ve bakım aracı', cat: 'sys', size: '42 MB', installed: false },
      { id: 'skanpage', name: 'Skanpage Çok Sayfalı Belge Tarayıcı', deb: 'skanpage', desc: 'Masaüstü ve ağ tarayıcılarından PDF/PNG olarak çok sayfalı belge tarama uygulaması', cat: 'sys', size: '16 MB', installed: false },
    ],
    tableBody: null,
    // Açılışta kafa karıştırmayan kısa liste; tamamı "Tümü" sekmesinde.
    currentCat: 'featured',
    currentSource: 'all',
    _busyIds: new Set(),
    _aptBusy: false,
    _detailPkgId: null,

    init() {
      // Kaydedilmiş kurulu paketleri yükle
      const savedInstalled = SafeStorage.getItem('ankora_installed_pkg_ids');
      if (savedInstalled) {
        try {
          const ids = JSON.parse(savedInstalled);
          if (Array.isArray(ids)) {
            this.packages.forEach(p => {
              if (ids.includes(p.id)) p.installed = true;
            });
          }
        } catch (e) {}
      }

      this.tableBody = document.getElementById('store-grid') || document.getElementById('store-table-body');
      const searchInput = document.getElementById('store-search');
      const filterBtns = document.querySelectorAll('.store-filter-btn');
      const sourceBtns = document.querySelectorAll('.store-source-btn');

      filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          filterBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.currentCat = btn.getAttribute('data-cat');
          this.render(searchInput ? searchInput.value : '');
        });
      });

      sourceBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          sourceBtns.forEach(b => {
            b.classList.remove('active');
            b.removeAttribute('style');
          });
          btn.classList.add('active');
          this.currentSource = btn.getAttribute('data-source');
          this.render(searchInput ? searchInput.value : '');
        });
      });

      if (searchInput) {
        let storeSearchTimer = 0;
        searchInput.addEventListener('input', (e) => {
          const value = e.target.value;
          clearTimeout(storeSearchTimer);
          storeSearchTimer = setTimeout(() => this.render(value), 120);
        });
      }

      const btnBack = document.getElementById('store-detail-back-btn');
      if (btnBack) btnBack.addEventListener('click', () => this.closeDetail());
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.closeDetail();
      });

      this.render();

      // Ön kurulu sistem / XDG uygulamalarını (ör. Fatih Kalem) kurulu olarak işaretle
      if (typeof XdgDesktopEngine !== 'undefined' && Array.isArray(XdgDesktopEngine.installedApps)) {
        const xdgList = XdgDesktopEngine.installedApps;
        let xdgChanged = false;
        this.packages.forEach(p => {
          if (!p.installed && p.id && !p.flatpak && xdgList.some(a =>
            a && (a.id === p.id || (p.deb && (a.id === p.deb || a.exec === p.deb)))
          )) {
            p.installed = true;
            xdgChanged = true;
          }
        });
        if (xdgChanged) {
          this.saveInstalledState();
          this.render(document.getElementById('store-search') ? document.getElementById('store-search').value : '');
        }
      }

      // APT kurulu paketleri sorgula (gerçek Linux dpkg listesi dönünce bayat kayıtları da uzlaştır)
      TauriBridge.invoke('list_installed_deb_packages').then((list) => {
        if (!Array.isArray(list)) return;
        const installed = new Set(list.map(s => String(s).trim()).filter(Boolean));
        const hasAuthoritativeDpkg = installed.size > 0;
        let changed = false;
        this.packages.forEach(p => {
          if (!p.deb || p.flatpak || p.action) return;
          if (!p.installed && installed.has(p.deb)) {
            p.installed = true;
            changed = true;
          } else if (hasAuthoritativeDpkg && p.installed && !installed.has(p.deb) && p.deb !== 'fatih-kalem') {
            p.installed = false;
            changed = true;
          }
        });
        if (changed) {
          this.saveInstalledState();
          this.render(document.getElementById('store-search') ? document.getElementById('store-search').value : '');
        }
      }).catch(() => {});

      // Flatpak kurulu paketleri sorgula
      TauriBridge.invoke('list_installed_flatpaks').then((list) => {
        if (!Array.isArray(list)) return;
        const installedFp = new Set(list.map(s => String(s).trim()));
        let changed = false;
        this.packages.forEach(p => {
          if (!p.installed && p.flatpak && installedFp.has(p.flatpak)) {
            p.installed = true;
            changed = true;
          }
        });
        if (changed) {
          this.saveInstalledState();
          this.render(document.getElementById('store-search') ? document.getElementById('store-search').value : '');
        }
      }).catch(() => {});
    },

    saveInstalledState() {
      const ids = [...new Set(this.packages.filter(p => p.installed).map(p => p.id))];
      SafeStorage.setItem('ankora_installed_pkg_ids', JSON.stringify(ids));
    },

    syncWithXdg(xdgApps) {
      if (!Array.isArray(xdgApps) || xdgApps.length === 0) return;
      const xdgIds = new Set(xdgApps.map(a => a && a.id).filter(Boolean).map(s => String(s)));
      let changed = false;
      this.packages.forEach(p => {
        if (p.installed || p.action) return;
        const hit = (p.flatpak && xdgIds.has(p.flatpak))
          || (p.id && xdgIds.has(p.id))
          || (p.deb && xdgIds.has(p.deb));
        if (hit) {
          p.installed = true;
          changed = true;
        }
      });
      if (changed) {
        this.saveInstalledState();
        this.render(document.getElementById('store-search') ? document.getElementById('store-search').value : '');
      }
    },

    _normText(s) {
      return String(s || '')
        .toLocaleLowerCase('tr')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/ı/g, 'i')
        .replace(/â/g, 'a');
    },

    render(query = '') {
      if (!this.tableBody) return;
      this.tableBody.replaceChildren();

      const frag = document.createDocumentFragment();
      const qRaw = String(query || '').trim();
      const q = qRaw.toLocaleLowerCase('tr');
      const qNorm = this._normText(qRaw);
      const seen = new Set();
      const filtered = this.packages.filter(p => {
        const matchSource = this.currentSource === 'all'
          || (this.currentSource === 'flathub' && Boolean(p.flatpak))
          || (this.currentSource === 'apt' && Boolean(!p.flatpak));
        // Arama kutusu doluyken "Öne Çıkanlar" vitrin kısıtı kaldırılır ki 550+ paketin tamamı aranabilsin.
        const matchCat = this.currentCat === 'all'
          || (this.currentCat === 'featured' && (Boolean(q) || Boolean(p.featured)))
          || (this.currentCat === 'school' && Boolean(p.school || p.id === 'fatih-kalem'))
          || p.cat === this.currentCat;
        const matchQ = !q
          || p.name.toLocaleLowerCase('tr').includes(q)
          || this._normText(p.name).includes(qNorm)
          || (p.id && p.id.toLowerCase().includes(qNorm))
          || (p.deb && p.deb.toLowerCase().includes(qNorm))
          || (p.flatpak && p.flatpak.toLowerCase().includes(qNorm))
          || p.desc.toLocaleLowerCase('tr').includes(q)
          || this._normText(p.desc).includes(qNorm);
        if (!matchSource || !matchCat || !matchQ) return false;
        const dedupeKey = p.flatpak ? `fp:${p.flatpak}` : (p.deb ? `deb:${p.deb}:${p.id}` : p.id);
        if (seen.has(dedupeKey)) return false;
        seen.add(dedupeKey);
        return true;
      });

      // Başlık ve paket sayısı güncelle
      const titleEl = document.getElementById('store-view-title');
      const countEl = document.getElementById('store-view-count');
      const catNames = {
        'featured': 'Öne Çıkanlar',
        'all': 'Tüm Paketler',
        'school': 'Okul & Eğitim',
        'dev': 'Geliştirici Araçları',
        'media': 'Medya & Ses',
        'graphics': 'Grafik & Tasarım',
        'net': 'İnternet & Ağ',
        'office': 'Ofis & Yazı',
        'util': 'Oyun & Yardımcılar',
        'sys': 'Sistem & Araçlar'
      };
      if (titleEl) {
        titleEl.textContent = q ? `Arama: "${query}"` : (catNames[this.currentCat] || 'Uygulamalar');
      }
      if (countEl) {
        countEl.textContent = `${filtered.length} paket`;
      }

      // Ana ekran: arama boşsa ve "featured" (Öne Çıkanlar) seçiliyse vitrin düzeni;
      // "all" (Tüm Paketler) seçildiğinde tüm paket kataloğu kart olarak listelenir.
      if (!q && this.currentCat === 'featured' && this.currentSource === 'all') {
        this.buildStoreHome(frag, filtered);
      } else {
        if (filtered.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'store-empty-notice';
          empty.innerHTML = `
            <svg class="glyph store-empty-icon" aria-hidden="true"><use href="#ico-search"></use></svg>
            <p>Eşleşen paket bulunamadı.</p>
          `;
          frag.appendChild(empty);
        } else {
          filtered.forEach(pkg => {
            frag.appendChild(this.buildStoreCard(pkg));
          });
        }
      }
      this.tableBody.appendChild(frag);
      IconResolver.upgradeScope(this.tableBody);
    },

    // Mağaza vitrini: zarif spotlight ve öne çıkanlar bölümü (AI-slop / parıltı blobu YOK)
    buildStoreHome(frag, filtered) {
      const spotlightPkg = this.packages.find(p => p.id === 'fatih-kalem') || filtered[0];
      const featured = filtered.filter(p => p.featured && (!spotlightPkg || p.id !== spotlightPkg.id)).slice(0, 8);
      const home = document.createElement('div');
      home.className = 'store-home';

      if (spotlightPkg) {
        const spotDeb = spotlightPkg.flatpak || spotlightPkg.deb || '';
        const spotHero = document.createElement('div');
        spotHero.className = 'store-spotlight-card';
        spotHero.innerHTML = `
          <div class="store-spotlight-content">
            <div class="store-spotlight-badge">
              <svg class="glyph" aria-hidden="true"><use href="#ico-zap"></use></svg>
              <span>Haftanın Seçimi</span>
            </div>
            <h2 class="store-spotlight-title">${escapeHtml(spotlightPkg.name)}</h2>
            <p class="store-spotlight-desc">${escapeHtml(spotlightPkg.desc)}</p>
            <div class="store-spotlight-actions">
              ${spotlightPkg.installed ? `
                <button class="btn-pkg btn-pkg-open" id="spot-open-${spotlightPkg.id}">Aç</button>
                <button class="btn-pkg installed" id="spot-pkg-${spotlightPkg.id}">Kaldır</button>
              ` : `
                <button class="btn-pkg" id="spot-pkg-${spotlightPkg.id}">Hemen Yükle</button>
              `}
              <span class="store-spotlight-meta">${spotlightPkg.flatpak ? 'Flathub Sandboxed' : 'Resmî Ankora Havuzu'} · ${spotlightPkg.size || 'Hafif'}</span>
            </div>
          </div>
          <div class="store-spotlight-icon-wrap">
            <span class="store-spotlight-big-icon">${XdgDesktopEngine.getAppSvgIcon({ id: spotlightPkg.id, exec: spotDeb, cat: spotlightPkg.cat })}</span>
          </div>
        `;
        const spotBigIcon = spotHero.querySelector('.store-spotlight-big-icon');
        if (spotBigIcon) IconResolver.tagIcon(spotBigIcon, { id: spotlightPkg.id, exec: spotDeb, deb: spotlightPkg.deb, flatpak: spotlightPkg.flatpak });
        const spotBtn = spotHero.querySelector('.btn-pkg:not(.btn-pkg-open)');
        if (spotBtn) spotBtn.addEventListener('click', () => this.togglePackage(spotlightPkg, spotHero));
        const spotOpen = spotHero.querySelector('.btn-pkg-open');
        if (spotOpen) spotOpen.addEventListener('click', () => this.launchPackage(spotlightPkg));
        spotHero.addEventListener('click', (e) => {
          if (e.target.closest('.btn-pkg')) return;
          this.openDetail(spotlightPkg);
        });
        home.appendChild(spotHero);
      }

      const featuredSection = document.createElement('div');
      featuredSection.className = 'store-home-section';
      featuredSection.innerHTML = `
        <div class="store-section-title">
          <span>Öne Çıkan Uygulamalar</span>
          <span class="store-section-sub">Günlük işler, eğitim ve üretkenlik için seçilenler</span>
        </div>
      `;
      const fGrid = document.createElement('div');
      fGrid.className = 'store-grid store-grid-featured';
      featured.forEach(p => fGrid.appendChild(this.buildStoreCard(p, true)));
      featuredSection.appendChild(fGrid);
      home.appendChild(featuredSection);

      frag.appendChild(home);
    },

    buildStoreCard(pkg, big = false) {
      const card = document.createElement('article');
      card.className = big ? 'store-card store-card-featured' : 'store-card';
      const isFlatpak = Boolean(pkg.flatpak);
      const pkgSub = pkg.flatpak || pkg.deb || (pkg.action === 'meb-cert' ? 'mebcert' : '');
      const sourceLabel = isFlatpak ? 'Flathub' : (pkg.action === 'meb-cert' ? 'Sistem' : (pkg.vendor ? 'Resmî' : 'APT'));
      const sourceClass = isFlatpak ? 'badge-flatpak' : (pkg.action === 'meb-cert' ? 'badge-cert' : 'badge-apt');

      card.innerHTML = `
        <div class="store-card-body">
          <div class="store-card-head">
            <div class="store-card-icon-wrap">
              <span class="store-card-icon">${XdgDesktopEngine.getAppSvgIcon({ id: pkg.id, exec: pkgSub, cat: pkg.cat })}</span>
            </div>
            <div class="store-card-titles">
              <div class="store-card-name" title="${escapeHtml(pkg.name)}">${escapeHtml(pkg.name)}</div>
              <div class="store-card-meta-line">
                <span class="store-card-source ${sourceClass}">${sourceLabel}</span>
                ${pkg.size ? `<span class="store-card-size">${escapeHtml(pkg.size)}</span>` : ''}
              </div>
            </div>
          </div>
          <p class="store-card-desc" title="${escapeHtml(pkg.desc)}">${escapeHtml(pkg.desc)}</p>
        </div>
        <div class="store-card-footer">
          <div class="pkg-progress-bar" id="prog-${pkg.id}"></div>
          <div class="store-card-actions">
            ${pkg.extUrl ? `
              <button class="btn-pkg btn-pkg-site" id="btn-site-${pkg.id}">Resmî Site</button>
            ` : pkg.installed ? `
              ${pkg.action === 'meb-cert' ? '' : `<button class="btn-pkg btn-pkg-open" id="btn-open-${pkg.id}">Aç</button>`}
              <button class="btn-pkg installed" id="btn-pkg-${pkg.id}">Kaldır</button>
            ` : `
              <button class="btn-pkg" id="btn-pkg-${pkg.id}">Kur</button>
            `}
          </div>
        </div>
      `;

      const iconBox = card.querySelector('.store-card-icon');
      if (iconBox) IconResolver.tagIcon(iconBox, { id: pkg.id, exec: pkgSub, deb: pkg.deb, flatpak: pkg.flatpak });

      const isBusy = this._busyIds && this._busyIds.has(pkg.id);
      const btn = card.querySelector('.btn-pkg:not(.btn-pkg-open):not(.btn-pkg-site)');
      if (btn) {
        if (isBusy) {
          btn.disabled = true;
          btn.textContent = pkg.installed ? 'Kaldırılıyor...' : 'İndiriliyor...';
        }
        btn.addEventListener('click', () => this.togglePackage(pkg, card));
      }

      const btnSite = card.querySelector('.btn-pkg-site');
      if (btnSite) {
        btnSite.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await TauriBridge.invoke('open_url', { url: pkg.extUrl });
            Terminal.log(`[AĞ] ${pkg.name} resmî sitesi açılıyor: ${pkg.extUrl}`, 'cmd');
          } catch (err) {
            Terminal.log(`[ERR] Resmî site açılamadı: ${err}`, 'error');
          }
        });
      }

      const btnOpen = card.querySelector('.btn-pkg-open');
      if (btnOpen) {
        btnOpen.addEventListener('click', (e) => {
          e.stopPropagation();
          this.launchPackage(pkg);
        });
      }

      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-pkg') || e.target.closest('.pkg-progress-bar')) return;
        this.openDetail(pkg);
      });

      return card;
    },

    openDetail(pkg) {
      const overlay = document.getElementById('store-detail-overlay');
      if (!overlay) return;
      this._detailPkgId = pkg.id;
      const iconWrap = document.getElementById('store-detail-icon');
      const nameEl = document.getElementById('store-detail-name');
      const leadEl = document.getElementById('store-detail-lead');
      const descEl = document.getElementById('store-detail-desc');
      const sourceEl = document.getElementById('store-detail-source');
      const catEl = document.getElementById('store-detail-cat');
      const sizeEl = document.getElementById('store-detail-size');
      const pkgSpec = document.getElementById('store-spec-pkg');
      const sourceSpec = document.getElementById('store-spec-source');
      const sandboxSpec = document.getElementById('store-spec-sandbox');
      const actionWrap = document.getElementById('store-detail-action-wrap');

      const isFlatpak = Boolean(pkg.flatpak);
      const pkgSub = pkg.flatpak || pkg.deb || (pkg.action === 'meb-cert' ? 'mebcert' : '');
      const sourceLabel = isFlatpak ? 'Flathub Sandboxed' : (pkg.action === 'meb-cert' ? 'Sistem Aracı' : (pkg.vendor ? 'Resmî Depo' : 'Devuan APT'));

      if (iconWrap) {
        iconWrap.innerHTML = `<span class="store-detail-app-icon">${XdgDesktopEngine.getAppSvgIcon({ id: pkg.id, exec: pkgSub, cat: pkg.cat })}</span>`;
        const iconBox = iconWrap.querySelector('.store-detail-app-icon');
        if (iconBox) IconResolver.tagIcon(iconBox, { id: pkg.id, exec: pkgSub, deb: pkg.deb, flatpak: pkg.flatpak });
        IconResolver.upgradeScope(iconWrap);
      }
      if (nameEl) nameEl.textContent = pkg.name;
      if (leadEl) leadEl.textContent = pkg.desc;
      if (descEl) descEl.textContent = `${pkg.desc}. Kaynak: ${sourceLabel}. Paket boyutu: ${pkg.size || 'Standart'}.`;
      if (sourceEl) sourceEl.textContent = isFlatpak ? 'FLATHUB' : (pkg.action === 'meb-cert' ? 'SİSTEM' : 'APT DEPOSU');
      if (catEl) catEl.textContent = (pkg.cat || 'UYGULAMA').toUpperCase();
      if (sizeEl) sizeEl.textContent = pkg.size || 'Hafif';
      if (pkgSpec) pkgSpec.textContent = pkgSub || pkg.id;
      if (sourceSpec) sourceSpec.textContent = sourceLabel;
      if (sandboxSpec) sandboxSpec.textContent = isFlatpak ? 'Bubblewrap Sandbox (İzole)' : (pkg.action === 'meb-cert' ? 'Sistem Güven Deposu' : 'Yerel Sistem / APT');

      if (actionWrap) {
        actionWrap.innerHTML = `
          ${pkg.extUrl ? `
            <button class="btn-pkg btn-pkg-site" id="dtl-site-${pkg.id}">Resmî Web Sitesi</button>
          ` : pkg.installed ? `
            ${pkg.action === 'meb-cert' ? '' : `<button class="btn-pkg btn-pkg-open" id="dtl-open-${pkg.id}">Uygulamayı Aç</button>`}
            <button class="btn-pkg installed" id="dtl-btn-${pkg.id}">Kaldır</button>
          ` : `
            <button class="btn-pkg" id="dtl-btn-${pkg.id}">Hemen Yükle</button>
          `}
        `;
        const btnSite = actionWrap.querySelector('.btn-pkg-site');
        if (btnSite) {
          btnSite.addEventListener('click', () => TauriBridge.invoke('open_url', { url: pkg.extUrl }).catch(() => {}));
        }
        const btnOpen = actionWrap.querySelector('.btn-pkg-open');
        if (btnOpen) {
          btnOpen.addEventListener('click', () => this.launchPackage(pkg));
        }
        const btnPkg = actionWrap.querySelector('.btn-pkg:not(.btn-pkg-open):not(.btn-pkg-site)');
        if (btnPkg) {
          if (this._busyIds && this._busyIds.has(pkg.id)) {
            btnPkg.disabled = true;
            btnPkg.textContent = pkg.installed ? 'Kaldırılıyor...' : 'İndiriliyor...';
          }
          btnPkg.addEventListener('click', async () => {
            if (this._busyIds && this._busyIds.has(pkg.id)) return;
            btnPkg.disabled = true;
            btnPkg.textContent = pkg.installed ? 'Kaldırılıyor...' : 'İndiriliyor...';
            await this.togglePackage(pkg);
            if (!overlay.hidden && this._detailPkgId === pkg.id) {
              this.openDetail(pkg);
            }
          });
        }
      }

      overlay.hidden = false;
    },

    closeDetail() {
      this._detailPkgId = null;
      const overlay = document.getElementById('store-detail-overlay');
      if (overlay) overlay.hidden = true;
    },

    async launchPackage(pkg) {
      Terminal.log(`[UYGULAMA BAŞLATILIYOR] ${pkg.name}...`, 'cmd');
      try {
        if (pkg.action === 'meb-cert') {
          await TauriBridge.invoke('install_meb_certificate', {});
          Terminal.log(`[BAŞARILI] ${pkg.name} yenilendi.`, 'success');
          return;
        }
        if (pkg.flatpak) {
          await TauriBridge.invoke('launch_application', { exec: `flatpak run ${pkg.flatpak}` });
          Terminal.log(`[BAŞARILI] ${pkg.name} başlatıldı.`, 'success');
          return;
        }

        // Kurulu .desktop kaydını bul; paket adıyla ikili ad her zaman örtüşmez
        // (ör. gnome-disk-utility -> gnome-disks, libreoffice-writer -> libreoffice --writer).
        const CLI_SHELL_PKGS = new Set([
          'curl', 'wget', 'zsh', 'fish', 'socat', 'netcat-openbsd', 'openssh-client',
          'rsync', 'python3', 'perl', 'php', 'ruby', 'gcc', 'g++', 'clang', 'llvm',
          'make', 'cmake', 'ninja-build', 'meson', 'autoconf', 'pkg-config', 'nodejs',
          'npm', 'rustc', 'cargo', 'golang-go', 'default-jdk', 'sqlite3', 'postgresql',
          'mariadb-server', 'redis-server', 'jq', 'httpie', 'gh', 'git', 'git-lfs',
          'subversion', 'mercurial', 'doxygen', 'ansible', 'yt-dlp', 'streamlink',
          'rclone', 'tor', 'privoxy', 'adb', 'fastboot', 'aria2', 'tcpdump', 'iperf3',
          'whois', 'mtr-tiny', 'bind9-dnsutils', 'traceroute', 'fping', 'hping3',
          'vnstat', 'macchanger', 'openvpn', 'wireguard-tools', 'clamav', 'lshw',
          'pciutils', 'usbutils', 'smartmontools', 'memtest86+', 'sysstat', 'flatpak',
          'tmux', 'screen', 'unrar-free', 'zip', 'unzip', 'tar', 'tree', 'fzf',
          'ripgrep', 'bat', 'fd-find', '7zip', 'p7zip-full', 'lm-sensors', 'testdisk',
          'clonezilla', 'cryptsetup', 'borgbackup', 'duplicity', 'weechat', 'valgrind',
          'cloc', 'shellcheck', 'strace', 'ltrace', 'cppcheck', 'clang-format',
          'sshfs', 'exfatprogs', 'partclone', 'nvme-cli', 'dosfstools', 'ntfs-3g',
          'wipe', 'secure-delete', 'tlp', 'winetricks', 'r-base', 'jupyter-notebook',
          'qemu-system-x86'
        ]);
        if ((pkg.deb && CLI_SHELL_PKGS.has(pkg.deb)) || CLI_SHELL_PKGS.has(pkg.id)) {
          const cliCmd = pkg.deb === 'qemu-system-x86' ? 'qemu-system-x86_64' : (pkg.deb || pkg.id);
          if (typeof WindowManager !== 'undefined' && WindowManager.open) {
            WindowManager.open('win-terminal');
          }
          Terminal.log(`[BİLGİ] ${pkg.name} (${cliCmd}) bir uçbirim / komut satırı aracıdır. Kullanmak için Terminal'de '${cliCmd} --help' yazabilirsiniz.`, 'cmd');
          if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
            ReportManager.showToast(`${pkg.name} uçbirim aracıdır; Terminal açıldı.`, 'info');
          }
          return;
        }

        const DEB_EXEC_MAP = {
          'gnome-disk-utility': 'gnome-disks',
          'libreoffice-writer': 'libreoffice --writer',
          'libreoffice-calc': 'libreoffice --calc',
          'libreoffice-impress': 'libreoffice --impress',
          'libreoffice-draw': 'libreoffice --draw',
          'libreoffice-math': 'libreoffice --math',
          'libreoffice-base': 'libreoffice --base',
          'linux-cpupower': 'cpupower frequency-info',
          'screenfetch': 'screenfetch',
          'qtcreator': 'qtcreator',
          'openshot-qt': 'openshot-qt',
          'vim-gtk3': 'gvim',
          'conky-all': 'conky',
          'epiphany-browser': 'epiphany',
          'dino-im': 'dino',
          'hplip-gui': 'hp-toolbox',
          'doublecmd-gtk': 'doublecmd',
          'timeshift': 'pkexec timeshift-gtk',
          'gparted': 'pkexec /usr/sbin/gparted',
          'synaptic': 'pkexec /usr/sbin/synaptic',
          'gufw': 'pkexec gufw-pkexec'
        };
        const xdgApps = (typeof XdgDesktopEngine !== 'undefined' && Array.isArray(XdgDesktopEngine.installedApps))
          ? XdgDesktopEngine.installedApps
          : [];
        const matched = xdgApps.find(a =>
          a && (
            a.id === pkg.id ||
            (pkg.deb && (
              a.id === pkg.deb ||
              a.deb === pkg.deb ||
              String(a.id || '').toLowerCase().endsWith('.' + pkg.deb.toLowerCase()) ||
              String(a.desktopFile || '').toLowerCase().endsWith('/' + pkg.deb.toLowerCase() + '.desktop')
            ))
          )
        );
        if (matched && typeof XdgDesktopEngine.launchApp === 'function') {
          await XdgDesktopEngine.launchApp(matched);
          return;
        }

        const resolvedExec = pkg.exec || DEB_EXEC_MAP[pkg.deb] || pkg.deb || pkg.id;
        if (typeof XdgDesktopEngine !== 'undefined' && typeof XdgDesktopEngine.launchApp === 'function') {
          await XdgDesktopEngine.launchApp({ id: pkg.id, name: pkg.name, exec: resolvedExec });
        } else {
          await TauriBridge.invoke('launch_application', { exec: resolvedExec });
        }
        Terminal.log(`[BAŞARILI] ${pkg.name} başlatıldı.`, 'success');
      } catch (err) {
        Terminal.log(`[BAŞLATMA HATASI] ${err}`, 'error');
        if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
          ReportManager.showToast(`Başlatılamadı: ${err.message || err}`, 'error');
        }
      }
    },

    // Aynı paket mağazada birden fazla satırda listeleniyor; id ile aramak
    // her zaman ilk satırı bulur. Durum, tetikleyen satırdan okunmalı.
    syncInstalledState(pkgId, installed) {
      this.packages.forEach(p => {
        if (p.id === pkgId) p.installed = installed;
      });
    },

    async togglePackage(pkg, row = null) {
      if (!pkg || !pkg.id) return;
      if (this._busyIds && this._busyIds.has(pkg.id)) {
        ReportManager.showToast(`${pkg.name} işlemi zaten devam ediyor.`, 'info');
        return;
      }
      const usesApt = !pkg.flatpak && pkg.action !== 'meb-cert';
      if (usesApt && this._aptBusy) {
        ReportManager.showToast('Başka bir APT paket işlemi sürüyor; bitmesini bekleyin.', 'info');
        return;
      }

      if (this._busyIds) this._busyIds.add(pkg.id);
      if (usesApt) this._aptBusy = true;

      const btn = row ? row.querySelector('.btn-pkg:not(.btn-pkg-open)')
                      : document.getElementById(`btn-pkg-${pkg.id}`);
      const prog = row ? row.querySelector('.pkg-progress-bar')
                       : document.getElementById(`prog-${pkg.id}`);

      try {
        // Sistem eylemleri (MEB sertifikası): paket yok, onaylı yardımcı
        // betik çalışır. Kaldırma, yalnızca yerel durumu sıfırlar.
        if (pkg.action === 'meb-cert') {
          if (pkg.installed) {
            if (btn) { btn.disabled = true; btn.textContent = 'Kaldırılıyor...'; }
            Terminal.log('[SİSTEM] MEB kök sertifikası sistemden ve tarayıcı depolarından kaldırılıyor...', 'cmd');
            try {
              const msg = await TauriBridge.invoke('remove_meb_certificate', {});
              this.syncInstalledState(pkg.id, false);
              this.saveInstalledState();
              Terminal.log(`[BAŞARILI] ${msg || 'MEB sertifikası kaldırıldı.'}`, 'success');
              ReportManager.showToast('MEB sertifikası kaldırıldı.');
              this.render(document.getElementById('store-search')?.value || '');
            } catch (err) {
              if (btn) { btn.disabled = false; btn.textContent = 'Kaldır'; }
              Terminal.log(`[ERR] MEB sertifika kaldırma hatası: ${err}`, 'error');
              ReportManager.showToast(`Kaldırma hatası: ${err.message || err}`, 'error');
            }
            return;
          }
          if (btn) { btn.disabled = true; btn.textContent = 'Kuruluyor...'; }
          Terminal.log('[SİSTEM] MEB okul ağı sertifikası resmi adresten kuruluyor...', 'cmd');
          try {
            const msg = await TauriBridge.invoke('install_meb_certificate', {});
            this.syncInstalledState(pkg.id, true);
            this.saveInstalledState();
            Terminal.log(`[BAŞARILI] ${msg || 'MEB sertifikası kuruldu.'}`, 'success');
            ReportManager.showToast('MEB sertifikası kuruldu; tarayıcı güven deposu güncellendi.');
            this.render(document.getElementById('store-search')?.value || '');
          } catch (err) {
            if (btn) { btn.disabled = false; btn.textContent = 'Kur'; }
            Terminal.log(`[ERR] MEB sertifika hatası: ${err}`, 'error');
            ReportManager.showToast(`Kurulum hatası: ${err.message || err}`, 'error');
          }
          return;
        }

        if (pkg.flatpak) {
          if (pkg.installed) {
            if (btn) { btn.disabled = true; btn.textContent = 'Kaldırılıyor...'; }
            Terminal.log(`[FLATPAK] flatpak uninstall -y ${pkg.flatpak} yürütülüyor...`, 'cmd');
            try {
              await TauriBridge.invoke('remove_flatpak_app', { appId: pkg.flatpak });
              this.syncInstalledState(pkg.id, false);
              this.saveInstalledState();
              XdgDesktopEngine.removeApplication(pkg.id, pkg.deb, pkg.flatpak);
              await XdgDesktopEngine.rescanXdgApps(true);
              Terminal.log(`[FLATPAK] '${pkg.name}' (${pkg.flatpak}) kaldırıldı.`, 'success');
              ReportManager.showToast(`${pkg.name} kaldırıldı.`);
              this.render(document.getElementById('store-search')?.value || '');
            } catch (err) {
              if (btn) { btn.disabled = false; btn.textContent = 'Kaldır'; }
              Terminal.log(`[ERR] Flatpak kaldırma hatası: ${err}`, 'error');
              ReportManager.showToast(`Kaldırılamadı: ${err.message || err}`, 'error');
            }
          } else {
            if (btn) { btn.disabled = true; btn.textContent = 'İndiriliyor...'; }
            Terminal.log(`[FLATPAK] flatpak install -y flathub ${pkg.flatpak} yürütülüyor...`, 'cmd');
            let fpVal = 6;
            if (prog) prog.style.width = `${fpVal}%`;
            const fpInterval = setInterval(() => {
              fpVal = Math.min(88, fpVal + 4);
              if (prog) prog.style.width = `${fpVal}%`;
            }, 900);
            try {
              await TauriBridge.invoke('install_flatpak_app', { appId: pkg.flatpak });
              clearInterval(fpInterval);
              this.syncInstalledState(pkg.id, true);
              if (prog) prog.style.width = '100%';
              setTimeout(() => { if (prog) prog.style.width = '0%'; }, 400);
              this.saveInstalledState();
              XdgDesktopEngine.addApplication({
                id: pkg.flatpak || pkg.id,
                storeId: pkg.id,
                flatpak: pkg.flatpak,
                name: pkg.name,
                icon: pkg.id,
                exec: `flatpak run ${pkg.flatpak}`,
                cat: pkg.cat,
                comment: pkg.desc,
                is_installed_by_user: true,
                on_desktop: true
              });
              await XdgDesktopEngine.rescanXdgApps(false);
              Terminal.log(`[FLATPAK] '${pkg.name}' (${pkg.flatpak}) başarıyla kuruldu ve masaüstüne eklendi!`, 'success');
              ReportManager.showToast(`${pkg.name} kuruldu ve masaüstüne eklendi!`);
              this.render(document.getElementById('store-search')?.value || '');
            } catch (err) {
              clearInterval(fpInterval);
              if (prog) prog.style.width = '0%';
              if (btn) { btn.disabled = false; btn.textContent = 'Kur'; }
              Terminal.log(`[ERR] Flatpak kurulum hatası: ${err}`, 'error');
              ReportManager.showToast(`Kurulum hatası: ${err.message || err}`, 'error');
            }
          }
          return;
        }

        if (pkg.installed) {
          if (btn) {
            btn.disabled = true;
            btn.textContent = 'Kaldırılıyor...';
          }
          Terminal.log(`[APT] sudo apt-get remove -y -- ${pkg.deb} yürütülüyor...`, 'cmd');

          try {
            await TauriBridge.invoke('remove_deb_package', { packageName: pkg.deb });
            this.syncInstalledState(pkg.id, false);
            if (btn) {
              btn.disabled = false;
              btn.classList.remove('installed');
              btn.textContent = 'Kur';
            }
            this.saveInstalledState();
            XdgDesktopEngine.removeApplication(pkg.id, pkg.deb, pkg.flatpak);
            await XdgDesktopEngine.rescanXdgApps(true);
            Terminal.log(`[APT] '${pkg.name}' (${pkg.deb}) başarıyla kaldırıldı.`, 'success');
            this.render(document.getElementById('store-search')?.value || '');
          } catch (err) {
            if (btn) {
              btn.disabled = false;
              btn.textContent = 'Kaldır';
            }
            Terminal.log(`[ERR] Kaldırma başarısız: ${err}`, 'error');
            ReportManager.showToast(`Kaldırılamadı: ${err.message || err}`, 'error');
            setTimeout(() => this.render(document.getElementById('store-search')?.value || ''), 1600);
          }
          return;
        }

        if (btn) {
          btn.disabled = true;
          btn.textContent = 'İndiriliyor...';
        }
        Terminal.log(pkg.vendor
          ? `[DEPO] ${pkg.vendor} resmî deposu hazırlanıp '${pkg.deb}' kuruluyor...`
          : `[APT] sudo apt-get install -y -- ${pkg.deb} yürütülüyor...`, 'cmd');

        let val = 8;
        if (prog) prog.style.width = `${val}%`;
        const interval = setInterval(() => {
          val = Math.min(85, val + 6);
          if (prog) prog.style.width = `${val}%`;
        }, 600);

        try {
          // vendor girdileri (Brave/Helium/Antigravity) root-owned
          // ayaz-pkg-helper'ın vendor eylemiyle; diğerleri normal apt akışıyla kurulur.
          const xdgApp = pkg.vendor
            ? await TauriBridge.invoke('install_vendor_package', { vendor: pkg.vendor })
            : await TauriBridge.invoke('install_deb_package', { packageName: pkg.deb });
          clearInterval(interval);
          this.syncInstalledState(pkg.id, true);
          if (prog) prog.style.width = '100%';
          setTimeout(() => { if (prog) prog.style.width = '0%'; }, 400);

          this.saveInstalledState();

          // Host, .desktop dosyasından kimliği ve görünen adı çözer; onu yok
          // sayarsak kayıt başka bir id ile eklenir ve sonraki taramada menüde
          // iki kez görünür. .deb dosya adı ikon olarak kullanılamaz.
          const resolved = xdgApp || {};
          XdgDesktopEngine.addApplication({
            id: resolved.id || pkg.id,
            storeId: pkg.id,
            name: resolved.name || pkg.name,
            exec: resolved.exec || pkg.deb,
            deb: pkg.deb,
            desktopFile: resolved.desktop_file || '',
            cat: resolved.cat || pkg.cat,
            comment: resolved.comment || pkg.desc,
            is_installed_by_user: true,
            on_desktop: true
          });
          await XdgDesktopEngine.rescanXdgApps(false);

          Terminal.log(`[XDG OK] ${resolved.name || pkg.name} kuruldu ve masaüstüne eklendi.`, 'success');
          ReportManager.showToast(`${resolved.name || pkg.name} kuruldu; masaüstüne eklendi.`);
          this.render(document.getElementById('store-search')?.value || '');
        } catch (err) {
          clearInterval(interval);
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Kur';
          }
          if (prog) prog.style.width = '0%';
          const errMsg = err && err.message ? err.message : String(err);
          Terminal.log(`[ERR] Kurulum başarısız: ${errMsg}`, 'error');
          ReportManager.showToast(`Kurulum başarısız: ${errMsg.slice(0, 220)}`, 'error');
          setTimeout(() => this.render(document.getElementById('store-search')?.value || ''), 1600);
        }
      } finally {
        if (this._busyIds) this._busyIds.delete(pkg.id);
        if (usesApt) this._aptBusy = false;
      }
    },

    findPackageForApp(pkgId, appHint = null) {
      const hint = appHint || ((typeof XdgDesktopEngine !== 'undefined' && Array.isArray(XdgDesktopEngine.installedApps))
        ? XdgDesktopEngine.installedApps.find(a => a && a.id === pkgId)
        : null);
      const candIds = new Set([pkgId, hint?.storeId, hint?.id].filter(Boolean));
      const candFp = hint?.flatpak || (pkgId && pkgId.includes('.') ? pkgId : '');
      const candDeb = hint?.deb || '';
      return this.packages.find(p =>
        candIds.has(p.id)
        || (candFp && p.flatpak === candFp)
        || (candDeb && p.deb === candDeb)
        || (p.deb && candIds.has(p.deb))
        || (p.flatpak && candIds.has(p.flatpak))
      ) || null;
    },

    async uninstallPackageById(pkgId, appHint = null) {
      const hint = appHint || ((typeof XdgDesktopEngine !== 'undefined' && Array.isArray(XdgDesktopEngine.installedApps))
        ? XdgDesktopEngine.installedApps.find(a => a && a.id === pkgId)
        : null);
      if (hint && hint.isBuiltin) {
        ReportManager?.showToast('Yerleşik sistem bileşenleri kaldırılamaz; masaüstünden gizleyebilirsiniz.', 'info');
        return;
      }
      const pkg = this.findPackageForApp(pkgId, hint);
      const label = (pkg && pkg.name) || (hint && hint.name) || pkgId;
      if (!confirm(`'${label}' uygulamasını sistemden ve masaüstünden kaldırmak istiyor musunuz?`)) return;

      if (pkg) {
        pkg.installed = true;
        await this.togglePackage(pkg);
        return;
      }

      if (hint && hint.flatpak) {
        try {
          await TauriBridge.invoke('remove_flatpak_app', { appId: hint.flatpak });
          ReportManager?.showToast(`${label} kaldırıldı.`);
        } catch (err) {
          ReportManager?.showToast(`Kaldırılamadı: ${err.message || err}`, 'error');
          return;
        }
      } else if (hint && hint.deb) {
        try {
          await TauriBridge.invoke('remove_deb_package', { packageName: hint.deb });
          ReportManager?.showToast(`${label} kaldırıldı.`);
        } catch (err) {
          ReportManager?.showToast(`Kaldırılamadı: ${err.message || err}`, 'error');
          return;
        }
      }
      XdgDesktopEngine.removeApplication(pkgId, hint?.deb || null, hint?.flatpak || null);
    }
  };

  // Rust tarafındaki EXACT_ALLOWED_COMMANDS + ALLOWED_UTILITIES ile eşleşmeli.
  // Tab tamamlaması bu listeden beslenir.

  Object.assign(window, { StoreManager });
})();

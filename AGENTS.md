# AGENTS.md — Ankora Linux / Ayaz DE

Bu depo, Ankora Linux projesinin resmî ana deposudur. Burada Ayaz Desktop Environment (Ayaz DE) geliştirilir, paketlenir ve canlı ISO yapılandırması sürdürülür.

## Proje genel bakış

- Ana kullanım amacı: Devuan tabanlı Ankora Linux için hafif, kiosk odaklı masaüstü ortamı.
- Teknoloji yığını: Tauri 1.5 + Rust + WebKitGTK
- Sistem modeli: SysVinit tabanlı çalışma, systemd yerine
- Paketleme: yalnızca ISO üretimi; Ayaz DE ayrı `.deb` olarak dış dünyaya dağıtılmaz

## Kaynak haritası

| Dosya | İçerik |
|---|---|
| `src/index.html` | Masaüstü arayüzü, pencereler, başlat menüsü |
| `src/app.js` | Pencere yöneticisi, güncelleyici, AI ajanı |
| `src/style.css` | Monokrom cam tasarım sistemi ve temalar |
| `src-tauri/src/main.rs` | Sistem telemetrisi, IPC, güncelleme motoru, güvenlik kalkanı |
| `scripts/*.sh` | ISO üretimi, güvenli kurulum yardımcıları ve üst seviye betikler |
| `third_party/` | Üçüncü parti paketler ve Devuan keyring dosyaları |

## Geliştirme kuralları

- Değişiklikleri küçük ve odaklı tut.
- Mevcut yapıyı bozacak değişikliklerden kaçın.
- Yeni betik eklerken `bash -n` çalıştır.
- JavaScript/Node tarafı için mümkünse `node --check` uygulayın.
- Bu depo, Ankora Linux ana deposudur; dosyalar ve açıklamalar buna göre güncellenmelidir.

## Dış görünüm ve metin

- Kullanıcıya dönük metinlerde netlik ve güvenilirlik önceliklidir.
- Gereksiz slogan, sahte övgü ve gereksiz emoji kullanımından kaçın.
- Açıklayıcı, teknik ve kısa metin yaz.

## Altyapı ve paketleme

- ISO üretimi ve iç güncelleme akışı için mevcut betikler ve iş akışları korunmalı, desteklenmelidir.
- Değişiklikler dağıtım akışını etkileyecekse, ilgili betik veya workflow dosyası da güncellenmelidir.

## Geliştirici notları (oturum hafızası)

Bu bölüm kararların ve çalışma geçmişinin kaydıdır. Yeni karar verildikçe
tarihli satır olarak eklenir; silinmez.

- 2026-10-28: Dinamik Ada her yerden açma/kapatma (Quick Settings flyout, masaüstü sağ tık menüsü, kapsül sağ tık menüsü, kapsül içi 'Gizle' butonu ve Ayarlar) kontrollerine kavuşturuldu. Masaüstündeki simge ve klasör kalabalığı temizlendi; varsayılan olarak yalnızca 4 temel simge (Sistemi Kur, Dosyalar, Brave, Mağaza) ve Çöp Kutusu bırakıldı, diğerleri Başlat menüsüne alındı. Mağazaya 100 yeni doğrulanmış Linux uygulaması (eğitim, bilim, geliştirme, medya, ofis, sistem) eklenerek paket sayısı 278'e ulaştı. Ankora AI yerel teşhis motoru (fallback diagnostic engine) ile güçlendirildi. Derleme yapılmadı.
- 2026-10-28: Modern lüks koyu cam masaüstü ekosistemi entegrasyonu tamamlandı (`9577d47`). Mağazaya tam detay görünüm katmanı (Store App Detail View; teyit rozeti, mimari/sandbox güvenlik izolasyonu dökümü, dinamik yükle/kaldır/çalıştır aksiyonları) eklendi. Dinamik Durum Kapsülü telemetri (CPU/RAM) yanına hava durumu canlı entegre edildi. Yapay zekâ asistanına tek tıkla eyleme geçirilebilir hızlı yönlendiriciler (Günün Planı, Sistem Durumu, Uygulama Öner, Uçbirim) eklendi. Masaüstü araçları ve kategori klasörleri birleşik lüks cam (`backdrop-filter: blur`) tasarım diliyle rafine edildi.
- 2026-10-28: Dinamik Durum Kapsülü ve Yazılım Mağazası antislop ilkeleriyle rafine edildi (`1d72578`). Kapsüldeki AI-slop göstergeleri (emojiler, neon noktalar, yapay dalgalar, hover sıçraması) kaldırıldı; üst kenara tam oturan monokrom cam mimarisine geçildi; çift bildirim ve tıklama toggle bugları giderildi. Mağaza arayüzü sol kenar çubuğu (kategoriler ve depo kaynağı) ile editoryal spotlight vitrini düzenine kavuşturuldu.
- 2026-10-28: Dinamik Ada (Dynamic Island) ve Fatih Kalem 2 akıllı tahta çizim aracı entegre edildi. Dinamik ada; animasyonlu cam teması, durumsal durumlar (idle, bildirim, indirme, AI dalgası), hızlı araçlar kartı ve Ayarlar'dan açma/kapama seçeneğiyle donatıldı. Fatih Kalem 2 ISO kurulum hattına ve Mağazaya eklendi (`051e7f5`).
- 2026-10-28: Ayaz DE Mağaza modern cam tasarım sistemi ile yenilendi; masaüstü kategori klasörlerine tek tıkla çıkarma ve hava durumuna anlık yenileme desteği geldi; CHANGELOG.md 3.7.0 için güncellendi.
- 2026-10-29: Güvenlik denetimi + sürüm 4.0.0 hazırlığı pushlandı (`7031e67` CSP senkronu, `fc17ec1` büyük paket). Sürüm 3.7.0 etiketi İPTAL; 3.6.0'dan doğrudan 4.0.0 sürülüyor (dört dosya 4.0.0 + README + main.rs'te CARGO_PKG_VERSION türetimi). reqwest 0.11→0.12.28 (h2 0.4.20, RUSTSEC-2026-0258 kapatıldı; cargo-audit açık sayısı 0, kalan 5 uyarı Tauri 1.5 yığınından bakım-dışı crate'ler). USB başlatma sorunu kök nedeni: build-iso.sh hibrit adımının sessiz CD-only fallback'i + isohdpfx sessiz atlaması + stderr yutma; üçü kaldırıldı (fatal hata), ISO sonrası xorriso report_system_area ile isohybrid MBR + UEFI gpt-basdat doğrulaması eklendi, efi.img mtools'la zorunlu hale getirildi. README'ye USB yazdırma talimatı geldi. Yeni tema "Cumhuriyet" (29 Ekim; bayrak kırmızısı #e23744 vurgu, wallpaper-cumhuriyet.svg, monokrom ikon seti) tema seçici + duvar kağıdı galerisinde; duvar kağıdı Galerisi "15 Vektörel" oldu. Mağaza 278 paket (doğrulandı, scroll-up), güncelleyici akışı sağlam: hedef repo sabit Ankora-Linux/Ankora, release draft olursa güncelleyici görmüyor (tag akışında risk yok), asset adı her sürümde ayaz-de-latest-amd64.deb olarak sabit. Site deposu 83f7554 pushlandı: 4.0 sürüm damgaları, 5 dilde 29 Ekim duyuru ledesi, 14 tema sayısı, 278 mağaza iddiası (176→278 düzeltilmişti, gerçek veri), de/es/ru da i18n_extra'dan 4.0'a taşındı. CI fc17ec1'de yeşil. Sonraki adım: kullanıcı onayıyla v4.0.0 tag push → build-iso.yml ISO + .deb üretir.
- 2026-10-26: Sürümün tek kaynağı `src-tauri/tauri.conf.json` içindeki
  `"version"` alanıdır. `Cargo.toml`, `package.json` ve `VERSION` aynı
  değeri taşır; `ci.yml` dördünü karşılaştırır ve uyuşmazlıkta işi durdurur.
- 2026-10-26: Son yayın 3.6.0 (2026-10-25). Sürüm notları `CHANGELOG.md`,
  ISO çıktısı `dist/ankora-linux-3.6.0-ayaz-amd64.iso`.
- 2026-10-26: Tema eki tek pakettir: `src/style.css` içindeki tema
  değişkenleri, eşleşen duvar kağıdı ve ikon seti birlikte eklenir
  (örnek: Çınar, Meltem, Kor, Dem, Boğaz, Ayna).
- 2026-10-26: Betik ve doğrulama komutları, ISO adımları ve yayın akışı
  için `ankora-iso` skill'i (`~/.config/opencode/skills/ankora-iso/`)
  kullanılır.
- 2026-10-26: Oturumlar arası hafıza (tercihler, yol haritası, yarım işler)
  küresel `~/.config/opencode/AGENTS.md` dosyasında tutulur. Bu dosya depo
  içi kuralları, orası kişisel hafızayı taşır.

## Not

Bu repo, Ankora Linux'un resmî merkez deposudur. Tüm proje mantığı, geliştirici ve yayın akışı burada bulunur.

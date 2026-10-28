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

- 2026-10-28: Ayaz DE Mağaza modern cam tasarım sistemi ile yenilendi; masaüstü kategori klasörlerine tek tıkla çıkarma ve hava durumuna anlık yenileme desteği geldi; CHANGELOG.md 3.7.0 için güncellendi.
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

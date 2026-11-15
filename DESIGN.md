# DESIGN.md: Ayaz DE tasarım yönü

Bu dosya ürün sahibinin talimatıdır. `antislop.md` yalnızca filtre görevi görür;
yön buradan okunur.

## Kimlik

Ayaz DE, Ankora Linux'un masaüstü ortamı. Bir uygulama vitrini değil, işletim
sisteminin kendisi. Kullanıcı burada zaman geçirir, okur, komut çalıştırır.
Gösteriş değil, gün boyu dayanıklılık aranır.

## Kişilik

Sakin ama canlı. Gergin değil, tembel de değil. Yüzeyler yumuşak, hareketler
kısa, renkler az.

## Palet

Tek vurgu rengi: mavi `#2563eb`.

| Rol | Koyu | Açık |
|---|---|---|
| Zemin | `#13141b` | `#ffffff` |
| Panel | `#1b1c26` | `#f8fafc` |
| Yüzey | `#242533` | `#f1f5f9` |
| Metin | `#f5f6fa` / `#a3a6be` / `#9597b6` | `#0f172a` / `#64748b` / `#5a687d` |

Nötrler sayılır, palet dışıdır. Kategori noktaları ve uygulama aksanları
istisnadır; her biri bir anlam taşır, süs değildir.

## Tipografi

`--font-sans` arayüz, `--font-mono` sayı, yol, komut ve durum bilgisi için.
Büyük mono başlık yok, geniş harf aralıklı büyük harf etiket yok.

## Cam (glassmorphism)

Kullanıcı talimatı: canlı, yumuşak, camlı. Ama sorun çıkaran şey yapılmayacak,
çok optimize olacak.

Bu iki madde birlikte doz demek:

- **Cam yalnızca iki yüzeyde:** görev çubuğu ve başlat menüsü. İkisi de sabit
  konumlu, altlarında içerik kaydırılmıyor,blur maliyeti sınırlı.
- **Camda doz:** `blur` en fazla `14px`, `saturate` en fazla `1.5`. Daha fazlası
  WebKitGTK'de gözle görülür yavaşlık yapar.
- **Pencereler, kartlar, tablolar, kaydırma alanları cam DEĞİL.** Bunlar düz
  yüzey kalır. Arkalarında kayan içerik varken blur kullanılmaz.
- **Yedek zemin zorunlu:** `backdrop-filter` desteklenmediğinde altındaki
  yarı saydam zemin tek başına okunur kalır; blur yoksa düzen bozulmaz.
- Parlama (glow) yok. Gölgeler tek seviye, yumuşak ve alçak.

## Hareket

`160-200ms`, `cubic-bezier(0.16, 1, 0.3, 1)`. Sonsuz döngü yok. Yalnızca açılış,
kapanış ve hover.

## Dial'lar

> Bu ürün, sistem arayüzü, düzenli kullanıcı için; canlı-soft, cam vurgulu
> bir dille. Dial **ENERGY 2 / RHYTHM 2 / MOTION 1**.

- ENERGY 2: sıcak ama bağırmayan. Vurgu tek noktada.
- RHYTHM 2: düzenli ızgara, iki yerde kırılma (başlat menüsü ve görev çubuğu).
- MOTION 1: yalnızca durum geçişleri. Kaydırma animasyonu, parallax yok.

## İkonlar

Tek renk, çizgi kalınlığı `1.8`, `currentColor` ile boyanır. Klasör, dosya,
uygulama ve durum ikonları aynı ailede. **Renkli emoji kullanılmaz**; yerine
`<use href="#ico-...">` ile aynı çizgi ağırlığındaki monokrom sembol geçer.

## Yazı dili

Türkçe, samimi, kısa. "Hızlı, güvenli ve modern" tarzı üçleme yok. Uydurma
istatistik, uydurma övgü yok. Bir satır bir şey anlatmıyorsa o satır yazılmaz.

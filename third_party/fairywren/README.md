# FairyWren Ayaz — ikon seçkisi

Bu dizin, Isaiah Membery'nin **FairyWren Icons** projesinden
(https://gitlab.com/FreshDoctor/FairyWren-Icons) Ayaz DE için alınmış
uyarlama seçkisidir. FairyWren, Papirus Icon Seti tabanlıdır; GPLv3
lisanslıdır (`LICENSE`).

## Kapsam

Tam FairyWren seti ~54 MB'tır; ISO boyutu için burada yalnız Ayaz DE'nin
kendi kurduğu yazılımların simgeleri + dosya türleri + aygıt simgeleri
var (~2 MB). Seçkide bulunmayan simgeler `index.theme`'deki devralma
zinciriyle **Papirus**'tan gelir; Papirus ISO'ya `papirus-icon-theme`
paketinden kurulur.

## Kullanım

- ISO derleyici (`scripts/build-iso.sh`) bu seti chroot içine
  `/usr/share/icons/FairyWren_Ayaz` olarak kopyalar.
- GTK/xsettings ikon teması: tema varsa `FairyWren_Ayaz`, yoksa Papirus
  (`sync_desktop_theme` bunu otomatik seçer).
- Ayaz arayüzünde karşılığı: Ayarlar → Görünüm → İkon Seti → "FairyWren
  (Renkli)".

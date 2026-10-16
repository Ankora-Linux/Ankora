#!/bin/bash
# ==============================================================================
# Ankora Linux — Ayaz DE .deb Paket Derleme Betiği
# Target: Devuan 5 (Daedalus) / Debian 12 (Bookworm) x86_64
# ==============================================================================

set -euo pipefail

echo "========================================================"
echo "  Ankora Linux — Ayaz DE Debian Paketi Derleniyor...   "
echo "========================================================"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# 1. Bağımlılık kontrolü
MISSING_PKGS=()
for cmd in cargo npm dpkg pkg-config; do
    if ! command -v "$cmd" &>/dev/null; then
        MISSING_PKGS+=("$cmd")
    fi
done

if [ ${#MISSING_PKGS[@]} -gt 0 ]; then
    echo "[HATA] Aşağıdaki gerekli araçlar eksik: ${MISSING_PKGS[*]}"
    echo "Debian 12 (Daedalus/Bookworm): sudo apt-get update && sudo apt-get install -y pkg-config build-essential cargo rustc nodejs npm libwebkit2gtk-4.0-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf"
    echo "Ubuntu 24.04+ / Zorin 18 (noble: 4.0-dev YOK): sudo apt-get update && sudo apt-get install -y pkg-config build-essential libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf"
    exit 1
fi

# 1b. WebKit/GTK/Soup geliştirme başlıkları (pkg-config ile doğrulanır)
if ! pkg-config --exists 'webkit2gtk-4.0' 2>/dev/null && ! pkg-config --exists 'webkit2gtk-4.1' 2>/dev/null; then
    echo "[HATA] WebKitGTK geliştirme dosyaları bulunamadı (webkit2gtk-4.0 ya da 4.1)."
    echo "Debian 12: sudo apt-get install -y libwebkit2gtk-4.0-dev"
    echo "Ubuntu 24.04+ / Zorin 18: sudo apt-get install -y libwebkit2gtk-4.1-dev"
    exit 1
fi
if ! pkg-config --exists 'libsoup-2.4' 2>/dev/null; then
    echo "[HATA] libsoup-2.4 geliştirme dosyaları bulunamadı (Tauri 1.5 soup2-sys ister)."
    echo "Kur: sudo apt-get install -y libsoup2.4-dev"
    exit 1
fi

# 1c. Ubuntu 24.04+ / Zorin 18 (noble) uyumluluğu: Tauri 1.5'in webkit2gtk-sys
# 0.18 / javascriptcore-rs-sys 0.4 kasaları yalnızca *-4.0 .pc adlarını arar,
# noble'da ise yalnız 4.1 başlıkları vardır. Sisteme dokunmadan kullanıcı
# önbelleğinde 4.0 -> 4.1 uyumluluk shimi kurulur (derleme karşılığı aynı API).
if ! pkg-config --exists 'webkit2gtk-4.0' 2>/dev/null && pkg-config --exists 'webkit2gtk-4.1' 2>/dev/null; then
    SHIM_DIR="${HOME:-/tmp}/.cache/ayaz-webkit40-shim"
    mkdir -p "$SHIM_DIR"
    if [ ! -f "$SHIM_DIR/webkit2gtk-4.0.pc" ] || [ ! -f "$SHIM_DIR/javascriptcoregtk-4.0.pc" ]; then
        echo "[BİLGİ] webkit2gtk-4.0 bulunamadı, 4.1 uyumluluk shimi kuruluyor ($SHIM_DIR)..."
        cat > "$SHIM_DIR/webkit2gtk-4.0.pc" <<'SHIM_EOF'
prefix=/usr
exec_prefix=${prefix}
libdir=/usr/lib/x86_64-linux-gnu
includedir=${prefix}/include

Name: WebKitGTK (4.0 shim -> 4.1, Tauri 1.5 noble derlemesi icin)
Description: Web content engine for GTK - 4.0 uyumluluk shimi
Version: 2.52.6
Requires: webkit2gtk-4.1
Libs: -L${libdir} -lwebkit2gtk-4.1
Cflags: -I${includedir}/webkitgtk-4.1
SHIM_EOF
        cat > "$SHIM_DIR/javascriptcoregtk-4.0.pc" <<'SHIM_EOF'
prefix=/usr
exec_prefix=${prefix}
libdir=/usr/lib/x86_64-linux-gnu
includedir=${prefix}/include

Name: JavaScriptCoreGTK+ (4.0 shim -> 4.1, Tauri 1.5 noble derlemesi icin)
Description: GTK+ version of the JavaScriptCore engine - 4.0 uyumluluk shimi
Version: 2.52.6
Requires: javascriptcoregtk-4.1
Libs: -L${libdir} -ljavascriptcoregtk-4.1
Cflags: -I${includedir}/webkitgtk-4.1
SHIM_EOF
    fi
    export PKG_CONFIG_PATH="$SHIM_DIR${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
    # Bağlayıcı aşaması: -lwebkit2gtk-4.0 / -ljavascriptcoregtk-4.0 gerçek .so
    # dosyaları noble'da yoktur. Kullanıcı alanında 4.1'e takma ad verilir;
    # bağlayıcıya RUSTFLAGS ile -L yoluyla gösterilir (sudo gerekmez).
    mkdir -p "$SHIM_DIR/lib"
    [ -e "$SHIM_DIR/lib/libwebkit2gtk-4.0.so" ] || ln -sf /usr/lib/x86_64-linux-gnu/libwebkit2gtk-4.1.so "$SHIM_DIR/lib/libwebkit2gtk-4.0.so"
    [ -e "$SHIM_DIR/lib/libjavascriptcoregtk-4.0.so" ] || ln -sf /usr/lib/x86_64-linux-gnu/libjavascriptcoregtk-4.1.so "$SHIM_DIR/lib/libjavascriptcoregtk-4.0.so"
    export RUSTFLAGS="${RUSTFLAGS:+$RUSTFLAGS }-L native=$SHIM_DIR/lib"
fi

# 2. Node bağımlılıkları
if [ ! -d "node_modules" ]; then
    echo "[1/4] NPM bağımlılıkları kuruluyor..."
    npm install
fi

# 3. Tauri CLI ile .deb derlemesi
echo "[2/4] Tauri ile .deb paketi derleniyor..."
npm run tauri build -- --bundles deb


# 4. Derlenen paketin kontrolü
# pipefail açık: head erken çıkarsa find SIGPIPE ile 141 döner ve betik,
# açıklayıcı "[HATA]" mesajı basmadan sessizce ölür.
DEB_FILE=$(find src-tauri/target/release/bundle/deb/ -name "*.deb" 2>/dev/null | head -n 1 || true)

if [ -n "$DEB_FILE" ] && [ -f "$DEB_FILE" ]; then
    echo "[3/4] Paket başarıyla oluşturuldu:"
    ls -lh "$DEB_FILE"
    
    mkdir -p dist
    # 3b. Tauri 1.5 bundler, otomatik bağımlılıkları kontrol satırının sonuna
    # bare olarak tekrar ekler (", libwebkit2gtk-4.0-37, libgtk-3-0").
    # Sondaki bare 4.0-37, noble (Ubuntu 24.04 / Zorin 18) depolarında
    # bulunmadığından kurulumu engeller; baştaki "4.0-37 | 4.1-0"
    # dönüşümü zaten yeterli olduğu için yinelenen kuyruk temizlenir.
    REPACK_DIR="$(mktemp -d)"
    dpkg-deb -R "$DEB_FILE" "$REPACK_DIR"
    sed -i 's/, libwebkit2gtk-4\.0-37, libgtk-3-0$//' "$REPACK_DIR/DEBIAN/control"
    chmod 755 "$REPACK_DIR/DEBIAN"
    dpkg-deb -b "$REPACK_DIR" "$DEB_FILE"
    rm -rf "$REPACK_DIR"
    echo "[3b/4] Depends yinelenen kuyruktan arındırıldı:"
    dpkg-deb -f "$DEB_FILE" Depends
    cp -v "$DEB_FILE" dist/ayaz-de-latest-amd64.deb
    echo "[4/4] Çıktı: dist/ayaz-de-latest-amd64.deb"
    echo "Tebrikler! .deb paketi ISO derleme adımına hazır."
else
    echo "[HATA] .deb paketi bulunamadı! Lütfen derleme loglarını inceleyin."
    exit 2
fi

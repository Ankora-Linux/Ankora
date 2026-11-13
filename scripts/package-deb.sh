#!/bin/bash
# ==============================================================================
# Ankora Linux — Ayaz DE İç Paket Derleme Betiği
# UYARI: Ayaz DE yalnız Ankora Linux ile dağıtılır; bu betiğin çıktısı
# dış dünyaya yayınlanmaz. Yalnızca canlı ISO derleyicisi (build-iso.sh)
# ayaz-de ikilisini ve güncelleyici kimliğini enjekte etmek için kullanır.
# Target: Devuan 6 (Excalibur) / Debian 13 (Trixie) / Ubuntu 24.04+ x86_64
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
    echo "Devuan 6 (Excalibur) / Debian 13 (Trixie) / Ubuntu 24.04+: sudo apt-get update && sudo apt-get install -y pkg-config build-essential cargo rustc nodejs npm libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf"
    exit 1
fi

# 1b. WebKitGTK 4.1 geliştirme başlıkları (pkg-config ile doğrulanır — Tauri 2 + libsoup3)
if ! pkg-config --exists 'webkit2gtk-4.1' 2>/dev/null; then
    echo "[HATA] WebKitGTK 4.1 geliştirme dosyaları bulunamadı (webkit2gtk-4.1)."
    echo "Devuan 6 (Excalibur) / Debian 13 (Trixie) / Ubuntu 24.04+: sudo apt-get install -y libwebkit2gtk-4.1-dev"
    exit 1
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
DEB_FILE=$(ls -1t src-tauri/target/release/bundle/deb/*.deb 2>/dev/null | head -n 1 || true)

if [ -n "$DEB_FILE" ] && [ -f "$DEB_FILE" ]; then
    echo "[3/4] Paket başarıyla oluşturuldu:"
    ls -lh "$DEB_FILE"
    
    mkdir -p dist
    echo "[3b/4] Paket bağımlılıkları:"
    dpkg-deb -f "$DEB_FILE" Depends || true
    cp -v "$DEB_FILE" dist/ayaz-de-latest-amd64.deb
    echo "[4/4] Çıktı: dist/ayaz-de-latest-amd64.deb"
    echo "Tebrikler! .deb paketi ISO derleme adımına hazır."
else
    echo "[HATA] .deb paketi bulunamadı! Lütfen derleme loglarını inceleyin."
    exit 2
fi

#!/bin/bash
# ==============================================================================
# Ankora Linux — Ayaz DE Tam Paket Derleme Betiği (.deb)
# Oturum başlatıcıyı (ayaz-de), /usr/bin/ayaz sembolik bağını, sistem yardımcılarını,
# sudoers politikasını ve /usr/share/ayaz varlıklarını tek pakette toplar.
# Target: Devuan 6 (Excalibur) / Debian 13 (Trixie) / Ubuntu 24.04+ x86_64
# ==============================================================================

set -euo pipefail

echo "========================================================"
echo "  Ankora Linux — Ayaz DE Debian Paketi Derleniyor...   "
echo "========================================================"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' src-tauri/tauri.conf.json | head -n 1)
if [ -z "$VERSION" ] && [ -f "VERSION" ]; then
    VERSION=$(tr -d '[:space:]' < VERSION)
fi
VERSION="${VERSION:-5.0.0}"

# 1. Bağımlılık kontrolü
MISSING_PKGS=()
for cmd in cargo npm dpkg dpkg-deb pkg-config; do
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
    echo "[1/5] NPM bağımlılıkları kuruluyor..."
    if [ -f "package-lock.json" ]; then
        npm ci
    else
        npm install
    fi
fi

# 3. Tauri CLI ile ikili ve temel .deb derlemesi
echo "[2/5] Tauri 2 ile Ayaz DE derleniyor (v${VERSION})..."
npm run tauri build -- --bundles deb

RAW_DEB=$(ls -1t src-tauri/target/release/bundle/deb/*.deb 2>/dev/null | head -n 1 || true)
BIN_PATH="src-tauri/target/release/ayaz-de"

if [ ! -x "$BIN_PATH" ]; then
    echo "[HATA] Derlenmiş ikili bulunamadı: $BIN_PATH" >&2
    exit 2
fi

if [ -z "$RAW_DEB" ] || [ ! -f "$RAW_DEB" ]; then
    echo "[HATA] Tauri .deb çıktısı bulunamadı! Lütfen derleme loglarını inceleyin." >&2
    exit 2
fi

echo "[3/5] Tam Ayaz DE paket içeriği birleştiriliyor (/usr/bin/ayaz-de + sistem yardımcıları)..."
STAGE_ROOT=$(mktemp -d /tmp/ayaz-deb-stage.XXXXXX)
trap 'rm -rf "$STAGE_ROOT"' EXIT

dpkg-deb -R "$RAW_DEB" "$STAGE_ROOT"

mkdir -p \
    "$STAGE_ROOT/usr/bin" \
    "$STAGE_ROOT/usr/local/bin" \
    "$STAGE_ROOT/etc/sudoers.d" \
    "$STAGE_ROOT/etc/polkit-1/rules.d" \
    "$STAGE_ROOT/usr/share/polkit-1/actions" \
    "$STAGE_ROOT/etc/skel/.config/openbox" \
    "$STAGE_ROOT/etc/ankora" \
    "$STAGE_ROOT/usr/share/ayaz/grub-theme-ankora" \
    "$STAGE_ROOT/usr/share/ayaz/plymouth-theme-ankora" \
    "$STAGE_ROOT/usr/share/applications" \
    "$STAGE_ROOT/usr/share/xsessions" \
    "$STAGE_ROOT/usr/share/icons/hicolor/512x512/apps"

install -m 0755 "$BIN_PATH" "$STAGE_ROOT/usr/bin/ayaz-de"
ln -sf /usr/bin/ayaz-de "$STAGE_ROOT/usr/bin/ayaz"

install -m 0755 "$ROOT_DIR/scripts/ayaz-session" "$STAGE_ROOT/usr/bin/ayaz-session"
install -m 0755 "$ROOT_DIR/scripts/ayaz-ctl" "$STAGE_ROOT/usr/bin/ayaz-ctl"
install -m 0755 "$ROOT_DIR/scripts/eta-touchdrv" "$STAGE_ROOT/usr/bin/eta-touchdrv"

install -m 0755 "$ROOT_DIR/scripts/ayaz-update-helper.sh" "$STAGE_ROOT/usr/local/bin/ayaz-update-helper"
install -m 0755 "$ROOT_DIR/scripts/ayaz-pkg-helper.sh" "$STAGE_ROOT/usr/local/bin/ayaz-pkg-helper"
install -m 0755 "$ROOT_DIR/scripts/ankora-doctor.sh" "$STAGE_ROOT/usr/local/bin/ankora-doctor"
install -m 0755 "$ROOT_DIR/scripts/ankora-ollama-install.sh" "$STAGE_ROOT/usr/local/bin/ankora-ollama-install"

install -m 0440 "$ROOT_DIR/scripts/ankora-updater-sudoers" "$STAGE_ROOT/etc/sudoers.d/ankora-updater"
install -m 0644 "$ROOT_DIR/scripts/49-ankora-admin.rules" "$STAGE_ROOT/etc/polkit-1/rules.d/49-ankora-admin.rules"
install -m 0644 "$ROOT_DIR/scripts/org.ankora.ayaz.pkg-helper.policy" "$STAGE_ROOT/usr/share/polkit-1/actions/org.ankora.ayaz.pkg-helper.policy"
install -m 0755 "$ROOT_DIR/scripts/xinitrc" "$STAGE_ROOT/etc/skel/.xinitrc"

cp -r "$ROOT_DIR/src/"* "$STAGE_ROOT/usr/share/ayaz/"
install -m 0644 "$ROOT_DIR/scripts/openbox-rc.xml" "$STAGE_ROOT/usr/share/ayaz/openbox-rc.xml"
install -m 0644 "$ROOT_DIR/scripts/openbox-rc.xml" "$STAGE_ROOT/etc/skel/.config/openbox/rc.xml"
install -m 0644 "$ROOT_DIR/scripts/grub-theme-ankora/theme.txt" "$STAGE_ROOT/usr/share/ayaz/grub-theme-ankora/theme.txt"
install -m 0644 "$ROOT_DIR/scripts/ankora-grub-default" "$STAGE_ROOT/usr/share/ayaz/ankora-grub-default"
install -m 0644 "$ROOT_DIR/scripts/plymouth-theme-ankora/ankora.plymouth" "$STAGE_ROOT/usr/share/ayaz/plymouth-theme-ankora/ankora.plymouth"
install -m 0644 "$ROOT_DIR/scripts/plymouth-theme-ankora/ankora.script" "$STAGE_ROOT/usr/share/ayaz/plymouth-theme-ankora/ankora.script"

install -m 0644 "$ROOT_DIR/scripts/ayaz.desktop" "$STAGE_ROOT/usr/share/applications/ayaz.desktop"
install -m 0644 "$ROOT_DIR/scripts/ayaz-session.desktop" "$STAGE_ROOT/usr/share/xsessions/ayaz.desktop"
if [ -f "$ROOT_DIR/assets/logo.png" ]; then
    install -m 0644 "$ROOT_DIR/assets/logo.png" "$STAGE_ROOT/usr/share/icons/hicolor/512x512/apps/ayaz-de.png"
fi

printf '%s\n' "$VERSION" > "$STAGE_ROOT/etc/ankora/version"
chmod 0644 "$STAGE_ROOT/etc/ankora/version"

# CRLF temizliği (yalnızca metin/betik dosyaları, ikili/symlink hariç)
for txtf in \
    "$STAGE_ROOT/usr/bin/ayaz-session" \
    "$STAGE_ROOT/usr/bin/ayaz-ctl" \
    "$STAGE_ROOT/usr/bin/eta-touchdrv" \
    "$STAGE_ROOT/usr/local/bin/ayaz-update-helper" \
    "$STAGE_ROOT/usr/local/bin/ayaz-pkg-helper" \
    "$STAGE_ROOT/usr/local/bin/ankora-doctor" \
    "$STAGE_ROOT/usr/local/bin/ankora-ollama-install" \
    "$STAGE_ROOT/etc/sudoers.d/ankora-updater" \
    "$STAGE_ROOT/etc/polkit-1/rules.d/49-ankora-admin.rules" \
    "$STAGE_ROOT/usr/share/polkit-1/actions/org.ankora.ayaz.pkg-helper.policy" \
    "$STAGE_ROOT/etc/skel/.xinitrc" \
    "$STAGE_ROOT/usr/share/applications/ayaz.desktop" \
    "$STAGE_ROOT/usr/share/xsessions/ayaz.desktop"; do
    if [ -f "$txtf" ] && [ ! -L "$txtf" ]; then
        sed -i 's/\r$//' "$txtf"
    fi
done

INSTALLED_SIZE=$(du -sk "$STAGE_ROOT/usr" "$STAGE_ROOT/etc" | awk '{s+=$1} END{print s+0}')

cat > "$STAGE_ROOT/DEBIAN/control" <<EOF
Package: ayaz-de
Version: ${VERSION}
Architecture: amd64
Maintainer: Ankora Linux Project <security@ankora.org>
Installed-Size: ${INSTALLED_SIZE}
Section: x11
Priority: optional
Depends: libwebkit2gtk-4.1-0 | libwebkit2gtk-4.0-37, libgtk-3-0, libayatana-appindicator3-1 | libappindicator3-1, bubblewrap, xdg-dbus-proxy, openbox, wmctrl, xdotool, x11-xserver-utils, libnss3-tools, plymouth
Provides: ayaz
Description: Ayaz Minimalist Kiosk Desktop Environment for Ankora Linux
 Ankora Linux (Devuan 6 Excalibur, SysVinit) için Tauri 2 ve WebKitGTK 4.1
 tabanlı masaüstü kabuğu, oturum yöneticisi ve sistem yardımcıları.
EOF

cat > "$STAGE_ROOT/DEBIAN/postinst" <<'POSTINST'
#!/bin/sh
set -e
chmod 0440 /etc/sudoers.d/ankora-updater 2>/dev/null || true
chmod 0755 /usr/bin/ayaz-de /usr/bin/ayaz-session /usr/bin/ayaz-ctl /usr/bin/eta-touchdrv \
    /usr/local/bin/ayaz-update-helper /usr/local/bin/ayaz-pkg-helper \
    /usr/local/bin/ankora-doctor /usr/local/bin/ankora-ollama-install 2>/dev/null || true

# Kurulu masaüstü kullanıcılarının .xinitrc dosyasını güncel /usr/bin/ayaz-de oturumuna geçir
if [ -f /etc/skel/.xinitrc ]; then
    for uhome in /home/*; do
        [ -d "$uhome" ] || continue
        ux="$uhome/.xinitrc"
        if [ -f "$ux" ] && grep -qE "AYAZ_BIN|ayaz" "$ux" 2>/dev/null; then
            owner=$(stat -c '%u:%g' "$uhome" 2>/dev/null || true)
            cp -f /etc/skel/.xinitrc "$ux"
            chmod 0755 "$ux"
            [ -n "$owner" ] && chown "$owner" "$ux" 2>/dev/null || true
        fi
    done
fi
for pf in /etc/skel/.profile /home/*/.profile; do
    [ -f "$pf" ] || continue
    if grep -qE 'exec startx[[:space:]]*>[[:space:]]*~/\.xsession-errors' "$pf" 2>/dev/null; then
        sed -i -E 's|exec startx[[:space:]]*>[[:space:]]*~/\.xsession-errors|exec startx -- "vt${XDG_VTNR:-1}" > ~/.xsession-errors|g' "$pf"
    fi
done

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -f /usr/share/icons/hicolor 2>/dev/null || true
fi
exit 0
POSTINST
chmod 0755 "$STAGE_ROOT/DEBIAN/postinst"

mkdir -p dist
OUT_VERSIONED="dist/ayaz-de_${VERSION}_amd64.deb"
OUT_LATEST="dist/ayaz-de-latest-amd64.deb"

echo "[4/5] Debian paketi inşa ediliyor: $OUT_LATEST"
dpkg-deb --build --root-owner-group "$STAGE_ROOT" "$OUT_VERSIONED"
cp -f "$OUT_VERSIONED" "$OUT_LATEST"

echo "[5/5] SHA-256 sağlama toplamları ve varsa GPG imzaları üretiliyor..."
(
    cd dist
    sha256sum "ayaz-de-latest-amd64.deb" > "ayaz-de-latest-amd64.deb.sha256"
    sha256sum "ayaz-de_${VERSION}_amd64.deb" "ayaz-de-latest-amd64.deb" > "SHA256SUMS"
)

if command -v gpg >/dev/null 2>&1; then
    if [ -n "${ANKORA_GPG_PRIVATE_KEY:-}" ]; then
        GNUPG_TMP=$(mktemp -d /tmp/ankora-gpg.XXXXXX)
        trap 'rm -rf "$STAGE_ROOT" "$GNUPG_TMP"' EXIT
        chmod 0700 "$GNUPG_TMP"
        printf '%s\n' "$ANKORA_GPG_PRIVATE_KEY" | gpg --homedir "$GNUPG_TMP" --batch --import 2>/dev/null || true
        KEY_ARG=()
        if [ -n "${ANKORA_GPG_KEY_ID:-}" ]; then
            KEY_ARG=(-u "$ANKORA_GPG_KEY_ID")
        fi
        PASSPHRASE_ARGS=(--pinentry-mode loopback --passphrase "${ANKORA_GPG_PASSPHRASE:-}")
        gpg --homedir "$GNUPG_TMP" --batch --yes "${PASSPHRASE_ARGS[@]}" "${KEY_ARG[@]}" \
            --armor --detach-sign -o dist/SHA256SUMS.asc dist/SHA256SUMS
        gpg --homedir "$GNUPG_TMP" --batch --yes "${PASSPHRASE_ARGS[@]}" "${KEY_ARG[@]}" \
            --armor --detach-sign -o dist/ayaz-de-latest-amd64.deb.asc dist/ayaz-de-latest-amd64.deb
        gpg --homedir "$GNUPG_TMP" --armor --export > dist/ankora-release-key.asc || true
        echo "[GPG] dist/SHA256SUMS.asc ve dist/ayaz-de-latest-amd64.deb.asc imzalandı."
    elif [ -n "${ANKORA_GPG_KEY_ID:-}" ]; then
        gpg --batch --yes -u "$ANKORA_GPG_KEY_ID" --armor --detach-sign -o dist/SHA256SUMS.asc dist/SHA256SUMS
        gpg --batch --yes -u "$ANKORA_GPG_KEY_ID" --armor --detach-sign -o dist/ayaz-de-latest-amd64.deb.asc dist/ayaz-de-latest-amd64.deb
        echo "[GPG] Yerel anahtar ($ANKORA_GPG_KEY_ID) ile imzalandı."
    else
        echo "[BİLGİ] ANKORA_GPG_PRIVATE_KEY tanımlı değil; .asc GPG imzası yerel derlemede atlandı."
    fi
fi

ls -lh "$OUT_LATEST" "$OUT_VERSIONED"
dpkg-deb -f "$OUT_LATEST" Package Version Depends || true
echo "Tebrikler! Tam Ayaz DE paketi (v${VERSION}) hazır: $OUT_LATEST (+ .sha256, SHA256SUMS)"


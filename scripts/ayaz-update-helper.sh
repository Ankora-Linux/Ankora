#!/bin/bash
# ==============================================================================
# Ayaz DE Güncelleme Yardımcısı (Ayaz Desktop Update Helper)
# Ankora Linux (Devuan 6 Excalibur SysVinit) Güvenli Kurulum Scripti
# Depo: https://github.com/Ankora-Linux/Ayaz
# ==============================================================================
# GÜVENLİK DÜZELTMELERİ:
#   - /tmp yerine root-owned 0700 staging dizini (/var/cache/ayaz-updates/)
#   - Symlink takibi engelleme (readlink -f + O_NOFOLLOW semantiği)
#   - Paket adı doğrulaması (yalnızca ayaz-de veya ankora-de paketleri)
#   - Dosya sahipliği doğrulaması (root:root olmalı)
#   - --stage modu: kullanıcı sürecinin indirdiği paketi sha256
#     doğrulamasıyla root staging'ine alma (TOCTOU'ya kapalı kopya)
# ==============================================================================

set -euo pipefail

STAGING_DIR="/var/cache/ayaz-updates"
DEB_PATH="${1:-${STAGING_DIR}/ayaz-update.deb}"

# 1. Staging dizini güvenlik kontrolü
if [[ ! -d "$STAGING_DIR" ]]; then
    mkdir -p "$STAGING_DIR"
    chown root:root "$STAGING_DIR"
    chmod 0700 "$STAGING_DIR"
fi

# Staging dizini sahipliği doğrulaması
STAGING_OWNER=$(stat -c '%u:%g' "$STAGING_DIR" 2>/dev/null || echo "unknown")
if [[ "$STAGING_OWNER" != "0:0" ]]; then
    echo "[HATA] Staging dizini root sahipliğinde değil: $STAGING_DIR ($STAGING_OWNER)" >&2
    exit 10
fi

# --- STAGE modu: kullanıcının indirdiği paketi root ile staging'e alır ---
# Kullanım: ayaz-update-helper --stage <kullanici_dosyasi> <sha256>
# İndirme kullanıcı sürecinde olur (/var/cache'a yazma yetkisi yoktur); paket
# burada root olarak kopyalanır ve KOPYANIN sha256'sı doğrulanır. Kaynak dosya
# kopya sırasında değiştirilse bile kopyanın özeti uyuşmadığı için reddedilir.
if [[ "${1:-}" == "--stage" ]]; then
    SRC="${2:-}"
    EXPECTED_SHA="${3:-}"
    if [[ -z "$SRC" || -z "$EXPECTED_SHA" || ! "$EXPECTED_SHA" =~ ^[0-9a-fA-F]{64}$ ]]; then
        echo "[HATA] Kullanım: ayaz-update-helper --stage <dosya> <sha256>" >&2
        exit 9
    fi
    if [[ ! -f "$SRC" || -L "$SRC" ]]; then
        echo "[HATA] Aşama alınacak dosya yok veya sembolik bağlantı: $SRC" >&2
        exit 9
    fi
    INCOMING="$STAGING_DIR/.incoming.deb"
    rm -f "$INCOMING"
    cat "$SRC" > "$INCOMING"
    chown root:root "$INCOMING"
    chmod 0600 "$INCOMING"
    ACTUAL_SHA=$(sha256sum "$INCOMING" | awk '{print $1}')
    if [[ "${ACTUAL_SHA,,}" != "${EXPECTED_SHA,,}" ]]; then
        rm -f "$INCOMING"
        echo "[HATA] sha256 doğrulaması başarısız; paket staging'e alınmadı." >&2
        exit 9
    fi
    mv -f "$INCOMING" "$STAGING_DIR/ayaz-update.deb"
    echo "[AYAZ GÜNCELLEYİCİ] Paket staging dizinine alındı ve özeti doğrulandı."
    exit 0
fi

# 2. Dosya yolu güvenlik kontrolü — yalnızca staging dizini kabul edilir
CANONICAL_PATH=$(readlink -f "$DEB_PATH" 2>/dev/null || echo "")
if [[ -z "$CANONICAL_PATH" || ! -f "$CANONICAL_PATH" ]]; then
    echo "[HATA] Güncelleme paketi bulunamadı veya geçersiz yol: $DEB_PATH" >&2
    exit 1
fi

# Staging dizini sınırı kontrolü (path traversal engeli)
if [[ "$CANONICAL_PATH" != "${STAGING_DIR}/"* ]]; then
    echo "[HATA] Paket güvenli staging dizininde değil: $CANONICAL_PATH (beklenen: $STAGING_DIR/)" >&2
    exit 2
fi

# 3. Symlink kontrolü — dosyanın kendisi symlink olmamalı
if [[ -L "$DEB_PATH" ]]; then
    echo "[HATA] Güvenlik: Sembolik bağlantılar kabul edilmez: $DEB_PATH" >&2
    exit 3
fi

# 4. Dosya uzantısı kontrolü
if [[ "$CANONICAL_PATH" != *.deb ]]; then
    echo "[HATA] Geçersiz dosya uzantısı. Yalnızca .deb dosyaları kabul edilir." >&2
    exit 4
fi

# 5. Paket adı doğrulaması — yalnızca bilinen Ayaz/Ankora paketleri
PKG_NAME=$(dpkg-deb --showformat='${Package}' -W "$CANONICAL_PATH" 2>/dev/null || echo "unknown")
case "$PKG_NAME" in
    ayaz-de|ankora-de|ankora-ayaz-de)
        ;;
    *)
        echo "[HATA] Güvenlik: Bilinmeyen paket adı '$PKG_NAME'. Yalnızca ayaz-de veya ankora-de paketleri kurulabilir." >&2
        exit 5
        ;;
esac

# 6. Dosya sahipliği kontrolü — root tarafından oluşturulmuş olmalı
FILE_OWNER=$(stat -c '%u' "$CANONICAL_PATH" 2>/dev/null || echo "-1")
if [[ "$FILE_OWNER" != "0" ]]; then
    echo "[HATA] Güvenlik: Paket dosyası root sahipliğinde değil (uid=$FILE_OWNER). TOCTOU koruması." >&2
    exit 6
fi

echo "[AYAZ GÜNCELLEYİCİ] Güvenlik doğrulamaları geçildi. Kurulum: $CANONICAL_PATH (paket: $PKG_NAME)"

# ==============================================================================
# ATOMİK KURULUM DURUM MAKİNESİ
#   installing -> committed  (kurulum doğrulandı)
#   installing -> failed     (hata, önceki sürüme geri alındı)
#   installing -> broken     (hata, geri alma mümkün değil — elle müdahale)
# Durum dosyası: $STAGING_DIR/update-state
# ==============================================================================
STATE_FILE="$STAGING_DIR/update-state"
PREV_VERSION=$(dpkg-query -W -f='${Version}' "$PKG_NAME" 2>/dev/null || echo "")
PKG_VERSION=$(dpkg-deb --showformat='${Version}' -W "$CANONICAL_PATH" 2>/dev/null || echo "unknown")
EXPECTED_VERSION="${2:-}"

# Sürüm karşılaştırması paket eki (+deb1, -1) ve epoch farkına duyarlı olsun;
# release etiketi "v" ile yazılmış olabilir.
norm_ver() {
    local v="$1"
    v="${v#*:}"
    v="${v#v}"
    v="${v%%-*}"
    v="${v%%+*}"
    printf '%s' "$v"
}

write_state() {
    {
        echo "state=$1"
        echo "note=$2"
        echo "package=$PKG_NAME"
        echo "previous=${PREV_VERSION:-none}"
        echo "new=${PKG_VERSION:-unknown}"
        echo "expected=${EXPECTED_VERSION:-any}"
        echo "time=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    } > "$STATE_FILE"
    chmod 600 "$STATE_FILE"
}

# Geri alma deb'i: kurulu sürümün deb'i depodan indirilir (varsa saklanır).
ROLLBACK_DEB="$STAGING_DIR/rollback-${PKG_NAME}.deb"
if [[ -n "$PREV_VERSION" && "$(norm_ver "$PREV_VERSION")" != "$(norm_ver "$PKG_VERSION")" ]]; then
    echo "[AYAZ GÜNCELLEYİCİ] Geri alma kopyası hazırlanıyor ($PKG_NAME=$PREV_VERSION)..."
    TMP_DL=$(mktemp -d "$STAGING_DIR/.dl-XXXXXX")
    if (cd "$TMP_DL" && apt-get download -qq "$PKG_NAME=$PREV_VERSION" >/dev/null 2>&1); then
        DL_FILE=$(find "$TMP_DL" -maxdepth 1 -name '*.deb' -print -quit)
        if [[ -n "$DL_FILE" && -f "$DL_FILE" ]]; then
            mv -f "$DL_FILE" "$ROLLBACK_DEB"
            chown root:root "$ROLLBACK_DEB"
            chmod 0600 "$ROLLBACK_DEB"
        fi
    fi
    rm -rf "$TMP_DL"
fi

write_state "installing" "kurulum başlıyor"

rollback_now() {
    # Yalnızca tam olarak kurulu sürümün kopyası geri alınır.
    if [[ -f "$ROLLBACK_DEB" ]]; then
        RB_VER=$(dpkg-deb -f "$ROLLBACK_DEB" Version 2>/dev/null || echo "")
        if [[ "$(norm_ver "$RB_VER")" == "$(norm_ver "$PREV_VERSION")" ]]; then
            echo "[AYAZ GÜNCELLEYİCİ] Geri alınıyor: $ROLLBACK_DEB ($RB_VER)"
            dpkg -i "$ROLLBACK_DEB" >/dev/null 2>&1 || true
            apt-get install -f -y -qq >/dev/null 2>&1 || true
            return 0
        fi
        echo "[UYARI] Geri alma deb'i beklenen sürüme uymuyor ($RB_VER != $PREV_VERSION); kullanılmıyor." >&2
    fi
    return 1
}

# 7. Dpkg ile Ayaz DE paketini kur (set -e altında hata yakalanır)
DPKG_RC=0
dpkg -i "$CANONICAL_PATH" || DPKG_RC=$?
if [[ $DPKG_RC -ne 0 ]]; then
    echo "[UYARI] dpkg hata verdi (kod $DPKG_RC); eksik bağımlılıklar deneniyor (apt-get install -f)..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq || true
    apt-get install -f -y -qq || true
fi

# 8. Kurulum sonucunu doğrula: paket kurulu olmalı, veriliyse beklenen
#    sürümle (paket eki farkları hariç) eşleşmeli.
INSTALLED_STATE=$(dpkg-query -W -f='${Status}' "$PKG_NAME" 2>/dev/null || echo "yok")
INSTALLED_VERSION=$(dpkg-query -W -f='${Version}' "$PKG_NAME" 2>/dev/null || echo "")
VERSION_OK=1
if [[ -n "$EXPECTED_VERSION" ]] && \
   [[ "$(norm_ver "$INSTALLED_VERSION")" != "$(norm_ver "$EXPECTED_VERSION")" ]]; then
    VERSION_OK=0
fi

if [[ "$INSTALLED_STATE" != "install ok installed" || $VERSION_OK -eq 0 ]]; then
    write_state "broken" "doğrulama başarısız: durum='$INSTALLED_STATE' sürüm='${INSTALLED_VERSION:-yok}'"
    if rollback_now; then
        write_state "failed" "geri alındı: önceki=${PREV_VERSION:-none} bozuk=${INSTALLED_VERSION:-yok}"
        echo "[HATA] Güncelleme doğrulanamadı; önceki sürüme geri alındı (durum: $STATE_FILE)." >&2
        rm -f "$CANONICAL_PATH"
        exit 7
    fi
    write_state "broken" "geri alma mümkün değil; elle müdahale gerekli"
    echo "[HATA] Güncelleme doğrulanamadı ve geri alınamadı (durum: $STATE_FILE)." >&2
    exit 8
fi

# 9. Senkronize et, durumu onayla
sync
write_state "committed" "kurulu sürüm: $INSTALLED_VERSION"

# 10. Güncellemenin kendi deb'i temizlenir; geri alma deb'i bir sonraki
#     başarılı güncelleme'ye kadar saklanır.
rm -f "$CANONICAL_PATH"

echo "[AYAZ GÜNCELLEYİCİ] Ayaz Masaüstü Ortamı $INSTALLED_VERSION sürümüne güncellendi (durum: committed)."
exit 0

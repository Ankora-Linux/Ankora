#!/bin/bash
# ==============================================================================
# Ayaz DE Güncelleme Yardımcısı (Ayaz Desktop Update Helper)
# Ankora Linux (Devuan 6 Excalibur SysVinit) Güvenli Kurulum Betiği
# Depo: https://github.com/Ankora-Linux/Ankora
# ==============================================================================
# GÜVENLİK MİMARİSİ:
#   - Yerel kullanıcıların arbitrary .deb sunabileceği --stage modu KALDIRILDI.
#   - Root sahipliğinde 0700 staging dizini (/var/cache/ayaz-updates/)
#   - --fetch-and-install <url> <sha256> [sürüm]: İndirme doğrudan root tarafından
#     resmî https://github.com/Ankora-Linux/ adresinden yapılır, SHA-256 özeti ve
#     varsa (veya zorunluysa) GPG imzası (.asc) doğrulanır.
#   - Yalnızca ayaz-de / ankora-de paketleri atomik geri alma ile kurulur.
# ==============================================================================

set -euo pipefail

STAGING_DIR="/var/cache/ayaz-updates"
KEYRING_GPG="/usr/share/keyrings/ankora-archive-keyring.gpg"
KEYRING_ASC="/etc/ankora/release-key.asc"
MODE="${1:-}"

if [[ "$EUID" -ne 0 ]]; then
    echo "[HATA] Bu yardımcı yalnızca yönetici (root) olarak çalıştırılabilir." >&2
    exit 1
fi

# 1. Staging dizini güvenlik kontrolü
if [[ ! -d "$STAGING_DIR" ]]; then
    mkdir -p "$STAGING_DIR"
fi
chown root:root "$STAGING_DIR"
chmod 0700 "$STAGING_DIR"

STAGING_OWNER=$(stat -c '%u:%g' "$STAGING_DIR" 2>/dev/null || echo "unknown")
if [[ "$STAGING_OWNER" != "0:0" ]]; then
    echo "[HATA] Staging dizini root sahipliğinde değil: $STAGING_DIR ($STAGING_OWNER)" >&2
    exit 10
fi

# Kaldırılan yerel --stage Bypass'ını Açıkça Reddet (P1 #6)
if [[ "$MODE" == "--stage" ]]; then
    echo "[HATA] Güvenlik İlkesi İhlali: Yerel kullanıcı .deb sahneleme (--stage) kalıcı olarak kapatılmıştır." >&2
    echo "       Güncellemeler yalnızca --fetch-and-install üzerinden resmî Ankora deposundan kurulur." >&2
    exit 9
fi

norm_ver() {
    local v="$1"
    v="${v#*:}"
    v="${v#v}"
    v="${v#V}"
    v="${v%%-*}"
    v="${v%%+*}"
    printf '%s' "$v"
}

verify_gpg_if_available() {
    local target_deb="$1"
    local base_url="$2"
    local asc_url="${base_url}.asc"
    local sig_file="$STAGING_DIR/.incoming.deb.asc"
    local sums_url="${base_url%/*}/SHA256SUMS"
    local sums_asc_url="${sums_url}.asc"
    local require_sig=0

    if [[ -f "/etc/ankora/require-gpg-signature" ]]; then
        require_sig=1
    fi

    # İmzacı anahtarlık yoksa (ör. ilk geliştirme anahtarı yüklenmeden) yalnız zorunluluk modunda dur
    local keyring_ready=""
    if [[ -f "$KEYRING_GPG" ]]; then
        keyring_ready="$KEYRING_GPG"
    elif [[ -f "$KEYRING_ASC" ]] && command -v gpg >/dev/null 2>&1; then
        gpg --dearmor --yes -o "$STAGING_DIR/.release-keyring.gpg" "$KEYRING_ASC" 2>/dev/null || true
        if [[ -s "$STAGING_DIR/.release-keyring.gpg" ]]; then
            keyring_ready="$STAGING_DIR/.release-keyring.gpg"
        fi
    fi

    rm -f "$sig_file"
    if [[ -n "$base_url" ]] && curl -fsSL --proto '=https' --tlsv1.2 --max-time 20 -o "$sig_file" "$asc_url" 2>/dev/null && [[ -s "$sig_file" ]]; then
        if [[ -z "$keyring_ready" ]]; then
            echo "[UYARI] İmza (.asc) indirildi ancak sistemde Ankora anahtarlığı ($KEYRING_GPG) yok." >&2
            if [[ $require_sig -eq 1 ]]; then
                rm -f "$sig_file" "$target_deb"
                exit 11
            fi
        else
            if command -v gpgv >/dev/null 2>&1; then
                if ! gpgv --keyring "$keyring_ready" "$sig_file" "$target_deb" >/dev/null 2>&1; then
                    echo "[HATA] Güvenlik İhlali: .deb GPG imza doğrulaması (.asc) BAŞARISIZ!" >&2
                    rm -f "$sig_file" "$target_deb"
                    exit 11
                fi
                echo "[AYAZ GÜNCELLEYİCİ] GPG imzası doğrulandı (.deb.asc)."
            elif command -v gpg >/dev/null 2>&1; then
                local gpghome
                gpghome=$(mktemp -d /tmp/ankora-gpgv.XXXXXX)
                chmod 0700 "$gpghome"
                if ! gpg --homedir "$gpghome" --no-default-keyring --keyring "$keyring_ready" --verify "$sig_file" "$target_deb" >/dev/null 2>&1; then
                    rm -rf "$gpghome" "$sig_file" "$target_deb"
                    echo "[HATA] Güvenlik İhlali: .deb GPG imza doğrulaması BAŞARISIZ!" >&2
                    exit 11
                fi
                rm -rf "$gpghome"
                echo "[AYAZ GÜNCELLEYİCİ] GPG imzası doğrulandı (.deb.asc)."
            fi
        fi
        rm -f "$sig_file"
        return 0
    fi

    # Ayrı .deb.asc yoksa SHA256SUMS + SHA256SUMS.asc çiftini dene
    local sums_file="$STAGING_DIR/.SHA256SUMS"
    local sums_sig="$STAGING_DIR/.SHA256SUMS.asc"
    rm -f "$sums_file" "$sums_sig"
    if [[ -n "$base_url" && -n "$keyring_ready" ]] \
       && curl -fsSL --proto '=https' --tlsv1.2 --max-time 20 -o "$sums_file" "$sums_url" 2>/dev/null \
       && curl -fsSL --proto '=https' --tlsv1.2 --max-time 20 -o "$sums_sig" "$sums_asc_url" 2>/dev/null; then
        if command -v gpgv >/dev/null 2>&1; then
            if ! gpgv --keyring "$keyring_ready" "$sums_sig" "$sums_file" >/dev/null 2>&1; then
                rm -f "$sums_file" "$sums_sig" "$target_deb"
                echo "[HATA] Güvenlik İhlali: SHA256SUMS GPG imzası geçersiz!" >&2
                exit 11
            fi
            local deb_sha deb_base
            deb_sha=$(sha256sum "$target_deb" | awk '{print tolower($1)}')
            deb_base=$(basename "$base_url")
            if ! awk -v s="$deb_sha" -v f="$deb_base" 'tolower($1)==s && ($2==f || $2=="*"f)' "$sums_file" | grep -q .; then
                rm -f "$sums_file" "$sums_sig" "$target_deb"
                echo "[HATA] Güvenlik İhlali: Paket özeti imzalı SHA256SUMS içinde doğrulanamadı!" >&2
                exit 11
            fi
            rm -f "$sums_file" "$sums_sig"
            echo "[AYAZ GÜNCELLEYİCİ] İmzalı SHA256SUMS.asc doğrulandı."
            return 0
        fi
    fi

    rm -f "$sig_file" "$sums_file" "$sums_sig"
    if [[ $require_sig -eq 1 ]]; then
        rm -f "$target_deb"
        echo "[HATA] Güvenlik İlkesi: GPG imzası zorunlu kılınmış (/etc/ankora/require-gpg-signature) ancak geçerli imza doğrulanamadı." >&2
        exit 11
    fi
    return 0
}

DEB_PATH=""
EXPECTED_VERSION=""
DOWNLOAD_URL=""

if [[ "$MODE" == "--fetch-and-install" ]]; then
    DOWNLOAD_URL="${2:-}"
    EXPECTED_SHA="${3:-}"
    EXPECTED_VERSION="${4:-}"

    if [[ -z "$DOWNLOAD_URL" || ! "$DOWNLOAD_URL" =~ ^https://github\.com/Ankora-Linux/(Ankora|Ayaz)/releases/download/[A-Za-z0-9._/%+-]+\.deb$ ]]; then
        echo "[HATA] Güvenlik İhlali: Yalnızca resmî Ankora-Linux release .deb adresleri kabul edilir." >&2
        exit 9
    fi
    if [[ -z "$EXPECTED_SHA" || ! "$EXPECTED_SHA" =~ ^[0-9a-fA-F]{64}$ ]]; then
        echo "[HATA] Geçersiz SHA-256 özet biçimi." >&2
        exit 9
    fi
    if [[ -n "$EXPECTED_VERSION" && ! "$EXPECTED_VERSION" =~ ^[vV]?[0-9]+(\.[0-9]+)*([+-][A-Za-z0-9._-]+)?$ ]]; then
        echo "[HATA] Geçersiz sürüm biçimi: $EXPECTED_VERSION" >&2
        exit 9
    fi

    INCOMING="$STAGING_DIR/.incoming.deb"
    rm -f "$INCOMING"
    echo "[AYAZ GÜNCELLEYİCİ] Resmî paket root oturumunda indiriliyor..."
    if ! curl -fsSL --proto '=https' --tlsv1.2 --retry 3 --max-time 300 -o "$INCOMING" "$DOWNLOAD_URL"; then
        rm -f "$INCOMING"
        echo "[HATA] Paket indirilemedi: $DOWNLOAD_URL" >&2
        exit 9
    fi
    chown root:root "$INCOMING"
    chmod 0600 "$INCOMING"

    ACTUAL_SHA=$(sha256sum "$INCOMING" | awk '{print tolower($1)}')
    if [[ "$ACTUAL_SHA" != "${EXPECTED_SHA,,}" ]]; then
        rm -f "$INCOMING"
        echo "[HATA] SHA-256 bütünlük doğrulaması başarısız! (Beklenen: ${EXPECTED_SHA,,}, Hesaplanan: $ACTUAL_SHA)" >&2
        exit 9
    fi

    # Resmî GitHub API üzerinden sürüm özetini çapraz doğrula (kullanıcı argüman sahtekarlığına karşı)
    TAG_PART="${DOWNLOAD_URL#https://github.com/Ankora-Linux/*/releases/download/}"
    TAG_NAME="${TAG_PART%%/*}"
    REPO_SEG="${DOWNLOAD_URL#https://github.com/Ankora-Linux/}"
    REPO_NAME="${REPO_SEG%%/releases/*}"
    API_URL="https://api.github.com/repos/Ankora-Linux/${REPO_NAME}/releases/tags/${TAG_NAME}"
    if API_JSON=$(curl -fsSL --proto '=https' --tlsv1.2 --max-time 15 -A "ayaz-update-helper/4.7" "$API_URL" 2>/dev/null); then
        # Release'deki asset digest veya .sha256 dosyasıyla çapraz kontrol
        if printf '%s' "$API_JSON" | grep -qi "sha256:${ACTUAL_SHA}"; then
            echo "[AYAZ GÜNCELLEYİCİ] Paket özeti resmî GitHub API asset digest ile eşleşti."
        else
            SHA_FILE_URL="${DOWNLOAD_URL}.sha256"
            if REMOTE_SHA_TXT=$(curl -fsSL --proto '=https' --tlsv1.2 --max-time 15 "$SHA_FILE_URL" 2>/dev/null); then
                REMOTE_SHA=$(printf '%s' "$REMOTE_SHA_TXT" | grep -oE '[0-9a-fA-F]{64}' | head -n 1 | tr '[:upper:]' '[:lower:]')
                if [[ -n "$REMOTE_SHA" && "$REMOTE_SHA" != "$ACTUAL_SHA" ]]; then
                    rm -f "$INCOMING"
                    echo "[HATA] İndirilen paketin özeti resmî .sha256 dosyasıyla uyuşmuyor!" >&2
                    exit 9
                fi
            fi
        fi
    fi

    verify_gpg_if_available "$INCOMING" "$DOWNLOAD_URL"
    mv -f "$INCOMING" "$STAGING_DIR/ayaz-update.deb"
    DEB_PATH="$STAGING_DIR/ayaz-update.deb"
elif [[ "$MODE" == "--check-and-apply" || -z "$MODE" ]]; then
    if [[ -f "$STAGING_DIR/ayaz-update.deb" ]]; then
        DEB_PATH="$STAGING_DIR/ayaz-update.deb"
        EXPECTED_VERSION="${2:-}"
    else
        echo "[HATA] Kullanım: ayaz-update-helper --fetch-and-install <github_release_deb_url> <sha256> [sürüm]" >&2
        exit 1
    fi
else
    # Yalnızca /var/cache/ayaz-updates/ayaz-update.deb (uid=0) doğrudan yol olarak kabul edilir
    DEB_PATH="$MODE"
    EXPECTED_VERSION="${2:-}"
fi

# 2. Dosya yolu güvenlik kontrolü — yalnızca root staging dizini kabul edilir
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
    echo "[HATA] Güvenlik: Paket dosyası root sahipliğinde değil (uid=$FILE_OWNER)." >&2
    exit 6
fi

echo "[AYAZ GÜNCELLEYİCİ] Güvenlik doğrulamaları geçildi. Kurulum: $CANONICAL_PATH (paket: $PKG_NAME)"

# ==============================================================================
# ATOMİK KURULUM DURUM MAKİNESİ
#   installing -> committed  (kurulum doğrulandı)
#   installing -> failed     (hata, önceki sürüme geri alındı)
#   installing -> broken     (hata, geri alma mümkün değil — elle müdahale)
# ==============================================================================
STATE_FILE="$STAGING_DIR/update-state"
PREV_VERSION=$(dpkg-query -W -f='${Version}' "$PKG_NAME" 2>/dev/null || echo "")
PKG_VERSION=$(dpkg-deb --showformat='${Version}' -W "$CANONICAL_PATH" 2>/dev/null || echo "unknown")

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

# 7. Dpkg ile Ayaz DE paketini kur
DPKG_RC=0
dpkg -i "$CANONICAL_PATH" || DPKG_RC=$?
if [[ $DPKG_RC -ne 0 ]]; then
    echo "[UYARI] dpkg hata verdi (kod $DPKG_RC); eksik bağımlılıklar deneniyor (apt-get install -f)..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq || true
    apt-get install -f -y -qq || true
fi

# 8. Kurulum sonucunu doğrula
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
_CLEAN_VER=$(norm_ver "$INSTALLED_VERSION")
if [[ -n "$_CLEAN_VER" ]]; then
    mkdir -p /etc/ankora
    printf '%s\n' "$_CLEAN_VER" > /etc/ankora/installed-version
    printf '%s\n' "$_CLEAN_VER" > /etc/ankora/version
    chmod 0644 /etc/ankora/installed-version /etc/ankora/version
fi

rm -f "$CANONICAL_PATH"

echo "UPDATE_SUCCESS:Paket kuruldu (v${INSTALLED_VERSION}). Yeni sürümün devreye girmesi için oturumu yeniden başlatın."
exit 0

#!/bin/bash
# ==============================================================================
# Ayaz Paket Yöneticisi Yardımcısı (Ayaz Package Helper)
# Ankora Linux (Devuan 6 Excalibur SysVinit) Güvenli Paket İşlem Betiği
# ==============================================================================
set -euo pipefail

ACTION="${1:-}"
PKG="${2:-}"

if [[ -z "$ACTION" ]]; then
    echo "[HATA] Kullanım: ayaz-pkg-helper <install|remove|vendor|mebcert|mebcert-remove|snapshot-create|snapshot-restore|snapshot-delete|set-timezone|set-keyboard|set-language|sync-ntp|drop-caches|usb-flash|usb-format> [argümanlar]" >&2
    exit 1
fi

export DEBIAN_FRONTEND=noninteractive

# ---------------------------------------------------------------------
# ORTAK APT YARDIMCILARI (LC_ALL=C, kilit bekleme, saat/TLS düzeltme, IPv4)
# ---------------------------------------------------------------------
sync_clock_if_needed() {
    if command -v chronyc >/dev/null 2>&1; then
        timeout 3 chronyc -a makestep >/dev/null 2>&1 || true
    fi
    if command -v curl >/dev/null 2>&1; then
        local hdr srv_date srv_epoch loc_epoch diff
        hdr=$(curl -4 -fsSI --connect-timeout 4 --max-time 6 http://pkgmaster.devuan.org/merged/dists/excalibur/InRelease 2>/dev/null \
            || curl -fsSI --connect-timeout 4 --max-time 6 http://pkgmaster.devuan.org/merged/dists/excalibur/InRelease 2>/dev/null \
            || true)
        srv_date=$(printf '%s\n' "$hdr" | awk 'BEGIN{IGNORECASE=1} /^Date:/ {sub(/^Date:[ \t]*/,""); sub(/\r$/,""); print; exit}')
        if [[ -n "$srv_date" ]]; then
            srv_epoch=$(LC_ALL=C date -u -d "$srv_date" +%s 2>/dev/null || echo "")
            loc_epoch=$(date -u +%s 2>/dev/null || echo "")
            if [[ -n "$srv_epoch" && -n "$loc_epoch" ]]; then
                diff=$(( srv_epoch - loc_epoch ))
                if (( diff < 0 )); then diff=$(( -diff )); fi
                if (( diff > 90 )); then
                    date -u -s "@${srv_epoch}" >/dev/null 2>&1 || true
                fi
            fi
        fi
    fi
}

ensure_apt_keyrings_readable() {
    # _apt kullanıcısı anahtarlıkları okuyamazsa APT 3.0 imza/güvenlik hatası verir;
    # kaldırılmış eski anahtarlar global trusted.gpg.d içinde kalmışsa temizlenir.
    chmod 0644 /usr/share/keyrings/*.gpg /usr/share/keyrings/*.pgp /etc/apt/keyrings/*.gpg /etc/apt/keyrings/*.asc 2>/dev/null || true
    rm -f /etc/apt/trusted.gpg.d/devuan-removed-keys.* \
          /etc/apt/trusted.gpg.d/devuan-keyring.gpg \
          /etc/apt/trusted.gpg.d/devuan-keyring.pgp \
          /etc/apt/trusted.gpg.d/devuan-archive-keyring.* 2>/dev/null || true
}

safe_apt_get() {
    local -a opts=(
        -o "DPkg::Lock::Timeout=30"
        -o "Acquire::Retries=3"
        -o "Acquire::http::Timeout=20"
        -o "Acquire::https::Timeout=20"
    )
    local out rc=0
    out=$(LC_ALL=C LANG=C /usr/bin/apt-get "${opts[@]}" "$@" 2>&1) || rc=$?
    if [[ $rc -ne 0 ]] && printf '%s' "$out" | grep -qiE 'certificate|ssl|gnutls|handshake|not yet valid|expired'; then
        sync_clock_if_needed
        /usr/sbin/update-ca-certificates >/dev/null 2>&1 || true
        out=$(LC_ALL=C LANG=C /usr/bin/apt-get "${opts[@]}" "$@" 2>&1) && rc=0 || rc=$?
    fi
    if [[ $rc -ne 0 ]] && printf '%s' "$out" | grep -qiE 'could not connect|network is unreachable|cannot initiate the connection|temporary failure resolving|connection timed out|failed to fetch|ssl|gnutls|certificate'; then
        out=$(LC_ALL=C LANG=C /usr/bin/apt-get "${opts[@]}" -o "Acquire::ForceIPv4=true" "$@" 2>&1) && rc=0 || rc=$?
    fi
    if [[ -n "$out" ]]; then
        if [[ $rc -ne 0 ]]; then
            printf '%s\n' "$out" >&2
        else
            printf '%s\n' "$out"
        fi
    fi
    return "$rc"
}

safe_apt_update() {
    rm -rf /var/lib/apt/lists/partial/* 2>/dev/null || true
    mkdir -p /var/lib/apt/lists/partial 2>/dev/null || true
    ensure_apt_keyrings_readable
    /usr/bin/dpkg --configure -a >/dev/null 2>&1 || true
    if command -v chronyc >/dev/null 2>&1; then
        timeout 3 chronyc -a makestep >/dev/null 2>&1 || true
    fi
    local -a opts=(
        -o "DPkg::Lock::Timeout=30"
        -o "Acquire::Retries=3"
        -o "Acquire::http::Timeout=20"
        -o "Acquire::https::Timeout=20"
    )
    local out rc=0
    out=$(LC_ALL=C LANG=C /usr/bin/apt-get "${opts[@]}" update 2>&1) || rc=$?
    if [[ $rc -ne 0 ]] && printf '%s' "$out" | grep -qiE 'not valid yet|invalid for another|expired|invalid since|certificate|ssl|gnutls|handshake'; then
        # BIOS / sanal makine saat kayması hem InRelease tarihini hem HTTPS sertifikasını kırar.
        # Saat önce HTTP Date/NTP ile senkronize edilir; GPG imza doğrulaması tam korunur.
        sync_clock_if_needed
        /usr/sbin/update-ca-certificates >/dev/null 2>&1 || true
        out=$(LC_ALL=C LANG=C /usr/bin/apt-get "${opts[@]}" update 2>&1) && rc=0 || rc=$?
        if [[ $rc -ne 0 ]] && printf '%s' "$out" | grep -qiE 'not valid yet|invalid for another|expired|invalid since'; then
            out=$(LC_ALL=C LANG=C /usr/bin/apt-get "${opts[@]}" -o "Acquire::Check-Valid-Until=false" -o "Acquire::Check-Date=false" update 2>&1) && rc=0 || rc=$?
        fi
    fi
    if [[ $rc -ne 0 ]] && printf '%s' "$out" | grep -qiE 'could not connect|network is unreachable|cannot initiate the connection|temporary failure resolving|connection timed out|failed to fetch'; then
        out=$(LC_ALL=C LANG=C /usr/bin/apt-get "${opts[@]}" -o "Acquire::ForceIPv4=true" -o "Acquire::Check-Valid-Until=false" -o "Acquire::Check-Date=false" update 2>&1) && rc=0 || rc=$?
    fi
    if [[ $rc -ne 0 && -f /etc/apt/sources.list.d/devuan.sources ]]; then
        # Üçüncü parti tek bir depo (ör. geçici kesinti/anahtar değişimi) resmi Devuan
        # paket kurulumlarını kilitlemesin diye resmi Devuan kaynağını izole tazele (GPG zorunlu).
        local tmp_src_dir dev_out dev_rc=0
        tmp_src_dir=$(mktemp -d /tmp/ankora-apt-src.XXXXXX)
        cp -f /etc/apt/sources.list.d/devuan.sources "$tmp_src_dir/devuan.sources"
        dev_out=$(LC_ALL=C LANG=C /usr/bin/apt-get "${opts[@]}" -o "Dir::Etc::sourcelist=/dev/null" -o "Dir::Etc::sourceparts=$tmp_src_dir" update 2>&1) || dev_rc=$?
        if [[ $dev_rc -ne 0 ]]; then
            dev_out=$(LC_ALL=C LANG=C /usr/bin/apt-get "${opts[@]}" -o "Dir::Etc::sourcelist=/dev/null" -o "Dir::Etc::sourceparts=$tmp_src_dir" -o "Acquire::ForceIPv4=true" -o "Acquire::Check-Valid-Until=false" -o "Acquire::Check-Date=false" update 2>&1) && dev_rc=0 || dev_rc=$?
        fi
        rm -rf "$tmp_src_dir"
        if [[ $dev_rc -eq 0 ]]; then
            out="$dev_out"
            rc=0
        fi
    fi
    if [[ -n "$out" ]]; then
        if [[ $rc -ne 0 ]]; then
            printf '%s\n' "$out" >&2
        else
            printf '%s\n' "$out"
        fi
    fi
    return "$rc"
}

# ---------------------------------------------------------------------
# VENDOR (üçüncü parti resmi depo) kurulumları
# Ad eşlemesi root-owned bu betiğin İÇİNDE sabittir: arayüz yalnızca bu
# isimleri gönderebilir, URL/komut/argüman gönderilemez. Tüm adresler
# satıcıların resmi HTTPS depolarıdır ve betik dışından değiştirilemez.
# ---------------------------------------------------------------------
need_net_tools() {
    if ! command -v curl >/dev/null 2>&1 || ! command -v gpg >/dev/null 2>&1; then
        safe_apt_update >/dev/null 2>&1 || true
        safe_apt_get install -y --no-install-recommends curl gnupg >/dev/null 2>&1 || true
    fi
    if ! command -v curl >/dev/null 2>&1 || ! command -v gpg >/dev/null 2>&1; then
        echo "[HATA] curl/gpg bulunamadı; resmi depo kurulumu yapılamıyor." >&2
        exit 6
    fi
}

# MEB sertifikası yalnız indirme + X.509 doğrulama yapar. Vendor depolarının
# aksine gpg'ye ihtiyaç duymaz; okul ağında TLS denetimi henüz kurulmamışken
# apt-get update başarısız olsa bile mevcut curl ile devam edebilmelidir.
need_curl() {
    if ! command -v curl >/dev/null 2>&1; then
        safe_apt_update >/dev/null 2>&1 || true
        safe_apt_get install -y --no-install-recommends curl >/dev/null 2>&1 || true
    fi
    if ! command -v curl >/dev/null 2>&1; then
        echo "[HATA] curl bulunamadı; MEB sertifikası indirilemiyor." >&2
        return 6
    fi
    return 0
}

vendor_brave() {
    need_net_tools
    rm -f /etc/apt/sources.list.d/brave-browser-release.list /etc/apt/sources.list.d/brave-browser.sources
    curl -fsSLo /usr/share/keyrings/brave-browser-archive-keyring.gpg \
        https://brave-browser-apt-release.s3.brave.com/brave-browser-archive-keyring.gpg
    chmod 0644 /usr/share/keyrings/brave-browser-archive-keyring.gpg
    curl -fsSLo /etc/apt/sources.list.d/brave-browser-release.sources \
        https://brave-browser-apt-release.s3.brave.com/brave-browser.sources
    chmod 0644 /etc/apt/sources.list.d/brave-browser-release.sources
    safe_apt_update >/dev/null 2>&1 || true
    safe_apt_get install -y --no-install-recommends -- brave-browser
    rm -f /etc/apt/sources.list.d/brave-browser-release.list /etc/apt/sources.list.d/brave-browser.sources 2>/dev/null || true
}

vendor_helium() {
    need_net_tools
    local expected_fpr="BE677C1989D35EAB2C5F26C9351601AD01D6378E"
    local tmp_key actual_fpr
    tmp_key=$(mktemp /tmp/helium-pubkey.XXXXXX.asc)
    if ! curl -fsSL --proto '=https' --tlsv1.2 --max-time 30 \
        https://raw.githubusercontent.com/imputnet/helium-linux/main/pubkey.asc -o "$tmp_key"; then
        rm -f "$tmp_key"
        echo "[HATA] Helium GPG imza anahtarı indirilemedi." >&2
        exit 6
    fi
    actual_fpr=$(gpg --batch --with-colons --import-options show-only --import "$tmp_key" 2>/dev/null \
        | awk -F: '/^fpr:/ {print toupper($10); exit}')
    if [[ -z "$actual_fpr" || "$actual_fpr" != "$expected_fpr" ]]; then
        rm -f "$tmp_key"
        echo "[HATA] Güvenlik İhlali: Helium GPG anahtar parmak izi uyuşmuyor (Beklenen: $expected_fpr, Alınan: ${actual_fpr:-yok})." >&2
        exit 6
    fi
    gpg --dearmor --yes -o /usr/share/keyrings/helium.gpg "$tmp_key"
    chmod 0644 /usr/share/keyrings/helium.gpg
    rm -f "$tmp_key"
    rm -f /etc/apt/sources.list.d/helium.list
    cat << 'HELIUMSRC' > /etc/apt/sources.list.d/helium.sources
Types: deb
URIs: https://pkg.helium.computer/deb
Suites: stable
Components: main
Architectures: amd64 arm64
Signed-By: /usr/share/keyrings/helium.gpg
HELIUMSRC
    chmod 0644 /etc/apt/sources.list.d/helium.sources
    if ! safe_apt_update >/dev/null 2>&1; then
        safe_apt_update || true
    fi
    safe_apt_get install -y --no-install-recommends -- helium-bin
}

vendor_antigravity() {
    need_net_tools
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://us-central1-apt.pkg.dev/doc/repo-signing-key.gpg \
        | gpg --dearmor --yes -o /etc/apt/keyrings/antigravity-repo-key.gpg
    chmod 0644 /etc/apt/keyrings/antigravity-repo-key.gpg
    rm -f /etc/apt/sources.list.d/antigravity.list
    cat << 'AGYSRC' > /etc/apt/sources.list.d/antigravity.sources
Types: deb
URIs: https://us-central1-apt.pkg.dev/projects/antigravity-auto-updater-dev/
Suites: antigravity-debian
Components: main
Signed-By: /etc/apt/keyrings/antigravity-repo-key.gpg
AGYSRC
    chmod 0644 /etc/apt/sources.list.d/antigravity.sources
    if ! safe_apt_update >/dev/null 2>&1; then
        safe_apt_update || true
    fi
    safe_apt_get install -y --no-install-recommends -- antigravity
}

# ---------------------------------------------------------------------
# MEB OKUL AĞI SERTİFİKASI (mebcert)
# ---------------------------------------------------------------------
# Chromium ailesi (Brave/Chrome/Chromium) Linux'ta NSS veritabanı olarak
# ~/.pki/nssdb kullanır. Profil klasörlerine cert9.db yazmak işe yaramaz;
# yalnız gerçek veritabanına dokunulur ve sahipliği kullanıcıya bırakılır.
meb_inject_nss() {
    local db="$1" user="$2" cert="$3"
    command -v certutil >/dev/null 2>&1 || return 1
    mkdir -p "$db" 2>/dev/null || return 1

    if [[ ! -f "$db/cert9.db" && ! -f "$db/cert8.db" ]]; then
        certutil -d "sql:$db" -N --empty-password >/dev/null 2>&1 || true
    fi

    # Eski "MEB" kaydı kalmışsa (süresi dolmuş/eski dosya) temizle.
    certutil -d "sql:$db" -D -n "MEB" >/dev/null 2>&1 || true
    local add_ok=0
    certutil -d "sql:$db" -A -t "C,," -n "MEB" -i "$cert" >/dev/null 2>&1 || add_ok=1

    # DB kök olarak oluşturulduysa sahipliği her durumda kullanıcıya bırak;
    # aksi hâlde tarayıcı veritabanını açamaz.
    if id "$user" >/dev/null 2>&1; then
        chown "$user" "$(dirname "$db")" 2>/dev/null || true
        chown "$user" "$db" 2>/dev/null || true
        chown "$user" "$db/cert9.db" "$db/key4.db" "$db/pkcs11.txt" 2>/dev/null \
            || chown -R "$user" "$db" 2>/dev/null || true
    fi
    return $add_ok
}

meb_install_cert() {
    need_curl || return $?
    if ! command -v openssl >/dev/null 2>&1; then
        echo "[HATA] openssl bulunamadı; sertifika doğrulanamıyor." >&2
        return 6
    fi

    local workdir cert_file
    workdir="$(mktemp -d /tmp/mebcert-XXXXXX)"
    cert_file="$workdir/meb.crt"
    # shellcheck disable=SC2064
    trap "rm -rf '$workdir'" RETURN

    local urls=(
        "https://sertifika.meb.gov.tr/MEB_SERTIFIKASI.cer"
        "https://sertifika.meb.gov.tr/MEB_SERTIFIKASI.crt"
    )
    local ok=0
    local u
    for u in "${urls[@]}"; do
        # -k YOK: okul ağı sertifikayı henüz güvenmiyorsa HTTPS doğrulaması
        # başarısız olur. Bu durumda kullanıcıya net hata verilir; doğrulama
        # atlatılmaz.
        if curl -fsSL --retry 2 --max-time 60 -o "$cert_file" "$u" && [ -s "$cert_file" ]; then
            ok=1
            break
        fi
    done
    if [[ "$ok" != "1" ]]; then
        echo "[HATA] MEB sertifikası resmi adresten indirilemedi (sertifika.meb.gov.tr). Ağ bağlantısını ve TLS denetimini kontrol edin." >&2
        return 6
    fi

    # DER gelirse PEM'e çevir; zaten PEM ise aynen kalır.
    if ! head -n 2 "$cert_file" | grep -q "BEGIN CERT"; then
        if openssl x509 -inform DER -in "$cert_file" -out "$workdir/meb.pem" 2>/dev/null; then
            cert_file="$workdir/meb.pem"
        fi
    fi

    local subject issuer
    subject="$(openssl x509 -in "$cert_file" -noout -subject 2>/dev/null || true)"
    issuer="$(openssl x509 -in "$cert_file" -noout -issuer 2>/dev/null || true)"
    if [[ -z "$subject" ]]; then
        echo "[HATA] İndirilen dosya geçerli bir X.509 sertifikası değil." >&2
        return 6
    fi
    # SEC-05: Kök sertifika doğrulama — hem konu/yayıncı hem de Basic Constraints CA:TRUE denetimi
    if ! printf '%s\n%s\n' "$subject" "$issuer" | grep -qi "meb\|mill.*e[ğg]itim\|egitim"; then
        echo "[HATA] Sertifika MEB kök sertifikasına benzemiyor (özne: $subject). Kurulum durduruldu." >&2
        return 6
    fi
    if ! openssl x509 -in "$cert_file" -noout -text 2>/dev/null | grep -A1 -i "Basic Constraints" | grep -qi "CA:TRUE"; then
        echo "[HATA] Sertifika bir Sertifika Yetkilisi (CA:TRUE) olarak yapılandırılmamış. Güvenli kök olarak eklenemez." >&2
        return 6
    fi

    # 1. Sistem deposu
    mkdir -p /usr/local/share/ca-certificates
    cp -f "$cert_file" /usr/local/share/ca-certificates/meb-kok.crt
    chmod 0644 /usr/local/share/ca-certificates/meb-kok.crt
    /usr/sbin/update-ca-certificates >/dev/null 2>&1 || update-ca-certificates >/dev/null 2>&1 || true

    # 2. Tarayıcı NSS veritabanları (her kullanıcı için ~/.pki/nssdb)
    local injected=0
    if command -v certutil >/dev/null 2>&1; then
        local home user
        for home in /home/* /root; do
            [ -d "$home" ] || continue
            user="$(basename "$home")"
            if meb_inject_nss "$home/.pki/nssdb" "$user" "$cert_file"; then
                injected=1
            fi
        done
    else
        echo "[UYARI] certutil (libnss3-tools) yok; tarayıcı NSS kurulumu atlandı, sistem deposu kuruldu." >&2
    fi

    echo "[AYAZ] MEB kök sertifikası kuruldu (özne: $subject)."
    if [[ "$injected" == "1" ]]; then
        echo "[AYAZ] Brave/Chrome NSS veritabanlarına işlendi."
    else
        echo "[AYAZ] Not: tarayıcı NSS deposuna yazılamadı; sistem deposu yine de geçerli."
    fi
    return 0
}

meb_remove_cert() {
    local removed=0
    if [[ -f /usr/local/share/ca-certificates/meb-kok.crt ]]; then
        rm -f /usr/local/share/ca-certificates/meb-kok.crt
        removed=1
    fi
    /usr/sbin/update-ca-certificates --fresh >/dev/null 2>&1 \
        || update-ca-certificates --fresh >/dev/null 2>&1 \
        || update-ca-certificates >/dev/null 2>&1 || true

    if command -v certutil >/dev/null 2>&1; then
        local home db
        for home in /home/* /root; do
            db="$home/.pki/nssdb"
            [[ -d "$db" ]] || continue
            if certutil -d "sql:$db" -D -n "MEB" >/dev/null 2>&1; then
                removed=1
            fi
        done
    fi

    if [[ "$removed" == "1" ]]; then
        echo "[AYAZ] MEB kök sertifikası sistemden ve tarayıcı NSS depolarından kaldırıldı."
    else
        echo "[AYAZ] Kaldırılacak MEB sertifikası kaydı bulunamadı."
    fi
    return 0
}

# ---------------------------------------------------------------------
# KURTARMA NOKTALARΙ (snapshot)
# ---------------------------------------------------------------------
SNAP_BASE="/var/backups/ankora-snapshots"

snap_meta_python() { # $1=op(add|remove) $2=id $3=ad $4=date_str $5=timestamp $6=size $7=size_human
    python3 - "$@" <<'PYEOF'
import json, os, sys
path = '/var/backups/ankora-snapshots/snapshots.json'
op, sid = sys.argv[1], sys.argv[2]
snaps = []
if os.path.exists(path):
    try:
        with open(path) as f:
            snaps = json.load(f)
        if not isinstance(snaps, list):
            snaps = []
    except Exception:
        snaps = []
snaps = [s for s in snaps if isinstance(s, dict) and s.get('id') != sid]
entry = None
if op == 'add':
    entry = {
        'id': sid,
        'name': sys.argv[3],
        'date_str': sys.argv[4],
        'timestamp': int(sys.argv[5]),
        'size_bytes': int(sys.argv[6]),
        'size_human': sys.argv[7],
    }
    snaps.append(entry)
with open(path, 'w') as f:
    json.dump(snaps, f, ensure_ascii=False, indent=1)
os.chmod(path, 0o644)
if entry:
    print(json.dumps(entry, ensure_ascii=False))
PYEOF
}

snapshot_create() { # $1 = ad
    local raw="$1"
    if [[ -z "$raw" ]]; then
        echo "[HATA] Kullanım: snapshot-create <ad>" >&2
        return 2
    fi
    local clean
    clean="$(printf '%s' "$raw" | tr -cd 'a-zA-Z0-9_-')"
    [[ -n "$clean" ]] || clean="Snapshot"
    local now id dir
    now="$(date +%s)"
    id="${now}_${clean}"
    dir="$SNAP_BASE/$id"
    mkdir -p "$dir"
    chmod 0755 "$SNAP_BASE"
    chmod 0700 "$dir"
    /usr/bin/dpkg --get-selections > "$dir/packages.list" 2>/dev/null || true
    /bin/tar -czf "$dir/etc-backup.tar.gz" --exclude=/etc/mtab --exclude=etc/shadow* --exclude=etc/gshadow* --exclude=etc/sudoers.d/* -C / etc 2>/dev/null || true
    if [ ! -s "$dir/etc-backup.tar.gz" ]; then
        echo "[HATA] /etc arşivi oluşturulamadı." >&2
        return 7
    fi
    chmod 0600 "$dir/etc-backup.tar.gz"
    local size_bytes size_human date_str
    size_bytes="$(stat -c '%s' "$dir/etc-backup.tar.gz" 2>/dev/null || echo 0)"
    date_str="$(date '+%Y-%m-%d %H:%M')"
    size_human="$(awk -v b="$size_bytes" 'BEGIN{printf (b<1048576) ? int(b/1024)" KB" : sprintf("%.1f MB", b/1048576)}')"
    snap_meta_python add "$id" "$clean" "$date_str" "$now" "$size_bytes" "$size_human"
}

snapshot_restore() { # $1 = kimlik
    local sid="$1"
    if [[ -z "$sid" || ! "$sid" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        echo "[HATA] Geçersiz snapshot kimliği" >&2
        return 2
    fi
    local dir
    dir="$SNAP_BASE/$sid"
    if [[ ! -d "$dir" || ! -s "$dir/etc-backup.tar.gz" ]]; then
        echo "[HATA] Snapshot bulunamadı: $sid" >&2
        return 7
    fi
    if ! /bin/tar -xzf "$dir/etc-backup.tar.gz" -C /; then
        echo "[HATA] /etc geri yükleme başarısız oldu." >&2
        return 8
    fi
    echo "[AYAZ] Kurtarma noktası geri yüklendi: $sid (/etc önceki haline döndü)"
}

snapshot_delete() { # $1 = kimlik
    local sid="$1"
    if [[ -z "$sid" || ! "$sid" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        echo "[HATA] Geçersiz snapshot kimliği" >&2
        return 2
    fi
    local dir
    dir="$SNAP_BASE/$sid"
    if [[ -d "$dir" ]]; then
        rm -rf "$dir"
    fi
    snap_meta_python remove "$sid"
    echo "[AYAZ] Kurtarma noktası silindi: $sid"
}

run_snapshot_action() { # $1 = eylem, $2 = argüman
    case "$1" in
        snapshot-create)  snapshot_create "$2" ;;
        snapshot-restore) snapshot_restore "$2" ;;
        snapshot-delete)  snapshot_delete "$2" ;;
    esac
}

# ---------------------------------------------------------------------
# SİSTEM AYARLARI VE DONANIM YARDIMCILARI (Kurulu Sistem NOPASSWD Desteği)
# ---------------------------------------------------------------------
helper_set_timezone() {
    local tz="${1:-}"
    if [[ -z "$tz" || "$tz" == *".."* || "$tz" == /* || ${#tz} -gt 64 || ! "$tz" =~ ^[A-Za-z0-9/_+-]+$ ]]; then
        echo "[HATA] Geçersiz saat dilimi biçimi: '$tz'" >&2
        return 2
    fi
    if [[ ! -f "/usr/share/zoneinfo/$tz" ]]; then
        echo "[HATA] Saat dilimi sistemde bulunamadı: '/usr/share/zoneinfo/$tz'" >&2
        return 2
    fi
    printf '%s\n' "$tz" > /etc/timezone
    ln -sf "/usr/share/zoneinfo/$tz" /etc/localtime
    DEBIAN_FRONTEND=noninteractive dpkg-reconfigure -f noninteractive tzdata >/dev/null 2>&1 || true
    echo "Saat dilimi: $tz"
}

helper_set_keyboard() {
    local lay="${1:-}"
    case "$lay" in
        tr|tr_f|us|de|fr|gb) ;;
        *)
            echo "[HATA] Desteklenmeyen klavye düzeni: '$lay'" >&2
            return 2
            ;;
    esac
    local xkb_lay="$lay"
    local xkb_var=""
    if [[ "$lay" == "tr_f" ]]; then
        xkb_lay="tr"
        xkb_var="f"
    fi
    cat > /etc/default/keyboard <<EOF
XKBMODEL="pc105"
XKBLAYOUT="$xkb_lay"
XKBVARIANT="$xkb_var"
XKBOPTIONS=""
BACKSPACE="guess"
EOF
    command -v setupcon >/dev/null 2>&1 && setupcon -k --force >/dev/null 2>&1 || true
    service console-setup restart >/dev/null 2>&1 || true
    echo "Klavye: $lay (kalıcı)"
}

helper_set_language() {
    local lang="${1:-}"
    case "$lang" in
        tr_TR.UTF-8|en_US.UTF-8) ;;
        *)
            echo "[HATA] Desteklenmeyen sistem dili: '$lang'" >&2
            return 2
            ;;
    esac
    local short="${lang%%.*}"
    local prefix="${short%%_*}"
    cat > /etc/default/locale <<EOF
LANG=$lang
LANGUAGE=$short:$prefix
LC_ALL=$lang
EOF
    command -v update-locale >/dev/null 2>&1 && update-locale "LANG=$lang" "LANGUAGE=$short" >/dev/null 2>&1 || true
    command -v locale-gen >/dev/null 2>&1 && locale-gen "$lang" en_US.UTF-8 >/dev/null 2>&1 || true
    echo "Sistem dili: $lang"
}

helper_sync_ntp() {
    command -v chronyc >/dev/null 2>&1 && chronyc -a makestep >/dev/null 2>&1 || true
    command -v ntpdate >/dev/null 2>&1 && ntpdate -u pool.ntp.org >/dev/null 2>&1 || true
    date '+%Y-%m-%d %H:%M:%S %Z'
}

helper_drop_caches() {
    sync
    echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true
    echo 1 > /proc/sys/vm/compact_memory 2>/dev/null || true
    echo "OK"
}

helper_suspend() {
    if command -v loginctl >/dev/null 2>&1 && loginctl suspend >/dev/null 2>&1; then
        return 0
    fi
    if command -v pm-suspend >/dev/null 2>&1 && pm-suspend >/dev/null 2>&1; then
        return 0
    fi
    if [[ -w /sys/power/state ]]; then
        printf 'mem' > /sys/power/state
        return $?
    fi
    echo "[HATA] Askıya alma aracı (loginctl/pm-suspend) kullanılamıyor." >&2
    return 1
}

validate_usb_block_device() {
    local dev="${1:-}"
    if [[ -z "$dev" || ! "$dev" =~ ^/dev/(sd[a-z]+|vd[a-z]+|nvme[0-9]+n[0-9]+|mmcblk[0-9]+)$ ]]; then
        echo "[HATA] Geçersiz blok aygıtı yolu: '$dev'" >&2
        return 2
    fi
    if [[ ! -b "$dev" ]]; then
        echo "[HATA] Hedef blok aygıtı bulunamadı: '$dev'" >&2
        return 2
    fi
    local dev_base="${dev#/dev/}"
    local removable tran sys_path
    removable="$(cat "/sys/block/${dev_base}/removable" 2>/dev/null || echo 0)"
    tran="$(lsblk -ndo TRAN "$dev" 2>/dev/null | head -n 1 || echo "")"
    sys_path="$(/usr/bin/readlink -f "/sys/block/${dev_base}" 2>/dev/null || echo "")"
    if [[ "$removable" != "1" && "${tran,,}" != "usb" && "$sys_path" != *"/usb"* ]]; then
        echo "[HATA] Güvenlik İlkesi İhlali: '$dev' çıkarılabilir bir USB aygıtı değil (Dahili sabit disklere yazma/biçimlendirme engellendi)." >&2
        return 3
    fi
    local mnt src
    for mnt in / /boot /boot/efi /home /var /usr /etc /run/live/medium /lib/live/mount/medium; do
        src="$(findmnt -n -o SOURCE "$mnt" 2>/dev/null || true)"
        if [[ -n "$src" && "$src" == "$dev"* ]]; then
            echo "[HATA] Kritik Güvenlik Uyarısı: Sistem veya canlı önyükleme diski ($dev) üzerine yazma engellendi!" >&2
            return 3
        fi
    done
    if grep -q "^${dev}" /proc/swaps 2>/dev/null; then
        echo "[HATA] Kritik Güvenlik Uyarısı: Aktif takas alanı (swap) içeren disk ($dev) üzerine yazma engellendi!" >&2
        return 3
    fi
    return 0
}

helper_usb_flash() {
    local iso_path="${1:-}"
    local target_dev="${2:-}"
    if [[ -z "$iso_path" || ! -f "$iso_path" || -L "$iso_path" ]]; then
        echo "[HATA] Geçerli bir ISO dosyası bulunamadı: '$iso_path'" >&2
        return 2
    fi
    local real_iso
    real_iso="$(/usr/bin/readlink -f -- "$iso_path" 2>/dev/null || true)"
    if [[ -z "$real_iso" || ! -f "$real_iso" ]]; then
        echo "[HATA] ISO dosya yolu doğrulanamadı: '$iso_path'" >&2
        return 2
    fi
    case "${real_iso,,}" in
        *.iso|*.img) ;;
        *)
            echo "[HATA] Güvenlik: Yalnızca .iso veya .img kalıp dosyaları yazdırılabilir." >&2
            return 2
            ;;
    esac
    case "$real_iso" in
        /etc/*|/boot/*|/root/*|/var/*|/usr/*|/bin/*|/sbin/*|/lib/*|/proc/*|/sys/*|/dev/*)
            echo "[HATA] Güvenlik İlkesi İhlali: Sistem dizinindeki dosya ISO olarak yazdırılamaz." >&2
            return 3
            ;;
    esac
    validate_usb_block_device "$target_dev" || return $?
    umount -f "$target_dev" 2>/dev/null || true
    while read -r dev _; do
        if [[ "$dev" == "$target_dev"* ]]; then
            umount -f "$dev" 2>/dev/null || true
        fi
    done < /proc/mounts
    dd "if=$real_iso" "of=$target_dev" bs=4M status=none conv=fsync
    sync
    echo "ISO başarıyla yazdırıldı: $target_dev"
}

helper_usb_format() {
    local target_dev="${1:-}"
    local fs_type="${2:-vfat}"
    local raw_label="${3:-ANKORA}"
    validate_usb_block_device "$target_dev" || return $?
    local clean_label
    clean_label="$(printf '%s' "$raw_label" | tr -cd 'a-zA-Z0-9_-')"
    [[ -n "$clean_label" ]] || clean_label="ANKORA"

    umount -f "$target_dev" 2>/dev/null || true
    while read -r dev _; do
        if [[ "$dev" == "$target_dev"* ]]; then
            umount -f "$dev" 2>/dev/null || true
        fi
    done < /proc/mounts

    case "${fs_type,,}" in
        vfat|fat32)
            mkfs.vfat -F 32 -n "${clean_label:0:11}" "$target_dev"
            ;;
        ext4)
            mkfs.ext4 -F -L "${clean_label:0:16}" "$target_dev"
            ;;
        ntfs)
            mkfs.ntfs -Q -L "${clean_label:0:32}" "$target_dev"
            ;;
        *)
            echo "[HATA] Desteklenmeyen dosya sistemi: '$fs_type'" >&2
            return 2
            ;;
    esac
    sync
    echo "$target_dev başarıyla ${fs_type^^} olarak biçimlendirildi."
}

helper_apt_update() {
    safe_apt_update
}

helper_apt_upgrade() {
    safe_apt_get -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" upgrade -y --no-install-recommends
}

# ---------------------------------------------------------------------
# EYLEM YÖNLENDİRİCİSİ (ACTION DISPATCHER)
# ---------------------------------------------------------------------
if [[ "$ACTION" == "mebcert" ]]; then
    meb_install_cert
    exit $?
fi

if [[ "$ACTION" == "mebcert-remove" ]]; then
    meb_remove_cert
    exit $?
fi

if [[ "$ACTION" == "snapshot-create" || "$ACTION" == "snapshot-restore" || "$ACTION" == "snapshot-delete" ]]; then
    run_snapshot_action "$ACTION" "$PKG"
    exit $?
fi

case "$ACTION" in
    set-timezone)
        helper_set_timezone "$PKG"
        exit $?
        ;;
    set-keyboard)
        helper_set_keyboard "$PKG"
        exit $?
        ;;
    set-language)
        helper_set_language "$PKG"
        exit $?
        ;;
    sync-ntp)
        helper_sync_ntp
        exit $?
        ;;
    drop-caches)
        helper_drop_caches
        exit $?
        ;;
    suspend)
        helper_suspend
        exit $?
        ;;
    usb-flash)
        helper_usb_flash "$PKG" "${3:-}"
        exit $?
        ;;
    usb-format)
        helper_usb_format "$PKG" "${3:-vfat}" "${4:-ANKORA}"
        exit $?
        ;;
    apt-update)
        helper_apt_update
        exit $?
        ;;
    apt-upgrade)
        helper_apt_upgrade
        exit $?
        ;;
esac

if [[ -z "$PKG" ]]; then
    echo "[HATA] Kullanım: ayaz-pkg-helper <install|remove|vendor> <paket_adi>" >&2
    exit 1
fi

# Yalnızca geçerli Debian paket isimleri kabul edilir: [a-zA-Z0-9.+_-]
# Kesinlikle bayrak (- veya -- ile başlayan argümanlar) veya enjeksiyon kabul edilmez
if [[ "$ACTION" != "install-deb-file" ]]; then
    if [[ ! "$PKG" =~ ^[a-zA-Z0-9][a-zA-Z0-9.+_-]*$ ]]; then
        echo "[HATA] Güvenlik İlkesi İhlali: Geçersiz paket adı biçimi: '$PKG'" >&2
        exit 2
    fi
fi

# Tehlikeli / sistem kritik paketlerin kaldırılmasını engelle
if [[ "$ACTION" == "remove" ]]; then
    CRITICAL_PKGS="libc6|linux-image.*|dpkg|apt|sysvinit-core|bash|coreutils|libgtk-3-0|libwebkit2gtk.*"
    if [[ "$PKG" =~ ^($CRITICAL_PKGS)$ ]]; then
        echo "[HATA] Güvenlik: Kritik sistem bileşeni kaldırılamaz: '$PKG'" >&2
        exit 3
    fi
fi

case "$ACTION" in
    install)
        # Sadece resmi depolardan güvenli kurulum (asla --allow-unauthenticated kabul edilmez).
        # Canlı ISO'da imaj küçültme için paket listeleri silinir; paket görünmüyorsa
        # veya indeks eskidiyse apt-get update ile tazelenip yeniden denenir.
        export DEBIAN_FRONTEND=noninteractive
        /usr/bin/dpkg --configure -a >/dev/null 2>&1 || true
        rm -rf /var/lib/apt/lists/partial/* 2>/dev/null || true
        UPDATED_NOW=0
        if ! /usr/bin/apt-cache show "$PKG" >/dev/null 2>&1; then
            safe_apt_update || true
            UPDATED_NOW=1
        fi
        if ! safe_apt_get -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" install -y --no-install-recommends -- "$PKG"; then
            if [[ "$UPDATED_NOW" == "0" ]]; then
                safe_apt_update || true
                safe_apt_get -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" install -y --no-install-recommends -- "$PKG"
            else
                exit 1
            fi
        fi
        ;;
    install-deb-file)
        if [[ -n "${SUDO_USER:-}" && -z "${PKEXEC_UID:-}" && ! -f /etc/sudoers.d/ankora ]]; then
            echo "[HATA] Güvenlik: Kurulu sistemde yerel .deb kurulumu etkileşimli yetki (pkexec) gerektirir." >&2
            exit 6
        fi
        if [[ -L "$PKG" ]]; then
            echo "[HATA] Güvenlik: Sembolik bağ üzerinden .deb kurulumu kabul edilmez." >&2
            exit 6
        fi
        DEB_FILE="$(/usr/bin/readlink -f -- "$PKG" 2>/dev/null || true)"
        if [[ -z "$DEB_FILE" || ! -f "$DEB_FILE" || "${DEB_FILE,,}" != *.deb ]]; then
            echo "[HATA] Belirtilen .deb dosyası bulunamadı veya geçersiz: $PKG" >&2
            exit 2
        fi
        if ! /usr/bin/dpkg-deb -I "$DEB_FILE" >/dev/null 2>&1; then
            echo "[HATA] Geçersiz veya bozuk Debian paketi: $DEB_FILE" >&2
            exit 3
        fi
        safe_apt_get -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" install -y --no-install-recommends -- "$DEB_FILE"
        ;;
    remove)
        safe_apt_get remove -y -- "$PKG"
        ;;
    vendor)
        case "$PKG" in
            brave)      vendor_brave ;;
            helium)     vendor_helium ;;
            antigravity) vendor_antigravity ;;
            *)
                echo "[HATA] Bilinmeyen vendor adı: '$PKG'. İzin verilenler: brave, helium, antigravity" >&2
                exit 5
                ;;
        esac
        ;;
    *)
        echo "[HATA] Bilinmeyen işlem: '$ACTION'. Kabul edilenler: install, install-deb-file, remove, vendor, mebcert, mebcert-remove, snapshot-create, snapshot-restore, snapshot-delete, set-timezone, set-keyboard, set-language, sync-ntp, drop-caches, usb-flash, usb-format" >&2
        exit 4
        ;;
esac

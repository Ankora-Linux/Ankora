#!/bin/bash
# ==============================================================================
# Ayaz Paket Yöneticisi Yardımcısı (Ayaz Package Helper)
# Ankora Linux (Devuan Daedalus SysVinit) Güvenli Paket İşlem Betiği
# ==============================================================================
set -euo pipefail

ACTION="${1:-}"
PKG="${2:-}"

if [[ -z "$ACTION" ]]; then
    echo "[HATA] Kullanım: ayaz-pkg-helper <install|remove|vendor|mebcert|snapshot-create|snapshot-restore|snapshot-delete|set-timezone|set-keyboard|set-language|sync-ntp|drop-caches|usb-flash|usb-format> [argümanlar]" >&2
    exit 1
fi

export DEBIAN_FRONTEND=noninteractive

# ---------------------------------------------------------------------
# VENDOR (üçüncü parti resmi depo) kurulumları
# Ad eşlemesi root-owned bu betiğin İÇİNDE sabittir: arayüz yalnızca bu
# isimleri gönderebilir, URL/komut/argüman gönderilemez. Tüm adresler
# satıcıların resmi HTTPS depolarıdır ve betik dışından değiştirilemez.
# ---------------------------------------------------------------------
need_net_tools() {
    if ! command -v curl >/dev/null 2>&1 || ! command -v gpg >/dev/null 2>&1; then
        /usr/bin/apt-get update -qq || true
        /usr/bin/apt-get install -y --no-install-recommends curl gnupg >/dev/null 2>&1 || true
    fi
    if ! command -v curl >/dev/null 2>&1 || ! command -v gpg >/dev/null 2>&1; then
        echo "[HATA] curl/gpg bulunamadı; resmi depo kurulumu yapılamıyor." >&2
        exit 6
    fi
}

vendor_brave() {
    need_net_tools
    curl -fsSLo /usr/share/keyrings/brave-browser-archive-keyring.gpg \
        https://brave-browser-apt-release.s3.brave.com/brave-browser-archive-keyring.gpg
    curl -fsSLo /etc/apt/sources.list.d/brave-browser-release.sources \
        https://brave-browser-apt-release.s3.brave.com/brave-browser.sources
    /usr/bin/apt-get update -qq
    exec /usr/bin/apt-get install -y --no-install-recommends -- brave-browser
}

vendor_helium() {
    need_net_tools
    curl -fsSL https://raw.githubusercontent.com/imputnet/helium-linux/main/pubkey.asc \
        | gpg --dearmor --yes -o /usr/share/keyrings/helium.gpg
    echo "deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/helium.gpg] https://pkg.helium.computer/deb stable main" \
        > /etc/apt/sources.list.d/helium.list
    /usr/bin/apt-get update -qq
    exec /usr/bin/apt-get install -y --no-install-recommends -- helium-bin
}

vendor_antigravity() {
    need_net_tools
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://us-central1-apt.pkg.dev/doc/repo-signing-key.gpg \
        | gpg --dearmor --yes -o /etc/apt/keyrings/antigravity-repo-key.gpg
    echo "deb [signed-by=/etc/apt/keyrings/antigravity-repo-key.gpg] https://us-central1-apt.pkg.dev/projects/antigravity-auto-updater-dev/ antigravity-debian main" \
        > /etc/apt/sources.list.d/antigravity.list
    /usr/bin/apt-get update -qq
    exec /usr/bin/apt-get install -y --no-install-recommends -- antigravity
}

# ---------------------------------------------------------------------
# MEB OKUL AĞI SERTİFİKASI (mebcert)
# ---------------------------------------------------------------------
meb_install_cert() {
    need_net_tools
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
        if curl -fsSL --retry 2 --max-time 60 -o "$cert_file" "$u" && [ -s "$cert_file" ]; then
            ok=1
            break
        fi
    done
    if [[ "$ok" != "1" ]]; then
        echo "[HATA] MEB sertifikası resmi adresten indirilemedi (sertifika.meb.gov.tr)." >&2
        return 6
    fi

    # DER gelirse PEM'e çevir; zaten PEM ise aynen kalır.
    if ! head -c 10 "$cert_file" | grep -q "BEGIN CERT"; then
        if command -v openssl >/dev/null 2>&1 && openssl x509 -inform DER -in "$cert_file" -out "$workdir/meb.pem" 2>/dev/null; then
            cert_file="$workdir/meb.pem"
        fi
    fi

    if ! command -v openssl >/dev/null 2>&1; then
        echo "[HATA] openssl bulunamadı; sertifika doğrulanamıyor." >&2
        return 6
    fi
    local subject issuer
    subject="$(openssl x509 -in "$cert_file" -noout -subject 2>/dev/null || true)"
    issuer="$(openssl x509 -in "$cert_file" -noout -issuer 2>/dev/null || true)"
    if [[ -z "$subject" ]]; then
        echo "[HATA] İndirilen dosya geçerli bir X.509 sertifikası değil." >&2
        return 6
    fi
    if ! printf '%s\n%s\n' "$subject" "$issuer" | grep -qi "meb\|mill.*e[ğg]itim\|egitim"; then
        echo "[HATA] Sertifika MEB kök sertifikasına benzemiyor (özne: $subject). Kurulum durduruldu." >&2
        return 6
    fi

    # 1. Sistem deposu
    cp -f "$cert_file" /usr/local/share/ca-certificates/meb-kok.crt
    chmod 0644 /usr/local/share/ca-certificates/meb-kok.crt
    /usr/sbin/update-ca-certificates >/dev/null 2>&1 || update-ca-certificates >/dev/null 2>&1 || true

    # 2. Tarayıcı NSS veritabanları (Brave öncelikli)
    local injected=0
    if command -v certutil >/dev/null 2>&1; then
        local home
        for home in /home/* /root; do
            [ -d "$home" ] || continue
            local user
            user="$(basename "$home")"
            local db
            mkdir -p "$home/.pki/nssdb" 2>/dev/null || true
            for db in "$home/.pki/nssdb" \
                      "$home/.config/BraveSoftware/Brave-Browser" \
                      "$home/.config/google-chrome" \
                      "$home/.config/chromium"; do
                if certutil -d "sql:$db" -A -t "C,," -n "MEB" -i "$cert_file" 2>/dev/null \
                   || certutil -d "$db" -A -t "C,," -n "MEB" -i "$cert_file" 2>/dev/null; then
                    injected=1
                    if id "$user" >/dev/null 2>&1; then
                        chown -R "$user" "$db" 2>/dev/null || true
                    fi
                else
                    certutil -d "sql:$db" -D -n "MEB" 2>/dev/null || true
                    if certutil -d "sql:$db" -A -t "C,," -n "MEB" -i "$cert_file" 2>/dev/null; then
                        injected=1
                    fi
                fi
            done
        done
    else
        echo "[UYARI] certutil (libnss3-tools) yok; tarayıcı NSS kurulumu atlandı, sistem deposu kuruldu." >&2
    fi

    echo "[AYAZ] MEB kök sertifikası kuruldu (özne: $subject)."
    if [[ "$injected" == "1" ]]; then
        echo "[AYAZ] Brave/Chrome NSS veritabanlarına işlendi."
    else
        echo "[AYAZ] Not: Brave profili bulunamadı; Brave ilk açılışta sistem deposunu kullanır."
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
    local mnt src
    for mnt in / /boot /boot/efi /home /etc /run/live/medium /lib/live/mount/medium; do
        src="$(findmnt -n -o SOURCE "$mnt" 2>/dev/null || true)"
        if [[ -n "$src" && "$src" == "$dev"* ]]; then
            echo "[HATA] Kritik Güvenlik Uyarısı: Sistem veya canlı önyükleme diski ($dev) üzerine yazma engellendi!" >&2
            return 3
        fi
    done
    return 0
}

helper_usb_flash() {
    local iso_path="${1:-}"
    local target_dev="${2:-}"
    if [[ -z "$iso_path" || ! -f "$iso_path" || -L "$iso_path" ]]; then
        echo "[HATA] Geçerli bir ISO dosyası bulunamadı: '$iso_path'" >&2
        return 2
    fi
    validate_usb_block_device "$target_dev" || return $?
    umount -f "$target_dev" 2>/dev/null || true
    while read -r dev _; do
        if [[ "$dev" == "$target_dev"* ]]; then
            umount -f "$dev" 2>/dev/null || true
        fi
    done < /proc/mounts
    dd "if=$iso_path" "of=$target_dev" bs=4M status=none conv=fsync
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

# ---------------------------------------------------------------------
# EYLEM YÖNLENDİRİCİSİ (ACTION DISPATCHER)
# ---------------------------------------------------------------------
if [[ "$ACTION" == "mebcert" ]]; then
    meb_install_cert
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
    usb-flash)
        helper_usb_flash "$PKG" "${3:-}"
        exit $?
        ;;
    usb-format)
        helper_usb_format "$PKG" "${3:-vfat}" "${4:-ANKORA}"
        exit $?
        ;;
esac

if [[ -z "$PKG" ]]; then
    echo "[HATA] Kullanım: ayaz-pkg-helper <install|remove|vendor> <paket_adi>" >&2
    exit 1
fi

# Yalnızca geçerli Debian paket isimleri kabul edilir: [a-zA-Z0-9.+_-]
# Kesinlikle bayrak (- veya -- ile başlayan argümanlar) veya enjeksiyon kabul edilmez
if [[ ! "$PKG" =~ ^[a-zA-Z0-9][a-zA-Z0-9.+_-]*$ ]]; then
    echo "[HATA] Güvenlik İlkesi İhlali: Geçersiz paket adı biçimi: '$PKG'" >&2
    exit 2
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
        # bir kez "apt-get update" ile tazelenip kurulum yeniden denenir.
        if ! /usr/bin/apt-cache show "$PKG" >/dev/null 2>&1; then
            /usr/bin/apt-get update -qq || true
        fi
        exec /usr/bin/apt-get install -y --no-install-recommends -- "$PKG"
        ;;
    remove)
        exec /usr/bin/apt-get remove -y -- "$PKG"
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
        echo "[HATA] Bilinmeyen işlem: '$ACTION'. Kabul edilenler: install, remove, vendor, mebcert, snapshot-create, snapshot-restore, snapshot-delete, set-timezone, set-keyboard, set-language, sync-ntp, drop-caches, usb-flash, usb-format" >&2
        exit 4
        ;;
esac

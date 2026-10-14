#!/bin/bash
# ==============================================================================
# Ayaz Paket Yöneticisi Yardımcısı (Ayaz Package Helper)
# Ankora Linux (Devuan Daedalus SysVinit) Güvenli Paket İşlem Betiği
# ==============================================================================
set -euo pipefail

ACTION="${1:-}"
PKG="${2:-}"

if [[ -z "$ACTION" ]]; then
    echo "[HATA] Kullanım: ayaz-pkg-helper <install|remove|vendor|mebcert> <paket_adi>" >&2
    exit 1
fi

# mebcert eylemi paket adı almaz; tek argümanla çalışır.
if [[ "$ACTION" == "mebcert" ]]; then
    meb_install_cert
    exit $?
fi

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
# Okul ağlarında (MEB filtreli internet) HTTPS denetimi MEB kök
# sertifikasıyla yapılır; sertifika yoksa tarayıcılar "güvenli değil"
# hatası verir. Bu eylem:
#   1. Sertifikayı YALNIZCA resmi MEB adresinden indirir,
#      openssl ile X.509 geçerliliğini doğrular (konu satırında MEB aranır).
#   2. Sistem deposuna (/usr/local/share/ca-certificates) kurar.
#   3. Brave / Chrome / Chromium NSS veritabanlarına (her kullanıcı için)
#      "MEB" adıyla işler; böylece ek adım gerekmeden Brave'te geçerli olur.
# URL ve sertifika adı bu betiğin İÇİNDE sabittir, arayüzden alınmaz.
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
            for db in "$home/.config/BraveSoftware/Brave-Browser" \
                      "$home/.config/google-chrome" \
                      "$home/.config/chromium"; do
                [ -d "$db" ] || continue
                if certutil -d "sql:$db" -A -t "C,," -n "MEB" -i "$cert_file" 2>/dev/null \
                   || certutil -d "$db" -A -t "C,," -n "MEB" -i "$cert_file" 2>/dev/null; then
                    injected=1
                    if id "$user" >/dev/null 2>&1; then
                        chown -R "$user" "$db" 2>/dev/null || true
                    fi
                else
                    # Eski kayıt varsa silip yeniden dene (süresi dolmuş olabilir).
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
        echo "[HATA] Bilinmeyen işlem: '$ACTION'. Yalnızca 'install', 'remove', 'vendor' veya 'mebcert' kabul edilir." >&2
        exit 4
        ;;
esac

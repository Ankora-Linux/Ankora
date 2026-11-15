#!/bin/bash
# ==============================================================================
# Ankora Linux 4.7 "Bora" (Excalibur) — Canlı (Live) ISO Derleme Betiği
# Masaüstü Ortamı: Ayaz DE (Tauri + WebKitGTK + SysVinit Core)
# Mimari: x86_64 (UEFI + BIOS Hibrit Boot)
# ==============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

WORK_DIR="/var/tmp/ankora-iso-build"
CHROOT_DIR="$WORK_DIR/chroot"
IMAGE_DIR="$WORK_DIR/image"
DEVUAN_MIRROR="${DEVUAN_SNAPSHOT_URL:-${DEVUAN_MIRROR:-https://deb.devuan.org/merged}}"
DEVUAN_SUITE="excalibur"

# Tek sürüm kaynağı: src-tauri/tauri.conf.json (devrik: VERSION).
# ISO adı ve GRUB menü başlıkları bu sürümden türetilir; sabit "3.5"
# yazmıyoruz ki yeni sürümde workflow kırılmasın.
AYAZ_VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$ROOT_DIR/src-tauri/tauri.conf.json" | head -n 1)
if [ -z "$AYAZ_VERSION" ] && [ -f "$ROOT_DIR/VERSION" ]; then
    AYAZ_VERSION=$(tr -d '[:space:]' < "$ROOT_DIR/VERSION")
fi
[ -z "$AYAZ_VERSION" ] && AYAZ_VERSION="4.7.0"
ISO_NAME="ankora-linux-${AYAZ_VERSION}-ayaz-amd64.iso"
# ISO9660 etiketi sürümü yansıtır; grub.cfg'deki search --label ile birebir
# aynı etikettir — ikisi tek değişkenden üretilir, elle düzeltmeyin.
VOLID="ANKORA_$(printf '%s' "$AYAZ_VERSION" | sed 's/\./_/g')"
echo
echo "======================================================================"
echo "   ANKORA LINUX $AYAZ_VERSION (AYAZ DE) CANLI ISO DERLEME SİSTEMİ      "
echo "======================================================================"
echo "Sürüm: $AYAZ_VERSION (Excalibur / SysVinit Core)"
echo "Çıktı Hedefi: $ROOT_DIR/dist/$ISO_NAME"
echo "======================================================================"

# 1. Kök Kullanıcı Denetimi
if [ "$(id -u)" -ne 0 ]; then
    echo "[HATA] ISO derleme işlemi kök (root) yetkisi gerektirir." >&2
    echo "Lütfen 'sudo bash scripts/build-iso.sh' ile çalıştırın." >&2
    exit 1
fi

# 2. Gerekli Host Paketlerinin Denetimi
REQUIRED_HOST_PKGS=(debootstrap squashfs-tools xorriso isolinux syslinux-common syslinux-efi grub-pc-bin grub-efi-amd64-bin mtools dosfstools wget gpgv)
MISSING_HOST_PKGS=()
for pkg in "${REQUIRED_HOST_PKGS[@]}"; do
    if ! dpkg -s "$pkg" &>/dev/null; then
        MISSING_HOST_PKGS+=("$pkg")
    fi
done

if [ ${#MISSING_HOST_PKGS[@]} -gt 0 ]; then
    echo "[BİLGİ] Eksik host araçları kuruluyor: ${MISSING_HOST_PKGS[*]}"
    apt-get update -qq
    apt-get install -y --no-install-recommends "${MISSING_HOST_PKGS[@]}"
fi

# Devuan suite betiğini debootstrap için tanımla (Debian host üzerinde eksikse ekle)
if [ ! -f "/usr/share/debootstrap/scripts/$DEVUAN_SUITE" ]; then
    echo "[BİLGİ] Debootstrap için $DEVUAN_SUITE profili oluşturuluyor..."
    if [ -f "/usr/share/debootstrap/scripts/trixie" ]; then
        ln -sf trixie "/usr/share/debootstrap/scripts/$DEVUAN_SUITE"
    elif [ -f "/usr/share/debootstrap/scripts/bookworm" ]; then
        ln -sf bookworm "/usr/share/debootstrap/scripts/$DEVUAN_SUITE"
    else
        ln -sf sid "/usr/share/debootstrap/scripts/$DEVUAN_SUITE"
    fi
fi

# Devuan GPG resmi anahtarlık denetimi (Excalibur anahtarları için güncel paket öncelikli)
LOCAL_KEYRING="$ROOT_DIR/third_party/devuan-keyring/gpg/devuan-archive-keyring.gpg"
LOCAL_DEB="$ROOT_DIR/third_party/devuan-keyring/devuan-keyring_2022.09.04_all.deb"

if [ ! -f /usr/share/keyrings/devuan-archive-keyring.gpg ] && [ ! -f /etc/apt/trusted.gpg.d/devuan-archive-keyring.gpg ]; then
    echo "[BİLGİ] Devuan resmi GPG anahtarlığı (devuan-keyring Excalibur) indiriliyor..."
    TMP_KEYRING_DEB=$(mktemp /tmp/devuan-keyring.XXXXXX.deb)
    rm -f "$TMP_KEYRING_DEB"
    wget -qO "$TMP_KEYRING_DEB" https://pkgmaster.devuan.org/devuan/pool/main/d/devuan-keyring/devuan-keyring_2026.01.13_all.deb 2>/dev/null \
        || wget -qO "$TMP_KEYRING_DEB" https://pkgmaster.devuan.org/devuan/pool/main/d/devuan-keyring/devuan-keyring_2025.08.09_all.deb 2>/dev/null \
        || true
    if [ -s "$TMP_KEYRING_DEB" ] && dpkg-deb -I "$TMP_KEYRING_DEB" >/dev/null 2>&1; then
        TMP_KEY_DIR=$(mktemp -d /tmp/devuan-key-verify.XXXXXX)
        dpkg-deb -x "$TMP_KEYRING_DEB" "$TMP_KEY_DIR" 2>/dev/null || true
        KEY_CAND="$TMP_KEY_DIR/usr/share/keyrings/devuan-archive-keyring.gpg"
        # Devuan archive signing fingerprints (2022/2025/2026 release keys)
        if [ -f "$KEY_CAND" ] && command -v gpg >/dev/null 2>&1 \
           && gpg --batch --with-colons --show-keys "$KEY_CAND" 2>/dev/null | grep -qiE "94532124541922FB|BB23C00C61FC752C|72E3CB773315DFA2|Devuan"; then
            dpkg -i "$TMP_KEYRING_DEB" 2>/dev/null || apt-get install -f -y 2>/dev/null || true
        elif [ -f "$LOCAL_DEB" ]; then
            echo "[UYARI] İndirilen Devuan anahtarlık parmak izi doğrulanamadı; depo içi anahtarlık kuruluyor." >&2
            dpkg -i "$LOCAL_DEB" 2>/dev/null || true
        fi
        rm -rf "$TMP_KEY_DIR"
    elif [ -f "$LOCAL_DEB" ]; then
        echo "[BİLGİ] Yerel Devuan anahtarlık paketi kuruluyor ($LOCAL_DEB)..."
        dpkg -i "$LOCAL_DEB" 2>/dev/null || true
    fi
    rm -f "$TMP_KEYRING_DEB"
fi

KEYRING_ARGS=()
if [ -f /usr/share/keyrings/devuan-archive-keyring.gpg ]; then
    KEYRING_ARGS=("--keyring=/usr/share/keyrings/devuan-archive-keyring.gpg")
elif [ -f /etc/apt/trusted.gpg.d/devuan-archive-keyring.gpg ]; then
    KEYRING_ARGS=("--keyring=/etc/apt/trusted.gpg.d/devuan-archive-keyring.gpg")
elif [ -f "$LOCAL_KEYRING" ]; then
    KEYRING_ARGS=("--keyring=$LOCAL_KEYRING")
else
    # Anahtarlıksız kurulum imzasız taban sistem demektir; sessizce geçilmez.
    echo "[HATA] Devuan GPG anahtarlığı bulunamadı:" >&2
    echo "       $LOCAL_KEYRING" >&2
    echo "       /usr/share/keyrings/devuan-archive-keyring.gpg" >&2
    echo "       /etc/apt/trusted.gpg.d/devuan-archive-keyring.gpg" >&2
    echo "[HATA] Kurulum imzasız olacağı için durduruldu." >&2
    exit 1
fi

# 3. Temiz Çalışma Alanı Hazırlığı
echo "[1/8] Çalışma dizinleri hazırlanıyor..."
umount -lf "$CHROOT_DIR/dev/pts" 2>/dev/null || true
umount -lf "$CHROOT_DIR/dev" 2>/dev/null || true
umount -lf "$CHROOT_DIR/proc" 2>/dev/null || true
umount -lf "$CHROOT_DIR/sys" 2>/dev/null || true
# Test ya da önceki derlemeden kalan bağ noktaları (X11 soket tmpfs'i dahil)
# da çözülür. Bunlar hâlâ bağlıyken rm -rf salt-okunur dosya sistemi
# hatasıyla durur ve derleme başlamadan biter.
awk -v p="$CHROOT_DIR" 'index($2, p "/") == 1 { print $2 }' /proc/mounts 2>/dev/null \
    | sort -r | while IFS= read -r m; do
        umount -lf "$m" 2>/dev/null || true
    done || true
# WORK_DIR bir bind-mount hedefi olabilir (ör. alanı bol diske bağlanır);
# dizinin kendisi silinmez, yalnızca içeriği temizlenir. `rm -rf $WORK_DIR`
# bağlı dizinde "Device or resource busy" ile `set -e` altında ölüyordu.
if [ -e "$WORK_DIR" ] && [ ! -d "$WORK_DIR" ]; then
    rm -f "$WORK_DIR"
fi
mkdir -p "$WORK_DIR"
find "$WORK_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null || true
mkdir -p "$CHROOT_DIR" "$IMAGE_DIR/live" "$IMAGE_DIR/boot/grub" "$ROOT_DIR/dist"

# 4. Debootstrap ile Temel Devuan Excalibur Sisteminin İndirilmesi
echo "[2/8] Devuan Excalibur SysVinit temel tabanı kuruluyor (debootstrap)..."
debootstrap --arch=amd64 \
    --variant=minbase \
    "${KEYRING_ARGS[@]}" \
    --include=sysvinit-core,sysvinit-utils,insserv,initramfs-tools,live-boot,live-config,live-config-sysvinit,ca-certificates \
    "$DEVUAN_SUITE" "$CHROOT_DIR" "$DEVUAN_MIRROR"

# 5. Sanal Dosya Sistemlerinin Bağlanması (Mount) ve Anahtarlık Transferi
mkdir -p "$CHROOT_DIR/etc/apt/trusted.gpg.d" "$CHROOT_DIR/usr/share/keyrings"
cp -f /usr/share/keyrings/devuan* "$CHROOT_DIR/etc/apt/trusted.gpg.d/" 2>/dev/null || true
cp -f /usr/share/keyrings/devuan* "$CHROOT_DIR/usr/share/keyrings/" 2>/dev/null || true
if ! ls "$CHROOT_DIR/usr/share/keyrings/"devuan*.gpg >/dev/null 2>&1 && [ -d "$ROOT_DIR/third_party/devuan-keyring/gpg" ]; then
    cp -f "$ROOT_DIR/third_party/devuan-keyring/gpg/"devuan* "$CHROOT_DIR/etc/apt/trusted.gpg.d/" 2>/dev/null || true
    cp -f "$ROOT_DIR/third_party/devuan-keyring/gpg/"devuan* "$CHROOT_DIR/usr/share/keyrings/" 2>/dev/null || true
fi
# Baz sistemler anahtarlığı yalnızca /etc/apt/trusted.gpg.d altında tutar.
# Ama bu dosyalar devuan-keyring paketinin conffile'larıyla aynı yolda
# çakışır: önceden konursa dpkg conffile sorusunda stdin'de eof alır, paketi
# yarı bırakır ve sonraki apt-get'i `set -e` ile durdurur. Yalnızca yukarıdaki
# kopyalama hiçbir şey koymadıysa yedeğe başvur.
if ! ls "$CHROOT_DIR/etc/apt/trusted.gpg.d/"devuan*.gpg >/dev/null 2>&1; then
    cp -f /etc/apt/trusted.gpg.d/devuan* "$CHROOT_DIR/etc/apt/trusted.gpg.d/" 2>/dev/null || true
fi

mount --bind /dev "$CHROOT_DIR/dev"
mount --bind /dev/pts "$CHROOT_DIR/dev/pts"
mount -t proc none "$CHROOT_DIR/proc"
mount -t sysfs none "$CHROOT_DIR/sys"

cleanup() {
    echo "[TEMİZLİK] Sanal dosya sistemleri ayrılıyor..."
    umount -lf "$CHROOT_DIR/dev/pts" 2>/dev/null || true
    umount -lf "$CHROOT_DIR/dev" 2>/dev/null || true
    umount -lf "$CHROOT_DIR/proc" 2>/dev/null || true
    umount -lf "$CHROOT_DIR/sys" 2>/dev/null || true
}
trap cleanup EXIT

# 6. Chroot İçinde Sistem ve Kiosk Paketlerinin Yapılandırılması
echo "[3/8] Çekirdek, X11 ve WebKit bağımlılıkları kuruluyor..."
cat << 'EOF' > "$CHROOT_DIR/chroot-setup.sh"
#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive
export HOME=/root
export LC_ALL=C

# -----------------------------------------------------------------------
# ALAN YÖNETİMİ: Gereksiz dil/doc/man dosyalarını engelle (~300 MB tasarruf)
# -----------------------------------------------------------------------
cat << 'NODOC' > /etc/dpkg/dpkg.cfg.d/01-nodoc
path-exclude /usr/share/doc/*
path-exclude /usr/share/man/*
path-exclude /usr/share/info/*
path-exclude /usr/share/lintian/*
path-exclude /usr/share/linda/*
path-include /usr/share/doc/*/copyright
NODOC

cat << 'NOLOCALE' > /etc/dpkg/dpkg.cfg.d/02-nolocale
path-exclude /usr/share/locale/*
path-include /usr/share/locale/tr/*
path-include /usr/share/locale/en/*
path-include /usr/share/locale/locale.alias
NOLOCALE

# Non-interactive derlemede dpkg'nin conffile sorusu stdin'de eof verir ve
# paketi yarı bırakır; `DEBIAN_FRONTEND=noninteractive` bu soruyu susturmaz,
# çünkü soru debconf değil dpkg'nin kendisine ait. Sorunun varsayılanı olan
# "mevcut dosyayı koru" seçeneğini sessizce uygula.
cat << 'CONFOPT' > /etc/apt/apt.conf.d/01-build-confold
Dpkg::Options { "--force-confdef"; "--force-confold"; };
CONFOPT

# Bazı ağlarda IPv6 erişilemezken DNS IPv6 adresi döndürdüğünde apt
# indirmeleri zaman aşımına düşüp kurulumu yarıda kesiyor. Build sırasında
# IPv4 zorlanır; squashfs öncesi bu dosya kaldırılır, ISO'ya sızmaz.
cat << 'FORCEIPV4' > /etc/apt/apt.conf.d/02-build-forceipv4
Acquire::ForceIPv4 "true";
FORCEIPV4

# Ayna senkronu sırasında apt-get update sert hata verip derlemeyi
# düşürüyordu (Packages.xz boyut uyuşmazlığı: "Mirror sync in progress?").
# deb.devuan.org bir yönlendiricidir; her deneme başka bir aynaya düşebilir.
apt_update_retry() {
    local _i
    for _i in 1 2 3 4 5; do
        if apt-get update -qq; then
            return 0
        fi
        echo "[UYARI] apt-get update başarısız (deneme ${_i}/5), 10 sn sonra yeniden..." >&2
        sleep 10
    done
    echo "[HATA] apt-get update beş denemede tamamlanamadı." >&2
    return 1
}

# Depo kaynakları
cat << 'SOURCES' > /etc/apt/sources.list
deb https://deb.devuan.org/merged excalibur main contrib non-free non-free-firmware
deb https://deb.devuan.org/merged excalibur-security main contrib non-free non-free-firmware
deb https://deb.devuan.org/merged excalibur-updates main contrib non-free non-free-firmware
SOURCES

# trusted=yes imza denetimini tamamen kapatıyordu. Anahtarlık yukarıda
# zaten chroot'a kopyalandığından Release dosyaları GPG ile doğrulanır;
# doğrulanamazsa `set -e` kurulumu burada durdurur.
apt_update_retry
apt-get install -y --no-install-recommends devuan-keyring || true

# -----------------------------------------------------------------------
# FARZ 1: Linux Çekirdeği ve temel araçlar (alan kontrolü ile)
# NOT: live-boot kök dosya sistemini initramfs içinden bulur. squashfs,
# loop ve iso9660 modülleri initrd'de yoksa açılış "Unable to find a
# medium containing a live file system" / kernel panic ile durur. Bu
# yüzden çekirdek + live-boot-initramfs araçları + konsol/klavye.UTF-8
# paketleri birlikte kurulur, modüller altta initramfs'e enjekte edilir.
# -----------------------------------------------------------------------
apt-get install -y --no-install-recommends \
    linux-image-amd64 \
    live-boot \
    live-boot-initramfs-tools \
    live-config \
    live-config-sysvinit \
    initramfs-tools \
    busybox \
    console-setup \
    console-data \
    kbd \
    fonts-dejavu-core \
    tzdata \
    chrony \
    ca-certificates \
    curl \
    wget \
    sudo \
    locales

# Ara temizlik (çekirdek ve firmware dosyaları çok yer kaplar)
apt-get clean
rm -rf /var/lib/apt/lists/*
apt_update_retry

echo "[ALAN RAPORU] Çekirdek kurulumundan sonra:"
df -h / || true

# -----------------------------------------------------------------------
# FARZ 2: Xorg (Tam Ekran Kartı Sürücü Paketi & Hızlandırma)
# -----------------------------------------------------------------------
apt-get install -y --no-install-recommends \
    xserver-xorg-core \
    xserver-xorg-video-all \
    xserver-xorg-video-intel \
    intel-media-va-driver \
    xserver-xorg-video-amdgpu \
    xserver-xorg-video-ati \
    xserver-xorg-video-nouveau \
    xserver-xorg-video-vesa \
    xserver-xorg-video-fbdev \
    xserver-xorg-video-vmware \
    xserver-xorg-video-qxl \
    xserver-xorg-input-all \
    xserver-xorg-legacy \
    libgl1-mesa-dri \
    libglx-mesa0 \
    mesa-vulkan-drivers \
    mesa-va-drivers \
    va-driver-all \
    mesa-utils \
    firmware-linux-free \
    xinit \
    openbox \
    x11-xserver-utils \
    dbus-x11

# -----------------------------------------------------------------------
# GPU FİRMWARE — gerçek donanımda test bulgusu: Radeon (r600/ati) kartları
# non-free firmware olmadan siyah ekran veriyor ve konsolu kilitliyor.
#
# ÖNEMLİ: paketleri TEK TEK kur. Tek bir bulunmayan paket adı (daedalus/excalibur'da
# firmware-radeon yok, firmware-amd-graphics içine katıldı) tüm apt komutunu
# düşürüyordu; eski hali `2>/dev/null || true` ile hatayı yutuyor ve ISO
# firmware'siz çıkıyordu. Bu yüzden artık hem tek tek kuruluyor hem de
# sonuç doğrulanıyor.
# -----------------------------------------------------------------------
for fw_pkg in firmware-linux-nonfree firmware-amd-graphics firmware-radeon; do
    if apt-get install -y --no-install-recommends "$fw_pkg"; then
        echo "[OK] $fw_pkg kuruldu"
    else
        echo "[UYARI] $fw_pkg kurulamadi (bu depoda bulunmuyor olabilir)"
    fi
done

# Doğrulama: radeon/amdgpu firmware gerçekten indi mi? İnmediyse ISO'yu
# yayınlamak anlamsız; eski AMD kartlarda siyah ekranın tek sebebi bu.
FW_RADEON=$(ls /lib/firmware/radeon 2>/dev/null | wc -l)
FW_AMDGPU=$(ls /lib/firmware/amdgpu 2>/dev/null | wc -l)
if [ "$FW_RADEON" -eq 0 ] && [ "$FW_AMDGPU" -eq 0 ]; then
    echo "[HATA] GPU firmware yok: /lib/firmware/radeon ve /lib/firmware/amdgpu bos."
    echo "[HATA] firmware-amd-graphics kurulamadi; ISO AMD/Radeon kartlarda siyah ekran verir."
    exit 1
fi
echo "[OK] GPU firmware: $FW_RADEON radeon, $FW_AMDGPU amdgpu dosyasi"

# -----------------------------------------------------------------------
# KABLOSUZ (Wi-Fi) DONANIM KAPSAMA — gerçek donanımda ağ kartı sürücüsü
# -----------------------------------------------------------------------
# Kernel sürücü modülleri (iwlwifi, rtw88/89, ath9k/ath10k, brcmfmac,
# mt76, b43...) çekirdekte kurulu; FATAL olan FİRMWARE eksikliğidir.
# VM'de sanal ağ kartı (e1000/virtio) firmware'siz çalıştığı için sorun
# görünmez; gerçek donanımda Intel/Realtek/Broadcom kartları firmware
# olmadan hiç tanınmaz ve "Wi-Fi ağları bulunamıyor" yaşanır.
# Bu yüzden tüm yaygın aileler için non-free-firmware paketleri kurulur.
# -----------------------------------------------------------------------
apt-get install -y --no-install-recommends \
    firmware-iwlwifi \
    firmware-realtek \
    firmware-atheros \
    firmware-brcm80211 \
    firmware-libertas \
    firmware-ath9k-htc \
    firmware-ti-connectivity \
    firmware-misc-nonfree \
    wireless-regdb \
    rfkill \
    b43-fwcutter

# Taban sürümünde bulunmayan firmware paketleri (ralink misc-nonfree'ye
# girdi/bölündü; intel-misc + mediatek trixie'de ayrıldı) varsa kurulur;
# yoksa derleme kırılmaz, kapsama misc-nonfree ile sağlanır.
for _fw_extra in firmware-ralink firmware-intel-misc firmware-mediatek; do
    if apt-cache show "$_fw_extra" >/dev/null 2>&1; then
        apt-get install -y --no-install-recommends "$_fw_extra" 2>/dev/null || true
    fi
done
unset _fw_extra

# Eski Broadcom b43 kartları için firmware paketi sürücü yükleyicisiyle
# gelir ve postinst ağdan firmware indirir; ağ yokluğunda paket postinst'i
# patlayabilir — derlemeyi durdurmasın (kalan kartlar yukarıda kapsanır).
apt-get install -y --no-install-recommends firmware-b43-installer 2>/dev/null || true

# Ara temizlik
apt-get clean
rm -rf /var/lib/apt/lists/*
apt_update_retry

echo "[ALAN RAPORU] Xorg ve GPU sürücüleri kurulumundan sonra:"
df -h / || true

# -----------------------------------------------------------------------
# FARZ 3: WebKitGTK, ses ve kiosk bileşenleri + Kurulum Araçları + Brave
# -----------------------------------------------------------------------
apt-get install -y --no-install-recommends \
    libwebkit2gtk-4.1-0 \
    libjavascriptcoregtk-4.1-0 \
    libgtk-3-0 \
    libayatana-appindicator3-1 \
    python3 \
    python3-gi \
    python3-gi-cairo \
    python3-cairo \
    gir1.2-webkit2-4.1 \
    gir1.2-gtk-3.0 \
    bubblewrap \
    xdg-dbus-proxy \
    alsa-utils \
    pulseaudio \
    pulseaudio-utils \
    pavucontrol \
    network-manager \
    bluez \
    udisks2 \
    polkitd \
    pkexec \
    fonts-inter \
    fonts-noto-core \
    fonts-noto-color-emoji \
    xtrlock \
    isc-dhcp-client \
    iproute2 \
    net-tools \
    wpasupplicant \
    parted \
    dosfstools \
    e2fsprogs \
    exfat-fuse \
    exfatprogs \
    rsync \
    grub-efi-amd64-bin \
    grub-pc-bin \
    grub2-common \
    efibootmgr \
    xdg-utils \
    file \
    scrot \
    xclip \
    xterm \
    xinput \
    xinput-calibrator \
    xserver-xorg-input-libinput \
    xserver-xorg-input-evdev \
    xserver-xorg-input-wacom \
    evtest \
    usbutils \
    input-utils \
    onboard \
    wmctrl \
    xdotool \
    dunst \
    libnotify-bin \
    plymouth \
    plymouth-themes \
    papirus-icon-theme \
    libnss3-tools \
    openssl \
    flatpak \
    libvulkan1 \
    mesa-vulkan-drivers \
    mesa-utils \
    zram-tools \
    lxpolkit \
    xsettingsd \
    trayer \
    playerctl \
    ntfs-3g \
    7zip \
    zip \
    unzip \
    gvfs \
    cups \
    cups-client \
    cups-bsd \
    printer-driver-gutenprint \
    system-config-printer \
    sane-utils \
    libsane1 \
    simple-scan

# Flathub Resmi Deposu Entegrasyonu (Spotify, Discord, Steam, VS Code 1-Tık)
flatpak remote-add --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo 2>/dev/null || true

# Brave Browser Resmi Deposu Kurulumu (Varsayılan Web Tarayıcı)
# Brave zorunludur: kurulamazsa derleme durur. Eskiden hata sessizce
# yutuluyor, ISO Brave'siz çıkıyor ama mimeapps yine Brave'i gösteriyordu.
mkdir -p /usr/share/keyrings /etc/apt/sources.list.d
BRAVE_KEY=/usr/share/keyrings/brave-browser-archive-keyring.gpg
BRAVE_URL=https://brave-browser-apt-release.s3.brave.com
for i in 1 2 3; do
    curl -fsSL --retry 3 -o "$BRAVE_KEY" "$BRAVE_URL/brave-browser-archive-keyring.gpg" && [ -s "$BRAVE_KEY" ] && break
    sleep 5
done
[ -s "$BRAVE_KEY" ] || { echo "[HATA] Brave imza anahtarı indirilemedi." >&2; exit 1; }
echo "deb [arch=amd64 signed-by=$BRAVE_KEY] $BRAVE_URL/ stable main" > /etc/apt/sources.list.d/brave-browser-release.list
BRAVE_OK=0
for i in 1 2 3; do
    if apt_update_retry && apt-get install -y --no-install-recommends brave-browser; then
        BRAVE_OK=1; break
    fi
    sleep 10
done
if [ "$BRAVE_OK" != 1 ] || [ ! -x /usr/bin/brave-browser ]; then
    echo "[HATA] brave-browser kurulamadı; ISO varsayılan tarayıcısız çıkmasın diye derleme durduruldu." >&2
    exit 1
fi
update-alternatives --install /usr/bin/x-www-browser x-www-browser /usr/bin/brave-browser 200
update-alternatives --set x-www-browser /usr/bin/brave-browser
update-alternatives --install /usr/bin/gnome-www-browser gnome-www-browser /usr/bin/brave-browser 200
update-alternatives --set gnome-www-browser /usr/bin/brave-browser
mkdir -p /etc/xdg
cat << 'MIME_GLOBAL' > /etc/xdg/mimeapps.list
[Default Applications]
x-scheme-handler/http=brave-browser.desktop
x-scheme-handler/https=brave-browser.desktop
text/html=brave-browser.desktop
application/xhtml+xml=brave-browser.desktop
MIME_GLOBAL
mkdir -p /usr/share/applications
cp /etc/xdg/mimeapps.list /usr/share/applications/mimeapps.list
echo "[BİLGİ] Brave kuruldu ve varsayılan tarayıcı yapıldı: $(dpkg-query -W -f='${Version}' brave-browser)"

# -----------------------------------------------------------------------
# GÜVENLİK: DSA sınıfı çekirdek/paket yamaları — debootstrap tabanı
# excalibur-security'deki son sürümlere çekilir; ISO bayat çekirdekle
# çıkmaz (ör. güncel Linux 6.12 LTS güvenlik yamaları).
# -----------------------------------------------------------------------
echo "[GÜVENLİK] Güvenlik güncellemeleri uygulanıyor (excalibur-security)..."
apt-get update -qq
apt-get -y dist-upgrade
echo "[GÜVENLİK] linux-image-amd64 = $(dpkg-query -W -f='${Version}' linux-image-amd64 2>/dev/null || echo ?)"
UPG=$(apt-get -s dist-upgrade 2>/dev/null | awk '/^Inst/{c++} END{print c+0}')
echo "[GÜVENLİK] Bekleyen paket güncellemesi: $UPG (beklenen 0)"

# Çift/eski çekirdek kalıntılarını güvenli temizle (en güncel çekirdek her zaman korunur)
LATEST_VMLINUZ=$(ls -1v /boot/vmlinuz-* 2>/dev/null | tail -n1 || true)
LATEST_KPKG=""
if [ -n "$LATEST_VMLINUZ" ]; then
    LATEST_KPKG=$(dpkg-query -S "$LATEST_VMLINUZ" 2>/dev/null | cut -d: -f1 | head -n1 || true)
fi
INSTALLED_KPKGS=$(dpkg-query -W -f='${Package}\n' 'linux-image-[0-9]*-amd64' 2>/dev/null | sort -V || true)
KPKG_COUNT=$(printf '%s\n' "$INSTALLED_KPKGS" | sed '/^$/d' | wc -l)
if [ "$KPKG_COUNT" -gt 1 ] && [ -n "$LATEST_KPKG" ]; then
    OLD_KPKGS=$(printf '%s\n' "$INSTALLED_KPKGS" | grep -vxF "$LATEST_KPKG" || true)
    if [ -n "$OLD_KPKGS" ]; then
        echo "[TEMİZLİK] Eski çekirdek paketleri kaldırılıyor: $OLD_KPKGS (korunan: $LATEST_KPKG)"
        apt-get purge -y $OLD_KPKGS || true
    fi
fi
apt-get autoremove --purge -y || true

# Son temizlik
apt-get clean
rm -rf /var/lib/apt/lists/*

echo "[ALAN RAPORU] Tüm paketler kurulduktan sonra:"
df -h / || true

# -----------------------------------------------------------------------
# Yerel ayarlar (Türkçe & UTF-8 desteği)
# Canlı çekirdek komut satırı da locales=tr_TR.UTF-8 + keyboard-layouts=tr
# taşır (aşağıda isolinux/grub APPEND satırları); burası kurulu sisteme
# ve konsola UTF-8 klavye/font mirası bırakır.
# -----------------------------------------------------------------------
echo "tr_TR.UTF-8 UTF-8" > /etc/locale.gen
echo "en_US.UTF-8 UTF-8" >> /etc/locale.gen
locale-gen
update-locale LANG=tr_TR.UTF-8 LANGUAGE=tr_TR:tr LC_ALL=tr_TR.UTF-8

# Saat dilimi: canlı sistem Europe/Istanbul ile açılır. SysVinit'te
# systemd-timesyncd yoktur; chrony açılışta saati internetten düzeltir.
# (Donanım saati UTC varsayılır; /etc/default/rcS içinde UTC=yes.)
echo "Europe/Istanbul" > /etc/timezone
ln -sf /usr/share/zoneinfo/Europe/Istanbul /etc/localtime
DEBIAN_FRONTEND=noninteractive dpkg-reconfigure -f noninteractive tzdata 2>/dev/null || true
update-rc.d chrony defaults 2>/dev/null || update-rc.d chronyd defaults 2>/dev/null || true

# Konsol ve X11 Türkçe Q klavye + UTF-8 font (boot'taki bozuk karakterlerin
# sistem tarafındaki karşılığı). live-config çekirdek parametresindeki
# keyboard-layouts=tr değerini okuyup aynısını uygular.
mkdir -p /etc/default
cat << 'KBD' > /etc/default/keyboard
XKBMODEL="pc105"
XKBLAYOUT="tr"
XKBVARIANT=""
XKBOPTIONS=""
BACKSPACE="guess"
KBD
cat << 'CONSOLE' > /etc/default/console-setup
CODESET="Lat15"
FONTFACE="VGA"
FONTSIZE="16"
VIDEOMODE=""
CHARMAP="UTF-8"
CONSOLE

# -----------------------------------------------------------------------
# Canlı Oturum Kullanıcısı: ankora
# -----------------------------------------------------------------------
for grp in sudo audio video plugdev netdev lp scanner; do
    getent group "$grp" >/dev/null || groupadd -r "$grp" 2>/dev/null || true
done

if ! id -u ankora &>/dev/null; then
    useradd -m -s /bin/bash -u 1000 -G sudo,audio,video,plugdev,netdev,lp,scanner ankora
else
    usermod -aG sudo,audio,video,plugdev,netdev,lp,scanner ankora 2>/dev/null || true
fi

# Root hesabı doğrudan girişlere kilitlenir
passwd -l root 2>/dev/null || true

# Canlı kullanıcı 'ankora' için varsayılan parola: ankora
echo "ankora:ankora" | chpasswd
passwd -u ankora 2>/dev/null || true

# Canlı oturum: parolasız tam sudo. Eski izin listesi tee/chroot/mount
# içerdiği için zaten root'a eşdeğerdi, ama kurucunun ihtiyaç duyduğu
# mkdir/sh/chmod/cp/blkid/rm komutlarını engelleyip kurulumu kırıyordu.
# Bu dosya yalnızca canlı ortamda geçerlidir; kurucu hedef sistemden siler.
cat << 'SUDO' > /etc/sudoers.d/ankora
ankora ALL=(ALL:ALL) NOPASSWD: ALL
SUDO
chmod 0440 /etc/sudoers.d/ankora

# WebKitGTK sandbox ve tarayıcı süreçleri için yetkisiz kullanıcı ad alanları (userns)
mkdir -p /etc/sysctl.d
echo "kernel.unprivileged_userns_clone = 1" > /etc/sysctl.d/99-userns.conf

# Ankora korumalı sistem durum ve kilit dizini (/var/lib/ankora)
mkdir -p /var/lib/ankora
chown ankora:ankora /var/lib/ankora 2>/dev/null || true
chmod 0750 /var/lib/ankora

# Hostname
echo "ankora-live" > /etc/hostname

# Xorg Kullanıcı Hakları (xserver-xorg-legacy ile ankora kullanıcısının startx çalıştırma izni)
mkdir -p /etc/X11
cat << 'XWRAP' > /etc/X11/Xwrapper.config
allowed_users=anybody
needs_root_rights=yes
XWRAP
chmod 0644 /etc/X11/Xwrapper.config

# Ağ Yapılandırması: Loopback arabirimi
mkdir -p /etc/network
cat << 'NETIF' > /etc/network/interfaces
auto lo
iface lo inet loopback

allow-hotplug eth0
iface eth0 inet dhcp
NETIF

# ----------------------------------------------------------------------
# Ağ: Fiziksel arayüzler için DHCP istemcisi (SysVinit)
# /etc/network/interfaces eth0 adını sabit yazar; gerçek arayüz adı
# enp1s0 / ens33 gibi bir değerse ifupdown hiç devreye girmez ve canlı
# sistemde bağlantı hiç kurulmaz. ayaz-net adı değil /sys/class/net/*
# altındaki aygıt kökünü (device) esas alır, her fiziksel arayüz için
# ayrı dhclient başlatır. Chroot-setup.sh içinde çalışıldığı için hem
# betik yazımı hem de update-rc.d doğrudan chroot dosya sisteminde yapılır.
# ----------------------------------------------------------------------
mkdir -p /etc/init.d /run /var/lib/dhcp
cat << 'AYAZNET' > /etc/init.d/ayaz-net
#!/bin/sh
### BEGIN INIT INFO
# Provides:          ayaz-net
# Required-Start:    $network $remote_fs
# Required-Stop:     $network $remote_fs
# Default-Start:     2 3 4 5
# Default-Stop:      0 1 6
# Short-Description: Fiziksel ethernet arayüzleri için DHCP
# Description:       Fiziksel kablolu arayüzleri ayağa kaldırır ve her biri
#                    için ayrı bir dhclient süreci başlatır.
### END INIT INFO
# chkconfig: 2345 90 10
#
# Canlı ISO'da arayüz adı eth0 olmak zorunda değildir (enp1s0, ens33...).

PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
RUNDIR=/run
LEASEDIR=/var/lib/dhcp

# Kablosuz, konteyner ve türetilmiş arayüzler dışarıda bırakılır:
# onların bağlantısını wpa_supplicant / docker / vpn kendi üstlenir.
skip_iface() {
    case "$1" in
        lo|wlan*|wlx*|docker*|veth*|tun*|tap*|wg*|tailscale*) return 0 ;;
    esac
    return 1
}

start_iface() {
    name="$1"
    # Aynı arayüz için çalışan bir dhclient varsa ikincisi IP'yi paylaşamaz
    if [ -f "$RUNDIR/dhclient.$name.pid" ] && \
       kill -0 "$(cat "$RUNDIR/dhclient.$name.pid" 2>/dev/null)" 2>/dev/null; then
        return 0
    fi
    ip link set "$name" up 2>/dev/null || ifconfig "$name" up 2>/dev/null || true
    dhclient -nw -pf "$RUNDIR/dhclient.$name.pid" \
             -lf "$LEASEDIR/dhclient.$name.lease" "$name" >/dev/null 2>&1 || true
}

do_start() {
    mkdir -p "$RUNDIR" "$LEASEDIR"
    for path in /sys/class/net/*; do
        [ -e "$path" ] || continue
        name="${path##*/}"
        skip_iface "$name" && continue
        # Yalnız fiziksel arayüzlerin altında device kökü vardır
        [ -d "$path/device" ] || continue
        start_iface "$name"
    done
    return 0
}

do_stop() {
    for pf in "$RUNDIR"/dhclient.*.pid; do
        [ -f "$pf" ] || continue
        pid="$(cat "$pf" 2>/dev/null)"
        [ -n "$pid" ] && kill "$pid" 2>/dev/null
        rm -f "$pf"
    done
    return 0
}

case "$1" in
    start)
        do_start
        ;;
    stop)
        do_stop
        ;;
    restart|force-reload)
        do_stop
        do_start
        ;;
    status)
        # LSB: 0 çalışır, 3 çalışmıyor
        alive=3
        for pf in "$RUNDIR"/dhclient.*.pid; do
            [ -f "$pf" ] || continue
            if kill -0 "$(cat "$pf" 2>/dev/null)" 2>/dev/null; then
                alive=0
            fi
        done
        exit "$alive"
        ;;
    *)
        echo "Kullanım: $0 {start|stop|restart|status}" >&2
        exit 1
        ;;
esac
exit 0
AYAZNET
chmod +x /etc/init.d/ayaz-net

# LSB başlığındaki Default-Start: 2 3 4 5 dizilimi rc2..rc5'te başlatma
# bağlantılarını kurar. insserv $network tesisatını bulamazsa betiği
# reddedebiliyor; böyle durumda bağlantılar elle kurulur (DHCP'siz kalmak
# canlı sistemde bağlantı yok demektir).
if ! update-rc.d ayaz-net defaults; then
    for rl in 2 3 4 5; do
        ln -sf ../init.d/ayaz-net "/etc/rc$rl.d/S01ayaz-net"
    done
    for rl in 0 1 6; do
        ln -sf ../init.d/ayaz-net "/etc/rc$rl.d/K01ayaz-net"
    done
fi
# ifupdown kuruluysa kendi betiği de devreye girsin (varsa)
if [ -f /etc/init.d/networking ]; then
    update-rc.d networking defaults 2>/dev/null || true
fi

# -----------------------------------------------------------------------
# Ağ Yönetimi Servisleri (SysVinit Etkinleştirme)
# -----------------------------------------------------------------------
# NetworkManager kurulur ama SysVinit kurallarına bağlanmazsa canlı
# oturumda hiç başlamaz: Ayaz'daki nmcli tabanlı Wi-Fi taraması
# "NetworkManager (nmcli) kurulu olmalı" hatası verir ve ağ kartları
# görünmez. dbus iş istasyonu servisi de NM'nin ön koşuludur.
if [ -f /etc/init.d/dbus ]; then
    update-rc.d dbus defaults 2>/dev/null || true
fi
if [ -f /etc/init.d/network-manager ]; then
    update-rc.d network-manager defaults 2>/dev/null || true
fi
if [ -f /etc/init.d/cups ]; then
    update-rc.d cups defaults 2>/dev/null || true
fi
if [ -f /etc/init.d/bluetooth ]; then
    update-rc.d bluetooth defaults 2>/dev/null || true
fi
# D-Bus başlamazsa NM de başlamaz; dbus init betiği $network tesisatına
# bağlantı bile olmadan kendi saatini bekler, bu yüzden düz kademe yeterli.

# -----------------------------------------------------------------------
# ZRAM: Sıkıştırılmış RAM Takas Alanı (SysVinit Servisi & Optimizasyon)
# -----------------------------------------------------------------------
cat << 'ZRAMINIT' > /etc/init.d/zram-swap
#!/bin/sh
### BEGIN INIT INFO
# Provides:          zram-swap
# Required-Start:    $local_fs
# Required-Stop:     $local_fs
# Default-Start:     2 3 4 5
# Default-Stop:      0 1 6
# Short-Description: ZRAM Sıkıştırılmış RAM Takas Alanı
### END INIT INFO

case "$1" in
  start)
    modprobe zram num_devices=1 2>/dev/null || true
    if [ -e /dev/zram0 ]; then
      for alg in zstd lz4 lzo; do
        if grep -q "$alg" /sys/block/zram0/comp_algorithm 2>/dev/null; then
          echo "$alg" > /sys/block/zram0/comp_algorithm 2>/dev/null && break
        fi
      done
      MEM_TOTAL_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}')
      if [ -n "$MEM_TOTAL_KB" ] && [ "$MEM_TOTAL_KB" -gt 0 ] 2>/dev/null; then
        DISKSIZE=$(( MEM_TOTAL_KB * 1024 / 2 ))
      else
        DISKSIZE=1073741824
      fi
      echo "$DISKSIZE" > /sys/block/zram0/disksize 2>/dev/null || true
      mkswap /dev/zram0 >/dev/null 2>&1 || true
      swapon -p 100 /dev/zram0 2>/dev/null || true
      echo "[ZRAM] Sıkıştırılmış bellek takas alanı aktif: $(( DISKSIZE / 1024 / 1024 )) MB"
    fi
    ;;
  stop)
    swapoff /dev/zram0 2>/dev/null || true
    echo 1 > /sys/block/zram0/reset 2>/dev/null || true
    ;;
  restart|force-reload)
    "$0" stop
    "$0" start
    ;;
  status)
    swapon -s 2>/dev/null | grep zram || echo "zram aktif değil"
    ;;
  *)
    echo "Kullanım: $0 {start|stop|restart|status}" >&2
    exit 1
    ;;
esac
exit 0
ZRAMINIT
chmod +x /etc/init.d/zram-swap
update-rc.d zram-swap defaults 05 95 2>/dev/null || true

# SysVinit Hızlı Paralel Açılış (Fast Parallel Boot)
mkdir -p /etc/default
cat << 'RCS_CONF' > /etc/default/rcS
# Ankora Linux 3.5 Hızlı Paralel Açılış
CONCURRENCY=makefile
UTC=yes
VERBOSE=no
FSCKFIX=no
RCS_CONF

# Kernel ZRAM bellek optimizasyonları (Ultra-Low RAM hedefi)
mkdir -p /etc/sysctl.d
cat << 'SYSCTL_ZRAM' > /etc/sysctl.d/99-zram.conf
vm.swappiness = 100
vm.page-cluster = 0
vm.vfs_cache_pressure = 150
vm.watermark_boost_factor = 0
vm.dirty_background_ratio = 5
vm.dirty_ratio = 10
SYSCTL_ZRAM

# -----------------------------------------------------------------------
# X11 Otomatik Kiosk Başlatıcı
# -----------------------------------------------------------------------
install -m 0755 /.ankora-xinitrc /home/ankora/.xinitrc
chmod +x /home/ankora/.xinitrc
cp /home/ankora/.xinitrc /etc/skel/.xinitrc

# SysVinit Otomatik Giriş (Getty inittab)
mkdir -p /etc/inittab.d
if [ ! -f /etc/inittab ] && [ -f /usr/share/sysvinit/inittab ]; then
    cp /usr/share/sysvinit/inittab /etc/inittab
fi
if [ -f /etc/inittab ]; then
    if grep -q "tty1" /etc/inittab; then
        # --noclear kullanılmaz: plymouth sonrası konsolda kalan boot
        # metinleri (servis hataları) otomatik girişte temizlenir.
        sed -i -E 's|^[0-9a-zA-Z]+:([0-9]+):respawn:/sbin/getty.*tty1.*|1:\1:respawn:/sbin/getty --autologin ankora 38400 tty1 linux|' /etc/inittab
    else
        echo "1:2345:respawn:/sbin/getty --autologin ankora 38400 tty1 linux" >> /etc/inittab
    fi
fi

# TTY1 Girişinde startx Başlatma
# -keeptty kullanılmaz: VT değiştirmeyi engelliyordu, siyah ekranda kalan
# kullanıcı Ctrl+Alt+F2 ile konsola geçemiyordu.
cat << 'PROFILE' >> /home/ankora/.profile
if [ -z "$DISPLAY" ] && [ "$(tty 2>/dev/null)" = "/dev/tty1" ]; then
    if [ -e /tmp/ankora-desktop-failed ]; then
        echo "Masaüstü önceki denemede başlatılamadı. Günlük: /tmp/ayaz.log"
        echo "Yeniden denemek için: rm /tmp/ankora-desktop-failed && startx"
    else
        # Açılış ekranından X'e geçiş: startx öncesinde plymouth'un DRM/KMS
        # ve konsol kilidini bırakması zorunludur. Aksi halde Xorg DRM master
        # alamaz (EBUSY/EACCES) ve .xinitrc çalışmadan düşer.
        if command -v plymouth >/dev/null 2>&1 && plymouth --ping >/dev/null 2>&1; then
            plymouth quit 2>/dev/null || sudo plymouth quit 2>/dev/null || true
        fi
        exec startx > ~/.xsession-errors 2>&1
    fi
fi
PROFILE
chown -R ankora:ankora /home/ankora
cp /home/ankora/.profile /etc/skel/.profile

# -----------------------------------------------------------------------
# INITRAMFS GÜNCELLEMESİ — live-boot modüllerinin initrd'ye eklenmesi
# Bu adım olmazsa ISO boot sırasında root dosya sistemi bulunamaz!
# squashfs/loop/iso9660 çekirdekte gömülü değildir; initrd'ye zorlanır.
# Aksi halde açılış "Unable to find a medium containing a live file
# system" hatasıyla kernel panic'e düşer.
# -----------------------------------------------------------------------
echo "[KRİTİK] initramfs güncelleniyor (live-boot modülleri enjekte ediliyor)..."
mkdir -p /etc/initramfs-tools
for _mod in overlay squashfs loop iso9660 sr_mod sd_mod usb_storage uhci_hcd ohci_hcd ehci_hcd xhci_hcd; do
    grep -qx "$_mod" /etc/initramfs-tools/modules 2>/dev/null || echo "$_mod" >> /etc/initramfs-tools/modules
done
unset _mod
# İnce (modüler) initramfs yerine tam donanım kapsama: farklı makinelerde
# disk/usb denetçisi bulunamazsa panic kaçınılmaz olur.
if grep -q '^MODULES=' /etc/initramfs-tools/initramfs.conf 2>/dev/null; then
    sed -i 's/^MODULES=.*/MODULES=most/' /etc/initramfs-tools/initramfs.conf
else
    echo "MODULES=most" >> /etc/initramfs-tools/initramfs.conf
fi
update-initramfs -u -k all

# Canlı imaj için resmi kaynak listesi
cat << 'SOURCES' > /etc/apt/sources.list
deb https://deb.devuan.org/merged excalibur main contrib non-free non-free-firmware
deb https://deb.devuan.org/merged excalibur-security main contrib non-free non-free-firmware
deb https://deb.devuan.org/merged excalibur-updates main contrib non-free non-free-firmware
SOURCES

# Son temizlik
apt-get clean
rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Gereksiz doc, man, locale dosyalarını temizle
rm -rf /usr/share/doc/* /usr/share/man/* /usr/share/info/* 2>/dev/null || true
rm -rf /usr/share/lintian/* /usr/share/linda/* 2>/dev/null || true

echo "[ALAN RAPORU] Son durum:"
df -h / || true
du -sh / 2>/dev/null || true
EOF

chmod +x "$CHROOT_DIR/chroot-setup.sh"
# .xinitrc tek kaynaktan gelir: depodaki scripts/xinitrc chroot icine kopyalanir.
cp -f "$ROOT_DIR/scripts/xinitrc" "$CHROOT_DIR/.ankora-xinitrc"
chroot "$CHROOT_DIR" /chroot-setup.sh
rm -f "$CHROOT_DIR/chroot-setup.sh" "$CHROOT_DIR/.ankora-xinitrc"

# 6.b Örnek belgeler: canlı oturum ankora ile çalışır, /root/Belgeler'e
# erişemez. Ofis ve Dosyalar GERÇEK açılan dosyalar göstermeli; PDF
# içeriğinin tek doğruluk kaynağı src/app.js'teki yerleşik base64 gömülüdür.
BDIR="$CHROOT_DIR/home/ankora/Belgeler"
mkdir -p "$BDIR"
_src_app_js="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)/src/app.js"
if [ -f "$_src_app_js" ]; then
    sed -n "s/.*base64,\([A-Za-z0-9+/=]\{50,\}\).*/\1/p" "$_src_app_js" \
        | head -n 1 | base64 -d > "$BDIR/ankora-sistem-rehberi.pdf" 2>/dev/null || true
fi
if grep -q '%PDF' "$BDIR/ankora-sistem-rehberi.pdf" 2>/dev/null; then
    echo "[BELGE] ankora-sistem-rehberi.pdf yazildi ($(stat -c%s "$BDIR/ankora-sistem-rehberi.pdf") bayt)"
else
    echo "[BELGE] UYARI: PDF olusturulamadi — $_src_app_js kontrol edin"
    # Bozuk 0 baytlık kalıntı Ofis/Dosyalar listesinde kırık dosya gösterir; kaldırılır.
    rm -f "$BDIR/ankora-sistem-rehberi.pdf"
fi
cat << 'KIOSKTXT' > "$BDIR/kiosk-ayarlari.txt"
Ankora Linux 4.7.0 — Kiosk Yapılandırma Raporu
=============================================

Taban            : Devuan GNU/Linux 6 (excalibur)
Init sistemi     : SysVinit (systemd yok)
Çekirdek         : Linux 6.12 LTS
Masaüstü         : Ayaz DE (Ayaz · Ankora Linux)
Pencere motoru   : Tauri 2 + WebKitGTK 4.1
Otomatik giriş   : tty1 getty --autologin ankora → startx
Ekran düzeltmesi : Yalnızca çözünürlük çok düşükse xrandr -s 1280x800
Paket yöneticisi : Yazılım Mağazası (apt tabanlı)

Bu dosya Ayaz Dosyalar ve Ofis uygulamalarından açılabilir.
Kiosk kilit ekranı ve widget ayarları Ayarlar penceresinden yönetilir.
KIOSKTXT
cat << 'KIOSKMD' > "$BDIR/kiosk-ayarlari.md"
# Ankora Linux 4.7.0 — Kiosk Yapılandırma Raporu

- Taban: Devuan 6 Excalibur (SysVinit, systemd-free)
- Çekirdek: Linux 6.12 LTS
- Pencere motoru: Tauri 2 + WebKitGTK 4.1
- Otomatik giriş: tty1 getty --autologin ankora → startx
- Ekran: xrandr donanım kontrolü, yalnız düşük çözünürlükte düzeltme
- Bellek: ZRAM + disk swap hiyerarşisi

Bu belge Ayaz Ofis yerel belge işleyicisi tarafından render edilir.
KIOSKMD
# Sayısal chown: betik host'ta koşuyor, host'ta "ankora" kullanıcı adı
# yok (set -euo pipefail ad-üstü chown'u öldürürdü). Canlı sistemde
# ankora = uid/gid 1000 (e2e --userspec=1000:1000 ile doğrulandı).
chown -R 1000:1000 "$BDIR"
echo "[BELGE] Belgeler/ icerigi: $(ls "$BDIR" | tr '\n' ' ')"

# 6.c Türkçe XDG klasörleri: dosya yöneticisi, Başlat menüsü ve Ofis bu
# adları bekler; oluşturulmazsa kullanıcı kendi evinde boş kalır. Aynı
# içerik skel'e de konur ki kurulumdan sonraki kullanıcılar da alsın.
# Sayısal chown: betik host'ta koşuyor, host'ta "ankora" kullanıcı adı yok
# (set -euo pipefail ad-üstü chown'u öldürürdü); canlı sistemde uid/gid 1000.
XDG_HOME="$CHROOT_DIR/home/ankora"
for xdg_d in Masaüstü İndirilenler Belgeler Müzik Resimler Videolar; do
    mkdir -p "$XDG_HOME/$xdg_d"
done
mkdir -p "$XDG_HOME/.config"
cat << 'USERDIRS' > "$XDG_HOME/.config/user-dirs.dirs"
XDG_DESKTOP_DIR="$HOME/Masaüstü"
XDG_DOWNLOAD_DIR="$HOME/İndirilenler"
XDG_DOCUMENTS_DIR="$HOME/Belgeler"
XDG_MUSIC_DIR="$HOME/Müzik"
XDG_PICTURES_DIR="$HOME/Resimler"
XDG_VIDEOS_DIR="$HOME/Videolar"
USERDIRS
cat << 'MIME_USER' > "$XDG_HOME/.config/mimeapps.list"
[Default Applications]
x-scheme-handler/http=brave-browser.desktop
x-scheme-handler/https=brave-browser.desktop
text/html=brave-browser.desktop
application/xhtml+xml=brave-browser.desktop
MIME_USER
mkdir -p "$CHROOT_DIR/etc/skel/.config"
cp "$XDG_HOME/.config/mimeapps.list" "$CHROOT_DIR/etc/skel/.config/mimeapps.list"
for xdg_d in Masaüstü İndirilenler Belgeler Müzik Resimler Videolar; do
    mkdir -p "$CHROOT_DIR/etc/skel/$xdg_d"
done
cp "$XDG_HOME/.config/user-dirs.dirs" "$CHROOT_DIR/etc/skel/.config/user-dirs.dirs"
chown -R 1000:1000 "$XDG_HOME/.config" \
    "$XDG_HOME/Masaüstü" "$XDG_HOME/İndirilenler" "$XDG_HOME/Belgeler" \
    "$XDG_HOME/Müzik" "$XDG_HOME/Resimler" "$XDG_HOME/Videolar"
echo "[XDG] Türkçe klasörler: $(ls "$XDG_HOME" | tr '\n' ' ')"

# 7. Ayaz DE Paketinin Sisteme Enjekte Edilmesi
echo "[4/8] Ayaz DE ikili dosyası ve sistem bileşenleri sisteme kopyalanıyor..."
# Eğer dist altında deb yoksa ve host ortamında cargo/npm mevcutsa otomatik derle
if [ ! -f "$ROOT_DIR/dist/ayaz-de-latest-amd64.deb" ] && [ ! -f "$ROOT_DIR/src-tauri/target/release/ayaz-de" ]; then
    echo "[BİLGİ] Ayaz DE paketi bulunamadı, host ortamında derleme başlatılıyor..."
    if command -v cargo &>/dev/null && command -v npm &>/dev/null; then
        bash "$ROOT_DIR/scripts/package-deb.sh" || echo "[UYARI] Paketleme tamamlanamadı, mevcut dosyalarla devam ediliyor..."
    fi
fi

# Arayüz web bileşenlerini her zaman /usr/share/ayaz altına aktar
mkdir -p "$CHROOT_DIR/usr/share/ayaz"
cp -r "$ROOT_DIR/src/"* "$CHROOT_DIR/usr/share/ayaz/"

# .deb varsa kur (güncelleyici paket kimliği + ayaz-de ikilisi için)
if [ -f "$ROOT_DIR/dist/ayaz-de-latest-amd64.deb" ]; then
    DEB_PATH="$ROOT_DIR/dist/ayaz-de-latest-amd64.deb"
    if [ "$ROOT_DIR/src" -nt "$DEB_PATH" ] || [ "$ROOT_DIR/src-tauri/src" -nt "$DEB_PATH" ] || [ "$ROOT_DIR/src-tauri/tauri.conf.json" -nt "$DEB_PATH" ]; then
        echo "[UYARI] dist/ayaz-de-latest-amd64.deb kaynaktan eski; yeniden derleniyor..."
        bash "$ROOT_DIR/scripts/package-deb.sh" || echo "[UYARI] Yeniden derleme basarisiz, mevcut .deb ile devam ediliyor..."
    fi
    echo "[BİLGİ] Önceden derlenmiş Ayaz DE .deb paketi kuruluyor..."
    cp "$ROOT_DIR/dist/ayaz-de-latest-amd64.deb" "$CHROOT_DIR/tmp/ayaz.deb"
    chroot "$CHROOT_DIR" bash -c "dpkg -i /tmp/ayaz.deb || apt-get install -f -y; rm -f /tmp/ayaz.deb"
fi
# Tek Masaüstü İkilisi (P0 #1 / P2): Tüm oturum /usr/bin/ayaz-de (Tauri 2) üzerinden çalışır.
if [ ! -x "$CHROOT_DIR/usr/bin/ayaz-de" ] && [ -x "$ROOT_DIR/src-tauri/target/release/ayaz-de" ]; then
    install -m 0755 "$ROOT_DIR/src-tauri/target/release/ayaz-de" "$CHROOT_DIR/usr/bin/ayaz-de"
fi
if [ ! -x "$CHROOT_DIR/usr/bin/ayaz-de" ]; then
    echo "[HATA] /usr/bin/ayaz-de ikilisi chroot içinde bulunamadı! Önce package-deb.sh ile derleyin." >&2
    exit 2
fi
ln -sf /usr/bin/ayaz-de "$CHROOT_DIR/usr/bin/ayaz"
mkdir -p "$CHROOT_DIR/etc/ankora"
printf '%s\n' "$AYAZ_VERSION" > "$CHROOT_DIR/etc/ankora/version"
chmod 0644 "$CHROOT_DIR/etc/ankora/version"

# XDG ve Desktop Entegrasyonu
mkdir -p "$CHROOT_DIR/etc/xdg/openbox" "$CHROOT_DIR/usr/share/ayaz" "$CHROOT_DIR/etc/skel/.config/openbox" "$CHROOT_DIR/home/ankora/.config/openbox"
cp "$ROOT_DIR/scripts/openbox-rc.xml" "$CHROOT_DIR/etc/xdg/openbox/rc.xml" || true
# Ankora önyükleyici ve açılış temaları (canlı sistem + kurulum hedefi için
# /usr/share/ayaz altında; kurulum aracı buradan /target altına taşır).
mkdir -p "$CHROOT_DIR/usr/share/ayaz/grub-theme-ankora" "$CHROOT_DIR/usr/share/ayaz/plymouth-theme-ankora"
cp "$ROOT_DIR/scripts/grub-theme-ankora/theme.txt" "$CHROOT_DIR/usr/share/ayaz/grub-theme-ankora/theme.txt" || true
cp "$ROOT_DIR/scripts/ankora-grub-default" "$CHROOT_DIR/usr/share/ayaz/ankora-grub-default" || true
cp "$ROOT_DIR/scripts/plymouth-theme-ankora/ankora.plymouth" "$CHROOT_DIR/usr/share/ayaz/plymouth-theme-ankora/ankora.plymouth" || true
cp "$ROOT_DIR/scripts/plymouth-theme-ankora/ankora.script" "$CHROOT_DIR/usr/share/ayaz/plymouth-theme-ankora/ankora.script" || true
# Canlı sistemin kendi açılış teması da Ankora olur (plymouth varsa).
mkdir -p "$CHROOT_DIR/usr/share/plymouth/themes/ankora"
cp "$ROOT_DIR/scripts/plymouth-theme-ankora/ankora.plymouth" "$CHROOT_DIR/usr/share/plymouth/themes/ankora/ankora.plymouth" || true
cp "$ROOT_DIR/scripts/plymouth-theme-ankora/ankora.script" "$CHROOT_DIR/usr/share/plymouth/themes/ankora/ankora.script" || true
if chroot "$CHROOT_DIR" plymouth-set-default-theme -R ankora 2>"$WORK_DIR/plymouth-theme.log"; then
    echo "[OK] Plymouth teması: ankora"
else
    echo "[UYARI] plymouth-set-default-theme başarısız, ayrıntı: $WORK_DIR/plymouth-theme.log" >&2
    chroot "$CHROOT_DIR" plymouth-set-default-theme ankora 2>/dev/null || true
    chroot "$CHROOT_DIR" update-initramfs -u -k all 2>/dev/null || true
fi
# Faz tahta dokunmatik sürücüsü (varsayılan): ETA yardımcısı + udev + Xorg.
cp "$ROOT_DIR/scripts/eta-touchdrv" "$CHROOT_DIR/usr/bin/eta-touchdrv" || true
chmod +x "$CHROOT_DIR/usr/bin/eta-touchdrv" || true
mkdir -p "$CHROOT_DIR/usr/share/applications" "$CHROOT_DIR/usr/share/ayaz"
cp "$ROOT_DIR/scripts/eta-touchdrv.desktop" "$CHROOT_DIR/usr/share/applications/eta-touchdrv.desktop" || true
cp "$ROOT_DIR/scripts/eta-touchdrv" "$CHROOT_DIR/usr/share/ayaz/eta-touchdrv" || true
# FairyWren ikon setinin Ayaz seçkisi: tam set 54 MB olduğu için seçki
# depoyla gelir, devralma zinciri Papirus'a bağlanır (paket yukarıda kurulur).
if [ -d "$ROOT_DIR/third_party/fairywren/FairyWren_Ayaz" ]; then
    mkdir -p "$CHROOT_DIR/usr/share/icons"
    cp -r "$ROOT_DIR/third_party/fairywren/FairyWren_Ayaz" "$CHROOT_DIR/usr/share/icons/" || true
    chroot "$CHROOT_DIR" gtk-update-icon-cache -f /usr/share/icons/FairyWren_Ayaz 2>/dev/null || true
    echo "[OK] İkon teması: FairyWren_Ayaz"
else
    echo "[UYARI] third_party/fairywren yok; yedek ikon teması Papirus kalır" >&2
fi
if [ -d "$ROOT_DIR/third_party/fatih-kalem" ]; then
    echo "[BİLGİ] Fatih Kalem akıllı tahta uygulaması chroot içine kuruluyor..."
    make -C "$ROOT_DIR/third_party/fatih-kalem" install DESTDIR="$CHROOT_DIR" PREFIX=/usr || true
    echo "[OK] Fatih Kalem /usr/share/fatih-kalem ve /usr/bin/fatih-kalem altına kuruldu"
fi
mkdir -p "$CHROOT_DIR/lib/udev/rules.d"
cp "$ROOT_DIR/scripts/99-faz-touch.rules" "$CHROOT_DIR/lib/udev/rules.d/99-faz-touch.rules" || true
mkdir -p "$CHROOT_DIR/usr/share/X11/xorg.conf.d" "$CHROOT_DIR/etc/X11/xorg.conf.d"
cp "$ROOT_DIR/scripts/99-faz-touch.conf" "$CHROOT_DIR/usr/share/X11/xorg.conf.d/99-faz-touch.conf" || true
cp "$ROOT_DIR/scripts/openbox-rc.xml" "$CHROOT_DIR/usr/share/ayaz/openbox-rc.xml" || true
cp "$ROOT_DIR/scripts/openbox-rc.xml" "$CHROOT_DIR/etc/skel/.config/openbox/rc.xml" || true
cp "$ROOT_DIR/scripts/openbox-rc.xml" "$CHROOT_DIR/home/ankora/.config/openbox/rc.xml" || true
chown -R 1000:1000 "$CHROOT_DIR/home/ankora/.config" 2>/dev/null || true

cp "$ROOT_DIR/scripts/ayaz-ctl" "$CHROOT_DIR/usr/bin/ayaz-ctl" || true
chmod +x "$CHROOT_DIR/usr/bin/ayaz-ctl" || true
cp "$ROOT_DIR/scripts/ayaz-session" "$CHROOT_DIR/usr/bin/ayaz-session" || true
chmod +x "$CHROOT_DIR/usr/bin/ayaz-session" || true

cp "$ROOT_DIR/scripts/ayaz.desktop" "$CHROOT_DIR/usr/share/applications/ayaz.desktop" || true
cp "$ROOT_DIR/scripts/ayaz-session.desktop" "$CHROOT_DIR/usr/share/xsessions/ayaz.desktop" || true
cp "$ROOT_DIR/scripts/ayaz-update-helper.sh" "$CHROOT_DIR/usr/local/bin/ayaz-update-helper" || true
chmod 0755 "$CHROOT_DIR/usr/local/bin/ayaz-update-helper" || true
chown root:root "$CHROOT_DIR/usr/local/bin/ayaz-update-helper" 2>/dev/null || true

cp "$ROOT_DIR/scripts/ayaz-pkg-helper.sh" "$CHROOT_DIR/usr/local/bin/ayaz-pkg-helper" || true
chmod 0755 "$CHROOT_DIR/usr/local/bin/ayaz-pkg-helper" || true
chown root:root "$CHROOT_DIR/usr/local/bin/ayaz-pkg-helper" 2>/dev/null || true

cp "$ROOT_DIR/scripts/ankora-doctor.sh" "$CHROOT_DIR/usr/local/bin/ankora-doctor" || true
chmod 0755 "$CHROOT_DIR/usr/local/bin/ankora-doctor" || true
chown root:root "$CHROOT_DIR/usr/local/bin/ankora-doctor" 2>/dev/null || true

cp "$ROOT_DIR/scripts/ankora-ollama-install.sh" "$CHROOT_DIR/usr/local/bin/ankora-ollama-install" || true
chmod 0755 "$CHROOT_DIR/usr/local/bin/ankora-ollama-install" || true
chown root:root "$CHROOT_DIR/usr/local/bin/ankora-ollama-install" 2>/dev/null || true

cp "$ROOT_DIR/scripts/ankora-updater-sudoers" "$CHROOT_DIR/etc/sudoers.d/ankora-updater" || true
sed -i 's/\r$//' "$CHROOT_DIR/etc/sudoers.d/ankora-updater" 2>/dev/null || true
chmod 0440 "$CHROOT_DIR/etc/sudoers.d/ankora-updater" || true
chown root:root "$CHROOT_DIR/etc/sudoers.d/ankora-updater" 2>/dev/null || true

if command -v visudo >/dev/null 2>&1; then
    visudo -cf "$CHROOT_DIR/etc/sudoers.d/ankora-updater" || {
        echo "[HATA] Sudoers kural doğrulama hatası!" >&2
        exit 1
    }
fi

# Masaüstü ve Sistem Marka İkonlarını Yerleştir
mkdir -p "$CHROOT_DIR/usr/share/pixmaps" "$CHROOT_DIR/usr/share/icons/hicolor/512x512/apps" "$CHROOT_DIR/usr/share/icons/hicolor/scalable/apps"
cp "$ROOT_DIR/assets/logo.png" "$CHROOT_DIR/usr/share/pixmaps/ayaz.png" 2>/dev/null || true
cp "$ROOT_DIR/assets/logo.png" "$CHROOT_DIR/usr/share/pixmaps/ankora.png" 2>/dev/null || true
cp "$ROOT_DIR/assets/logo.png" "$CHROOT_DIR/usr/share/icons/hicolor/512x512/apps/ayaz.png" 2>/dev/null || true
cp "$ROOT_DIR/assets/logo.svg" "$CHROOT_DIR/usr/share/icons/hicolor/scalable/apps/ayaz.svg" 2>/dev/null || true

# Windows CRLF → Unix LF dönüşümü (sudoers \r görürse syntax error verir)
echo "[BİLGİ] Windows satır sonları (CRLF) temizleniyor..."
for f in \
    "$CHROOT_DIR/etc/sudoers.d/ankora-updater" \
    "$CHROOT_DIR/etc/sudoers.d/ankora" \
    "$CHROOT_DIR/etc/inittab" \
    "$CHROOT_DIR/etc/X11/Xwrapper.config" \
    "$CHROOT_DIR/usr/local/bin/ayaz-update-helper" \
    "$CHROOT_DIR/usr/local/bin/ayaz-pkg-helper" \
    "$CHROOT_DIR/usr/local/bin/ankora-doctor" \
    "$CHROOT_DIR/usr/local/bin/ankora-ollama-install" \
    "$CHROOT_DIR/usr/bin/ayaz-ctl" \
    "$CHROOT_DIR/usr/bin/ayaz-session" \
    "$CHROOT_DIR/usr/share/applications/ayaz.desktop" \
    "$CHROOT_DIR/usr/share/xsessions/ayaz.desktop" \
    "$CHROOT_DIR/home/ankora/.xinitrc" \
    "$CHROOT_DIR/home/ankora/.profile" \
    "$CHROOT_DIR/etc/skel/.xinitrc" \
    "$CHROOT_DIR/etc/skel/.profile"; do
    if [ -f "$f" ] && [ ! -L "$f" ]; then
        sed -i 's/\r$//' "$f"
    fi
done

# Build'a özel IPv4 zorlaması artık gerekli; dağıtılan sistemde kalmamalı
rm -f "$CHROOT_DIR/etc/apt/apt.conf.d/02-build-forceipv4"

# 8. SquashFS Sıkıştırılmış Kök Dosya Sisteminin Üretilmesi
echo "[5/8] SquashFS kök dosya sistemi sıkıştırılıyor (filesystem.squashfs)..."
# Çekirdek ve initrd dosyalarını çıkar (sürüm eşleşmeli: vmlinuz-X ↔ initrd.img-X).
# Bağımsız `sort -V | tail` seçimi dist-upgrade sonrası eski/yeni çekirdeği
# eşleştirmeden seçip "kernel panic / VFS mount" ile GRUB sonrası düşürüyordu.
KERNEL_FILE=$(ls -1v "$CHROOT_DIR/boot/vmlinuz-"* 2>/dev/null | tail -n 1 || true)
KVER="${KERNEL_FILE##*/vmlinuz-}"
INITRD_FILE=""
if [ -n "$KVER" ] && [ -f "$CHROOT_DIR/boot/initrd.img-${KVER}" ]; then
    INITRD_FILE="$CHROOT_DIR/boot/initrd.img-${KVER}"
else
    INITRD_FILE=$(find "$CHROOT_DIR/boot" -name "initrd.img*" | sort -V | tail -n 1 || true)
fi

if [ -z "$KERNEL_FILE" ] || [ -z "$INITRD_FILE" ]; then
    echo "[HATA] Çekirdek (vmlinuz) veya initrd dosyası bulunamadı!" >&2
    echo "       Chroot /boot içeriği:" >&2
    ls -la "$CHROOT_DIR/boot/" >&2
    exit 2
fi

# Eşleşme doğrulaması: vmlinuz-6.1.0-53 ↔ initrd.img-6.1.0-53 olmalı
K_BASE="${KERNEL_FILE##*/vmlinuz-}"
I_BASE="${INITRD_FILE##*/initrd.img-}"
if [ "$K_BASE" != "$I_BASE" ]; then
    echo "[HATA] Çekirdek/initrd sürümleri eşleşmiyor: $K_BASE vs $I_BASE" >&2
    ls -la "$CHROOT_DIR/boot/" >&2
    exit 2
fi
echo "[OK] Çekirdek/initrd çifti: $K_BASE"

cp -v "$KERNEL_FILE" "$IMAGE_DIR/live/vmlinuz"
cp -v "$INITRD_FILE" "$IMAGE_DIR/live/initrd"

# initrd içinde live-boot modüllerinin varlığını doğrula.
# lsinitramfs host'ta kurulu olmayabilir (initramfs-tools-core chroot'a ait);
# yoksa cpio ile initrd'yi doğrudan listele, o da yoksa doğrulamayı atla.
echo "[DOĞRULAMA] initrd içindeki live-boot modülleri kontrol ediliyor..."
# pipefail açık: erken kapanan okuyucu (grep -q, head) yazan tarafı SIGPIPE ile
# öldürür ve 141 kodu tüm betiği sonlandırır. Bu yüzden boru yok — dosya girdili
# grep ve tüm girdiyi okuyup tüketen sed kullanılır.
if command -v lsinitramfs >/dev/null 2>&1; then
    INITRD_LIST=$(lsinitramfs "$IMAGE_DIR/live/initrd" 2>/dev/null || true)
elif command -v cpio >/dev/null 2>&1; then
    INITRD_LIST=$(zcat "$IMAGE_DIR/live/initrd" 2>/dev/null | cpio -t 2>/dev/null || true)
else
    INITRD_LIST=""
fi

if [ -z "$INITRD_LIST" ]; then
    echo "[BİLGİ] initrd içeriği listelenemedi (lsinitramfs/cpio host'ta yok), doğrulama atlandı."
elif grep -q "live" <<< "$INITRD_LIST"; then
    echo "[OK] live-boot modülleri initrd içinde mevcut."
else
    echo "[UYARI] live-boot modülleri initrd içinde bulunamadı. Boot sorunları yaşanabilir."
    echo "        initrd listesi (ilk 20 satır):"
    printf '%s\n' "$INITRD_LIST" | sed -n '1,20p'
fi

# ISO manifest'i: kök dosya sisteminin imaj künyesi. Ayarlar > Hakkında da
# bu dosyadan okur; sürüm, derleme tarihi ve git özeti burada saklanır.
echo "[MANIFEST] Sistem künyesi yazılıyor..."
AYAZ_VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$ROOT_DIR/src-tauri/tauri.conf.json")
AYAZ_VERSION="${AYAZ_VERSION%%$'\n'*}"
if [ -z "$AYAZ_VERSION" ]; then
    AYAZ_VERSION="4.7.0"
fi
# git yoksa (ör. WSL) .git/HEAD + ref dosyaları doğrudan okunur; revizyon
# manifestte hiçbir koşulda boş kalmaz.
GIT_REV="bilinmiyor"
if command -v git >/dev/null 2>&1; then
    GIT_REV=$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || echo "bilinmiyor")
elif [ -f "$ROOT_DIR/.git/HEAD" ]; then
    _HEAD_RAW=$(tr -d '[:space:]' < "$ROOT_DIR/.git/HEAD")
    _GIT_HASH=""
    case "$_HEAD_RAW" in
        ref:*)
            _GIT_REF=${_HEAD_RAW#ref:}
            if [ -f "$ROOT_DIR/.git/$_GIT_REF" ]; then
                _GIT_HASH=$(head -c 40 "$ROOT_DIR/.git/$_GIT_REF")
            elif [ -f "$ROOT_DIR/.git/packed-refs" ]; then
                _GIT_HASH=$(awk -v r="$_GIT_REF" '$2 == r { print $1; exit }' "$ROOT_DIR/.git/packed-refs")
            fi
            ;;
        *)
            _GIT_HASH=$_HEAD_RAW
            ;;
    esac
    if [ -n "$_GIT_HASH" ]; then
        GIT_REV=${_GIT_HASH:0:7}
    fi
fi
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
mkdir -p "$CHROOT_DIR/usr/share/ayaz"
mkdir -p "$CHROOT_DIR/etc/ankora"
printf '%s\n' "${AYAZ_VERSION}" > "$CHROOT_DIR/etc/ankora/version"
# Canlı sistem kendi kimliğini taşısın: telemetry os-release PRETTY_NAME
# urlparse okur; Devuan kimliğiyle "Ankora Linux <sürüm>" görünmeli (hata #2).
if [ -f "$CHROOT_DIR/etc/os-release" ]; then
    sed -i -E '/^(PRETTY_NAME|VERSION)=/d' "$CHROOT_DIR/etc/os-release"
    sed -i "1aPRETTY_NAME=\"Ankora Linux ${AYAZ_VERSION} Bora (Excalibur)\"\nVERSION=\"${AYAZ_VERSION} (Bora)\"\nVERSION_ID=\"${AYAZ_VERSION}\"" "$CHROOT_DIR/etc/os-release"
fi
cat > "$CHROOT_DIR/usr/share/ayaz/manifest.json" <<MANIFEST_JSON
{
  "product": "Ayaz DE (Ankora Linux)",
  "version": "${AYAZ_VERSION}",
  "codename": "Bora",
  "build_date": "${BUILD_DATE}",
  "git_revision": "${GIT_REV}",
  "architecture": "amd64",
  "base": "Devuan GNU/Linux 6 (Excalibur)",
  "init_system": "SysVinit",
  "image_type": "hybrid live ISO"
}
MANIFEST_JSON

# Sanal bağlantıları kaldır
umount -lf "$CHROOT_DIR/dev/pts" 2>/dev/null || true
umount -lf "$CHROOT_DIR/dev" 2>/dev/null || true
umount -lf "$CHROOT_DIR/proc" 2>/dev/null || true
umount -lf "$CHROOT_DIR/sys" 2>/dev/null || true

# Squashfs öncesi güvenli boyut temizliği (dil paketleri / önbellekler / loglar)
rm -rf "$CHROOT_DIR/var/lib/apt/lists/"* \
       "$CHROOT_DIR/var/cache/apt/archives/"*.deb \
       "$CHROOT_DIR/var/cache/apt/archives/partial/"* \
       "$CHROOT_DIR/var/cache/apt/"*.bin 2>/dev/null || true
rm -f "$CHROOT_DIR/var/lib/dpkg/"*-old "$CHROOT_DIR/var/cache/debconf/"*-old 2>/dev/null || true
find "$CHROOT_DIR/var/log" -type f -exec truncate -s 0 {} + 2>/dev/null || true
rm -f "$CHROOT_DIR/var/cache/ldconfig/aux-cache" 2>/dev/null || true
find "$CHROOT_DIR/usr" "$CHROOT_DIR/opt" -type d -name '__pycache__' -exec rm -rf {} + 2>/dev/null || true
if [ -d "$CHROOT_DIR/opt/brave.com/brave/locales" ]; then
    find "$CHROOT_DIR/opt/brave.com/brave/locales" -maxdepth 1 -type f -name '*.pak' \
        ! -name 'tr.pak' ! -name 'en-US.pak' ! -name 'en-GB.pak' -delete 2>/dev/null || true
fi
if [ -d "$CHROOT_DIR/usr/share/locale" ]; then
    find "$CHROOT_DIR/usr/share/locale" -mindepth 1 -maxdepth 1 -type d \
        ! -name 'tr' ! -name 'tr_*' ! -name 'en' ! -name 'en_*' ! -name 'C' ! -name 'C.*' ! -name 'POSIX' \
        -exec rm -rf {} + 2>/dev/null || true
fi

# Not: boot DAHİL tutulur — kurucu squashfs'i /target'a açıp GRUB'u
# oradaki çekirdekle kurar; boot dışlanırsa kurulu sistem çekirdeksiz kalır.
# KRİTİK: -e 'dizin' dizinin KENDİSİNİ siler; /dev /proc /sys /run yoksa
# switch_root hedefe geçemez ve açılış "Attempted to kill init" ile ölür.
# Bu yüzden 'dizin/*' kalıbı kullanılır: içerik atılır, boş dizin kalır.
# /proc /sys /dev olduğu gibi tutulur (boş/statik, zararsız).
mksquashfs "$CHROOT_DIR" "$IMAGE_DIR/live/filesystem.squashfs" -comp xz -Xdict-size 100% -b 1048576 -noappend \
    -e 'tmp/*' 'run/*' 'mnt/*' 'media/*' 'var/tmp/*' 'var/cache/apt/archives/*' 'var/lib/apt/lists/*' 2>/dev/null || \
mksquashfs "$CHROOT_DIR" "$IMAGE_DIR/live/filesystem.squashfs" -comp xz -b 1048576 -noappend

# 9. Önyükleyici (Bootloader: GRUB BIOS El Torito + GRUB EFI) Yapılandırması
echo "[6/8] EFI ve BIOS hibrit önyükleyicileri hazırlanıyor..."
# GRUB (BIOS) — ISOLINUX yerine i386-pc El Torito imajı.
# Gerekçe: ISOLINUX 6.04 + COM32 zinciri bu çekirdekte kurulumu PARAMETRESİZ
# (cmdline/initrd'siz) ham başlatıyordu → "VFS: Unable to mount root fs".
# UEFI tarafında kanıtlanmış GRUB artık iki firmware'de de tek yükleyicidir
# (Fedora canlı ISO'larıyla aynı mimari). Ortak menü: boot/grub/grub.cfg.
# Erken yapılandırma: ISO'yu dosya ile bulur, ortak menüye dallanır.
cat << 'EOF' > "$IMAGE_DIR/boot/grub/early-bios.cfg"
if search --no-floppy --file --set=root /boot/grub/grub.cfg; then true; fi
if [ ! -e /boot/grub/grub.cfg ]; then set root=(cd); fi
set prefix=($root)/boot/grub
configfile /boot/grub/grub.cfg
EOF

if command -v grub-mkimage &>/dev/null; then
    echo "[BIOS] grub-mkimage ile i386-pc El Torito imajı üretiliyor..."
    grub-mkimage \
        -O i386-pc-eltorito \
        -o "$IMAGE_DIR/boot/grub/i386-pc-eltorito.img" \
        -p /boot/grub \
        -c "$IMAGE_DIR/boot/grub/early-bios.cfg" \
        biosdisk part_msdos part_gpt fat ext2 iso9660 normal configfile linux linux16 search search_label search_fs_uuid search_fs_file loopback echo reboot halt test gettext all_video gfxterm gfxmenu png jpeg || {
        echo "[HATA] grub-mkimage i386-pc-eltorito.img oluşturamadı!" >&2
        exit 1
    }
else
    echo "[HATA] grub-mkimage bulunamadı (grub-pc-bin gerekli)!" >&2
    exit 1
fi
# early-bios.cfg hem ISO'da durur hem imaja gömülür; önyükleme gömülü kopyayla başlar.

# GRUB (UEFI) — Ankora temalı modern menü (tam Türkçe, UTF-8).
# Tema dosyası ISO üzerinde yoksa renkli yedeğe düşülür, menü bozulmaz.
# KRİTİK: search satırı kökü ISO etiketine sabitler; yoksa /live/vmlinuz
# bulunamaz ve açılış "you need to load the kernel first" ile durur.
cat << 'EOF' > "$IMAGE_DIR/boot/grub/grub.cfg"
set default="0"
set timeout="10"
set timeout_style="menu"

insmod all_video
insmod gfxterm
insmod gfxmenu
insmod png
insmod jpeg
insmod part_gpt
insmod part_msdos
insmod fat
insmod ext2
insmod loopback
insmod test
insmod search
insmod search_label
insmod iso9660
insmod gettext
# Kip devri: menü bilinen-iyi sabit zincirle açılır (1024x768 neredeyse
# her VGA/UEFI aygıtta desteklenir; menü düzenli çizilir). Çekirdeğe
# devirde gfxpayload=auto: çekirdek KMS ile ekran kartının gerçekten
# desteklediği ana modu kendisi seçer. Sabit payload zinciri devralma
# yapamayan adapterlerde "video error" üretiyordu. Metin konsolu
# Failsafe'tedir.
set gfxmode="1024x768,800x600,auto"
set gfxpayload="auto"
terminal_output gfxterm
# Yazı tipi: önce ISO'daki gerçek yol, sonra gömülü ad. Tema YALNIZCA yazı
# tipi yüklenirse seçilir; yoksa renkli yedek menüde kalınır. Yüklenmemiş
# yazı tipiyle tema seçmek gfxmenu'yü hata ile konsola düşürüyordu.
have_font="0"
if loadfont ($root)/boot/grub/fonts/unicode.pf2; then have_font="1"; elif loadfont unicode; then have_font="1"; else echo "yazi tipi yuklenemedi"; fi

# ISO kökü etiketle bulunur; etiket okunamazsa (bazı USB yazıcılar /
# büyük-küçük harf farkı) dosya varlığıyla yedeğe düşülür. Yedek yoksa
# /live/vmlinuz bulunamaz ve "you need to load the kernel first" verir.
if search --no-floppy --set=root --label __ANKORA_VOLID__; then true; fi
if [ ! -e "/live/vmlinuz" ]; then
    if search --no-floppy --set=root --file /live/vmlinuz; then true; fi
fi

set color_normal="light-gray/black"
set color_highlight="white/blue"
set menu_color_normal="light-gray/black"
set menu_color_highlight="white/blue"

if [ "$have_font" = "1" ]; then
    if [ -e "$prefix/themes/ankora/theme.txt" ]; then
        set theme="$prefix/themes/ankora/theme.txt"
    elif [ -e "/boot/grub/themes/ankora/theme.txt" ]; then
        set theme="/boot/grub/themes/ankora/theme.txt"
    fi
fi
export theme

menuentry "Ankora Linux 3.5  —  Canlı Masaüstü" {
    linux /live/vmlinuz boot=live live-media-path=/live union=overlay components username=ankora hostname=ankora-live locales=tr_TR.UTF-8 keyboard-layouts=tr timezone=Europe/Istanbul utc=yes noeject splash quiet loglevel=3
    initrd /live/initrd
}

menuentry "Ankora Linux 3.5  —  Canlı Masaüstü (RAM'den Açılış / Ventoy)" {
    # Ventoy/USB giriş akışı: live-boot toram ile RO medyanın tamamını
    # RAM'e kopyalayıp oradan açar; flakey USB okuma/slow enumeration
    # sınıfı sorunlar bypass edilir. RAM ihtiyacı ≈ squashfs + ~1 GB
    # (8 GB önerilir). toram + noeject birlikte: açılıştan sonra stick
    # sökülebilir, canlı oturum etkilenmez.
    linux /live/vmlinuz boot=live live-media-path=/live union=overlay components username=ankora hostname=ankora-live locales=tr_TR.UTF-8 keyboard-layouts=tr timezone=Europe/Istanbul utc=yes noeject toram splash quiet loglevel=3
    initrd /live/initrd
}

menuentry "Ankora Linux 3.5  —  Güvenli Mod (Failsafe)" {
    # Metin kipi: grafik devri olmadan düz konsol logları (donanım sorunlarında)
    set gfxpayload="text"
    linux /live/vmlinuz boot=live live-media-path=/live union=overlay components username=ankora hostname=ankora-live locales=tr_TR.UTF-8 keyboard-layouts=tr timezone=Europe/Istanbul noeject nomodeset noapic noacpi
    initrd /live/initrd
}

menuentry "Ankora Linux 3.5  —  Donanım Teşhisi (Ayrıntılı Günlük)" {
    # Ventoy/USB'de "Devuan..." yazısından sonra donan açılış (VM'de düzgün)
    # durumunda sorunun hangi aşamada takıldığını açık konsoldan görmek için:
    # plymouth yok, loglevel=7. Takılan son satırı fotoğraflayıp hata
    # raporuna ekleyin; kök neden o satırdan belirlenir.
    set gfxpayload="text"
    linux /live/vmlinuz boot=live live-media-path=/live union=overlay components username=ankora hostname=ankora-live locales=tr_TR.UTF-8 keyboard-layouts=tr timezone=Europe/Istanbul utc=yes noeject verbose loglevel=7
    initrd /live/initrd
}


menuentry "Yeniden Başlat" {
    reboot
}

menuentry "Kapat" {
    halt
}
EOF
# Menü başlıkları sürümden türetilir: heredoc tırnaklı ('EOF') olduğundan
# menü metni derleme anında gerçek sürümle değiştirilir.
sed -i -E "s/Ankora Linux [0-9]+\.[0-9]+/Ankora Linux ${AYAZ_VERSION}/g" "$IMAGE_DIR/boot/grub/grub.cfg"
# Etiket yer tutucusu da gerçek VOLID ile değiştirilir (grub.cfg'deki
# search --label ile xorriso -volid aynı $VOLID'den üretilir; ISO kökü
# etikete göre bulunur, iki tarafın uyuşmazlığı boot'u kırar).
if grep -q '__ANKORA_VOLID__' "$IMAGE_DIR/boot/grub/grub.cfg" && ! sed -i "s/__ANKORA_VOLID__/${VOLID}/g" "$IMAGE_DIR/boot/grub/grub.cfg"; then
    echo "[HATA] grub.cfg etiket yer tutucusu değiştirilemedi." >&2
    exit 1
fi
if grep -q '__ANKORA_VOLID__' "$IMAGE_DIR/boot/grub/grub.cfg"; then
    echo "[HATA] grub.cfg'de etiket yer tutucusu kalmış; VOLID genişletme atlanmış görünüyor." >&2
    exit 1
fi
# Derleme kapısı: bozuk GRUB sözdizimi ISO'ya giremez.
if command -v grub-script-check &>/dev/null; then
    if ! grub-script-check "$IMAGE_DIR/boot/grub/grub.cfg"; then
        echo "[HATA] grub.cfg sözdizimi bozuk, ISO durduruldu!" >&2
        exit 1
    fi
    echo "[OK] grub.cfg sözdizimi doğrulandı."
fi
# Tema kapısı: boş resim yolu ve dengesiz küme menüyü hata ile düşürür.
THEME_TXT="$ROOT_DIR/scripts/grub-theme-ankora/theme.txt"
if grep -q 'desktop-image: *""' "$THEME_TXT"; then
    echo "[HATA] GRUB temasında boş desktop-image yolu var!" >&2
    exit 1
fi
if [ "$(tr -cd '{' < "$THEME_TXT" | wc -c)" != "$(tr -cd '}' < "$THEME_TXT" | wc -c)" ]; then
    echo "[HATA] GRUB temasında dengesiz küme parantezi!" >&2
    exit 1
fi
echo "[OK] GRUB teması doğrulandı."
# GRUB teması + yazı tipi ISO içine de konur (normal EFI yolundan okunur).
mkdir -p "$IMAGE_DIR/boot/grub/themes/ankora" "$IMAGE_DIR/boot/grub/fonts"
cp "$ROOT_DIR/scripts/grub-theme-ankora/theme.txt" "$IMAGE_DIR/boot/grub/themes/ankora/theme.txt" || true
for _pf2 in /usr/share/grub/unicode.pf2 /usr/share/grub/fonts/unicode.pf2; do
    if [ -f "$_pf2" ]; then
        cp -f "$_pf2" "$IMAGE_DIR/boot/grub/fonts/unicode.pf2" || true
        break
    fi
done
unset _pf2

# EFI Bağımsız Önyükleyici ve efi.img Üretimi (Modern UEFI Boot Desteği)
mkdir -p "$IMAGE_DIR/EFI/BOOT" "$IMAGE_DIR/EFI/boot" "$IMAGE_DIR/boot/grub/x86_64-efi"

if command -v grub-mkstandalone &>/dev/null; then
    echo "[EFI] grub-mkstandalone ile bootx64.efi üretiliyor..."
    grub-mkstandalone \
        --format=x86_64-efi \
        --output="$IMAGE_DIR/EFI/boot/bootx64.efi" \
        --locales="" \
        --fonts="unicode" \
        --modules="part_gpt part_msdos fat ext2 iso9660 normal configfile linux test echo reboot halt search search_label search_fs_uuid search_fs_file loopback gettext all_video gfxterm gfxmenu png jpeg" \
        "boot/grub/grub.cfg=$IMAGE_DIR/boot/grub/grub.cfg" \
        "boot/grub/themes/ankora/theme.txt=$ROOT_DIR/scripts/grub-theme-ankora/theme.txt" || {
        echo "[HATA] grub-mkstandalone bootx64.efi oluşturamadı!" >&2
        exit 1
    }
    cp -f "$IMAGE_DIR/EFI/boot/bootx64.efi" "$IMAGE_DIR/EFI/BOOT/BOOTX64.EFI" 2>/dev/null || true
fi

if [ -f "$IMAGE_DIR/EFI/boot/bootx64.efi" ]; then
    echo "[EFI] efi.img FAT disk imajı hazırlanıyor..."
    dd if=/dev/zero of="$IMAGE_DIR/boot/grub/efi.img" bs=1M count=8 || { echo "[HATA] efi.img oluşturulamadı!" >&2; exit 1; }
    mkfs.vfat "$IMAGE_DIR/boot/grub/efi.img" || { echo "[HATA] efi.img dosya sistemi biçimlendirilemedi!" >&2; exit 1; }
    if command -v mmd &>/dev/null && command -v mcopy &>/dev/null; then
        mmd -i "$IMAGE_DIR/boot/grub/efi.img" ::/EFI ::/EFI/BOOT || true
        mcopy -i "$IMAGE_DIR/boot/grub/efi.img" "$IMAGE_DIR/EFI/boot/bootx64.efi" ::/EFI/BOOT/BOOTX64.EFI || {
            echo "[HATA] bootx64.efi efi.img içine kopyalanamadı!" >&2
            exit 1
        }
    else
        echo "[HATA] mtools (mmd/mcopy) kullanılamıyor: efi.img boş kalır, UEFI USB boot ölü doğar." >&2
        echo "       Kurulum: sudo apt-get install mtools ; derleme durduruldu." >&2
        exit 1
    fi
fi

# 10. ISO Önyükleme Manifest'i: boot zinciri künyesi + paket envanteri.
#     ISO kökünde durur (Windows'tan bağlanınca da okunur); kurulu paketler
#     ve önyükleme dosyalarının SHA-256 toplamları sırayla listelenir.
echo "[MANIFEST] ISO önyükleme manifest'i yazılıyor..."
{
    echo "# Ayaz DE - ISO Manifest"
    echo "# surum: ${AYAZ_VERSION}"
    echo "# derleme: ${BUILD_DATE}"
    echo "# git: ${GIT_REV}"
    echo "# mimari: amd64"
    echo ""
    echo "[boot-files]"
} > "$IMAGE_DIR/ayaz-manifest.txt"

add_manifest_hash() {
    local abs="$1" label="$2"
    if [ -f "$abs" ]; then
        printf '%s  %s\n' "$(sha256sum "$abs" | cut -d' ' -f1)" "$label" >> "$IMAGE_DIR/ayaz-manifest.txt"
    else
        printf 'YOK  %s\n' "$label" >> "$IMAGE_DIR/ayaz-manifest.txt"
    fi
}

add_manifest_hash "$IMAGE_DIR/live/vmlinuz" "/live/vmlinuz"
add_manifest_hash "$IMAGE_DIR/live/initrd" "/live/initrd"
add_manifest_hash "$IMAGE_DIR/boot/grub/i386-pc-eltorito.img" "/boot/grub/i386-pc-eltorito.img"
add_manifest_hash "$IMAGE_DIR/boot/grub/grub.cfg" "/boot/grub/grub.cfg"
add_manifest_hash "$IMAGE_DIR/EFI/boot/bootx64.efi" "/EFI/boot/bootx64.efi"
add_manifest_hash "$IMAGE_DIR/boot/grub/efi.img" "/boot/grub/efi.img"
add_manifest_hash "$IMAGE_DIR/live/filesystem.squashfs" "/live/filesystem.squashfs"

{
    echo ""
    echo "[packages]"
} >> "$IMAGE_DIR/ayaz-manifest.txt"
# dpkg -l yalnız /var/lib/dpkg okur; chroot içinde /proc mount'u gerekmez.
chroot "$CHROOT_DIR" dpkg -l 2>/dev/null | awk '/^ii/{print $2" "$3}' >> "$IMAGE_DIR/ayaz-manifest.txt" || true

echo "[OK] Manifest yazıldı: ayaz-manifest.txt ($(wc -l < "$IMAGE_DIR/ayaz-manifest.txt") satır)"

# 11. Xorriso ile Hibrit ISO İmajının Derlenmesi
echo "[7/8] Xorriso ile bootable hibrit ISO oluşturuluyor..."
ISOHDPFX=$(find /usr/lib/syslinux/mbr /usr/lib/syslinux /usr/lib/ISOLINUX -name "isohdpfx.bin" 2>/dev/null | head -n 1 || true)
if [ -z "$ISOHDPFX" ]; then
    echo "[HATA] isohdpfx.bin bulunamadı (syslinux-common paketi kurulu değil)."
    echo "       MBR'siz ISO USB diskinden BIOS olarak başlatılamaz; ISO üretimi durduruldu."
    exit 1
fi

XORRISO_CMD=(
    xorriso -as mkisofs
    -iso-level 3
    -full-iso9660-filenames
    -r -J -l
    -volid "${VOLID}"
    -isohybrid-mbr "$ISOHDPFX"
    -eltorito-boot boot/grub/i386-pc-eltorito.img
    -eltorito-catalog boot/grub/boot.cat
    -no-emul-boot -boot-load-size 4 -boot-info-table
)

if [ -f "$IMAGE_DIR/boot/grub/efi.img" ]; then
    XORRISO_CMD+=(
        -eltorito-alt-boot
        -e boot/grub/efi.img
        -no-emul-boot
        -isohybrid-gpt-basdat
    )
fi

XORRISO_CMD+=(-output "$ROOT_DIR/dist/$ISO_NAME" "$IMAGE_DIR")

# XORRISO_YARDIMCI_LOG: ssh oturumlarında stderr kaybolmasın; ayrı dosyada saklansın
if ! "${XORRISO_CMD[@]}" 2>&1 | tee "$WORK_DIR/xorriso-build.log" >/dev/null; then
    echo "[HATA] Hibrit xorriso derlemesi başarısız oldu. Log: $WORK_DIR/xorriso-build.log"
    echo "       Sessiz 'standart mod' fallback kaldırıldı: hibritleşmemiş ISO USB diskinden"
    echo "       BIOS olarak başlatılamaz; dağıtıma uygun olmadığından derleme durduruldu."
    exit 1
fi

# Hibrit doğrulama: BIOS (isohdpfx MBR) ve UEFI (GPT bas-dat) bayrağı ISO içinde var mı?
if [ -f "$ROOT_DIR/dist/$ISO_NAME" ]; then
    # MBR: isohdpfx.bin'in ilk 432 baytı (bootloader kodu) ISO'nun ilk 432
    # baytına birebir gelmelidir. xorriso raporu MBR'yi '-G --interval...'
    # satırıyla temsil eder; jeton aramaya kaldırmak yerine bayt karşılaştırması.
    if ! cmp -s <(head -c 432 "$ISOHDPFX") <(head -c 432 "$ROOT_DIR/dist/$ISO_NAME"); then
        echo "[HATA] Üretilen ISO'nun MBR'si isohdpfx bootloader kodunu içermiyor; USB'den BIOS boot çalışmaz."
        exit 1
    fi
    # UEFI: jeton aramasına güvenme — as_mkisofs raporu sürüme göre farklı
    # basıyor (xorriso 1.5.4 '-isohybrid-gpt-basdat' satırını üretmiyor).
    # Bunun yerine ISO'nun sistem alanını bayt düzeyinde doğrula:
    #   1) MBR 1. bölüm girişi önyüklenebilir (offset 446, durum baytı 0x80)
    #   2) MBR 2. bölüm girişinin tür baytı 0xef (offset 466)
    #   3) LBA 1'de (byte 512) GPT imzası "EFI PART"
    # İkisi birlikte: USB disk girdisinde EFI bölümü ve GPT gerçekten var.
    if [ -f "$IMAGE_DIR/boot/grub/efi.img" ]; then
        MBR1_BOOT=$(dd if="$ROOT_DIR/dist/$ISO_NAME" bs=1 skip=446 count=1 2>/dev/null | od -An -tx1 | tr -d ' \n')
        MBR_EFI_TYPE=$(dd if="$ROOT_DIR/dist/$ISO_NAME" bs=1 skip=466 count=1 2>/dev/null | od -An -tx1 | tr -d ' \n')
        GPT_SIG=$(dd if="$ROOT_DIR/dist/$ISO_NAME" bs=1 skip=512 count=8 2>/dev/null)
        if [ "$MBR1_BOOT" != "80" ] || [ "$MBR_EFI_TYPE" != "ef" ] || [ "$GPT_SIG" != "EFI PART" ]; then
            echo "[HATA] Üretilen ISO'da UEFI hibrit yapısı saptanmadı (MBR1=0x${MBR1_BOOT:-??}, MBR2=0x${MBR_EFI_TYPE:-??}, GPT=${GPT_SIG:-yok}); USB'den UEFI boot riskli."
            echo "--- report_system_area çıktısı (teşhis için) ---"
            xorriso -indev "$ROOT_DIR/dist/$ISO_NAME" -report_system_area plain 2>&1 | head -30 || true
            exit 1
        fi
        echo "[OK] Hibrit doğrulama: isohybrid MBR ve UEFI bölüm yapısı (MBR2=0xef + GPT imzası) mevcut."
    fi
fi

# 11. Bitiş ve Doğrulama
echo "[8/8] ISO Doğrulaması ve SHA256..."
if [ -f "$ROOT_DIR/dist/$ISO_NAME" ]; then
    cd "$ROOT_DIR/dist"
    sha256sum "$ISO_NAME" > "$ISO_NAME.sha256"
    echo "======================================================================"
    echo "  BAŞARILI: Ankora Linux ISO Kalıbı Hazır!"
    echo "  Konum: $ROOT_DIR/dist/$ISO_NAME"
    echo "  Boyut: $(du -h "$ISO_NAME" | cut -f1)"
    echo "  SHA256: $(cat "$ISO_NAME.sha256" | cut -d' ' -f1)"
    echo "======================================================================"
else
    echo "[HATA] ISO derleme işlemi tamamlanamadı!" >&2
    exit 3
fi

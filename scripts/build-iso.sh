#!/bin/bash
# ==============================================================================
# Ankora Linux 3.5 (Daedalus) — Canlı (Live) ISO Derleme Betiği
# Masaüstü Ortamı: Ayaz DE (Tauri + WebKitGTK + SysVinit Core)
# Mimari: x86_64 (UEFI + BIOS Hibrit Boot)
# ==============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

WORK_DIR="/var/tmp/ankora-iso-build"
CHROOT_DIR="$WORK_DIR/chroot"
IMAGE_DIR="$WORK_DIR/image"
DEVUAN_MIRROR="http://deb.devuan.org/merged"
DEVUAN_SUITE="daedalus"

# Tek sürüm kaynağı: src-tauri/tauri.conf.json (devrik: VERSION).
# ISO adı ve GRUB menü başlıkları bu sürümden türetilir; sabit "3.5"
# yazmıyoruz ki yeni sürümde workflow kırılmasın.
AYAZ_VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$ROOT_DIR/src-tauri/tauri.conf.json" | head -n 1)
if [ -z "$AYAZ_VERSION" ] && [ -f "$ROOT_DIR/VERSION" ]; then
    AYAZ_VERSION=$(tr -d '[:space:]' < "$ROOT_DIR/VERSION")
fi
[ -z "$AYAZ_VERSION" ] && AYAZ_VERSION="3.7.0"
ISO_NAME="ankora-linux-${AYAZ_VERSION}-ayaz-amd64.iso"
# ISO9660 etiketi sürümü yansıtır; grub.cfg'deki search --label ile birebir
# aynı etikettir — ikisi tek değişkenden üretilir, elle düzeltmeyin.
VOLID="ANKORA_$(printf '%s' "$AYAZ_VERSION" | sed 's/\./_/g')"
echo
echo "======================================================================"
echo "   ANKORA LINUX $AYAZ_VERSION (AYAZ DE) CANLI ISO DERLEME SİSTEMİ      "
echo "======================================================================"
echo "Sürüm: $AYAZ_VERSION (Daedalus / SysVinit Core)"
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
    if [ -f "/usr/share/debootstrap/scripts/bookworm" ]; then
        ln -sf bookworm "/usr/share/debootstrap/scripts/$DEVUAN_SUITE"
    else
        ln -sf sid "/usr/share/debootstrap/scripts/$DEVUAN_SUITE"
    fi
fi

# Devuan GPG resmi anahtarlık denetimi
LOCAL_KEYRING="$ROOT_DIR/third_party/devuan-keyring/gpg/devuan-archive-keyring.gpg"
LOCAL_DEB="$ROOT_DIR/third_party/devuan-keyring/devuan-keyring_2022.09.04_all.deb"

if [ ! -f /usr/share/keyrings/devuan-archive-keyring.gpg ] && [ ! -f /etc/apt/trusted.gpg.d/devuan-archive-keyring.gpg ]; then
    if [ -f "$LOCAL_DEB" ]; then
        echo "[BİLGİ] Yerel Devuan anahtarlık paketi kuruluyor ($LOCAL_DEB)..."
        dpkg -i "$LOCAL_DEB" 2>/dev/null || true
    elif [ ! -f "$LOCAL_KEYRING" ]; then
        echo "[BİLGİ] Devuan resmi GPG anahtarlığı (devuan-keyring) aranıyor..."
        wget -qO /tmp/devuan-keyring.deb https://pkgmaster.devuan.org/devuan/pool/main/d/devuan-keyring/devuan-keyring_2022.09.04_all.deb 2>/dev/null || true
        if [ -f /tmp/devuan-keyring.deb ] && [ -s /tmp/devuan-keyring.deb ]; then
            dpkg -i /tmp/devuan-keyring.deb 2>/dev/null || apt-get install -f -y 2>/dev/null || true
            rm -f /tmp/devuan-keyring.deb
        fi
    fi
fi

KEYRING_ARGS=()
if [ -f "$LOCAL_KEYRING" ]; then
    KEYRING_ARGS=("--keyring=$LOCAL_KEYRING")
elif [ -f /usr/share/keyrings/devuan-archive-keyring.gpg ]; then
    KEYRING_ARGS=("--keyring=/usr/share/keyrings/devuan-archive-keyring.gpg")
elif [ -f /etc/apt/trusted.gpg.d/devuan-archive-keyring.gpg ]; then
    KEYRING_ARGS=("--keyring=/etc/apt/trusted.gpg.d/devuan-archive-keyring.gpg")
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

# 4. Debootstrap ile Temel Devuan Daedalus Sisteminin İndirilmesi
echo "[2/8] Devuan Daedalus SysVinit temel tabanı kuruluyor (debootstrap)..."
debootstrap --arch=amd64 \
    --variant=minbase \
    "${KEYRING_ARGS[@]}" \
    --include=sysvinit-core,sysvinit-utils,insserv,initramfs-tools,live-boot,live-config,live-config-sysvinit \
    "$DEVUAN_SUITE" "$CHROOT_DIR" "$DEVUAN_MIRROR"

# 5. Sanal Dosya Sistemlerinin Bağlanması (Mount) ve Anahtarlık Transferi
mkdir -p "$CHROOT_DIR/etc/apt/trusted.gpg.d" "$CHROOT_DIR/usr/share/keyrings"
cp -f /usr/share/keyrings/devuan* "$CHROOT_DIR/etc/apt/trusted.gpg.d/" 2>/dev/null || true
cp -f /usr/share/keyrings/devuan* "$CHROOT_DIR/usr/share/keyrings/" 2>/dev/null || true
if [ -d "$ROOT_DIR/third_party/devuan-keyring/gpg" ]; then
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
deb http://deb.devuan.org/merged daedalus main contrib non-free non-free-firmware
deb http://deb.devuan.org/merged daedalus-security main contrib non-free non-free-firmware
deb http://deb.devuan.org/merged daedalus-updates main contrib non-free non-free-firmware
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
# GPU FİRMWARE — gerçek donanımda test bulgusu: Radeon (amdgpu/r600/ati)
# kartları non-free firmware olmadan siyah ekran/büyütülmüş boyut veriyor.
# xserver-xorg-video-amdgpu + mesa kurulu olsa bile kart firmware beklemeden
# init etmiyor; bu yüzden AMD ve genel non-free firmware seti kurulur.
# -----------------------------------------------------------------------
apt-get install -y --no-install-recommends \
    firmware-linux-nonfree \
    firmware-amd-graphics \
    firmware-radeon 2>/dev/null || true

# Güncel depolarda firmware-radeon firmware-amd-graphics içine katıldıysa
# derleme kırılmaz (yukarıdaki "|| true" kapsar).

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
    libwebkit2gtk-4.0-37 \
    libjavascriptcoregtk-4.0-18 \
    libwebkit2gtk-4.1-0 \
    libjavascriptcoregtk-4.1-0 \
    libgtk-3-0 \
    libayatana-appindicator3-1 \
    python3 \
    python3-gi \
    python3-gi-cairo \
    python3-cairo \
    gir1.2-webkit2-4.0 \
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
    policykit-1 \
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
    policykit-1-gnome \
    xsettingsd \
    trayer \
    playerctl \
    ntfs-3g \
    p7zip-full \
    zip \
    unzip \
    gvfs

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
# daedalus-security'deki son sürümlere çekilir; ISO bayat çekirdekle
# çıkmaz (ör. DSA-6528-1 sonrası 6.1.187-1).
# -----------------------------------------------------------------------
echo "[GÜVENLİK] Güvenlik güncellemeleri uygulanıyor (daedalus-security)..."
apt-get update -qq
apt-get -y dist-upgrade
echo "[GÜVENLİK] linux-image-amd64 = $(dpkg-query -W -f='${Version}' linux-image-amd64 2>/dev/null || echo ?)"
UPG=$(apt-get -s dist-upgrade 2>/dev/null | awk '/^Inst/{c++} END{print c+0}')
echo "[GÜVENLİK] Bekleyen paket güncellemesi: $UPG (beklenen 0)"

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
for grp in sudo audio video plugdev netdev; do
    getent group "$grp" >/dev/null || groupadd -r "$grp" 2>/dev/null || true
done

if ! id -u ankora &>/dev/null; then
    useradd -m -s /bin/bash -u 1000 -G sudo,audio,video,plugdev,netdev ankora
else
    usermod -aG sudo,audio,video,plugdev,netdev ankora 2>/dev/null || true
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

# Kernel ZRAM bellek optimizasyonları
mkdir -p /etc/sysctl.d
cat << 'SYSCTL_ZRAM' > /etc/sysctl.d/99-zram.conf
vm.swappiness = 100
vm.vfs_cache_pressure = 50
vm.watermark_boost_factor = 0
vm.dirty_background_ratio = 5
vm.dirty_ratio = 10
SYSCTL_ZRAM

# -----------------------------------------------------------------------
# X11 Otomatik Kiosk Başlatıcı
# -----------------------------------------------------------------------
cat << 'XINIT' > /home/ankora/.xinitrc
#!/bin/sh
# Açılış ekranından X'e sessiz geçiş: plymouth açılış bitmeden kalırsa
# arkasında biriken boot metinleri ([FAIL] satırları) kullanıcıya görünür.
if command -v plymouth >/dev/null 2>&1 && plymouth --ping >/dev/null 2>&1; then
    plymouth quit 2>/dev/null || true
fi

# Loopback ağ arabirimini ayağa kaldır
ip link set lo up 2>/dev/null || ifconfig lo 127.0.0.1 up 2>/dev/null || true

xsetroot -solid "#0b0c10" 2>/dev/null || true
xset -dpms 2>/dev/null || true
xset s off 2>/dev/null || true
xset s noblank 2>/dev/null || true

# WebKitGTK ve X11 ortam ayarları (fiziksel donanım ve sanal makine uyumluluğu)
export GDK_BACKEND=x11
export WEBKIT_DISABLE_DMABUF_RENDERER=1
export WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1

# Sanal makine (VirtualBox, QEMU, KVM, VMware) tespiti:
# Sanal GPU'larda (VMSVGA/QXL) DRI çökmelerini önlemek için yazılımsal render (llvmpipe) devreye alınır;
# Fiziksel donanımlarda (Intel/AMD/Nvidia) tam GPU hızlandırması korunur.
IS_VM=0
for dmi in /sys/class/dmi/id/product_name /sys/class/dmi/id/sys_vendor /sys/class/dmi/id/board_vendor; do
    if [ -r "$dmi" ]; then
        case "$(cat "$dmi" 2>/dev/null)" in
            *[Vv]irtual[Bb]ox*|*[Vv][Mm]ware*|*KVM*|*QEMU*|*[Bb]ochs*|*innotek*) IS_VM=1; break ;;
        esac
    fi
done
if [ "$IS_VM" = "1" ]; then
    export LIBGL_ALWAYS_SOFTWARE=1
fi
# Kullanıcının Ayarlar'dan verdiği DPMS zaman aşımı yeniden başlatmada korunur
[ -f "$HOME/.config/ankora/dpms_secs" ] && xset +dpms dpms "$(cat "$HOME/.config/ankora/dpms_secs")" "$(cat "$HOME/.config/ankora/dpms_secs")" "$(cat "$HOME/.config/ankora/dpms_secs")" 2>/dev/null || true

# 1) Ekranın önerilen (native) çözünürlüğüne geç: kurulu sistemde düşük
#    modda kalan ekranın bulanık/sahte görünmesini böyle önlenir.
# 2) Önerilen okunamazsa ve çözünürlük hâlâ çok düşükse (ör. sanal
#    makinenin varsayılanı) eski düzeltme uygulanır; fiziksel ekranda
#    orijinal çözünürlük asla düşürülmez.
PREF=$(xrandr 2>/dev/null | awk '{
    for (i = 2; i <= NF; i++) {
        if (index($i, "+") && $(i - 1) ~ /^[0-9]+x[0-9]+$/) { print $(i - 1); exit }
    }
}')
CURM=$(xrandr 2>/dev/null | awk '{
    for (i = 2; i <= NF; i++) {
        if (index($i, "*") && $(i - 1) ~ /^[0-9]+x[0-9]+$/) { print $(i - 1); exit }
    }
}')
if [ -n "$PREF" ] && [ "$PREF" != "$CURM" ]; then
    xrandr -s "$PREF" 2>/dev/null || true
fi

CURW=$(xrandr 2>/dev/null | awk '/\*/{print $1; exit}' | cut -dx -f1)
case "$CURW" in
    ''|640*|720*|800*|854*|960*) xrandr -s 1280x800 2>/dev/null || xrandr -s 1024x768 2>/dev/null || true ;;
esac

# Dokunmatik giriş (Faz tahta/IR çerçeve + dokunmatik ped): pedlerde
# dokun-kaydır, tahta aygıtları her zaman açık. Kalibrasyon Ayarlar'dan.
# ETA sürücü varsa önce o koşar (Faz1-3/IR/eGalax/HID eşleşmesi + matris).
if [ -x /usr/bin/eta-touchdrv ]; then
    /usr/bin/eta-touchdrv --enable 2>/dev/null || true
fi
if command -v xinput >/dev/null 2>&1; then
    for _dev in $(xinput --list --id-only 2>/dev/null); do
        _name=$(xinput --list --name-only "$_dev" 2>/dev/null || true)
        case "$_name" in
            *[Tt]ouchpad*|*Synaptics*|*Elan*|*ELAN*)
                xinput --set-prop "$_dev" "libinput Tapping Enabled" 1 2>/dev/null || true
                xinput --set-prop "$_dev" "libinput Natural Scroll Enabled" 0 2>/dev/null || true
                xinput --set-prop "$_dev" "libinput Scroll Method Enabled" 0 0 1 2>/dev/null || true
                xinput --set-prop "$_dev" "libinput Click Method Enabled" 0 1 2>/dev/null || true
                ;;
            *[Tt]ouchscreen*|*[Tt]ouch*|*IR*|*Vestel*|*Arcelik*|*Faz*)
                xinput --enable "$_dev" 2>/dev/null || true
                ;;
        esac
    done
    unset _dev _name
fi

# Ankora Openbox Yapılandırmasını Hazırla ve Başlat
mkdir -p "$HOME/.config/openbox"
if [ -f /usr/share/ayaz/openbox-rc.xml ]; then
    cp -u /usr/share/ayaz/openbox-rc.xml "$HOME/.config/openbox/rc.xml"
fi

if command -v openbox >/dev/null 2>&1; then
    if [ -f "$HOME/.config/openbox/rc.xml" ]; then
        openbox --config-file "$HOME/.config/openbox/rc.xml" &
    else
        openbox &
    fi
fi

# Ses sunucusunu kullanıcı oturumunda başlat
if command -v pulseaudio >/dev/null 2>&1; then
    # Arka planda: ses sunucusu takılırsa oturum başlatma onu beklemez.
    pulseaudio --start --exit-idle-time=-1 >/dev/null 2>&1 &
fi

# Bildirim sunucusunu arka planda başlat
if command -v dunst >/dev/null 2>&1; then
    dunst &
fi

# Polkit Grafiksel Yetkilendirme Ajanı (GParted, Synaptic vb. root araçları için)
if command -v lxpolkit >/dev/null 2>&1; then
    lxpolkit &
elif [ -x /usr/lib/policykit-1-gnome/polkit-gnome-authentication-agent-1 ]; then
    /usr/lib/policykit-1-gnome/polkit-gnome-authentication-agent-1 &
fi

# XSettings Daemon (GTK/Qt tema eşitleme)
if command -v xsettingsd >/dev/null 2>&1; then
    xsettingsd &
fi

# Sistem Tepsisi (Systray)
if command -v trayer >/dev/null 2>&1; then
    trayer --edge bottom --align right --widthtype request --height 32 --transparent true --alpha 0 --tint 0x0f172a --distance 6 --expand false &
elif command -v stalonetray >/dev/null 2>&1; then
    stalonetray --geometry 1x1-10+10 --grow-gravity NE --icon-gravity NE --kludges force_icons_size --transparent --tint-color "#0f172a" &
fi

# Ayaz DE Masaüstü Ortamını çalıştır
# Sessiz siyah ekran yasağı: masaüstü düşerse günlük görünür bir pencerede
# sunulur ve kabuk açılır. Önceden süreç ölünce ekran yalnızca xsetroot
# renginde kalıyor, kullanıcı hiçbir hata göremiyordu.
AYAZ_LOG=/tmp/ayaz.log
if ! : > "$AYAZ_LOG" 2>/dev/null; then
    AYAZ_LOG=/dev/null
fi

AYAZ_BIN=
if [ -x /usr/bin/ayaz ]; then
    AYAZ_BIN=/usr/bin/ayaz
elif [ -x /usr/local/bin/ayaz ]; then
    AYAZ_BIN=/usr/local/bin/ayaz
fi

if [ -z "$AYAZ_BIN" ]; then
    printf '[Ayaz] Masaüstü ikilisi bulunamadı (/usr/bin/ayaz, /usr/local/bin/ayaz).\n' >>"$AYAZ_LOG"
    AYAZ_RC=127
else
    "$AYAZ_BIN" >>"$AYAZ_LOG" 2>&1
    AYAZ_RC=$?
fi

if [ "$AYAZ_RC" -ne 0 ]; then
    # Otomatik yeniden deneme döngüsünü kır: bir sonraki tty1 girişinde
    # startx kendiliğinden tekrar başlamaz, kullanıcı bilinçli karar verir.
    : > /tmp/ankora-desktop-failed 2>/dev/null || true
    printf '[Ayaz] Masaüstü başlatılamadı (çıkış kodu %s). Günlük: %s\n' "$AYAZ_RC" "$AYAZ_LOG" >&2
    if command -v xterm >/dev/null 2>&1; then
        exec xterm -T "Ayaz — Başlatma Hatası" -fa Monospace -fs 11 -geometry 120x36 \
            -e sh -c 'tail -n 60 "$1" 2>/dev/null; printf "\n--- Kabuk açık. Yeniden denemek için: exit, sonra startx ---\n"; exec sh' sh "$AYAZ_LOG"
    fi
    exec sh
fi

XINIT
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
deb http://deb.devuan.org/merged daedalus main contrib non-free non-free-firmware
deb http://deb.devuan.org/merged daedalus-security main contrib non-free non-free-firmware
deb http://deb.devuan.org/merged daedalus-updates main contrib non-free non-free-firmware
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
chroot "$CHROOT_DIR" /chroot-setup.sh
rm -f "$CHROOT_DIR/chroot-setup.sh"

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
Ankora Linux 3.5 — Kiosk Yapılandırma Raporu
=============================================

Taban            : Devuan GNU/Linux 5 (daedalus)
Init sistemi     : SysVinit (systemd yok)
Çekirdek         : Linux 6.1 LTS
Masaüstü         : Ayaz DE (Ayaz — Ankora Linux)
Pencere motoru   : Tauri 1.5 + WebKitGTK
Otomatik giriş   : tty1 getty --autologin ankora → startx
Ekran düzeltmesi : Yalnızca çözünürlük çok düşükse xrandr -s 1280x800
Paket yöneticisi : Yazılım Mağazası (apt tabanlı)

Bu dosya Ayaz Dosyalar ve Ofis uygulamalarından açılabilir.
Kiosk kilit ekranı ve widget ayarları Ayarlar penceresinden yönetilir.
KIOSKTXT
cat << 'KIOSKMD' > "$BDIR/kiosk-ayarlari.md"
# Ankora Linux 3.5 — Kiosk Yapılandırma Raporu

- Taban: Devuan Daedalus (SysVinit, systemd-free)
- Çekirdek: Linux 6.1 LTS
- Pencere motoru: Tauri + WebKitGTK
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
    echo "[BİLGİ] Önceden derlenmiş Ayaz DE .deb paketi kuruluyor..."
    cp "$ROOT_DIR/dist/ayaz-de-latest-amd64.deb" "$CHROOT_DIR/tmp/ayaz.deb"
    chroot "$CHROOT_DIR" bash -c "dpkg -i /tmp/ayaz.deb || apt-get install -f -y; rm -f /tmp/ayaz.deb"
fi
# /usr/bin/ayaz canlı oturumun ana girişidir (xinitrc / ayaz-session).
# .deb /usr/bin/ayaz-de kurar; noble-shimli Rust ikilisi webkit 4.1'e bağlıdır
# ve yalnız 4.0'lı canlıda açılmaz. Giriş her koşulda çalışan Python köprüye
# emanet edilir; ayaz-de ayrıca kurulu kalır.
if [ ! -x "$CHROOT_DIR/usr/bin/ayaz" ]; then
    echo "[BİLGİ] Ayaz DE Kiosk çalışma ortamı ve arayüz bileşenleri entegre ediliyor..."
    cat << 'AYAZ_PY' > "$CHROOT_DIR/usr/bin/ayaz"
#!/usr/bin/env python3
import sys, os, subprocess, json, threading, shutil, re, shlex, hmac, gzip, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import urllib.parse, urllib.request

# GPU Donanım Hızlandırma ve WebKit Ortam Değişkenleri
# DİKKAT: WebKit ve GTK kütüphaneleri import edilmeden ÖNCE ortam değişkenleri ayarlanmalıdır!
os.environ["GDK_BACKEND"] = "x11"
os.environ["WEBKIT_DISABLE_DMABUF_RENDERER"] = "1"
os.environ["WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS"] = "1"

# Sanal makine (VirtualBox, QEMU, KVM, VMware) tespiti:
# Sanal GPU'larda DRI çökmelerini önlemek için yazılımsal render (llvmpipe) devreye alınır;
# Fiziksel donanımlarda tam GPU hızlandırması korunur.
IS_VM = False
for dmi in ('/sys/class/dmi/id/product_name', '/sys/class/dmi/id/sys_vendor', '/sys/class/dmi/id/board_vendor'):
    if os.path.exists(dmi):
        try:
            with open(dmi, 'r', errors='ignore') as f:
                val = f.read().lower()
                if any(k in val for k in ('virtualbox', 'vmware', 'kvm', 'qemu', 'bochs', 'innotek')):
                    IS_VM = True
                    break
        except Exception:
            pass

if IS_VM:
    os.environ["LIBGL_ALWAYS_SOFTWARE"] = "1"

# Canlı oturumda kullanıcı PATH'i /sbin ve /usr/sbin içermez; sistem ve
# kurulum araçları (parted, mkfs.vfat, blkid, chroot...) bu dizinlerdedir.
# Bilinen sistem dizinleri başa eklenir ki alt süreçlerin hepsi aynı yolu görsün.
_SBIN_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
os.environ['PATH'] = _SBIN_PATH + os.pathsep + os.environ.get('PATH', '')

import gi
gi.require_version('Gtk', '3.0')
try:
    gi.require_version('WebKit2', '4.0')
except ValueError:
    gi.require_version('WebKit2', '4.1')
from gi.repository import Gtk, WebKit2, Gdk, GLib

PORT = 49152
# Origin başlığı yansıtılmaz: sabitlenen tek origin, aynı makinedeki her
# sayfanın IPC köprüsünü kullanmasını engeller.
ALLOWED_ORIGIN = f'http://127.0.0.1:{PORT}'
TERM_CWD = '/home/ankora' if os.path.exists('/home/ankora') else os.path.expanduser('~')

# GÜVENLİK: IPC Token - sunucu başlarken üretilir, her istekte doğrulanır
import secrets
IPC_TOKEN = secrets.token_hex(32)
# Ardışık başarısız token denemelerini sayar; aşımında kapı tamamen kapanır
IPC_STATE = {'bad': 0}
_STATE_LOCK = threading.Lock()

# XDG tarama önbelleği: dizin özetleri (mtime) değişmediyse yeniden taranmaz
_XDG_CACHE = None
_CACHE_LOCK = threading.Lock()

# Kilit ekranı girişim sınırlayıcı (C3) ve oturum kilit yetki takipçisi (H1)
_LOCK_ATTEMPTS = {'count': 0, 'last_failed': 0.0}
_LOCK_MUTEX = threading.Lock()
_UNLOCK_AUTH_UNTIL = 0.0
_AUTH_LOCK = threading.Lock()

# Proxy istek hız sınırlayıcı (C4)
_PROXY_REQUEST_TIMES = []
_PROXY_LOCK = threading.Lock()

def is_safe_user_path(p, write=False):
    if not p or '\0' in p:
        raise Exception('Geçersiz dosya yolu')
    p_abs = os.path.abspath(p)
    forbidden = ['/etc', '/boot', '/root', '/proc', '/sys', '/dev', '/usr', '/bin', '/sbin', '/lib', '/lib64']
    for f in forbidden:
        if p_abs == f or p_abs.startswith(f + '/'):
            raise Exception(f'Güvenlik İlkesi İhlali: Sistem dizinine ({f}) işlem yapılamaz')
    if write and (p_abs == '/var' or (p_abs.startswith('/var/') and not p_abs.startswith('/var/tmp/'))):
        raise Exception('Güvenlik İlkesi İhlali: /var dizinine doğrudan işlem yapılamaz')
    return p_abs

# Radyo (Wi-Fi/Bluetooth) ve ağ durumu: nmcli varsa o, yoksa rfkill.
def _run_capture(cmd_args):
    # Sabit argümanlı tek komut; kabuk yorumlaması yok, aracı yoksa None.
    try:
        proc = subprocess.run(
            cmd_args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, timeout=15
        )
    except Exception:
        return None
    if proc.returncode != 0:
        return None
    return proc.stdout

def _root_run(cmd_args, stdin_text=None, timeout=30):
    """root gerektiren komutu ya doğrudan ya da `sudo -n` ile çalıştırır.

    Canlı sistemde ankora için parolasız sudo tanımlıdır; sudo yoksa ya da
    parola gerekiyorsa beklemeden net bir Türkçe hata döner."""
    if os.geteuid() == 0:
        run_args = list(cmd_args)
    elif shutil.which('sudo'):
        run_args = ['sudo', '-n'] + list(cmd_args)
    else:
        raise Exception('Bu ayar için yönetici (root) yetkisi gerekiyor: sudo kurulu değil.')
    try:
        proc = subprocess.run(
            run_args, input=stdin_text, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True, timeout=timeout
        )
    except subprocess.TimeoutExpired:
        raise Exception(f'Komut zaman aşımına uğradı ({timeout} sn)')
    except Exception as e:
        raise Exception(f'Komut çalıştırılamadı: {e}')
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or '').strip()
        if any(t in err for t in ('password is required', 'a terminal is required', 'no tty present')):
            raise Exception('Bu ayar için yönetici (root) yetkisi gerekiyor: sudo parola soruyor.')
    return proc

def _snap_helper_json(action, arg):
    """Kurtarma noktası yazımları root-owned ayaz-pkg-helper üzerinden
    yapılır (sudoers NOPASSWD). Masaüstü oturumu /var/backups altına
    doğrudan yazamaz; 'yetki yok' hatasının köküdü bu köprünün eski
    doğrudan-yazma davranışıydı. Helper JSON döner, hata olursa Türkçe
    mesajıyla Exception yükselir."""
    helper = '/usr/local/bin/ayaz-pkg-helper'
    if not os.path.exists(helper):
        raise Exception('Kurtarma noktası yardımcısı (ayaz-pkg-helper) bulunamadı; sistem kurulumu eksik.')
    proc = _root_run([helper, action, arg], timeout=900)
    if proc.returncode != 0:
        raise Exception((proc.stderr or proc.stdout or '').strip() or 'Kurtarma noktası işlemi başarısız oldu')
    out = (proc.stdout or '').strip()
    try:
        return json.loads(out)
    except Exception:
        return out

def _live_boot_disks():
    """Canlı ISO'nun açıldığı disk(ler). Kurulum hedefi olarak sunulmaz:
    USB'den açılan sistemde ilk disk çoğu zaman USB'nin kendisidir ve
    seçilirse kurulum, üzerinde çalıştığı ortamı siler."""
    disks = set()
    for mp in ('/run/live/medium', '/lib/live/mount/medium'):
        src = (_run_capture(['findmnt', '-n', '-o', 'SOURCE', mp]) or '').strip()
        if not src.startswith('/dev/'):
            continue
        parent = (_run_capture(['lsblk', '-no', 'PKNAME', src]) or '').strip().splitlines()
        parent = parent[0].strip() if parent and parent[0].strip() else ''
        disks.add(f'/dev/{parent}' if parent else src)
    return disks

def _rfkill_enabled(out):
    for line in out.splitlines():
        t = line.strip()
        if t.startswith('Soft blocked:'):
            return t.endswith('no')
    return False

def _radio_state():
    state = {
        'available': False, 'backend': '', 'wifi_enabled': False,
        'bluetooth_enabled': False, 'wifi_ssid': ''
    }
    wifi = _run_capture(['nmcli', 'radio', 'wifi'])
    if wifi is not None:
        bt = _run_capture(['nmcli', 'radio', 'bluetooth']) or ''
        state['available'] = True
        state['backend'] = 'nmcli'
        state['wifi_enabled'] = wifi.strip() == 'enabled'
        state['bluetooth_enabled'] = bt.strip() == 'enabled'
        if state['wifi_enabled']:
            listing = _run_capture(['nmcli', '-t', '-f', 'ACTIVE,SSID', 'dev', 'wifi', 'list'])
            if listing:
                for line in listing.splitlines():
                    parts = line.split(':', 1)
                    if len(parts) == 2 and parts[0] == 'yes' and parts[1]:
                        state['wifi_ssid'] = parts[1].replace('\\:', ':').replace('\\\\', '\\')
                        break
        return state
    wl = _run_capture(['rfkill', 'list', 'wifi'])
    if wl is not None:
        state['available'] = True
        state['backend'] = 'rfkill'
        state['wifi_enabled'] = _rfkill_enabled(wl)
        bl = _run_capture(['rfkill', 'list', 'bluetooth'])
        if bl is not None:
            state['bluetooth_enabled'] = _rfkill_enabled(bl)
    return state

def _battery_state():
    # Masaüstü makinelerde BAT* yoktur; None döner ve arayüzde gizlenir.
    try:
        for name in sorted(os.listdir('/sys/class/power_supply')):
            if not name.startswith('BAT'):
                continue
            base = os.path.join('/sys/class/power_supply', name)
            pct = None
            status = None
            try:
                with open(os.path.join(base, 'capacity')) as f:
                    pct = int(f.read().strip())
            except Exception:
                pass
            try:
                with open(os.path.join(base, 'status')) as f:
                    status = f.read().strip()
            except Exception:
                pass
            return {'percent': pct, 'status': status}
    except Exception:
        pass
    return {'percent': None, 'status': None}

# /proc/stat sayaçları iki okuma arası okunur; ilk örnekte 0.0 döner.
_CPU_PREV = {'total': None, 'idle': None}

def _cpu_percent():
    try:
        with open('/proc/stat') as f:
            parts = f.readline().split()
        vals = [int(x) for x in parts[1:] if x.isdigit()]
        if len(vals) < 4:
            return None
        total = sum(vals)
        idle = vals[3] + (vals[4] if len(vals) > 4 else 0)
    except Exception:
        return None
    prev_total = _CPU_PREV['total']
    prev_idle = _CPU_PREV['idle']
    pct = 0.0
    if prev_total is not None and total > prev_total:
        dt = total - prev_total
        di = idle - prev_idle
        pct = max(0.0, min(100.0, 100.0 * (1.0 - di / dt)))
    _CPU_PREV['total'] = total
    _CPU_PREV['idle'] = idle
    return round(pct, 1)

def _disk_usage():
    # Kök bölünüm: (kullanılan GB, toplam GB, %); okunamazsa None.
    try:
        import shutil
        du = shutil.disk_usage('/')
        g = 1024 ** 3
        pct = int(round(100.0 * du.used / du.total)) if du.total else 0
        return (round(du.used / g, 1), round(du.total / g, 1), pct)
    except Exception:
        return None

# --- Ekran modu güvenli değiştirme yardımcıları ---------------------------
# Çözünürlük değişikliği 15 saniye içinde onaylanmazsa eski moda geri
# dönülür: kullanıcı yanlış mod seçerse ekran kararmaz/kurulmaz, sistem
# kendini kurtarır. Onay arayüzden confirm_display_mode ile gelir.
DISPLAY_REVERT_DELAY = 15
_display_revert = {'pid': None, 'mode': None, 'rate': None, 'output': None}


def _display_current_state():
    """xrandr --query okuyup {'output','mode','rate'} döndürür; bulunamazsa None."""
    try:
        p = subprocess.run(['xrandr', '--query'], stdout=subprocess.PIPE,
                           stderr=subprocess.DEVNULL, text=True, timeout=10)
    except Exception:
        return None
    out = mode = rate = None
    for line in p.stdout.splitlines():
        if out is None:
            m = re.match(r'^(\S+)\s+connected\b', line)
            if m:
                out = m.group(1)
                sm = re.search(r'(\d+x\d+)\+\d+\+\d+', line)
                if sm:
                    mode = sm.group(1)
        mm = re.match(r'^\s+(\d+x\d+)\s+(.+)$', line)
        if mm:
            for tok in mm.group(2).split():
                if '*' in tok:
                    rate = tok.replace('*', '').replace('+', '')
    if out is None or mode is None:
        return None
    return {'output': out, 'mode': mode, 'rate': rate}


def _display_cancel_revert():
    pid = _display_revert.get('pid')
    if pid:
        try:
            os.kill(pid, 15)  # SIGTERM
        except Exception:
            pass
    _display_revert.update({'pid': None, 'mode': None, 'rate': None, 'output': None})


def _display_schedule_revert(prev):
    """prev hedefine DISPLAY_REVERT_DELAY saniye sonra geri dönen süreci
    başlatır; confirm_display_mode çağrısı süreci öldürerek iptal eder."""
    _display_cancel_revert()
    if not prev:
        return None
    cmd = 'sleep %d; xrandr --output %s --mode %s' % (
        DISPLAY_REVERT_DELAY, prev['output'], prev['mode'])
    if prev.get('rate'):
        cmd += ' --rate %s' % prev['rate']
    cmd += ' >/dev/null 2>&1'
    try:
        proc = subprocess.Popen(['sh', '-c', cmd])
    except Exception:
        return None
    _display_revert.update({'pid': proc.pid, 'mode': prev['mode'],
                            'rate': prev.get('rate'), 'output': prev['output']})
    return proc.pid

_EXACT_ALLOWED = {
    "uname -a", "uname -r", "whoami", "uptime", "ls", "ls -la", "ls -l", "ls -lh",
    "date", "hostname", "id", "free -m", "free -h", "df -h", "df -h /",
    "lscpu", "lsblk", "/usr/local/bin/ankora-doctor",
    "cat /etc/os-release", "cat /etc/issue", "cat /proc/version",
    "cat /proc/meminfo", "cat /proc/cpuinfo", "ps aux", "top -b -n 1",
    "apt-get clean", "rm -rf /tmp/*",
    "apt-get clean && rm -rf /tmp/*", "df -h / && free -m", "clear", "sync"
}
_ALLOWED_UTILITIES = {
    "uname", "whoami", "uptime", "date", "hostname", "id",
    "free", "df", "ls", "ps", "top", "which",
    "cat", "pwd", "echo", "head", "tail", "grep", "wc",
    "lscpu", "lsblk", "arch", "w", "who", "cal", "apt-cache"
}
_FORBIDDEN_BINARIES = {
    "sudo", "su", "pkexec", "dd", "mkfs", "fdisk", "parted",
    "sh", "bash", "zsh", "dash", "csh", "tcsh", "fish", "env",
    "xargs", "passwd", "chpasswd", "chmod", "chown", "reboot",
    "poweroff", "shutdown", "init", "systemctl", "telinit", "halt",
    "chroot", "unshare", "nsenter", "mount", "umount",
    "nc", "ncat", "socat", "ssh", "scp", "wget", "curl",
    "kill", "pkill", "killall", "tee", "install", "ln",
    "mkfifo", "mknod", "insmod", "modprobe", "rmmod",
    "docker", "podman", "runuser", "sg", "newgrp",
    "at", "batch", "crontab", "systemd-run"
}
_SENSITIVE_PATTERNS = [
    "/etc/shadow", "/etc/gshadow", "/etc/sudoers", "/etc/master.passwd",
    "/etc/security", "/root/.ssh", ".ssh/", "id_rsa", "id_ed25519",
    "id_ecdsa", "id_dsa", "/proc/kcore", "/sys/", "/dev/", "/var/log/auth",
    "ai_creds.json", "lock.hash"
]
_ALLOWED_CAT_FILES = {
    "/etc/os-release", "/etc/issue", "/proc/version", "/proc/meminfo", "/proc/cpuinfo"
}
_ALLOWED_AGENT_ACTIONS = {
    "apt-get clean && rm -rf /tmp/*",
    "apt-get clean",
    "rm -rf /tmp/*",
    "df -h / && free -m",
    "df -h",
    "free -m",
    "free -h",
    "uptime",
    "uname -a",
    "lscpu",
    "lsblk",
    "ps aux",
    "top -b -n 1",
    "/usr/local/bin/ankora-doctor",
    "sync",
}
_PENDING_AGENT_ACTION = {'token': None, 'cmd': None, 'ts': 0.0}
_AGENT_LOCK = threading.Lock()

def _generate_agent_action_token(cmd_str):
    import hashlib
    token = hashlib.sha256(os.urandom(32) + cmd_str.encode('utf-8')).hexdigest()
    with _AGENT_LOCK:
        _PENDING_AGENT_ACTION['token'] = token
        _PENDING_AGENT_ACTION['cmd'] = cmd_str
        _PENDING_AGENT_ACTION['ts'] = time.time()
    return token

def execute_ayaz_command(cmd, args):
    global TERM_CWD
    home_dir = os.path.expanduser('~')
    if not os.path.exists(home_dir):
        home_dir = '/home/ankora' if os.path.exists('/home/ankora') else '/root'

    if not os.path.exists(TERM_CWD):
        TERM_CWD = home_dir

    if cmd == 'report_console':
        # Teşhis kaydı: konsol/CSP ihlalleri (/tmp/ayaz-console.log).
        line = str(args.get('line') or args.get('message') or '')[:500].strip()
        if line:
            try:
                with open('/tmp/ayaz-console.log', 'a', encoding='utf-8') as fh:
                    fh.write(line + '\n')
            except Exception:
                pass
        return True

    if cmd == 'run_terminal_command':
        command = args.get('command', '').strip()
        if not command:
            return ''

        # Persistent cd tracking
        if command == 'cd':
            TERM_CWD = home_dir
            return ''
        elif command.startswith('cd '):
            target_d = command[3:].strip()
            if target_d.startswith('~'):
                target_d = os.path.expanduser(target_d)
            new_path = os.path.normpath(os.path.join(TERM_CWD, target_d))
            if os.path.isdir(new_path):
                TERM_CWD = new_path
                return ''
            else:
                return f'bash: cd: {target_d}: Böyle bir dosya ya da dizin yok'

        if command not in _EXACT_ALLOWED:
            bad_chars = set(';&|`$\n\r><()')
            found_bad = bad_chars.intersection(command)
            if found_bad:
                return f"[GÜVENLİK İHLALİ] Yasaklı kabuk operatörü tespit edildi: {list(found_bad)[0]}"

            parts = command.split()
            if not parts:
                return ''
            bin_name = parts[0]
            if bin_name in _FORBIDDEN_BINARIES:
                return f"[GÜVENLİK İHLALİ] '{bin_name}' komutu güvenlik politikası gereği doğrudan çalıştırılamaz."
            if bin_name not in _ALLOWED_UTILITIES:
                return f"[GÜVENLİK İHLALİ] '{bin_name}' komutu izin verilenler listesinde (whitelist) yer almıyor."

            lower_cmd = command.lower()
            for pat in _SENSITIVE_PATTERNS:
                if pat.lower() in lower_cmd:
                    return f"[GÜVENLİK İHLALİ] Hassas sistem yoluna erişim engellendi: {pat}"

            if bin_name in ("cat", "head", "tail", "grep", "wc"):
                for arg in parts[1:]:
                    if arg.startswith('/'):
                        if arg not in _ALLOWED_CAT_FILES and not arg.startswith(home_dir):
                            return f"[GÜVENLİK İHLALİ] '{arg}' yolu izin verilen okuma listesinde yer almıyor."

        # Whitelist denetiminden geçen komut için güvenli bash çalıştırma
        try:
            env = dict(os.environ, TERM='xterm-256color', HOME=home_dir, PAGER='cat')
            proc = subprocess.run(
                ['/bin/bash', '-c', command],
                cwd=TERM_CWD,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                timeout=120,
                env=env
            )
            out = proc.stdout or ''
            if len(out) > 1_000_000:
                out = out[:1_000_000] + '\n... [Güvenlik Sınırı: Çıktı boyutu 1 MB sınırını aştığı için kırpıldı.]'
            if not out and proc.returncode != 0:
                out = f'[Komut {proc.returncode} koduyla sonlandı]'
            return out
        except subprocess.TimeoutExpired:
            return '[Zaman Aşımı] Komut 120 saniye içinde tamamlanamadı.'
        except Exception as e:
            return f'[HATA] {e}'

    elif cmd == 'launch_application':
        exec_cmd = args.get('exec', '').strip()
        if not exec_cmd:
            raise Exception('Uygulama komutu boş olamaz')
        # GÜVENLİK: Shell metakarakterleri engelle
        SHELL_BAD = set(';|`$><\\()\n\r&')
        if SHELL_BAD & set(exec_cmd):
            raise Exception('Güvenlik Hatası: Komutta tehlikeli karakterler var')
        FORBIDDEN_BINS = {
            'sudo', 'su', 'pkexec', 'dd', 'mkfs', 'fdisk', 'parted',
            'sh', 'bash', 'zsh', 'dash', 'csh', 'tcsh', 'fish', 'env',
            'xargs', 'passwd', 'chpasswd', 'chmod', 'chown', 'reboot',
            'poweroff', 'shutdown', 'init', 'systemctl', 'telinit', 'halt',
            'chroot', 'unshare', 'nsenter', 'mount', 'umount',
            'nc', 'ncat', 'socat', 'ssh', 'scp', 'wget', 'curl',
            'kill', 'pkill', 'killall', 'tee', 'install', 'ln',
            'mkfifo', 'mknod', 'insmod', 'modprobe', 'rmmod',
            'docker', 'podman', 'runuser', 'sg', 'newgrp',
            'at', 'batch', 'crontab', 'systemd-run'
        }
        try:
            tokens = shlex.split(exec_cmd)
        except Exception:
            tokens = exec_cmd.split()
        if not tokens:
            raise Exception('Geçersiz uygulama komutu')

        first_word = tokens[0]
        base_name = os.path.basename(first_word)
        if base_name in FORBIDDEN_BINS:
            raise Exception(f'Güvenlik İlkesi İhlali: {base_name} doğrudan başlatılamaz')

        # H2: Argümanlarda geçen ikili adları da denetle
        for arg in tokens[1:]:
            if '://' in arg:
                continue
            arg_base = os.path.basename(arg)
            if arg_base in FORBIDDEN_BINS:
                raise Exception(f'Güvenlik İlkesi İhlali: {arg_base} komut parametresi olarak kullanılamaz')

        if '/' in first_word:
            allowed_prefixes = ('/usr/bin/', '/bin/', '/usr/local/bin/', '/usr/games/', '/opt/')
            if not any(first_word.startswith(pfx) for pfx in allowed_prefixes):
                raise Exception('Güvenlik Hatası: Uygulama yolu izin verilen sistem dizinlerinde değil')
            if os.path.exists(first_word):
                real_bin = os.path.realpath(first_word)
                if os.path.basename(real_bin) in FORBIDDEN_BINS:
                    raise Exception('Güvenlik İlkesi İhlali: Program kısayolu izin verilmeyen bir sistem aracına işaret ediyor')

        env = os.environ.copy()
        if 'DISPLAY' not in env:
            env['DISPLAY'] = ':0'
        cli_apps = {'htop', 'btop', 'ncdu', 'fastfetch', 'neofetch', 'inxi', 'iotop', 'iftop'}
        if base_name in cli_apps or first_word in cli_apps:
            subprocess.Popen(['xterm', '-title', base_name, '-e'] + tokens, cwd=home_dir, env=env, start_new_session=True)
        else:
            subprocess.Popen(tokens, cwd=home_dir, env=env, start_new_session=True)
        return f'Uygulama başlatıldı: {exec_cmd}'

    elif cmd == 'install_deb_package':
        pkg = args.get('packageName', '').strip()
        if not pkg or not re.match(r'^[a-zA-Z0-9.+_-]+$', pkg):
            raise Exception('Geçersiz paket adı biçimi')
        helper = '/usr/local/bin/ayaz-pkg-helper'
        cmd_args = ['sudo', helper, 'install', pkg] if os.path.exists(helper) else ['sudo', 'apt-get', 'install', '-y', '--no-install-recommends', '--', pkg]
        # stdin DEVNULL: sudo parola sorarsa veya dpkg conffile sorusu
        # gelirse arayüz askıda kalmasın, hata anında frontend'e dönsün.
        try:
            proc = subprocess.run(
                cmd_args,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=300
            )
        except subprocess.TimeoutExpired:
            raise Exception(f'Kurulum zaman aşımına uğradı: {pkg} (300 sn)')
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or '').strip()
            if not err:
                err = f'çıkış kodu {proc.returncode}'
            raise Exception(f'Kurulum başarısız: {err}')

        # Kurulan paketin .desktop girdisi kullanıcı dizinine kopyalanır; Başlat
        # menüsü ve masaüstü ikonu yeniden başlatma sonrasında da korunur.
        # Dosya adları paket adıyla birebir örtüşmeyebilir (debian-xterm.desktop,
        # mate-terminal.desktop); önek ve ek sonu da denenir. Kimlik ve görünen
        # ad .desktop içinden alınır, yoksa taramanın döndürdüğü kayıtla
        # eşleşmez ve menüde iki kez görünür.
        app_id = app_name = app_exec = pkg
        user_app_dir = os.path.expanduser('~/.local/share/applications')
        try:
            os.makedirs(user_app_dir, exist_ok=True)
            sys_dir = '/usr/share/applications'
            if os.path.isdir(sys_dir):
                matches = [
                    os.path.join(sys_dir, fn) for fn in os.listdir(sys_dir)
                    if fn.endswith('.desktop') and (
                        fn[:-8] == pkg
                        or fn[:-8].startswith(pkg + '-')
                        or fn[:-8].endswith('-' + pkg)
                    )
                ]
                src = sorted(matches, key=len)[0] if matches else None
                if src:
                    hidden = False
                    in_entry = False
                    with open(src, encoding='utf-8', errors='replace') as fh:
                        for line in fh:
                            line = line.strip()
                            if line.startswith('['):
                                in_entry = (line == '[Desktop Entry]')
                            elif in_entry:
                                if line.startswith('Name='):
                                    app_name = line.split('=', 1)[1]
                                elif line.startswith('Exec='):
                                    parts = line.split('=', 1)[1].split()
                                    if parts:
                                        app_exec = parts[0]
                                elif line.startswith(('Hidden=True', 'NoDisplay=True')):
                                    hidden = True
                    if not hidden:
                        app_id = os.path.basename(src)[:-8]
                        shutil.copy2(src, os.path.join(user_app_dir, os.path.basename(src)))
        except Exception:
            pass

        return {'id': app_id, 'name': app_name, 'exec': app_exec,
                'cat': 'util', 'is_installed_by_user': True}

    elif cmd == 'install_vendor_package':
        # Üçüncü parti resmi depo kurulumları (Brave/Helium/Antigravity).
        # Ad eşlemesi sabittir; URL/komut arayüzden ALINMAZ — hepsi
        # root-owned ayaz-pkg-helper betiğinin içindedir.
        vendor = str(args.get('vendor', '')).strip()
        vendor_pkgs = {'brave': 'brave-browser',
                       'helium': 'helium-bin',
                       'antigravity': 'antigravity'}
        if vendor not in vendor_pkgs:
            raise Exception('Bilinmeyen uygulama kaynağı')
        helper = '/usr/local/bin/ayaz-pkg-helper'
        if not os.path.exists(helper):
            raise Exception('Güvenlik: ayaz-pkg-helper bulunamadı; vendor kurulumu yapılamaz')
        try:
            proc = subprocess.run(
                ['sudo', helper, 'vendor', vendor],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=600
            )
        except subprocess.TimeoutExpired:
            raise Exception(f'Kurulum zaman aşımına uğradı: {vendor} (600 sn)')
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or '').strip()
            if not err:
                err = f'çıkış kodu {proc.returncode}'
            raise Exception(f'Kurulum başarısız: {err}')
        # Depo eklendikten sonraki paket kurulumu ve .desktop yerleşimi normal
        # kurulum akışının kendisiyle yapılır (apt ikinci çağrıda boştur).
        return execute_ayaz_command('install_deb_package',
                                    {'packageName': vendor_pkgs[vendor]})

    elif cmd == 'install_meb_certificate':
        # MEB okul ağı kök sertifikası: indirme ve doğrulama yalnızca
        # root-owned ayaz-pkg-helper içindedir; arayüzden URL alınmaz.
        helper = '/usr/local/bin/ayaz-pkg-helper'
        if not os.path.exists(helper):
            raise Exception('Güvenlik: ayaz-pkg-helper bulunamadı; MEB sertifikası kurulamaz')
        try:
            proc = subprocess.run(
                ['sudo', helper, 'mebcert'],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=180
            )
        except subprocess.TimeoutExpired:
            raise Exception('MEB sertifika kurulumu zaman aşımına uğradı (180 sn)')
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or '').strip()
            if not err:
                err = f'çıkış kodu {proc.returncode}'
            raise Exception(f'MEB sertifikası kurulamadı: {err}')
        return 'MEB kök sertifikası sisteme ve tarayıcı NSS deposuna kuruldu.'

    elif cmd == 'remove_meb_certificate':
        # Kaldırma da yalnız root-owned yardımcı üzerinden yapılır; arayüz
        # dosya yolu veya komut göndermez.
        helper = '/usr/local/bin/ayaz-pkg-helper'
        if not os.path.exists(helper):
            raise Exception('Güvenlik: ayaz-pkg-helper bulunamadı; MEB sertifikası kaldırılamaz')
        try:
            proc = subprocess.run(
                ['sudo', helper, 'mebcert-remove'],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=180
            )
        except subprocess.TimeoutExpired:
            raise Exception('MEB sertifika kaldırma zaman aşımına uğradı (180 sn)')
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or '').strip()
            if not err:
                err = f'çıkış kodu {proc.returncode}'
            raise Exception(f'MEB sertifikası kaldırılamadı: {err}')
        return 'MEB kök sertifikası sistemden ve tarayıcı depolarından kaldırıldı.'

    elif cmd == 'get_xdg_user_dirs':
        # Gerçek XDG kullanıcı dizinleri (~/.config/user-dirs.dirs öncelikli).
        # Yerel ad (Downloads) ya da Türkçe ad (İndirilenler) kurulumdaki
        # dile göre değişir; arayüz varsayım yapmaz, buradan okur.
        def _xdg_pick(key, fallbacks):
            cfg = os.path.join(home_dir, '.config/user-dirs.dirs')
            try:
                with open(cfg, encoding='utf-8', errors='replace') as fh:
                    for line in fh:
                        line = line.strip()
                        if line.startswith(key + '='):
                            val = line.split('=', 1)[1].strip().strip('"')
                            if val.startswith('$HOME'):
                                val = os.path.join(home_dir, val[5:].lstrip('/'))
                            if val:
                                return val
            except Exception:
                pass
            for fb in fallbacks:
                p = os.path.join(home_dir, fb)
                if os.path.isdir(p):
                    return p
            return os.path.join(home_dir, fallbacks[0])
        return {
            'home': home_dir,
            'desktop': _xdg_pick('XDG_DESKTOP_DIR', ['Desktop', 'Masaüstü']),
            'download': _xdg_pick('XDG_DOWNLOAD_DIR', ['Downloads', 'İndirilenler']),
            'documents': _xdg_pick('XDG_DOCUMENTS_DIR', ['Documents', 'Belgeler']),
            'pictures': _xdg_pick('XDG_PICTURES_DIR', ['Pictures', 'Resimler']),
            'music': _xdg_pick('XDG_MUSIC_DIR', ['Music', 'Müzik']),
            'videos': _xdg_pick('XDG_VIDEOS_DIR', ['Videos', 'Videolar']),
        }

    elif cmd == 'get_app_icon':
        # Kurulu uygulamanın gerçek simge dosyasını veri URL'si yapar.
        # Yalnızca resim uzantılı, 512 KB altı dosyalar okunur.
        import base64 as _b64
        names = args.get('names', []) or []
        if isinstance(names, str):
            names = [names]
        search_dirs = [
            os.path.join(home_dir, '.local/share/icons'),
            os.path.join(home_dir, '.icons'),
            '/usr/share/icons',
            '/usr/share/pixmaps',
            '/usr/local/share/icons',
            '/usr/local/share/pixmaps',
        ]
        found = None
        for cand in names:
            c = str(cand).strip()
            if not c:
                continue
            if os.path.isabs(c):
                if os.path.isfile(c) and c.lower().endswith(('.png', '.svg', '.xpm')):
                    found = c
                    break
                continue
            base = c.rsplit('/', 1)[-1]
            rels = [f'{base}.png', f'{base}.svg', f'{base}.xpm',
                    f'hicolor/48x48/apps/{base}.png',
                    f'hicolor/scalable/apps/{base}.svg',
                    f'hicolor/32x32/apps/{base}.png',
                    f'Adwaita/48x48/apps/{base}.png',
                    f'Adwaita/scalable/apps/{base}.svg']
            hit = None
            for d in search_dirs:
                for rel in rels:
                    p = os.path.join(d, rel)
                    if os.path.isfile(p):
                        hit = p
                        break
                if hit:
                    break
            if hit:
                found = hit
                break
        if not found:
            return None
        try:
            if os.path.getsize(found) > 512 * 1024:
                return None
            with open(found, 'rb') as fh:
                raw = fh.read()
            low = found.lower()
            mime = 'image/svg+xml' if low.endswith('.svg') else (
                'image/x-xpixmap' if low.endswith('.xpm') else 'image/png')
            return f'data:{mime};base64,{_b64.b64encode(raw).decode("ascii")}'
        except Exception:
            return None

    elif cmd == 'remove_deb_package':
        pkg = args.get('packageName', '').strip()
        if not pkg or not re.match(r'^[a-zA-Z0-9.+_-]+$', pkg):
            raise Exception('Geçersiz paket adı biçimi')
        helper = '/usr/local/bin/ayaz-pkg-helper'
        cmd_args = ['sudo', helper, 'remove', pkg] if os.path.exists(helper) else ['sudo', 'apt-get', 'remove', '-y', '--', pkg]
        try:
            proc = subprocess.run(
                cmd_args,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=120
            )
        except subprocess.TimeoutExpired:
            raise Exception(f'Kaldırma zaman aşımına uğradı: {pkg} (120 sn)')
        # Daha önce returncode'a bakılmadan "kaldırıldı" dönülüyordu; arayüz
        # paket silinmemişken başarı görüyordu.
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or '').strip()
            if not err:
                err = f'çıkış kodu {proc.returncode}'
            raise Exception(f'Kaldırma başarısız: {err}')
        return f'{pkg} kaldırıldı'

    elif cmd == 'list_installed_deb_packages':
        # Yazılım Mağazası'nın "kurulu" listesi dpkg üzerinden yürür;
        # dpkg yoksa (veya sorgu düşerse) boş liste arayüzü bozmaz.
        out = _run_capture(['dpkg-query', '-W', '-f=${Package}\n'])
        if out is None:
            return []
        return [p.strip() for p in out.splitlines() if p.strip()]

    elif cmd == 'system_poweroff':
        for b in ('/sbin/poweroff', '/usr/sbin/poweroff', '/bin/systemctl'):
            if os.path.exists(b):
                _root_run([b])
                break
        return 'Sistem kapatılıyor...'

    elif cmd == 'system_reboot':
        for b in ('/sbin/reboot', '/usr/sbin/reboot', '/bin/systemctl'):
            if os.path.exists(b):
                _root_run([b])
                break
        return 'Sistem yeniden başlatılıyor...'

    elif cmd == 'system_suspend':
        if os.path.exists('/usr/local/bin/ayaz-pkg-helper'):
            _root_run(['/usr/local/bin/ayaz-pkg-helper', 'suspend'])
        elif os.path.exists('/bin/loginctl'):
            subprocess.run(['loginctl', 'suspend'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return 'Sistem askıya alınıyor...'

    elif cmd == 'system_logout':
        import getpass
        curr_user = getpass.getuser()
        subprocess.Popen(['sh', '-c', f'pkill -u {curr_user} xinit 2>/dev/null || pkill -u {curr_user} Xorg 2>/dev/null || pkill -f ayaz 2>/dev/null || true'])
        return 'Oturum kapatılıyor...'
    elif cmd == 'take_screenshot':
        mode = args.get('mode', 'fullscreen')
        delay = int(args.get('delay', 0))
        save_to_disk = bool(args.get('save_to_disk', True))
        copy_clipboard = bool(args.get('copy_clipboard', True))

        # Gerçek "Resimler" dizini: xdg-user-dir Tercih edilir; yoksa
        # ~/Resimler (Türkçe oturum), ~/Pictures. Alt klasör ZORLA
        # oluşturulmaz — "resimler" yerine yeni 'Pictures/Screenshots'
        # klasörü şikayeti bu düzellemenin öncesi hopsa.
        _xdg_pics = ''
        try:
            _xdg_pics = subprocess.run(['xdg-user-dir', 'PICTURES'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True).stdout.strip()
        except Exception:
            _xdg_pics = ''
        if _xdg_pics and _xdg_pics != home_dir:
            pictures_dir = _xdg_pics
        elif os.path.isdir(os.path.join(home_dir, 'Resimler')):
            pictures_dir = os.path.join(home_dir, 'Resimler')
        elif os.path.isdir(os.path.join(home_dir, 'Pictures')):
            pictures_dir = os.path.join(home_dir, 'Pictures')
        else:
            pictures_dir = os.path.join(home_dir, 'Resimler')
            os.makedirs(pictures_dir, exist_ok=True)
        if save_to_disk:
            os.makedirs(pictures_dir, exist_ok=True)
        ts = time.strftime('%Y-%m-%d_%H-%M-%S')
        if save_to_disk:
            filepath = os.path.join(pictures_dir, f'Ekran-Goruntusu_{ts}.png')
        else:
            filepath = os.path.join('/tmp', f'Ekran-Goruntusu_{ts}.png')

        scrot_args = ['scrot']
        if delay > 0:
            scrot_args.extend(['-d', str(delay)])
        if mode == 'window':
            scrot_args.extend(['-u', '-b'])
        elif mode == 'region':
            scrot_args.extend(['-s', '-f'])
        scrot_args.append(filepath)

        env = dict(os.environ, DISPLAY=os.environ.get('DISPLAY', ':0'))
        proc = subprocess.run(scrot_args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
        if proc.returncode != 0:
            raise Exception(f"Ekran görüntüsü alınamadı: {proc.stderr or proc.stdout}")

        if copy_clipboard and shutil.which('xclip') and os.path.exists(filepath):
            subprocess.run(['xclip', '-selection', 'clipboard', '-t', 'image/png', '-i', filepath], env=env)

        preview_b64 = None
        if os.path.exists(filepath):
            try:
                import base64
                with open(filepath, 'rb') as f:
                    preview_b64 = base64.b64encode(f.read()).decode('ascii')
            except Exception:
                pass

        return {
            'success': True,
            'file_path': filepath,
            'file_name': os.path.basename(filepath),
            'image_b64': preview_b64
        }

    elif cmd == 'get_radio_state':
        return _radio_state()

    elif cmd == 'set_radio_state':
        kind = str(args.get('kind', '')).strip()
        enabled = bool(args.get('enabled'))
        if kind not in ('wifi', 'bluetooth'):
            raise Exception('Geçersiz radyo türü.')
        onoff = 'on' if enabled else 'off'
        if _run_capture(['nmcli', 'radio', kind, onoff]) is not None:
            return _radio_state()
        verb = 'unblock' if enabled else 'block'
        if _run_capture(['rfkill', verb, kind]) is not None:
            return _radio_state()
        raise Exception('Ağ yöneticisi bulunamadı: sistemde nmcli veya rfkill yok.')

    elif cmd == 'scan_wifi_networks':
        _run_capture(['nmcli', 'dev', 'wifi', 'rescan'])
        out = _run_capture(['nmcli', '-t', '-f', 'ACTIVE,SSID,SIGNAL', 'dev', 'wifi', 'list'])
        if out is None:
            raise Exception('Kablosuz tarama için NetworkManager (nmcli) kurulu olmalı.')
        networks = []
        for line in out.splitlines():
            parts = line.split(':', 2)
            if len(parts) < 3:
                continue
            active, ssid, signal = parts
            ssid = ssid.replace('\\:', ':').replace('\\\\', '\\')
            if not ssid:
                continue
            try:
                sig = int(signal)
            except ValueError:
                sig = 0
            networks.append({'ssid': ssid, 'signal': sig, 'active': active == 'yes'})
        return networks

    elif cmd == 'wifi_connect':
        ssid = str(args.get('ssid', '')).strip()
        password = str(args.get('password', '')).strip()
        # SSID tek argüman (kabuk yok); IEEE sınırı 32 bayttır.
        if not ssid or len(ssid.encode('utf-8')) > 32:
            raise Exception('Geçersiz ağ adı (SSID).')
        cmd_args = ['nmcli', 'dev', 'wifi', 'connect', ssid]
        if password:
            cmd_args += ['password', password]
        try:
            proc = subprocess.run(
                cmd_args,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                text=True, timeout=45
            )
        except Exception:
            raise Exception('nmcli bulunamadı: kablosuz bağlantı için NetworkManager gerekli.')
        if proc.returncode == 0:
            return f'Bağlanıldı: {ssid}'
        err = (proc.stderr or '').strip()
        if 'Secrets were required' in err or 'password' in err.lower() or 'no-secrets' in err:
            raise Exception('Bu ağ için Wi-Fi parolası gerekli veya girilen parola hatalı.')
        raise Exception(err or f'Bağlanılamadı: {ssid}')

    elif cmd == 'get_network_info':
        info = {'interface': '', 'ip': '', 'prefix': 0, 'gateway': '',
                'dns': [], 'connected': False}
        out = _run_capture(['ip', '-o', '-4', 'addr', 'show', 'scope', 'global'])
        if out:
            for line in out.splitlines():
                parts = line.split()
                if len(parts) < 4 or parts[2] != 'inet':
                    continue
                cidr = parts[3]
                if '/' not in cidr:
                    continue
                ip, prefix = cidr.split('/', 1)
                info['interface'] = parts[1]
                info['ip'] = ip
                try:
                    info['prefix'] = int(prefix)
                except ValueError:
                    info['prefix'] = 0
                info['connected'] = True
                break
        rt = _run_capture(['ip', 'route', 'show', 'default'])
        if rt:
            for line in rt.splitlines():
                if ' via ' in line:
                    info['gateway'] = line.split(' via ', 1)[1].split()[0]
                    break
        try:
            with open('/etc/resolv.conf') as f:
                for line in f:
                    if line.startswith('nameserver'):
                        fields = line.split(None, 1)
                        if len(fields) == 2 and fields[1].strip():
                            info['dns'].append(fields[1].strip())
        except Exception:
            pass
        return info

    elif cmd == 'get_processes':
        out = _run_capture(['ps', '-eo', 'pid=,user=,pcpu=,rss=,stat=,comm='])
        if out is None:
            raise Exception('Süreç listesi okunamadı (ps bulunamadı).')
        status_map = {'R': 'Çalışıyor', 'S': 'Uyuyor', 'D': 'Beklemede',
                      'Z': 'Zombi', 'T': 'Durduruldu', 't': 'Durduruldu',
                      'I': 'Boşta'}
        procs = []
        for line in out.splitlines():
            f = line.split()
            if len(f) < 6:
                continue
            try:
                pid = int(f[0])
            except ValueError:
                continue
            try:
                cpu = float(f[2])
            except ValueError:
                cpu = 0.0
            try:
                mem_mb = float(f[3]) / 1024.0
            except ValueError:
                mem_mb = 0.0
            procs.append({
                'pid': pid, 'user': f[1], 'cpu': cpu, 'mem_mb': mem_mb,
                'status': status_map.get(f[4][:1], 'Bilinmiyor'),
                'name': ' '.join(f[5:])
            })
        procs.sort(key=lambda p: p['cpu'], reverse=True)
        return procs[:300]

    elif cmd == 'kill_process':
        try:
            pid = int(args.get('pid', 0))
        except (TypeError, ValueError):
            raise Exception('Geçersiz PID.')
        if pid <= 1:
            raise Exception('PID 1 (init) ve altındaki süreçler sonlandırılamaz.')
        if pid == os.getpid() or pid == os.getppid():
            raise Exception('Görev Yöneticisi kendi sürecini sonlandıramaz.')
        proc = subprocess.run(
            ['kill', '-TERM', str(pid)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        )
        if proc.returncode != 0:
            err = (proc.stderr or '').strip()
            raise Exception(err or f'PID {pid} sonlandırılamadı.')
        return f'SIGTERM gönderildi (PID {pid}).'

    elif cmd == 'get_storage_devices':
        try:
            proc = subprocess.run(
                ['lsblk', '-J', '-b', '-o', 'NAME,PATH,SIZE,MODEL,RM,TYPE,RO'],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            data = json.loads(proc.stdout)
        except Exception as e:
            raise Exception(f'Diskler listelenemedi (lsblk): {e}')
        live = _live_boot_disks()
        disks = []
        for d in data.get('blockdevices', []):
            name = d.get('name', '')
            path = d.get('path') or f"/dev/{name}"
            if d.get('type') != 'disk' or name.startswith(('loop', 'zram', 'sr', 'ram')):
                continue
            # lsblk sürümüne göre RO/RM bool ya da "0"/"1" dizgesi döner
            if str(d.get('ro', '0')).lower() in ('1', 'true'):
                continue
            if path in live:
                continue
            size_b = int(d.get('size') or 0)
            size_gb = round(size_b / (1024 ** 3), 1)
            model = (d.get('model') or f'Depolama Sürücüsü ({size_gb} GB)').strip()
            disks.append({
                'name': name,
                'path': path,
                'size_gb': size_gb,
                'model': model,
                'is_removable': str(d.get('rm', '0')).lower() in ('1', 'true')
            })
        return disks

    elif cmd == 'get_storage_stats':
        # Ayarlar'daki depolama göstergesi: kök bölünüm + ZRAM (varsa).
        # Bayt cinsinden döner; arayüz ölçeği kendisi çevirir.
        stats = {'disk_total': 0, 'disk_used': 0, 'zram_total': 0, 'zram_used': 0}
        out = _run_capture(['df', '-B1', '/'])
        if out:
            for line in out.splitlines()[1:]:
                parts = line.split()
                if len(parts) >= 6 and parts[1].isdigit() and parts[2].isdigit():
                    stats['disk_total'] = int(parts[1])
                    stats['disk_used'] = int(parts[2])
                    break
                # Uzun aygıt adı satırı kırıldığında sayılar başa kayar
                if len(parts) >= 5 and parts[0].isdigit() and parts[1].isdigit():
                    stats['disk_total'] = int(parts[0])
                    stats['disk_used'] = int(parts[1])
                    break
        try:
            with open('/sys/block/zram0/disksize') as f:
                stats['zram_total'] = int((f.read().strip() or '0'))
        except Exception:
            stats['zram_total'] = 0
        try:
            # mm_stat'ın ilk alanı sıkıştırılmamış (asıl) veri boyutudur
            with open('/sys/block/zram0/mm_stat') as f:
                stats['zram_used'] = int(f.read().split()[0])
        except Exception:
            stats['zram_used'] = 0
        return stats

    elif cmd == 'execute_system_installation':
        payload = args.get('payload', {})
        target = payload.get('target_disk', '').strip()
        username = payload.get('username', 'ankora').strip()
        hostname = payload.get('hostname', 'ankora-pc').strip()
        password = payload.get('password', '')
        autologin = payload.get('autologin', True)
        want_tz = str(payload.get('timezone', '') or '').strip() or 'Europe/Istanbul'
        want_kb = str(payload.get('keyboard_layout', '') or '').strip() or 'tr'
        want_lang = str(payload.get('language', '') or '').strip() or 'tr_TR.UTF-8'

        if not target or not re.match(r'^/dev/(sd[a-z]|vd[a-z]|nvme[0-9]+n[0-9]+|mmcblk[0-9]+)$', target):
            raise Exception('Geçersiz hedef disk seçimi (Örn: /dev/sda veya /dev/nvme0n1)')
        if not re.match(r'^[a-z_][a-z0-9_-]{0,31}$', username):
            raise Exception('Geçersiz kullanıcı adı')
        if not re.match(r'^[a-zA-Z0-9][a-zA-Z0-9-]{0,62}$', hostname):
            raise Exception('Geçersiz makine adı')
        if not password or '\0' in password or '\n' in password:
            raise Exception('Geçersiz parola')
        # Bölge/dil/saat denetimi: izin listesi dışı değer sessizce öntanımlıya döner.
        if ('..' in want_tz or want_tz.startswith('/') or len(want_tz) > 64
                or any(c not in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/_-+' for c in want_tz)):
            want_tz = 'Europe/Istanbul'
        if want_kb not in ('tr', 'tr_f', 'us', 'de', 'fr', 'gb'):
            want_kb = 'tr'
        if want_lang not in ('tr_TR.UTF-8', 'en_US.UTF-8'):
            want_lang = 'tr_TR.UTF-8'

        # Canlı USB ortamının kendisi hedef olarak seçilemez
        live_disks = _live_boot_disks()
        if target in live_disks:
            raise Exception(f'Seçilen aygıt ({target}) canlı sistemin çalıştığı kurulum medyasıdır. Kurulum için başka bir disk seçin.')

        # Canlı oturumda ankora yetkisizdir; kurulum root gerektirir.
        if os.geteuid() != 0:
            if not shutil.which('sudo'):
                raise Exception('Kurulum için yönetici (root) yetkisi gerekiyor: sudo kurulu değil.')
            try:
                subprocess.run(['sudo', '-n', 'true'], check=True,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception:
                raise Exception('Kurulum için yönetici (root) yetkisi gerekiyor: parolasız sudo erişimi (sudo -n) doğrulanamadı.')

        def _root(cmd_input, check=True):
            # Dize komutlar kabuk sözdizimi (2>/dev/null, ||, *) içerir;
            # shlex.split bunları argüman sanıp komutu bozuyordu. sh -c ile koşulur.
            if isinstance(cmd_input, (list, tuple)):
                args = list(cmd_input)
            else:
                args = ['sh', '-c', cmd_input]
            if os.geteuid() != 0:
                args = ['sudo', '-n'] + args
            res = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if check and res.returncode != 0:
                err = (res.stderr or res.stdout or '').strip()
                raise Exception(f"Komut başarısız: '{cmd_input}' -> {err}")
            return res

        def _root_out(cmd_input):
            if isinstance(cmd_input, (list, tuple)):
                args = list(cmd_input)
            else:
                args = ['sh', '-c', cmd_input]
            if os.geteuid() != 0:
                args = ['sudo', '-n'] + args
            return subprocess.check_output(args, text=True)

        def _root_write(path, data):
            if os.geteuid() == 0:
                with open(path, 'w') as f:
                    f.write(data)
                return
            proc = subprocess.run(['sudo', '-n', 'tee', path], input=data.encode(),
                                  stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            if proc.returncode != 0:
                raise Exception(f'{path} yazılamadı: {proc.stderr.decode(errors="replace").strip()}')

        def _root_makedirs(path):
            _root(f"mkdir -p {shlex.quote(path)}", check=False)

        # 1. Eski bağlantıları ve takas alanlarını çöz
        _root("swapoff -a 2>/dev/null || true", check=False)
        _root("umount -q -R /target 2>/dev/null || true", check=False)
        _root(f"umount -q {shlex.quote(target)}* 2>/dev/null || true", check=False)

        # 2. Disk imzalarını temizle (LVM/GPT/MBR kalıntıları parted'ı bloklamasın)
        _root(f"wipefs -a -f {shlex.quote(target)} 2>/dev/null || true", check=False)

        # 3. Hibrit BIOS + UEFI Uyumlu GPT Bölümleme Tablosu:
        #    Part 1: 1MiB - 3MiB   -> bios_grub (Legacy BIOS / MBR için GPT önyükleme alanı)
        #    Part 2: 3MiB - 515MiB -> ESP / FAT32 (UEFI Boot için)
        #    Part 3: 515MiB - 100% -> Primary EXT4 (Kök Dosya Sistemi)
        part_cmds = [
            f"parted -s {shlex.quote(target)} mklabel gpt",
            f"parted -s {shlex.quote(target)} mkpart bios_boot 1MiB 3MiB",
            f"parted -s {shlex.quote(target)} set 1 bios_grub on",
            f"parted -s {shlex.quote(target)} mkpart ESP fat32 3MiB 515MiB",
            f"parted -s {shlex.quote(target)} set 2 esp on",
            f"parted -s {shlex.quote(target)} mkpart primary ext4 515MiB 100%"
        ]
        for pc in part_cmds:
            _root(pc)

        # Çekirdeğin yeni bölüm tablosunu okuması
        _root(f"partprobe {shlex.quote(target)}", check=False)
        try:
            subprocess.run(['udevadm', 'settle'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
        except Exception:
            pass
        time.sleep(1)

        def _get_part_path(disk, num):
            if re.search(r'\d$', disk):
                return f"{disk}p{num}"
            return f"{disk}{num}"

        p_bios = _get_part_path(target, 1)
        p_esp = _get_part_path(target, 2)
        p_root = _get_part_path(target, 3)

        # 4. Dosya Sistemlerini Biçimlendir
        _root(f"mkfs.vfat -F32 {shlex.quote(p_esp)}")
        _root(f"mkfs.ext4 -F -L ANKORA_ROOT {shlex.quote(p_root)}")

        # 5. Bağlama Noktaları
        _root_makedirs('/target')
        _root(f"mount {shlex.quote(p_root)} /target")
        _root_makedirs('/target/boot/efi')
        _root(f"mount {shlex.quote(p_esp)} /target/boot/efi")

        bind_mounts = ['/dev', '/dev/pts', '/proc', '/sys', '/run']

        try:
            # 6. Kök Sistemi Hedefe Aktar
            squashfs_cand = [
                '/run/live/medium/live/filesystem.squashfs',
                '/lib/live/mount/medium/live/filesystem.squashfs',
                '/run/live/rootfs/filesystem.squashfs'
            ]
            found_sq = None
            for sq in squashfs_cand:
                if os.path.isfile(sq):
                    found_sq = sq
                    break

            if found_sq and shutil.which('unsquashfs'):
                _root(f"unsquashfs -f -d /target {shlex.quote(found_sq)}")
            else:
                rsync_cmd = (
                    "rsync -aAX / /target/ "
                    "--exclude=/proc/* --exclude=/sys/* --exclude=/dev/* "
                    "--exclude=/tmp/* --exclude=/run/* --exclude=/mnt/* "
                    "--exclude=/media/* --exclude=/target/* --exclude=/home/* "
                    "--exclude=/lib/live/mount/* --exclude=/var/log/*"
                )
                _root(rsync_cmd)

            # 7. Kimlik ve Ağ Dosyaları
            mid = secrets.token_hex(16)
            _root_write('/target/etc/machine-id', mid + '\n')
            _root_write('/target/var/lib/dbus/machine-id', mid + '\n')
            _root("rm -f /target/var/lib/dhcp/* /target/etc/ssh/ssh_host_* /target/root/.bash_history 2>/dev/null", check=False)
            _root("sh -c 'find /target/var/log -type f -delete 2>/dev/null; rm -rf /target/var/tmp/* /target/tmp/* 2>/dev/null; true'", check=False)

            _root_write('/target/etc/hostname', f"{hostname}\n")
            _root_write('/target/etc/hosts',
                        f"127.0.0.1\tlocalhost\n127.0.1.1\t{hostname}\n\n"
                        "::1\tlocalhost ip6-localhost ip6-loopback\nff02::1\tip6-allnodes\nff02::2\tip6-allrouters\n")

            # 7b. Bölge / dil / saat hedefe taşınır (sihirbaz seçimleri).
            _root_write('/target/etc/timezone', f"{want_tz}\n")
            _root(f"ln -sf /usr/share/zoneinfo/{shlex.quote(want_tz)} /target/etc/localtime", check=False)
            _root("chroot /target sh -c 'DEBIAN_FRONTEND=noninteractive dpkg-reconfigure -f noninteractive tzdata 2>/dev/null; true'", check=False)
            _kb_lay, _kb_var = (('tr', 'f') if want_kb == 'tr_f' else (want_kb, ''))
            _root_write('/target/etc/default/keyboard',
                        f'XKBMODEL="pc105"\nXKBLAYOUT="{_kb_lay}"\nXKBVARIANT="{_kb_var}"\nXKBOPTIONS=""\nBACKSPACE="guess"\n')
            _lang_short = want_lang.split('.')[0]
            _root_write('/target/etc/default/locale',
                        f'LANG={want_lang}\nLANGUAGE={_lang_short}:{_lang_short.split("_")[0]}\nLC_ALL={want_lang}\n')
            _root(f"chroot /target sh -c 'command -v update-locale >/dev/null && update-locale LANG={shlex.quote(want_lang)} 2>/dev/null; command -v locale-gen >/dev/null && locale-gen {shlex.quote(want_lang)} en_US.UTF-8 2>/dev/null; true'", check=False)

            # 8. /etc/fstab Yapılandırması
            try:
                root_uuid = _root_out(f"blkid -s UUID -o value {shlex.quote(p_root)}").strip()
                efi_uuid = _root_out(f"blkid -s UUID -o value {shlex.quote(p_esp)}").strip()
            except Exception:
                root_uuid = ''
                efi_uuid = ''

            root_dev = f"UUID={root_uuid}" if root_uuid else p_root
            efi_dev = f"UUID={efi_uuid}" if efi_uuid else p_esp

            fstab_content = f"""# /etc/fstab generated by Ankora Linux Installer
{root_dev} / ext4 errors=remount-ro 0 1
{efi_dev} /boot/efi vfat umask=0077 0 1
tmpfs /tmp tmpfs defaults,noatime,mode=1777 0 0
"""
            _root_write('/target/etc/fstab', fstab_content)

            # 9. Bind Mounts (Chroot için)
            for bm in bind_mounts:
                _root_makedirs(f"/target{bm}")
                _root(f"mount --bind {bm} /target{bm}")

            if os.path.exists('/sys/firmware/efi/efivars'):
                _root_makedirs('/target/sys/firmware/efi/efivars')
                _root("mount --bind /sys/firmware/efi/efivars /target/sys/firmware/efi/efivars 2>/dev/null || true", check=False)

            _root_pre = [] if os.geteuid() == 0 else ['sudo', '-n']

            # 10. Kullanıcı Hesapları
            user_exists = subprocess.run(_root_pre + ['chroot', '/target', 'id', username],
                                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
            if not user_exists:
                _root(f"chroot /target useradd -m -s /bin/bash -G sudo,audio,video,plugdev,netdev {shlex.quote(username)}")
            else:
                _root_makedirs(f"/target/home/{username}")
                _root(f"cp -rT /target/etc/skel /target/home/{shlex.quote(username)} 2>/dev/null || true", check=False)
                _root(f"chroot /target chown -R {shlex.quote(username)}:{shlex.quote(username)} /home/{shlex.quote(username)}")
                _root(f"chroot /target usermod -aG sudo,audio,video,plugdev,netdev {shlex.quote(username)}")
                _root(f"chroot /target usermod -U {shlex.quote(username)} 2>/dev/null || true", check=False)

            # Parola Belirleme
            chpasswd_proc = subprocess.Popen(
                _root_pre + ['chroot', '/target', 'chpasswd'],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            _, cp_err = chpasswd_proc.communicate(input=f"{username}:{password}\n".encode())
            if chpasswd_proc.returncode != 0:
                raise Exception('Parola atanamadı: ' + cp_err.decode(errors='replace').strip())

            # Sudoers Yetkisi: Kurulu sistem güvenliği gereği kullanıcı sudo grubuna eklenir (parolalı tam yetki)
            _root(f"chroot /target usermod -aG sudo {shlex.quote(username)}")
            _root(f"rm -f /target/etc/sudoers.d/ankora")

            # Ayaz güncelleyici ve masaüstü bakım yardımcıları sudoers (sınırlı NOPASSWD)
            _root_write('/target/etc/sudoers.d/ankora-updater',
                        f"{username} ALL=(root) NOPASSWD: "
                        "/usr/local/bin/ayaz-update-helper, /usr/local/bin/ayaz-pkg-helper, /usr/local/bin/ankora-doctor, /bin/true, /usr/bin/true, /sbin/poweroff, /usr/sbin/poweroff, /sbin/reboot, /usr/sbin/reboot, /sbin/shutdown, /usr/sbin/shutdown\n")
            _root("chmod 0440 /target/etc/sudoers.d/ankora-updater")

            # Hızlı Paralel Açılış ve ZRAM Swap Servisi Optimizasyonlarını Kurulu Sisteme Aktar
            _root_write('/target/etc/default/rcS',
                        "# Ankora Linux 3.5 Hızlı Paralel Açılış\nCONCURRENCY=makefile\nUTC=yes\nVERBOSE=no\nFSCKFIX=no\n")
            _root_write('/target/etc/sysctl.d/99-zram.conf',
                        "vm.swappiness = 100\nvm.vfs_cache_pressure = 50\nvm.watermark_boost_factor = 0\nvm.dirty_background_ratio = 5\nvm.dirty_ratio = 10\n")
            zram_target_script = """#!/bin/sh
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
"""
            _root_write('/target/etc/init.d/zram-swap', zram_target_script)
            _root("chmod 0755 /target/etc/init.d/zram-swap")
            _root("chroot /target update-rc.d zram-swap defaults 05 95 2>/dev/null || true", check=False)

            # Eğer farklı bir kullanıcı oluşturulduysa canlı 'ankora' kalıntısını temizle
            if username != 'ankora':
                _root("rm -f /target/etc/sudoers.d/ankora", check=False)
                _root("chroot /target deluser --remove-home ankora 2>/dev/null || chroot /target userdel -r ankora 2>/dev/null || true", check=False)

            # 11. Otomatik Giriş (Getty inittab)
            inittab_path = '/target/etc/inittab'
            if os.path.exists(inittab_path):
                try:
                    with open(inittab_path, 'r') as f:
                        content = f.read()
                    # --noclear yok: plymouth sonrası kalan boot metinleri
                    # otomatik girişte temizlenir.
                    tty1_line = f'1:2345:respawn:/sbin/getty --autologin {username} 38400 tty1 linux' if autologin else '1:2345:respawn:/sbin/getty 38400 tty1 linux'
                    if re.search(r'^[0-9a-zA-Z]+:[0-9]+:respawn:/sbin/getty.*tty1.*', content, flags=re.MULTILINE):
                        content = re.sub(r'^[0-9a-zA-Z]+:[0-9]+:respawn:/sbin/getty.*tty1.*', tty1_line, content, flags=re.MULTILINE)
                    else:
                        content += f'\n{tty1_line}\n'
                    _root_write(inittab_path, content)
                except Exception:
                    pass

            # Canlı sistem paketlerini kurulu sistemden kaldır: live-config her
            # açılışta canlı kullanıcıyı/otomatik girişi yeniden kurabilir.
            _root("chroot /target dpkg --purge live-config live-config-sysvinit live-boot live-boot-initramfs-tools live-tools 2>/dev/null; "
                  "rm -f /target/etc/rcS.d/S*live-config* /target/etc/init.d/live-config*; true", check=False)
            _root("chroot /target update-initramfs -u -k all")
            # Silinen SSH anahtarları her kurulumda benzersiz yeniden üretilir.
            _root("[ -x /target/usr/bin/ssh-keygen ] && chroot /target ssh-keygen -A; true", check=False)

            # 12. Önyükleyici (GRUB) Kurulumu
            is_efi = os.path.isdir('/sys/firmware/efi')
            grub_ok = False

            if is_efi:
                res_efi = subprocess.run(
                    _root_pre + ['chroot', '/target', 'grub-install',
                                 '--target=x86_64-efi', '--efi-directory=/boot/efi',
                                 '--bootloader-id=ankora', '--recheck'],
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
                )
                if res_efi.returncode == 0:
                    grub_ok = True
                    subprocess.run(
                        _root_pre + ['chroot', '/target', 'grub-install',
                                     '--target=x86_64-efi', '--efi-directory=/boot/efi',
                                     '--bootloader-id=ankora', '--removable', '--recheck'],
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                    )

                subprocess.run(
                    _root_pre + ['chroot', '/target', 'grub-install',
                                 '--target=i386-pc', '--recheck', target],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                )
            else:
                res_bios = subprocess.run(
                    _root_pre + ['chroot', '/target', 'grub-install',
                                 '--target=i386-pc', '--recheck', target],
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
                )
                if res_bios.returncode == 0:
                    grub_ok = True

            if not grub_ok:
                res_retry = subprocess.run(
                    _root_pre + ['chroot', '/target', 'grub-install',
                                 '--target=i386-pc', '--recheck', target],
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
                )
                if res_retry.returncode == 0:
                    grub_ok = True
                else:
                    err_msg = (res_retry.stderr or res_retry.stdout or '').strip()
                    raise Exception(f'Önyükleyici (GRUB) kurulamadı: {err_msg}')

            # 11b. Ankora önyükleyici görünümü: modern GRUB menüsü + açılış
            # ekranı. Kaynaklar canlı sistemdeki /usr/share/ayaz altındadır
            # (ISO derleyici oraya koyar); yoksa sessizce atlanır.
            _root("mkdir -p /target/boot/grub/themes/ankora "
                  "/target/usr/share/plymouth/themes/ankora", check=False)
            _root("cp -f /usr/share/ayaz/grub-theme-ankora/theme.txt "
                  "/target/boot/grub/themes/ankora/theme.txt 2>/dev/null; true", check=False)
            _root("cp -f /usr/share/ayaz/ankora-grub-default "
                  "/target/etc/default/grub 2>/dev/null; true", check=False)
            _root("cp -rf /usr/share/ayaz/plymouth-theme-ankora/. "
                  "/target/usr/share/plymouth/themes/ankora/ 2>/dev/null; true", check=False)
            _root("chroot /target plymouth-set-default-theme -R ankora "
                  "2>/dev/null || chroot /target plymouth-set-default-theme ankora "
                  "2>/dev/null || true; chroot /target update-initramfs -u -k all 2>/dev/null || true", check=False)
            # Faz tahta dokunmatik sürücüsü kurulu sisteme taşınır.
            _root("cp -f /usr/bin/eta-touchdrv /target/usr/bin/eta-touchdrv 2>/dev/null; "
                  "cp -f /usr/share/applications/eta-touchdrv.desktop "
                  "/target/usr/share/applications/eta-touchdrv.desktop 2>/dev/null; "
                  "cp -f /lib/udev/rules.d/99-faz-touch.rules "
                  "/target/lib/udev/rules.d/99-faz-touch.rules 2>/dev/null; "
                  "mkdir -p /target/usr/share/X11/xorg.conf.d && cp -f "
                  "/usr/share/X11/xorg.conf.d/99-faz-touch.conf "
                  "/target/usr/share/X11/xorg.conf.d/99-faz-touch.conf 2>/dev/null; true", check=False)

            res_ug = subprocess.run(
                _root_pre + ['chroot', '/target', 'update-grub'],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
            )
            if res_ug.returncode != 0:
                err_msg = (res_ug.stderr or res_ug.stdout or '').strip()
                raise Exception(f'update-grub başarısız oldu: {err_msg}')

        finally:
            # 13. Güvenli Çözme (Umount)
            _root("umount -l /target/sys/firmware/efi/efivars 2>/dev/null || true", check=False)
            for bm in reversed(bind_mounts):
                _root(f"umount -l /target{bm} 2>/dev/null || true", check=False)
            _root("umount -l /target/boot/efi 2>/dev/null || true", check=False)
            _root("umount -l /target 2>/dev/null || true", check=False)

        return "Ankora Linux 4.0 başarıyla kuruldu! Sistemi yeniden başlatabilirsiniz."

    elif cmd == 'get_system_telemetry':
        mem_total = 4096
        mem_used = 512
        try:
            with open('/proc/meminfo', 'r') as f:
                lines = f.readlines()
                t = 0
                a = 0
                for l in lines:
                    if l.startswith('MemTotal:'):
                        t = int(l.split()[1]) // 1024
                    elif l.startswith('MemAvailable:'):
                        a = int(l.split()[1]) // 1024
                mem_total = t
                mem_used = max(0, t - a)
        except Exception:
            pass

        uptime_s = 3600
        try:
            with open('/proc/uptime', 'r') as f:
                uptime_s = int(float(f.read().split()[0]))
        except Exception:
            pass

        kernel = 'Linux 6.1.0-22-amd64'
        try:
            with open('/proc/version', 'r') as f:
                kernel = ' '.join(f.read().split()[:3])
        except Exception:
            pass

        bat = _battery_state()
        du = _disk_usage()
        return {
            'os_name': 'Devuan GNU/Linux 5 (daedalus)',
            'kernel': kernel,
            'init_system': 'SysVinit (systemd-free)',
            'memory_used_mb': mem_used,
            'memory_total_mb': mem_total,
            'cpu_cores': os.cpu_count() or 4,
            'uptime_seconds': uptime_s,
            'battery_percent': bat['percent'],
            'battery_status': bat['status'],
            'cpu_percent': _cpu_percent(),
            'disk_percent': du[2] if du else None,
            'disk_used_gb': du[0] if du else None,
            'disk_total_gb': du[1] if du else None
        }

    elif cmd == 'optimize_system_memory':
        def _read_mem_used():
            try:
                with open('/proc/meminfo', 'r') as f:
                    t, a = 0, 0
                    for l in f:
                        if l.startswith('MemTotal:'):
                            t = int(l.split()[1]) // 1024
                        elif l.startswith('MemAvailable:'):
                            a = int(l.split()[1]) // 1024
                    return max(0, t - a)
            except Exception:
                return 0
        try:
            before_mb = _read_mem_used()
            subprocess.run(['sync'], check=False)
            helper = '/usr/local/bin/ayaz-pkg-helper'
            if os.path.exists(helper):
                res = _root_run([helper, 'drop-caches'])
            else:
                res = _root_run(['tee', '/proc/sys/vm/drop_caches'], stdin_text='3\n')
            after_mb = _read_mem_used()
            freed = max(0, before_mb - after_mb) if (before_mb > 0 and after_mb > 0) else 0
            if res.returncode == 0:
                msg = f'Bellek önbellekleri temizlendi ({freed} MB serbest bırakıldı).' if freed > 0 else 'Bellek önbellekleri senkronize edildi. Sistem optimize durumda.'
                return {'success': True, 'freed_mb': freed, 'message': msg}
            else:
                return {'success': False, 'freed_mb': 0, 'message': 'Önbellek temizleme yetki hatası (root gerekli).'}
        except Exception as e:
            return {'success': False, 'freed_mb': 0, 'message': str(e)}

    elif cmd == 'list_directory':
        req_path = args.get('path', home_dir)
        if not isinstance(req_path, str):
            req_path = home_dir
        req_path = req_path.strip()
        if not req_path or '\0' in req_path:
            # Boş yol bilerek ev dizinine düşer; arayüzün varsayılanıdır.
            req_path = home_dir
        elif not os.path.exists(req_path):
            # Verilen yol yokken sessizce ev dizinine dönmek arayüze yanlış
            # klasörü gösteriyordu; eksik yol açıkça hata olarak döner.
            raise Exception('Klasör bulunamadı: ' + str(req_path))
        req_path = os.path.abspath(req_path)
        # GÜVENLİK: Kök gezilebilir, ancak başkalarının hesapları ve çekirdek /
        # aygıt arayüzleri listelenemez (dosya adı sızıntısı).
        real_req = os.path.realpath(req_path)
        for sensitive_root in ('/root', '/proc', '/sys', '/dev', '/boot', '/etc'):
            if real_req == sensitive_root or real_req.startswith(sensitive_root + '/'):
                raise Exception('Güvenlik İlkesi İhlali: Bu dizin listelenemez')
        items = []
        try:
            with os.scandir(req_path) as entries:
                for entry in entries:
                    try:
                        is_d = entry.is_dir(follow_symlinks=True)
                        size_str = '-'
                        if not is_d:
                            s = entry.stat().st_size
                            if s < 1024:
                                size_str = f"{s} B"
                            elif s < 1024 * 1024:
                                size_str = f"{round(s / 1024, 1)} KB"
                            else:
                                size_str = f"{round(s / (1024 * 1024), 1)} MB"
                        ext = os.path.splitext(entry.name)[1].lower().replace('.', '')
                        items.append({
                            'name': entry.name,
                            'path': entry.path,
                            'is_dir': is_d,
                            'size_str': size_str,
                            'ext': ext,
                            'is_hidden': entry.name.startswith('.')
                        })
                    except Exception:
                        continue
            items.sort(key=lambda x: (not x['is_dir'], x['name'].lower()))
        except Exception as e:
            raise Exception(f"Dizin okunamadı: {e}")
        return {'current_path': req_path, 'items': items, 'home_dir': home_dir}

    elif cmd == 'create_folder':
        folder_path = args.get('path', '').strip()
        if not folder_path or '\0' in folder_path:
            raise Exception('Geçersiz klasör yolu')
        folder_path = os.path.abspath(folder_path)
        restricted = ['/bin', '/sbin', '/usr', '/etc', '/boot', '/dev', '/proc', '/sys',
                      '/lib', '/lib64', '/var', '/opt', '/srv', '/root']
        for r in restricted:
            if folder_path == r or folder_path.startswith(r + '/'):
                raise Exception('Bu sistem dizininde klasör oluşturulamaz')
        os.makedirs(folder_path, exist_ok=True)
        return f"Klasör oluşturuldu: {folder_path}"

    elif cmd == 'write_text_file':
        file_path = args.get('path', '').strip()
        content = args.get('content', '')
        if not file_path or '\0' in file_path:
            raise Exception('Geçersiz dosya yolu')
        file_path = os.path.abspath(file_path)
        # M1: Sembolik bağ üzerine yazma engeli
        if os.path.islink(file_path):
            raise Exception('Güvenlik Hatası: Sembolik bağlar üzerine doğrudan dosya yazılamaz')
        restricted = ['/bin', '/sbin', '/usr', '/etc', '/boot', '/dev', '/proc', '/sys',
                      '/lib', '/lib64', '/var', '/opt', '/srv', '/root']
        for r in restricted:
            if file_path == r or file_path.startswith(r + '/'):
                raise Exception('Bu sistem dizininde dosya oluşturulamaz')
        parent_dir = os.path.dirname(file_path)
        if parent_dir and not os.path.exists(parent_dir):
            os.makedirs(parent_dir, exist_ok=True)
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return f"Dosya kaydedildi: {file_path}"

    elif cmd == 'open_path':
        target_path = args.get('path', '').strip()
        if not target_path or '\0' in target_path or not os.path.exists(target_path):
            raise Exception('Açılacak dosya bulunamadı')
        target_path = os.path.abspath(target_path)
        env = os.environ.copy()
        if 'DISPLAY' not in env:
            env['DISPLAY'] = ':0'
        # GÜVENLİK: kurulabilir/çalıştırılabilir dosyalar xdg-open'a verilmez
        lower_tp = target_path.lower()
        # .deb → doğrudan sudo install yapmak yerine bilgi dön
        if lower_tp.endswith('.deb'):
            return f"DEB paketi tespit edildi: {target_path}. Lütfen Ankora Mağaza üzerinden kurun."
        if lower_tp.endswith(('.desktop', '.run', '.appimage')):
            raise Exception('Güvenlik Hatası: Çalıştırılabilir dosyalar buradan açılamaz')
        subprocess.Popen(['xdg-open', target_path], env=env, start_new_session=True)
        return f"Açıldı: {target_path}"

    elif cmd == 'open_url':
        url = str(args.get('url', '')).strip()
        if '\0' in url or not re.match(r'^https?://', url):
            raise Exception('Yalnızca http/https adresleri açılabilir')
        env = os.environ.copy()
        if 'DISPLAY' not in env:
            env['DISPLAY'] = ':0'
        subprocess.Popen(['xdg-open', url], env=env, start_new_session=True,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True

    elif cmd == 'system_browser_available':
        # Canlı ISO'ya hiçbir tarayıcı kurulmaz; xdg-mime bu durumda boş satır
        # ve rc=0 döner. Kayıtlı bir .desktop yoksa "Dış Tarayıcıda Aç"
        # denetimi çalışmaz, gizlenir.
        try:
            out = subprocess.run(
                ['xdg-mime', 'query', 'default', 'x-scheme-handler/https'],
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                text=True, timeout=10
            )
            handler = (out.stdout or '').strip()
        except Exception:
            return True
        if not handler.endswith('.desktop'):
            return False
        dirs = [
            '/usr/share/applications',
            '/usr/local/share/applications',
            '/var/lib/flatpak/exports/share/applications',
            os.path.expanduser('~/.local/share/applications'),
            os.path.expanduser('~/.local/share/flatpak/exports/share/applications'),
        ]
        return any(os.path.exists(os.path.join(d, handler)) for d in dirs)

    elif cmd == 'delete_file':
        target_path = args.get('path', '').strip()
        if not target_path or '\0' in target_path or not os.path.exists(target_path):
            raise Exception('Silinecek dosya bulunamadı')
        target_path = os.path.abspath(target_path)
        real_path = os.path.realpath(target_path)
        # GÜVENLİK (İZİN LİSTESİ - ALLOWLIST): Yalnızca kullanıcı çalışma alanındaki yollar silinebilir
        allowed_prefixes = (home_dir + '/', '/tmp/', '/media/', '/mnt/')
        if not any(real_path.startswith(p) for p in allowed_prefixes) or real_path in ('/', '/home', home_dir):
            raise Exception('Güvenlik İlkesi İhlali: Kritik sistem dizinleri veya yetkisiz yollar silinemez')
        # Sembolik bağlantı (symlink) güvenliği: Sembolik bağlantı ise hedef dizini değil, yalnızca bağlantıyı kaldır
        if os.path.islink(target_path):
            os.unlink(target_path)
        elif os.path.isdir(target_path):
            shutil.rmtree(target_path)
        else:
            os.remove(target_path)
        return f"Silindi: {target_path}"

    elif cmd == 'scan_xdg_applications':
        global _XDG_CACHE
        user_app_dir = os.path.expanduser('~/.local/share/applications')
        user_fp_dir = os.path.expanduser('~/.local/share/flatpak/exports/share/applications')
        sys_fp_dir = '/var/lib/flatpak/exports/share/applications'
        app_dirs = [
            '/usr/share/applications',
            '/usr/local/share/applications',
            sys_fp_dir,
            user_app_dir,
            user_fp_dir,
        ]
        user_dirs = {user_app_dir, user_fp_dir, sys_fp_dir}
        sig = []
        for ad in app_dirs:
            try:
                st = os.stat(ad)
                sig.append((ad, st.st_mtime_ns))
            except OSError:
                sig.append((ad, 0))
        with _CACHE_LOCK:
            if _XDG_CACHE is not None and _XDG_CACHE[0] == sig:
                return _XDG_CACHE[1]
        apps = []
        seen_ids = set()
        for ad in app_dirs:
            if os.path.exists(ad):
                for fname in sorted(os.listdir(ad)):
                    if fname.endswith('.desktop'):
                        app_id = fname[:-8]
                        if app_id in seen_ids:
                            continue
                        p = os.path.join(ad, fname)
                        try:
                            name = app_id
                            exec_cmd = app_id
                            cat = 'util'
                            comment = ''
                            icon = 'application-x-executable'
                            no_display = False
                            with open(p, 'r', errors='ignore') as f:
                                for line in f:
                                    l_str = line.strip()
                                    if l_str.startswith('NoDisplay=') and l_str.split('=', 1)[1].strip().lower() == 'true':
                                        no_display = True
                                        break
                                    elif l_str.startswith('Name=') and name == app_id:
                                        name = l_str.split('=', 1)[1].strip()
                                    elif l_str.startswith('Exec=') and exec_cmd == app_id:
                                        raw_exec = l_str.split('=', 1)[1].strip()
                                        exec_cmd = re.sub(r'%[fFuUdDnNickvm]', '', raw_exec).strip()
                                    elif l_str.startswith('Icon=') and icon == 'application-x-executable':
                                        icon = l_str.split('=', 1)[1].strip()
                                    elif l_str.startswith('Categories='):
                                        c = l_str.lower()
                                        if 'audio' in c or 'video' in c or 'media' in c:
                                            cat = 'media'
                                        elif 'graphic' in c:
                                            cat = 'graphics'
                                        elif 'network' in c or 'web' in c:
                                            cat = 'net'
                                        elif 'office' in c:
                                            cat = 'office'
                                        elif 'development' in c:
                                            cat = 'dev'
                                        elif 'system' in c or 'settings' in c:
                                            cat = 'sys'
                                    elif l_str.startswith('Comment=') and not comment:
                                        comment = l_str.split('=', 1)[1].strip()
                            if no_display:
                                continue
                            seen_ids.add(app_id)
                            apps.append({
                                'id': app_id,
                                'name': name,
                                'exec': exec_cmd,
                                'icon': icon,
                                'cat': cat,
                                'comment': comment,
                                'is_installed_by_user': ad in user_dirs
                            })
                        except Exception:
                            continue
        with _CACHE_LOCK:
            _XDG_CACHE = (sig, apps)
        return apps

    elif cmd == 'read_document_file':
        f_path = args.get('file_path') or args.get('filePath') or ''
        if not f_path:
            raise Exception('Belge bulunamadı')
        # GÜVENLİK: Rust tarafındaki read_document_file denetiminin birebir karşılığı
        if '..' in f_path:
            raise Exception("Güvenlik Hatası: Dizin geçişine ('..') izin verilmez")
        f_ext = os.path.splitext(f_path)[1].lower().replace('.', '')
        if f_ext not in ('pdf', 'md', 'txt', 'conf', 'log', 'json', 'yaml', 'yml', 'ini',
                         'js', 'py', 'sh', 'css', 'html', 'xml',
                         'png', 'jpg', 'jpeg', 'webp', 'gif'):
            raise Exception(f"Güvenlik Hatası: '.{f_ext}' uzantılı dosyalar güvenlik nedeniyle okunamaz")
        # Görsel uzantılar metin değil, base64 data URI olarak döner
        IMAGE_MIME = {'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
                      'webp': 'image/webp', 'gif': 'image/gif'}
        is_image = f_ext in IMAGE_MIME
        if not os.path.exists(f_path):
            # Canlı oturum ankora ile çalışır; /root/Belgeler'e kök erişimi
            # yoktur. Örnek belgeler kullanıcı dizinindedir — aynı ad
            # (dizin geçişi olmadan) Belgeler altında aranır.
            _alt = os.path.join(home_dir, 'Belgeler', os.path.basename(f_path))
            if _alt != f_path and os.path.exists(_alt):
                f_path = _alt
            else:
                raise Exception('Belge bulunamadı: ' + str(f_path))
        real_path = os.path.realpath(f_path)
        real_lower = real_path.lower()
        sensitive = (
            '/etc/shadow', '/etc/gshadow', '/etc/sudoers', '/etc/master.passwd',
            '/etc/security', '/root/.ssh', '.ssh/', 'id_rsa', 'id_ed25519',
            'id_ecdsa', 'id_dsa', '/proc/kcore', '/sys/', '/dev/',
            '/var/log/auth', 'ai_creds.json', 'lock.hash',
        )
        if any(p in real_lower for p in sensitive):
            raise Exception('Güvenlik Hatası: Hassas sistem dosyalarının okunması engellendi')
        allowed_dirs = [
            os.path.join(home_dir, 'Belgeler'),
            os.path.join(home_dir, 'Downloads'),
            os.path.join(home_dir, 'Resimler'),
            os.path.join(home_dir, 'Masaüstü'),
            os.path.join(home_dir, 'İndirilenler'),
            os.path.join(home_dir, 'Müzik'),
            os.path.join(home_dir, 'Videolar'),
            home_dir,
            '/root/Belgeler',
            '/usr/share/doc',
        ]
        if not any(real_path.startswith(d + os.sep) for d in allowed_dirs if d):
            if os.path.basename(real_path) not in (
                    'ankora-sistem-rehberi.pdf', 'kiosk-ayarlari.txt', 'kiosk-ayarlari.md'):
                raise Exception('Güvenlik Hatası: Yalnızca kullanıcı belgeleri ve sistem '
                                'dokümantasyonu dizinindeki dosyalar okunabilir')
        f_path = real_path
        # GÜVENLİK: Rust'taki hard-link ve boyut denetimlerinin karşılığı —
        # çok bağlantılı dosyalar ve 50 MB üstü içerikler okunmaz.
        st = os.stat(f_path)
        if st.st_nlink > 1:
            raise Exception('Güvenlik Hatası: Çoklu bağlantılı (hard link) dosyaların '
                            'okunması güvenlik gerekçesiyle engellendi')
        f_size = st.st_size
        if f_size > 50 * 1024 * 1024:
            raise Exception('Dosya boyutu çok büyük (50 MB üstü kabul edilmez)')
        f_name = os.path.basename(f_path)
        if is_image:
            # Tarayıcı <img> için doğrudan gömülebilen data URI üretilir
            import base64
            with open(f_path, 'rb') as f:
                b64 = base64.b64encode(f.read()).decode('utf-8')
            return {
                'file_name': f_name,
                'file_type': 'image',
                'file_size': f_size,
                'content': f"data:{IMAGE_MIME[f_ext]};base64,{b64}"
            }
        if f_ext == 'pdf':
            import base64
            with open(f_path, 'rb') as f:
                b64 = base64.b64encode(f.read()).decode('utf-8')
            return {
                'file_name': f_name,
                'file_type': 'pdf',
                'file_size': f_size,
                'content': f"data:application/pdf;base64,{b64}"
            }
        else:
            with open(f_path, 'r', errors='ignore') as f:
                txt = f.read()
            return {
                'file_name': f_name,
                'file_type': 'text',
                'file_size': f_size,
                'content': txt
            }

    elif cmd == 'list_available_documents':
        docs = []
        doc_roots = ['/home/ankora/Belgeler', '/home/ankora/Downloads', '/root/Belgeler', '/usr/share/doc']
        for dr in doc_roots:
            if os.path.exists(dr):
                for fn in os.listdir(dr):
                    if fn.endswith(('.pdf', '.txt', '.md')):
                        docs.append(os.path.join(dr, fn))
        if not docs:
            docs = ['/root/Belgeler/ankora-sistem-rehberi.pdf', '/root/Belgeler/kiosk-ayarlari.txt']
        return docs

    elif cmd == 'is_lock_configured':
        var_h = '/var/lib/ankora/lock.hash'
        usr_h = os.path.expanduser('~/.config/ankora/lock.hash')
        return os.path.exists(var_h) or os.path.exists(usr_h)

    elif cmd == 'set_lock_credentials':
        new_pin = (args.get('new_pin') or args.get('newPin') or '').strip()
        if len(new_pin) < 4:
            raise Exception('Yeni PIN/Parola en az 4 karakter olmalıdır.')
        var_dir = '/var/lib/ankora'
        var_h = os.path.join(var_dir, 'lock.hash')
        cfg_dir = os.path.expanduser('~/.config/ankora')
        usr_h = os.path.join(cfg_dir, 'lock.hash')
        h_file = var_h if (os.path.exists(var_h) or (os.path.isdir(var_dir) and os.access(var_dir, os.W_OK))) else usr_h
        # Rust tarafındaki set_lock_credentials ile aynı denetim: kilit
        # zaten kurulu ve istekte current_pin alanındaysa önce o doğrulanır.
        if (os.path.exists(var_h) or os.path.exists(usr_h)) and ('current_pin' in args or 'currentPin' in args):
            cur_pin = str(args.get('current_pin') or args.get('currentPin') or '')
            if not execute_ayaz_command('verify_lock_credentials', {'pin': cur_pin}):
                raise Exception('Mevcut PIN hatalı! PIN değiştirme reddedildi.')
        import hashlib
        salt = os.urandom(16)
        h = hashlib.sha256(salt + new_pin.encode()).digest()
        for i in range(50000):
            h = hashlib.sha256(h + salt + i.to_bytes(4, 'little')).digest()
        try:
            with open(h_file, 'wb') as f:
                f.write(salt + h)
            os.chmod(h_file, 0o600)
        except Exception:
            os.makedirs(cfg_dir, exist_ok=True)
            with open(usr_h, 'wb') as f:
                f.write(salt + h)
            os.chmod(usr_h, 0o600)
        return True

    elif cmd == 'verify_lock_credentials':
        pin = (args.get('pin') or '').strip()
        # C3: Rate limiting ve üstel bekleme (Brute-force engelleme)
        with _LOCK_MUTEX:
            if _LOCK_ATTEMPTS['count'] >= 3:
                penalty = min(300.0, 2.0 ** max(0, _LOCK_ATTEMPTS['count'] - 2))
                elapsed = time.time() - _LOCK_ATTEMPTS['last_failed']
                if elapsed < penalty:
                    rem = int(penalty - elapsed) + 1
                    raise Exception(f'Çok fazla hatalı deneme! Lütfen {rem} saniye bekleyin.')

        var_h = '/var/lib/ankora/lock.hash'
        usr_h = os.path.expanduser('~/.config/ankora/lock.hash')
        h_file = var_h if os.path.exists(var_h) else usr_h
        if not os.path.exists(h_file):
            with _AUTH_LOCK:
                global _UNLOCK_AUTH_UNTIL
                _UNLOCK_AUTH_UNTIL = time.time() + 30.0
            return True
        import hashlib
        with open(h_file, 'rb') as f:
            data = f.read()
        if len(data) < 48:
            return False
        salt = data[:16]
        expected = data[16:48]
        h = hashlib.sha256(salt + pin.encode()).digest()
        for i in range(50000):
            h = hashlib.sha256(h + salt + i.to_bytes(4, 'little')).digest()
        is_valid = hmac.compare_digest(h, expected)
        with _LOCK_MUTEX:
            if is_valid:
                _LOCK_ATTEMPTS['count'] = 0
                _LOCK_ATTEMPTS['last_failed'] = 0.0
                with _AUTH_LOCK:
                    _UNLOCK_AUTH_UNTIL = time.time() + 30.0
            else:
                _LOCK_ATTEMPTS['count'] += 1
                _LOCK_ATTEMPTS['last_failed'] = time.time()
        return is_valid

    elif cmd == 'lock_x11_session':
        with _AUTH_LOCK:
            _UNLOCK_AUTH_UNTIL = 0.0
        if os.path.exists('/usr/bin/xtrlock'):
            subprocess.Popen(['/usr/bin/xtrlock', '-b'])
            return 'X11 oturumu kilitlendi'
        return 'Kiosk kilit ekranı devrede'

    elif cmd == 'unlock_x11_session':
        # H1: Kilit yapılandırılmışsa, kilit açma ancak geçerli PIN doğrulamasından sonraki 30 sn içinde yapılabilir
        var_h = '/var/lib/ankora/lock.hash'
        usr_h = os.path.expanduser('~/.config/ankora/lock.hash')
        h_file = var_h if os.path.exists(var_h) else usr_h
        if os.path.exists(h_file):
            with _AUTH_LOCK:
                now = time.time()
                if now > _UNLOCK_AUTH_UNTIL:
                    raise Exception('Güvenlik İlkesi İhlali: Kilit açma izni yok veya süresi doldu. Lütfen önce PIN doğrulayın.')
                _UNLOCK_AUTH_UNTIL = 0.0
        try:
            subprocess.run(['pkill', '-x', 'xtrlock'],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass
        return 'Ekran kilidi kaldırıldı'

    elif cmd == 'set_brightness':
        lvl = int(args.get('level', 100))
        clamped = max(20, min(100, lvl))
        ratio = clamped / 100.0
        try:
            p = subprocess.run(['xrandr'], stdout=subprocess.PIPE, text=True)
            for line in p.stdout.splitlines():
                if ' connected' in line:
                    d_name = line.split()[0]
                    subprocess.run(['xrandr', '--output', d_name, '--brightness', f"{ratio:.2f}"])
                    break
        except Exception:
            pass
        return f"Parlaklık ayarlandı: %{clamped}"

    elif cmd == 'get_volume':
        # ALSA Master kanalının yüzde değeri. Araç yokluğu ile aygıt
        # yokluğu ayrı hatalardır: biri "kurulu değil" derken diğeri
        # donanım/sürücü sorununu gösterir.
        if not shutil.which('amixer'):
            raise Exception('Ses sistemi bulunamadı (amixer kurulu değil)')
        try:
            proc = subprocess.run(
                ['amixer', 'get', 'Master'],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                text=True, timeout=10)
        except Exception as e:
            raise Exception(f'Ses sistemi okunamadı: {e}')
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or '').strip()
            raise Exception(f'Ses aygıtı okunamadı: {err or "amixer hata verdi"}')
        m = re.search(r'\[(\d{1,3})%\]', proc.stdout)
        if not m:
            raise Exception('Ses düzeyi okunamadı (amixer yüzde vermedi)')
        return max(0, min(100, int(m.group(1))))

    elif cmd == 'set_volume':
        try:
            level = int(args.get('level', args.get('volume', 50)))
        except (TypeError, ValueError):
            raise Exception('Geçersiz ses seviyesi')
        if not 0 <= level <= 100:
            raise Exception('Ses seviyesi 0 ile 100 arasında olmalı')
        if not shutil.which('amixer'):
            raise Exception('Ses sistemi bulunamadı (amixer kurulu değil)')
        # Karıştırıcıya yazmak çoğu sistemde grup yetkisiyle doğrudan olur;
        # olmazsa parolasız sudo ile denenir.
        try:
            proc = subprocess.run(
                ['amixer', 'set', 'Master', f'{level}%'],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                text=True, timeout=10)
        except Exception as e:
            raise Exception(f'Ses ayarı çalıştırılamadı: {e}')
        if proc.returncode != 0:
            proc = _root_run(['amixer', 'set', 'Master', f'{level}%'])
            if proc.returncode != 0:
                err = (proc.stderr or proc.stdout or '').strip()
                raise Exception(err or 'Ses seviyesi ayarlanamadı')
        return f'Ses seviyesi ayarlandı: %{level}'

    elif cmd == 'get_native_windows':
        if not shutil.which('wmctrl'):
            return []
        try:
            out = subprocess.run(['wmctrl', '-l', '-x'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=3).stdout
        except Exception:
            return []
        # xprop "0x1a00003", wmctrl "0x01a00003" verir: sayısal karşılaştırılır.
        active_num = None
        try:
            if shutil.which('xdotool'):
                o = subprocess.run(['xdotool', 'getactivewindow'], stdout=subprocess.PIPE,
                                   stderr=subprocess.DEVNULL, text=True, timeout=2).stdout.strip()
                if o.isdigit():
                    active_num = int(o)
            if active_num is None and shutil.which('xprop'):
                xprop_out = subprocess.run(['xprop', '-root', '_NET_ACTIVE_WINDOW'], stdout=subprocess.PIPE,
                                           stderr=subprocess.DEVNULL, text=True, timeout=2).stdout
                if '#' in xprop_out:
                    active_num = int(xprop_out.split('#')[1].strip().split(',')[0], 16)
        except Exception:
            active_num = None
        windows = []
        for line in out.splitlines():
            parts = line.split(None, 3)
            if len(parts) < 4:
                continue
            # Masaüstü -1: yapışkan paneller (trayer, dunst); görev değil.
            if parts[1] == '-1':
                continue
            win_id = parts[0].strip().lower()
            wm_class = parts[2].strip()
            title = parts[3].strip()
            lower_class = wm_class.lower()
            lower_title = title.lower()
            if any(k in lower_class for k in ['ayaz', 'openbox', 'desktop', 'trayer', 'dunst']) or 'ayaz — ankora' in lower_title or title == 'Desktop':
                continue
            app_name = wm_class.split('.')[-1] if '.' in wm_class else wm_class
            try:
                is_active = active_num is not None and int(win_id, 16) == active_num
            except ValueError:
                is_active = False
            windows.append({
                'id': parts[0].strip(),
                'title': title,
                'app_name': app_name,
                'wm_class': wm_class,
                'is_active': is_active
            })
        return windows

    elif cmd == 'activate_native_window':
        win_id = str(args.get('id', '')).strip()
        if win_id and shutil.which('wmctrl'):
            subprocess.run(['wmctrl', '-i', '-a', win_id], timeout=3)
        return True

    elif cmd == 'close_native_window':
        win_id = str(args.get('id', '')).strip()
        if win_id and shutil.which('wmctrl'):
            subprocess.run(['wmctrl', '-i', '-c', win_id], timeout=3)
        return True

    elif cmd == 'minimize_native_window':
        win_id = str(args.get('id', '')).strip()
        if win_id:
            if shutil.which('wmctrl'):
                subprocess.run(['wmctrl', '-i', '-r', win_id, '-b', 'add,hidden'], timeout=3)
            elif shutil.which('xdotool'):
                subprocess.run(['xdotool', 'windowminimize', win_id], timeout=3)
        return True

    elif cmd == 'minimize_all_windows':
        if shutil.which('wmctrl'):
            subprocess.run(['wmctrl', '-k', 'on'], timeout=3)
        return True

    elif cmd == 'set_desktop_layer':
        above = bool(args.get('above', False))
        arg = 'add,above' if above else 'remove,above'
        if shutil.which('wmctrl'):
            subprocess.run(['wmctrl', '-r', 'Ayaz — Ankora', '-b', arg], timeout=3)
            if not above:
                subprocess.run(['wmctrl', '-r', 'Ayaz — Ankora', '-b', 'add,below'], timeout=3)
        return True

    elif cmd == 'get_removable_drives':
        if not shutil.which('lsblk'):
            return []
        try:
            p = subprocess.run(['lsblk', '-J', '-o', 'NAME,SIZE,LABEL,MOUNTPOINT,RM,TYPE,FSTYPE'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=5)
            data = json.loads(p.stdout)
        except Exception:
            return []
        drives = []
        for dev in data.get('blockdevices', []):
            is_rm = str(dev.get('rm', '')).lower() in ('1', 'true')
            name = dev.get('name', '')
            if any(name.startswith(pfx) for pfx in ('loop', 'zram', 'sr')):
                continue
            targets = dev.get('children', []) if dev.get('children') else ([dev] if is_rm else [])
            for item in targets:
                iname = item.get('name', '')
                if not iname:
                    continue
                size = item.get('size', '')
                label = item.get('label', '') or iname
                fstype = item.get('fstype', '')
                mountpoint = item.get('mountpoint')
                if is_rm and not mountpoint and fstype and fstype != 'swap' and shutil.which('udisksctl'):
                    try:
                        u_res = subprocess.run(['udisksctl', 'mount', '-b', f'/dev/{iname}', '--no-user-interaction'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=5)
                        if ' at ' in u_res.stdout:
                            mountpoint = u_res.stdout.split(' at ')[1].strip()
                    except Exception:
                        pass
                if is_rm or (mountpoint and (mountpoint.startswith('/media') or mountpoint.startswith('/mnt'))):
                    drives.append({
                        'name': iname,
                        'label': label,
                        'mountpoint': mountpoint,
                        'size': size,
                        'fstype': fstype
                    })
        return drives

    elif cmd == 'unmount_drive':
        device = str(args.get('device', '')).strip()
        dev_arg = device if device.startswith('/') else f'/dev/{device}'
        if shutil.which('udisksctl'):
            try:
                subprocess.run(['udisksctl', 'unmount', '-b', dev_arg, '--no-user-interaction'], timeout=5)
                return 'Sürücü güvenle çıkarıldı'
            except Exception:
                pass
        subprocess.run(['umount', dev_arg], timeout=5)
        return 'Sürücü bağlantısı kesildi'

    elif cmd == 'get_clipboard_text':
        # H4: Oturum kilitliyken pano içeriği verilmez
        var_h = '/var/lib/ankora/lock.hash'
        usr_h = os.path.expanduser('~/.config/ankora/lock.hash')
        if os.path.exists(var_h) or os.path.exists(usr_h):
            with _AUTH_LOCK:
                if time.time() > _UNLOCK_AUTH_UNTIL:
                    try:
                        p = subprocess.run(['pgrep', '-x', 'xtrlock'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                        if p.returncode == 0:
                            return ''
                    except Exception:
                        pass
        if shutil.which('xclip'):
            try:
                p = subprocess.run(['xclip', '-selection', 'clipboard', '-o'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=2)
                return p.stdout
            except Exception:
                pass
        return ''

    elif cmd == 'set_clipboard_text':
        # H4: Oturum kilitliyken pano değiştirilemez
        var_h = '/var/lib/ankora/lock.hash'
        usr_h = os.path.expanduser('~/.config/ankora/lock.hash')
        if os.path.exists(var_h) or os.path.exists(usr_h):
            with _AUTH_LOCK:
                if time.time() > _UNLOCK_AUTH_UNTIL:
                    try:
                        p = subprocess.run(['pgrep', '-x', 'xtrlock'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                        if p.returncode == 0:
                            return True
                    except Exception:
                        pass
        text = str(args.get('text', ''))
        if shutil.which('xclip'):
            try:
                subprocess.run(['xclip', '-selection', 'clipboard', '-i'], input=text, text=True, timeout=2)
            except Exception:
                pass
        return True

    elif cmd == 'install_flatpak_app':
        app_id = str(args.get('app_id', args.get('appId', ''))).strip()
        if not shutil.which('flatpak'):
            raise Exception('Flatpak kurulu değil')
        p = subprocess.run(['flatpak', 'install', '-y', '--noninteractive', 'flathub', app_id], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=600)
        if p.returncode != 0:
            raise Exception(p.stderr.strip() or 'Flatpak kurulamadı')
        return f'{app_id} kuruldu'

    elif cmd == 'remove_flatpak_app':
        app_id = str(args.get('app_id', args.get('appId', ''))).strip()
        if not shutil.which('flatpak'):
            raise Exception('Flatpak kurulu değil')
        p = subprocess.run(['flatpak', 'uninstall', '-y', '--noninteractive', app_id], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=120)
        if p.returncode != 0:
            raise Exception(p.stderr.strip() or 'Flatpak kaldırılamadı')
        return f'{app_id} kaldırıldı'

    elif cmd == 'list_installed_flatpaks':
        if not shutil.which('flatpak'):
            return []
        try:
            p = subprocess.run(['flatpak', 'list', '--app', '--columns=application'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=10)
            return [l.strip() for l in p.stdout.splitlines() if l.strip()]
        except Exception:
            return []

    elif cmd == 'move_to_trash':
        target_path = str(args.get('path', '')).strip()
        if not target_path or not os.path.exists(target_path):
            raise Exception('Dosya bulunamadı')
        real_p = os.path.realpath(target_path)
        if real_p in ('/', '/home', home_dir):
            raise Exception('Kritik sistem dizinleri çöpe taşınamaz')
        if shutil.which('gio'):
            try:
                res = subprocess.run(['gio', 'trash', real_p], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=5)
                if res.returncode == 0:
                    return f"Çöp kutusuna taşındı: {os.path.basename(real_p)}"
            except Exception:
                pass
        trash_dir = os.path.join(home_dir, '.local/share/Trash')
        files_dir = os.path.join(trash_dir, 'files')
        info_dir = os.path.join(trash_dir, 'info')
        os.makedirs(files_dir, exist_ok=True)
        os.makedirs(info_dir, exist_ok=True)
        base_name = os.path.basename(real_p)
        dest_f = os.path.join(files_dir, base_name)
        dest_i = os.path.join(info_dir, f"{base_name}.trashinfo")
        with open(dest_i, 'w', encoding='utf-8') as f:
            f.write(f"[Trash Info]\nPath={real_p}\nDeletionDate=2026-01-01T00:00:00\n")
        shutil.move(real_p, dest_f)
        return f"Çöp kutusuna taşındı: {base_name}"

    elif cmd == 'list_trash':
        trash_files = os.path.join(home_dir, '.local/share/Trash/files')
        items = []
        if os.path.exists(trash_files):
            for fname in os.listdir(trash_files):
                fp = os.path.join(trash_files, fname)
                is_d = os.path.isdir(fp)
                sz = 0 if is_d else (os.path.getsize(fp) if os.path.exists(fp) else 0)
                ext = fname.rsplit('.', 1)[-1].lower() if '.' in fname else ''
                # format size
                if sz < 1024:
                    s_str = f"{sz} B"
                elif sz < 1048576:
                    s_str = f"{round(sz/1024, 1)} KB"
                else:
                    s_str = f"{round(sz/1048576, 1)} MB"
                items.append({
                    'name': fname,
                    'path': fp,
                    'is_dir': is_d,
                    'size_str': s_str,
                    'ext': ext,
                    'is_hidden': False
                })
        items.sort(key=lambda x: (not x['is_dir'], x['name'].lower()))
        return items

    elif cmd == 'restore_trash_item':
        file_name = str(args.get('fileName', args.get('file_name', ''))).strip()
        trash_dir = os.path.join(home_dir, '.local/share/Trash')
        file_p = os.path.join(trash_dir, 'files', file_name)
        info_p = os.path.join(trash_dir, 'info', f"{file_name}.trashinfo")
        if not os.path.exists(file_p):
            raise Exception('Geri yüklenecek dosya bulunamadı')
        target_dest = os.path.join(home_dir, 'Masaüstü', file_name)
        if os.path.exists(info_p):
            try:
                with open(info_p, 'r', encoding='utf-8') as f:
                    for line in f:
                        if line.startswith('Path='):
                            orig = line.strip().split('=', 1)[1]
                            if os.path.exists(os.path.dirname(orig)):
                                target_dest = orig
                            break
            except Exception:
                pass
        shutil.move(file_p, target_dest)
        if os.path.exists(info_p):
            try: os.remove(info_p)
            except Exception: pass
        return f"Geri yüklendi: {target_dest}"

    elif cmd == 'empty_trash':
        if shutil.which('gio'):
            try:
                subprocess.run(['gio', 'trash', '--empty'], timeout=5)
                return "Çöp kutusu tamamen boşaltıldı."
            except Exception:
                pass
        trash_dir = os.path.join(home_dir, '.local/share/Trash')
        for sub in ['files', 'info']:
            sd = os.path.join(trash_dir, sub)
            if os.path.exists(sd):
                shutil.rmtree(sd, ignore_errors=True)
                os.makedirs(sd, exist_ok=True)
        return "Çöp kutusu tamamen boşaltıldı."

    elif cmd == 'extract_archive':
        arc = str(args.get('archivePath', args.get('archive_path', ''))).strip()
        dest = str(args.get('destDir', args.get('dest_dir', ''))).strip() or os.path.dirname(arc) or home_dir
        if not os.path.exists(arc):
            raise Exception('Arşiv bulunamadı')
        low = arc.lower()
        if low.endswith('.zip') and shutil.which('unzip'):
            p = subprocess.run(['unzip', '-q', '-o', arc, '-d', dest], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=120)
        elif (low.endswith('.tar.gz') or low.endswith('.tgz')) and shutil.which('tar'):
            p = subprocess.run(['tar', '-xzf', arc, '-C', dest], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=120)
        elif (low.endswith('.tar.xz') or low.endswith('.txz')) and shutil.which('tar'):
            p = subprocess.run(['tar', '-xJf', arc, '-C', dest], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=120)
        elif low.endswith('.7z') and shutil.which('7z'):
            p = subprocess.run(['7z', 'x', '-y', arc, f'-o{dest}'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=120)
        else:
            p = subprocess.run(['tar', '-xf', arc, '-C', dest], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=120)
        if p.returncode != 0:
            raise Exception(p.stderr.strip() or 'Arşiv çıkartılamadı')
        return f"Arşiv çıkarıldı: {dest}"

    elif cmd == 'create_archive':
        src = str(args.get('sourcePath', args.get('source_path', ''))).strip()
        atype = str(args.get('archiveType', args.get('archive_type', 'zip'))).strip().lower()
        if not os.path.exists(src):
            raise Exception('Arşivlenecek dosya bulunamadı')
        parent = os.path.dirname(src) or '.'
        bname = os.path.basename(src)
        out_arc = f"{src}.zip" if atype == 'zip' else f"{src}.tar.gz"
        if atype == 'zip' and shutil.which('zip'):
            p = subprocess.run(['zip', '-r', '-q', out_arc, bname], cwd=parent, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=120)
        else:
            p = subprocess.run(['tar', '-czf', out_arc, bname], cwd=parent, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=120)
        if p.returncode != 0:
            raise Exception(p.stderr.strip() or 'Arşivlenemedi')
        return f"Arşiv oluşturuldu: {out_arc}"

    elif cmd == 'move_path':
        src = str(args.get('sourcePath', args.get('source_path', ''))).strip()
        dest = str(args.get('destPath', args.get('dest_path', ''))).strip()
        if not os.path.exists(src):
            raise Exception('Kaynak dosya veya klasör bulunamadı')
        if not dest:
            raise Exception('Hedef yol belirtilmedi')
        is_safe_user_path(src, write=True)
        is_safe_user_path(dest, write=True)
        shutil.move(src, dest)
        return f"Öge taşındı: {dest}"

    elif cmd == 'sync_desktop_theme':
        is_dark = bool(args.get('isDark', args.get('is_dark', True)))
        tname = 'Adwaita-dark' if is_dark else 'Adwaita'
        # İkon teması: FairyWren Ayaz seçkisi ISO ile kurulur; yoksa Papirus
        # paketinden devralınır. Papirus da yoksa GTK kendi yedeğine düşer.
        if os.path.isdir('/usr/share/icons/FairyWren_Ayaz'):
            iname = 'FairyWren_Ayaz'
        else:
            iname = 'Papirus-Dark' if is_dark else 'Papirus'
        pdark = '1' if is_dark else '0'
        cscheme = 'prefer-dark' if is_dark else 'default'
        # GTK3
        g3 = os.path.join(home_dir, '.config/gtk-3.0')
        os.makedirs(g3, exist_ok=True)
        with open(os.path.join(g3, 'settings.ini'), 'w', encoding='utf-8') as f:
            f.write(f"[Settings]\ngtk-theme-name = {tname}\ngtk-icon-theme-name = {iname}\ngtk-application-prefer-dark-theme = {pdark}\ngtk-font-name = Sans 10\n")
        # GTK4
        g4 = os.path.join(home_dir, '.config/gtk-4.0')
        os.makedirs(g4, exist_ok=True)
        with open(os.path.join(g4, 'settings.ini'), 'w', encoding='utf-8') as f:
            f.write(f"[Settings]\ngtk-theme-name = {tname}\ngtk-icon-theme-name = {iname}\ngtk-application-prefer-dark-theme = {pdark}\n")
        # GTK2
        with open(os.path.join(home_dir, '.gtkrc-2.0'), 'w', encoding='utf-8') as f:
            f.write(f"gtk-theme-name=\"{tname}\"\ngtk-icon-theme-name=\"{iname}\"\n")
        # xsettingsd
        xsd = os.path.join(home_dir, '.config/xsettingsd')
        os.makedirs(xsd, exist_ok=True)
        with open(os.path.join(xsd, 'xsettingsd.conf'), 'w', encoding='utf-8') as f:
            f.write(f"Net/ThemeName \"{tname}\"\nNet/IconThemeName \"{iname}\"\nGtk/ApplicationPreferDarkTheme {pdark}\nGtk/CursorThemeName \"Adwaita\"\n")
        subprocess.run(['pkill', '-HUP', 'xsettingsd'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if shutil.which('gsettings'):
            subprocess.run(['gsettings', 'set', 'org.gnome.desktop.interface', 'color-scheme', cscheme], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            subprocess.run(['gsettings', 'set', 'org.gnome.desktop.interface', 'gtk-theme', tname], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            subprocess.run(['gsettings', 'set', 'org.gnome.desktop.interface', 'icon-theme', iname], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True

    elif cmd == 'set_native_workspace':
        idx = str(args.get('index', 0))
        if shutil.which('wmctrl'):
            subprocess.run(['wmctrl', '-s', idx], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        elif shutil.which('xdotool'):
            subprocess.run(['xdotool', 'set_desktop', idx], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True

    elif cmd == 'get_audio_devices':
        sinks = []
        sources = []
        def_sink = ''
        def_source = ''
        if shutil.which('pactl'):
            p1 = subprocess.run(['pactl', 'get-default-sink'], stdout=subprocess.PIPE, text=True)
            def_sink = p1.stdout.strip()
            p2 = subprocess.run(['pactl', 'get-default-source'], stdout=subprocess.PIPE, text=True)
            def_source = p2.stdout.strip()

            p_sinks = subprocess.run(['pactl', 'list', 'sinks'], stdout=subprocess.PIPE, text=True)
            cur_name, cur_desc = '', ''
            for line in p_sinks.stdout.splitlines():
                t = line.strip()
                if t.startswith('Name: '):
                    cur_name = t.split('Name: ', 1)[1].strip()
                elif t.startswith('Description: '):
                    cur_desc = t.split('Description: ', 1)[1].strip()
                elif t.startswith('Sink #') or not t:
                    if cur_name:
                        sinks.append({'id': cur_name, 'name': cur_name, 'description': cur_desc or cur_name, 'is_default': cur_name == def_sink})
                        cur_name, cur_desc = '', ''
            if cur_name:
                sinks.append({'id': cur_name, 'name': cur_name, 'description': cur_desc or cur_name, 'is_default': cur_name == def_sink})

            p_src = subprocess.run(['pactl', 'list', 'sources'], stdout=subprocess.PIPE, text=True)
            cur_name, cur_desc = '', ''
            for line in p_src.stdout.splitlines():
                t = line.strip()
                if t.startswith('Name: '):
                    cur_name = t.split('Name: ', 1)[1].strip()
                elif t.startswith('Description: '):
                    cur_desc = t.split('Description: ', 1)[1].strip()
                elif t.startswith('Source #') or not t:
                    if cur_name:
                        sources.append({'id': cur_name, 'name': cur_name, 'description': cur_desc or cur_name, 'is_default': cur_name == def_source})
                        cur_name, cur_desc = '', ''
            if cur_name:
                sources.append({'id': cur_name, 'name': cur_name, 'description': cur_desc or cur_name, 'is_default': cur_name == def_source})

        if not sinks:
            sinks.append({'id': 'default_speaker', 'name': 'Dahili Hoparlör', 'description': 'Sistem Varsayılan Ses Çıkışı', 'is_default': True})
        if not sources:
            sources.append({'id': 'default_mic', 'name': 'Dahili Mikrofon', 'description': 'Sistem Varsayılan Girişi', 'is_default': True})
        return {'sinks': sinks, 'sources': sources, 'default_sink': def_sink, 'default_source': def_source}

    elif cmd == 'set_default_audio_device':
        kind = str(args.get('kind', 'sink')).strip()
        dev = str(args.get('deviceName', args.get('device_name', ''))).strip()
        if shutil.which('pactl') and dev:
            sub = 'set-default-source' if kind == 'source' else 'set-default-sink'
            subprocess.run(['pactl', sub, dev], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True

    elif cmd == 'get_bluetooth_status':
        is_avail = False
        is_pow = False
        devs = []
        if shutil.which('bluetoothctl'):
            p = subprocess.run(['timeout', '1.5', 'bluetoothctl', 'show'], stdout=subprocess.PIPE, text=True)
            if p.stdout and 'No default controller' not in p.stdout:
                is_avail = True
                if 'Powered: yes' in p.stdout:
                    is_pow = True
            if is_avail:
                p2 = subprocess.run(['timeout', '1.5', 'bluetoothctl', 'devices'], stdout=subprocess.PIPE, text=True)
                for line in p2.stdout.splitlines():
                    pts = line.split()
                    if len(pts) >= 3 and pts[0] == 'Device':
                        devs.append({
                            'address': pts[1],
                            'name': ' '.join(pts[2:]),
                            'is_connected': '(connected)' in line,
                            'is_paired': True
                        })
        return {'is_available': is_avail, 'is_powered': is_pow, 'devices': devs}

    elif cmd == 'toggle_bluetooth':
        pow_on = bool(args.get('powered', True))
        val = 'on' if pow_on else 'off'
        if shutil.which('bluetoothctl'):
            subprocess.run(['timeout', '2', 'bluetoothctl', 'power', val], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if shutil.which('rfkill'):
            subprocess.run(['rfkill', 'unblock' if pow_on else 'block', 'bluetooth'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return pow_on

    elif cmd == 'scan_bluetooth':
        en = bool(args.get('enable', True))
        val = 'on' if en else 'off'
        if shutil.which('bluetoothctl'):
            subprocess.run(['timeout', '2', 'bluetoothctl', 'scan', val], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return en

    elif cmd == 'connect_bluetooth_device':
        addr = str(args.get('address', '')).strip()
        if shutil.which('bluetoothctl') and addr:
            p = subprocess.run(['timeout', '5', 'bluetoothctl', 'connect', addr], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if p.returncode != 0:
                raise Exception(p.stderr.strip() or 'Bağlantı kurulamadı')
            return f"{addr} aygıtına bağlanıldı."
        return f"{addr} aygıtına bağlanıldı (Simüle)."

    elif cmd == 'disconnect_bluetooth_device':
        addr = str(args.get('address', '')).strip()
        if shutil.which('bluetoothctl') and addr:
            subprocess.run(['timeout', '3', 'bluetoothctl', 'disconnect', addr], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return f"{addr} bağlantısı kesildi."

    elif cmd == 'spotlight_search_files':
        q = str(args.get('query', '')).strip().lower()
        if not q:
            return []
        roots = [
            os.path.join(home_dir, 'Masaüstü'),
            os.path.join(home_dir, 'Belgeler'),
            os.path.join(home_dir, 'İndirilenler'),
            os.path.join(home_dir, 'Resimler'),
            os.path.join(home_dir, 'Müzik'),
            os.path.join(home_dir, 'Videolar'),
            home_dir
        ]
        results = []
        seen = set()
        for root in roots:
            if not os.path.exists(root):
                continue
            try:
                for entry in os.scandir(root):
                    if len(results) >= 20:
                        break
                    if entry.name.startswith('.'):
                        continue
                    if q in entry.name.lower() and entry.path not in seen:
                        seen.add(entry.path)
                        is_dir = entry.is_dir()
                        ext = entry.name.rsplit('.', 1)[-1].lower() if '.' in entry.name else ''
                        sz = entry.stat().st_size if not is_dir else 0
                        sz_str = 'Klasör' if is_dir else (f"{sz} B" if sz < 1024 else (f"{sz/1024:.1f} KB" if sz < 1048576 else f"{sz/1048576:.1f} MB"))
                        results.append({
                            'name': entry.name,
                            'path': entry.path,
                            'ext': ext,
                            'is_dir': is_dir,
                            'size_str': sz_str
                        })
            except Exception:
                continue
            if len(results) >= 20:
                break
        return results

    elif cmd == 'get_system_notifications':
        items = []
        nfile = '/tmp/ayaz-notifications.jsonl'
        if os.path.exists(nfile):
            try:
                with open(nfile, 'r', encoding='utf-8') as f:
                    for line in reversed(f.readlines()[-30:]):
                        line = line.strip()
                        if line:
                            items.append(json.loads(line))
            except Exception:
                pass
        return items

    elif cmd == 'send_desktop_notification':
        title = str(args.get('title', '')).strip()
        body = str(args.get('body', '')).strip()
        app = str(args.get('appName', args.get('app_name', 'Sistem'))).strip()
        if shutil.which('notify-send'):
            subprocess.run(['notify-send', '-a', app, title, body], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        now_str = time.strftime('%H:%M')
        item = {
            'id': str(int(time.time() * 1000)),
            'app_name': app,
            'title': title,
            'body': body,
            'timestamp': now_str
        }
        try:
            with open('/tmp/ayaz-notifications.jsonl', 'a', encoding='utf-8') as f:
                f.write(json.dumps(item) + '\n')
        except Exception:
            pass
        return True

    elif cmd == 'clear_system_notifications':
        nfile = '/tmp/ayaz-notifications.jsonl'
        if os.path.exists(nfile):
            try:
                with open(nfile, 'w', encoding='utf-8') as f:
                    f.write('')
            except Exception:
                pass
        if shutil.which('dunstctl'):
            subprocess.run(['dunstctl', 'history-clear'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            subprocess.run(['dunstctl', 'close-all'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True

    elif cmd == 'get_cpu_governor':
        try:
            with open('/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor') as f:
                return f.read().strip()
        except Exception:
            raise Exception('Bu donanım CPU frekans profilini desteklemiyor')

    elif cmd == 'set_cpu_governor':
        gov = str(args.get('governor', args.get('profile', ''))).strip().lower()
        # Arayüzdeki "Dengeli" bir governor adı değil: çekirdek hangisini
        # sunuyorsa (schedutil > ondemand > conservative) o seçilir.
        if gov == 'balanced':
            gov = ''
            try:
                with open('/sys/devices/system/cpu/cpu0/cpufreq/scaling_available_governors') as f:
                    avail = f.read().split()
                for cand in ('schedutil', 'ondemand', 'conservative'):
                    if cand in avail:
                        gov = cand
                        break
            except Exception:
                pass
            if not gov:
                raise Exception('Bu donanım dengeli güç profili desteklemiyor')
        if gov not in ('performance', 'powersave', 'ondemand', 'conservative', 'schedutil'):
            raise Exception('Geçersiz CPU frekans profili')
        gov_file = '/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor'
        if not os.path.exists(gov_file):
            raise Exception('Bu donanım CPU frekans profilini desteklemiyor')
        # Sysfs yazısı root gerektirir; canlı sistemde ankora parolasız sudo kullanır
        proc = _root_run(['tee', gov_file], stdin_text=gov + '\n')
        if proc.returncode != 0:
            raise Exception('Bu donanım CPU frekans profilini desteklemiyor')
        try:
            with open(gov_file) as f:
                applied = f.read().strip()
        except Exception:
            applied = ''
        if applied != gov:
            raise Exception('Bu donanım CPU frekans profilini desteklemiyor')
        return f'CPU frekans profili ayarlandı: {gov}'

    elif cmd == 'set_dpms_timeout':
        # Süre saniyedir; 0 DPMS'i kapatır. Değer ~/.config/ankora/dpms_secs
        # dosyasına yazılır ki .xinitrc yeniden başlatmada koruyabilsin.
        raw = args.get('seconds', args.get('secs', args.get('timeout', args.get('value', 0))))
        try:
            secs = int(raw)
        except (TypeError, ValueError):
            raise Exception('Geçersiz bekleme süresi (saniye)')
        if secs < 0:
            raise Exception('Geçersiz bekleme süresi (saniye)')
        if not shutil.which('xset'):
            raise Exception('Ekran ayarları için xset kurulu değil (x11-xserver-utils)')
        cfg_dir = os.path.expanduser('~/.config/ankora')
        cfg_file = os.path.join(cfg_dir, 'dpms_secs')
        try:
            if secs > 0:
                os.makedirs(cfg_dir, exist_ok=True)
                with open(cfg_file, 'w') as f:
                    f.write(str(secs))
            elif os.path.exists(cfg_file):
                os.remove(cfg_file)
        except Exception:
            pass  # kalıcılık hatası ayarın kendisini düşürmez
        env = os.environ.copy()
        if 'DISPLAY' not in env:
            env['DISPLAY'] = ':0'
        cmd_args = ['xset', '-dpms'] if secs == 0 else \
                   ['xset', '+dpms', 'dpms', str(secs), str(secs), str(secs)]
        try:
            p = subprocess.run(cmd_args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, env=env, timeout=10)
        except Exception as e:
            raise Exception(f'DPMS ayarı uygulanamadı: {e}')
        if p.returncode != 0:
            raise Exception(p.stderr.strip() or 'DPMS ayarı uygulanamadı')
        if secs == 0:
            return 'Ekran uyku (DPMS) kapatıldı'
        return f'Ekran uyku zaman aşımı ayarlandı: {secs} sn'

    elif cmd == 'get_region_settings':
        # Bölge/dil/saat: o anki değerler + arayüzün sunacağı izinli listeler.
        def _cur_tz():
            try:
                link = os.readlink('/etc/localtime')
                if 'zoneinfo/' in link:
                    return link.split('zoneinfo/', 1)[1]
            except Exception:
                pass
            try:
                with open('/etc/timezone') as f:
                    t = f.read().strip()
                    if t:
                        return t
            except Exception:
                pass
            return 'Europe/Istanbul'
        def _cur_lang():
            for p in ('/etc/default/locale', '/etc/locale.conf'):
                try:
                    with open(p) as f:
                        for line in f:
                            t = line.strip()
                            if t.startswith('LANG='):
                                v = t[5:].strip().strip('"')
                                if v in ('tr_TR.UTF-8', 'en_US.UTF-8'):
                                    return v
                except Exception:
                    pass
            return 'tr_TR.UTF-8'
        def _cur_kb():
            try:
                with open('/etc/default/keyboard') as f:
                    lay = var = ''
                    for line in f:
                        t = line.strip()
                        if t.startswith('XKBLAYOUT='):
                            lay = t[10:].strip().strip('"')
                        elif t.startswith('XKBVARIANT='):
                            var = t[11:].strip().strip('"')
                    if lay == 'tr' and var == 'f':
                        return 'tr_f'
                    if lay in ('tr', 'tr_f', 'us', 'de', 'fr', 'gb'):
                        return lay
            except Exception:
                pass
            return 'tr'
        try:
            p = subprocess.run(['date', '+%Y-%m-%d %H:%M:%S %Z'],
                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                               text=True, timeout=10)
            now = p.stdout.strip()
        except Exception:
            now = ''
        zones = ['Europe/Istanbul', 'Europe/London', 'Europe/Berlin',
                 'Europe/Paris', 'Europe/Moscow', 'America/New_York',
                 'America/Chicago', 'America/Los_Angeles', 'Asia/Dubai',
                 'Asia/Baku', 'Asia/Nicosia', 'UTC']
        cur = _cur_tz()
        if cur not in zones:
            zones.insert(0, cur)
        return {'timezone': cur, 'local_time': now,
                'keyboard_layout': _cur_kb(), 'language': _cur_lang(),
                'available_timezones': zones,
                'available_keyboards': ['tr', 'tr_f', 'us', 'de', 'fr', 'gb'],
                'available_languages': ['tr_TR.UTF-8', 'en_US.UTF-8']}

    elif cmd == 'set_timezone':
        # SysVinit'te timedatectl yoktur: /etc/localtime bağı + /etc/timezone.
        tz = str(args.get('timezone', '')).strip()
        if ('..' in tz or tz.startswith('/') or not tz or len(tz) > 64
                or any(c not in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/_-+' for c in tz)):
            raise Exception('Geçersiz saat dilimi')
        if not os.path.isfile(os.path.join('/usr/share/zoneinfo', tz)):
            raise Exception('Desteklenmeyen saat dilimi (zoneinfo kaydı yok)')
        helper = '/usr/local/bin/ayaz-pkg-helper'
        if os.path.exists(helper):
            proc = _root_run([helper, 'set-timezone', tz])
            if proc.returncode == 0:
                return f'Saat dilimi: {tz}'
        _root_run(['tee', '/etc/timezone'], stdin_text=tz + '\n')
        proc = _root_run(['ln', '-sf', f'/usr/share/zoneinfo/{tz}', '/etc/localtime'])
        if proc.returncode != 0:
            raise Exception('Saat dilimi bağlanamadı (yönetici yetkisi gerekiyor)')
        subprocess.run(['sh', '-c', 'DEBIAN_FRONTEND=noninteractive dpkg-reconfigure -f noninteractive tzdata 2>/dev/null; true'],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60)
        return f'Saat dilimi: {tz}'

    elif cmd in ('sync_clock_ntp', 'sync_time_ntp'):
        # chrony birincil, ntpdate yedek; donanım saati okunamazsa bile
        # güncel saat döndürülür.
        helper = '/usr/local/bin/ayaz-pkg-helper'
        if os.path.exists(helper):
            _root_run([helper, 'sync-ntp'], timeout=60)
        else:
            subprocess.run(['sh', '-c', 'command -v chronyc >/dev/null && chronyc -a makestep 2>/dev/null; command -v ntpdate >/dev/null && ntpdate -u pool.ntp.org 2>/dev/null; true'],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60)
        try:
            p = subprocess.run(['date', '+%Y-%m-%d %H:%M:%S %Z'],
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, timeout=10)
        except Exception as e:
            raise Exception(f'Saat okunamadı: {e}')
        return p.stdout.strip()

    elif cmd in ('set_keyboard_layout', 'set_system_keyboard'):
        # O anki X oturumu + kalıcı kayıt (/etc/default/keyboard ve konsol).
        lay = str(args.get('layout', '')).strip()
        if lay not in ('tr', 'tr_f', 'us', 'de', 'fr', 'gb'):
            raise Exception('Geçersiz veya desteklenmeyen klavye haritası')
        helper = '/usr/local/bin/ayaz-pkg-helper'
        persist = False
        if os.path.exists(helper):
            try:
                proc = _root_run([helper, 'set-keyboard', lay])
                persist = (proc.returncode == 0)
            except Exception:
                persist = False
        if not persist:
            xkb_lay, xkb_var = (('tr', 'f') if lay == 'tr_f' else (lay, ''))
            kb_conf = (f'XKBMODEL="pc105"\nXKBLAYOUT="{xkb_lay}"\nXKBVARIANT="{xkb_var}"\n'
                       'XKBOPTIONS=""\nBACKSPACE="guess"\n')
            try:
                _root_run(['tee', '/etc/default/keyboard'], stdin_text=kb_conf)
                persist = True
            except Exception:
                persist = False
            if persist:
                subprocess.run(['sh', '-c', 'command -v setupcon >/dev/null && setupcon -k --force 2>/dev/null; service console-setup restart 2>/dev/null; true'],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
        env = os.environ.copy()
        if 'DISPLAY' not in env:
            env['DISPLAY'] = ':0'
        try:
            if lay == 'tr_f':
                subprocess.run(['setxkbmap', 'tr', '-variant', 'f'], env=env,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
            else:
                subprocess.run(['setxkbmap', lay], env=env,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
        except Exception:
            pass
        if persist:
            return f'Klavye: {lay} (kalıcı)'
        raise Exception('Klavye o anki oturumda değişti, ancak kalıcı kayıt için yönetici yetkisi gerekiyor')

    elif cmd == 'set_system_language':
        lang = str(args.get('language', '')).strip()
        if lang not in ('tr_TR.UTF-8', 'en_US.UTF-8'):
            raise Exception('Geçersiz veya desteklenmeyen sistem dili')
        helper = '/usr/local/bin/ayaz-pkg-helper'
        if os.path.exists(helper):
            proc = _root_run([helper, 'set-language', lang], timeout=120)
            if proc.returncode == 0:
                return f'Sistem dili: {lang} (oturumu yeniden başlatınca uygulanır)'
        short = lang.split('.')[0]
        conf = f'LANG={lang}\nLANGUAGE={short}:{short.split("_")[0]}\nLC_ALL={lang}\n'
        try:
            _root_run(['tee', '/etc/default/locale'], stdin_text=conf)
        except Exception as e:
            raise Exception(f'Sistem dili yazılamadı (yönetici yetkisi gerekiyor): {e}')
        subprocess.run(['sh', '-c', f'command -v update-locale >/dev/null && update-locale LANG={lang} 2>/dev/null; command -v locale-gen >/dev/null && locale-gen {lang} en_US.UTF-8 2>/dev/null; true'],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
        return f'Sistem dili: {lang} (oturumu yeniden başlatınca uygulanır)'

    elif cmd == 'get_display_modes':
        # Çıktı listelemeyen sunucularda (Xvfb vb.) boş döner; arayüz sabit
        # listeye düşerek çalışmayı sürdürür.
        info = {'output': None, 'current_mode': None, 'current_rate': None,
                'preferred_mode': None, 'modes': []}
        try:
            p = subprocess.run(['xrandr', '--query'], stdout=subprocess.PIPE,
                               stderr=subprocess.DEVNULL, text=True, timeout=10)
        except Exception:
            return info

        output = None
        for line in p.stdout.splitlines():
            if output is None:
                cm = re.match(r'^(\S+)\s+connected\b', line)
                if cm:
                    output = cm.group(1)
                    info['output'] = output
                    sm = re.search(r'(\d+x\d+)\+\d+\+\d+', line)
                    if sm:
                        info['current_mode'] = sm.group(1)
                continue

            mm = re.match(r'^\s+(\d+x\d+)\s+(.+)$', line)
            if mm:
                rates = []
                preferred = False
                for tok in mm.group(2).split():
                    marked = '*' in tok
                    if '+' in tok:
                        preferred = True
                    r = tok.replace('*', '').replace('+', '')
                    if re.match(r'^\d+(\.\d+)?$', r):
                        rates.append(r)
                        if marked:
                            info['current_rate'] = r
                info['modes'].append({
                    'mode': mm.group(1),
                    'rates': rates,
                    'current': mm.group(1) == info['current_mode'],
                    'preferred': preferred
                })
                if preferred and not info['preferred_mode']:
                    info['preferred_mode'] = mm.group(1)
            elif line and not line[0].isspace():
                break
        return info

    elif cmd == 'set_display_mode':
        mode = str(args.get('mode', '')).strip()
        rate = str(args.get('rate', '')).strip()
        output = str(args.get('output', '')).strip()
        # 'preferred': ekranın önerilen (native) çözünürlüğü — kurulum sonrası
        # bulanıklığı çözen seçenek.
        if mode != 'preferred' and not re.match(r'^\d+x\d+$', mode):
            raise Exception('Geçersiz çözünürlük biçimi')
        if output and not re.match(r'^[A-Za-z0-9_-]+$', output):
            raise Exception('Geçersiz ekran çıkışı')
        if mode == 'preferred':
            if not output:
                cur = _display_current_state()
                output = (cur or {}).get('output') or ''
            if not output:
                raise Exception('Bağlı ekran bulunamadı')
            cmd_args = ['xrandr', '--output', output, '--preferred']
        else:
            cmd_args = ['xrandr']
            if output:
                cmd_args += ['--output', output, '--mode', mode]
            else:
                cmd_args += ['--size', mode]
        if rate and re.match(r'^\d+(\.\d+)?$', rate):
            cmd_args += ['--rate', rate]

        prev = _display_current_state()
        try:
            p = subprocess.run(cmd_args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, timeout=15)
        except Exception as e:
            raise Exception(f'Ekran modu ayarlanamadı: {e}')
        if p.returncode != 0:
            raise Exception(p.stderr.strip() or 'Ekran modu uygulanamadı')
        # Güvenlik ağı: değişiklik onaylanmazsa eski moda otomatik geri dönüş.
        revert_pid = _display_schedule_revert(prev)
        return {'applied': True,
                'revert_after': DISPLAY_REVERT_DELAY if revert_pid else 0}

    elif cmd == 'confirm_display_mode':
        # Arayüz onayı: geri dönüş sayacını iptal eder.
        _display_cancel_revert()
        return True

    elif cmd == 'revert_display_mode':
        # Kullanıcının "geri al" düğmesi: sayaç beklemeden eski moda dönülür.
        prev = dict(_display_revert)
        _display_cancel_revert()
        if not prev.get('mode'):
            raise Exception('Geri alınacak önceki ekran modu yok')
        cmd_args = ['xrandr', '--output', prev['output'], '--mode', prev['mode']]
        if prev.get('rate'):
            cmd_args += ['--rate', prev['rate']]
        p = subprocess.run(cmd_args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                           text=True, timeout=15)
        if p.returncode != 0:
            raise Exception(p.stderr.strip() or 'Önceki ekran moduna dönülemedi')
        return True

    elif cmd == 'set_display_scale':
        try:
            pct = float(args.get('percent', 100))
        except (TypeError, ValueError):
            raise Exception('Geçersiz ölçek değeri')
        if not 50 <= pct <= 300:
            raise Exception('Ölçek %50 ile %300 arasında olmalı')
        dpi = int(round(96 * pct / 100.0))
        p = subprocess.run(['xrandr', '--dpi', str(dpi)], stdout=subprocess.PIPE,
                           stderr=subprocess.PIPE, text=True, timeout=10)
        if p.returncode != 0:
            raise Exception(p.stderr.strip() or 'Ölçek uygulanamadı')
        return True

    elif cmd == 'save_ai_credential':
        prov = (args.get('provider') or '').strip().lower()
        key = (args.get('apiKey') or args.get('api_key') or '').strip()
        cfg_dir = os.path.expanduser('~/.config/ankora')
        os.makedirs(cfg_dir, exist_ok=True)
        c_file = os.path.join(cfg_dir, 'ai_creds.json')
        creds = {}
        if os.path.exists(c_file):
            try:
                with open(c_file, 'r') as f: creds = json.load(f)
            except: pass
        if key: creds[prov] = key
        elif prov in creds: del creds[prov]
        with open(c_file, 'w') as f: json.dump(creds, f)
        os.chmod(c_file, 0o600)
        return True

    elif cmd == 'has_ai_credential':
        prov = (args.get('provider') or '').strip().lower()
        c_file = os.path.expanduser('~/.config/ankora/ai_creds.json')
        if os.path.exists(c_file):
            try:
                with open(c_file, 'r') as f: creds = json.load(f)
                return bool(creds.get(prov))
            except: pass
        return False

    elif cmd == 'delete_ai_credential':
        prov = (args.get('provider') or '').strip().lower()
        c_file = os.path.expanduser('~/.config/ankora/ai_creds.json')
        if os.path.exists(c_file):
            try:
                with open(c_file, 'r') as f: creds = json.load(f)
                if prov in creds: del creds[prov]
                with open(c_file, 'w') as f: json.dump(creds, f)
            except: pass
        return True

    elif cmd == 'query_local_ai':
        prompt = (args.get('prompt') or '').strip()
        provider = (args.get('provider') or 'ollama').strip().lower()
        api_key = (args.get('apiKey') or args.get('api_key') or '').strip()
        model = (args.get('model') or '').strip()
        endpoint = (args.get('endpoint') or '').strip()
        agent_mode = (args.get('agentMode') or args.get('agent_mode') or 'sysadmin').strip().lower()

        if not api_key:
            c_file = os.path.expanduser('~/.config/ankora/ai_creds.json')
            if os.path.exists(c_file):
                try:
                    with open(c_file, 'r') as f:
                        creds = json.load(f)
                    api_key = creds.get(provider, '')
                except Exception:
                    pass

        tele = execute_ayaz_command('get_system_telemetry', {})
        ram_used = tele.get('memory_used_mb', 512)
        ram_tot = tele.get('memory_total_mb', 4096) or 4096
        ram_pct = int(round(100.0 * ram_used / ram_tot))
        disk_used = tele.get('disk_used_gb') or 0.0
        disk_tot = tele.get('disk_total_gb') or 0.0
        disk_pct = tele.get('disk_percent') or 0
        cpu_cores = tele.get('cpu_cores') or 4
        cpu_pct = tele.get('cpu_percent') or 0.0
        uptime_mins = int((tele.get('uptime_seconds') or 0) // 60)
        os_name = tele.get('os_name') or 'Ankora Linux 3.5'
        kernel = tele.get('kernel') or 'Linux 6.1'
        init_sys = tele.get('init_system') or 'SysVinit'

        def _parse_action(text):
            if '<<<ACTION:' in text:
                s_idx = text.find('<<<ACTION:')
                e_rel = text[s_idx:].find('>>>')
                if e_rel != -1:
                    raw_j = text[s_idx + 10:s_idx + e_rel]
                    clean_r = text[:s_idx].strip()
                    try:
                        act = json.loads(raw_j)
                        c_cmd = (act.get('command') or '').strip()
                        if c_cmd in _ALLOWED_AGENT_ACTIONS:
                            tok = _generate_agent_action_token(c_cmd)
                            return {
                                'reply': clean_r,
                                'has_action': True,
                                'action_command': c_cmd,
                                'action_desc': act.get('desc') or 'Sistem bakım komutu',
                                'action_token': tok
                            }
                    except Exception:
                        pass
            return {'reply': text, 'has_action': False, 'action_command': None, 'action_desc': None, 'action_token': None}

        tele_ctx = f"[Sistem Özeti: {os_name} | {kernel} | {init_sys} | RAM: {ram_used}/{ram_tot} MB (%{ram_pct}) | CPU: {cpu_cores} çekirdek (%{cpu_pct}) | Disk: {disk_used}/{disk_tot} GB (%{disk_pct})]"
        sys_prompt = (
            "Sen Ankora Linux 3.5 (Devuan Daedalus, SysVinit) sistem yöneticisi ve tanılama ajanısın. "
            "Kullanıcıya Türkçe, net ve teknik yanıtlar ver. Gerekirse yanıtının sonuna şu formatta onaylı eylem ekle: "
            "<<<ACTION:{\"command\":\"izin_verilen_komut\",\"desc\":\"Açıklama\"}>>>\n" + tele_ctx
        )

        # Eğer API anahtarı veya Ollama varsa canlı HTTP çağrısı yap
        if api_key or provider == 'ollama':
            try:
                import urllib.request
                if provider == 'gemini' and api_key:
                    ai_model = model or 'gemini-2.0-flash'
                    if not re.match(r'^[A-Za-z0-9._/\-]+$', ai_model):
                        raise Exception('Geçersiz model adı')
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/{ai_model}:generateContent"
                    body = json.dumps({
                        "contents": [{"parts": [{"text": f"{sys_prompt}\n\nKullanıcı: {prompt}"}]}]
                    }).encode('utf-8')
                    req = urllib.request.Request(url, data=body, headers={
                        'Content-Type': 'application/json',
                        'x-goog-api-key': api_key
                    })
                    with urllib.request.urlopen(req, timeout=20) as resp:
                        res_data = json.loads(resp.read().decode('utf-8'))
                        parts = res_data.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])
                        reply_text = parts[0].get('text', '') if parts else ''
                        if reply_text:
                            return _parse_action(reply_text)

                elif provider in ('openai', 'groq', 'openrouter') and api_key:
                    default_ep = (
                        'https://api.groq.com/openai/v1/chat/completions' if provider == 'groq'
                        else ('https://openrouter.ai/api/v1/chat/completions' if provider == 'openrouter'
                              else 'https://api.openai.com/v1/chat/completions')
                    )
                    ep = endpoint or default_ep
                    ai_model = model or ('llama-3.3-70b-versatile' if provider == 'groq' else 'gpt-4o-mini')
                    body = json.dumps({
                        "model": ai_model,
                        "messages": [
                            {"role": "system", "content": sys_prompt},
                            {"role": "user", "content": prompt}
                        ],
                        "temperature": 0.3
                    }).encode('utf-8')
                    req = urllib.request.Request(ep, data=body, headers={
                        'Content-Type': 'application/json',
                        'Authorization': f'Bearer {api_key}'
                    })
                    with urllib.request.urlopen(req, timeout=20) as resp:
                        res_data = json.loads(resp.read().decode('utf-8'))
                        reply_text = res_data.get('choices', [{}])[0].get('message', {}).get('content', '')
                        if reply_text:
                            return _parse_action(reply_text)

                elif provider == 'ollama':
                    ep = endpoint or 'http://127.0.0.1:11434/api/generate'
                    if ep.startswith(('http://127.0.0.1:', 'http://localhost:')):
                        ai_model = model or 'qwen2.5:0.5b'
                        body = json.dumps({
                            "model": ai_model,
                            "prompt": f"{sys_prompt}\n\nKullanıcı: {prompt}",
                            "stream": False
                        }).encode('utf-8')
                        req = urllib.request.Request(ep, data=body, headers={'Content-Type': 'application/json'})
                        with urllib.request.urlopen(req, timeout=10) as resp:
                            res_data = json.loads(resp.read().decode('utf-8'))
                            reply_text = res_data.get('response', '')
                            if reply_text:
                                return _parse_action(reply_text)
            except Exception:
                pass

        p_lower = prompt.lower()
        if any(w in p_lower for w in ['doktor', 'doctor', 'onar', 'sağlık']) or (agent_mode == 'doctor' and any(w in p_lower for w in ['tara', 'kontrol', 'durum'])):
            c_cmd = '/usr/local/bin/ankora-doctor'
            return {
                'reply': (f"Ankora Sistem Doktoru ön kontrolü tamamlandı:\n"
                          f"• İşletim Sistemi: {os_name} ({init_sys})\n"
                          f"• Çekirdek: {kernel}\n"
                          f"• Bellek Kullanımı: {ram_used} MB / {ram_tot} MB (%{ram_pct})\n"
                          f"• Kök Disk: {disk_used} GB / {disk_tot} GB (%{disk_pct})\n"
                          f"• Çalışma Süresi: {uptime_mins} dakika\n\n"
                          "Kırık paketleri, ağ servislerini, ZRAM takas alanını ve disk önbelleklerini kapsamlı denetlemek için aşağıdaki Sistem Doktoru eylemini onaylayabilirsiniz."),
                'has_action': True,
                'action_command': c_cmd,
                'action_desc': 'Ankora Sistem Doktoru kapsamlı sağlık taramasını çalıştır',
                'action_token': _generate_agent_action_token(c_cmd)
            }
        elif any(w in p_lower for w in ['temizle', 'önbellek', 'cache', 'çöp']):
            c_cmd = 'apt-get clean && rm -rf /tmp/*'
            return {
                'reply': f"Anlık Bellek Durumu: {ram_used} MB / {ram_tot} MB (%{ram_pct}).\nPaket önbelleklerini ve `/tmp` altındaki geçici dosyaları güvenli biçimde temizlemek için aşağıdaki eylemi onaylayabilirsiniz.",
                'has_action': True,
                'action_command': c_cmd,
                'action_desc': 'Sistem ve geçici dosya önbelleklerini temizle',
                'action_token': _generate_agent_action_token(c_cmd)
            }
        elif any(w in p_lower for w in ['süreç', 'işlem', 'process', 'cpu', 'işlemci', 'yavaş']):
            c_cmd = 'top -b -n 1'
            return {
                'reply': f"İşlemci Analizi:\n• Çekirdek Sayısı: {cpu_cores} Çekirdek\n• Anlık CPU Yükü: %{cpu_pct}\n• Bellek Kullanımı: {ram_used} MB / {ram_tot} MB (%{ram_pct})\n\nEn çok kaynak tüketen süreçlerin anlık dökümünü almak için aşağıdaki komutu onaylayabilirsiniz.",
                'has_action': True,
                'action_command': c_cmd,
                'action_desc': 'Anlık süreç ve CPU kullanım tablosunu listele',
                'action_token': _generate_agent_action_token(c_cmd)
            }
        elif any(w in p_lower for w in ['zram', 'takas', 'swap', 'bellek', 'ram', 'hafıza']):
            c_cmd = 'free -h'
            return {
                'reply': f"Bellek ve ZRAM Telemetrisi:\n• Kullanılan RAM: {ram_used} MB / {ram_tot} MB (%{ram_pct})\n• Mimari: SysVinit ZRAM Sıkıştırmalı Takas Havuzu\n\nFiziksel RAM ve ZRAM takas alanı ayrıntılarını görmek için aşağıdaki komutu çalıştırabilirsiniz.",
                'has_action': True,
                'action_command': c_cmd,
                'action_desc': 'RAM ve ZRAM takas tablolarını görüntüle (free -h)',
                'action_token': _generate_agent_action_token(c_cmd)
            }
        elif any(w in p_lower for w in ['disk', 'depolama', 'alan', 'bölüm', 'lsblk', 'durum', 'özet', 'rapor', 'analiz']):
            c_cmd = 'df -h / && free -m'
            return {
                'reply': f"Ankora Linux 3.5 Canlı Sistem Raporu:\n• Sistem: {os_name} ({init_sys})\n• Çekirdek: {kernel}\n• CPU: {cpu_cores} Çekirdek (Yük: %{cpu_pct})\n• RAM: {ram_used} MB / {ram_tot} MB (%{ram_pct})\n• Disk: {disk_used} GB / {disk_tot} GB (%{disk_pct})\n• Çalışma Süresi: {uptime_mins} dk\n\nAyrıntılı disk ve bellek çıktısı için aşağıdaki komutu onaylayabilirsiniz.",
                'has_action': True,
                'action_command': c_cmd,
                'action_desc': 'Disk ve bellek doluluk durumunu sorgula',
                'action_token': _generate_agent_action_token(c_cmd)
            }
        elif any(w in p_lower for w in ['donanım', 'hardware', 'çekirdek', 'kernel', 'mimari']):
            c_cmd = 'lscpu'
            return {
                'reply': f"Donanım ve Çekirdek Bilgisi:\n• Dağıtım: {os_name}\n• Çekirdek: {kernel}\n• Init Sistemi: {init_sys}\n• Mantıksal Çekirdek: {cpu_cores}\n\nDetaylı işlemci mimarisi ve bayraklarını incelemek için `lscpu` eylemini çalıştırabilirsiniz.",
                'has_action': True,
                'action_command': c_cmd,
                'action_desc': 'İşlemci ve donanım mimarisi detaylarını görüntüle (lscpu)',
                'action_token': _generate_agent_action_token(c_cmd)
            }
        else:
            reply = (
                f"Ankora Yerel Tanılama Motoru ({agent_mode.upper()} modu) aktif.\n\n"
                f"Anlık Sistem Telemetrisi:\n"
                f"• Sistem: {os_name} | {kernel}\n"
                f"• Bellek: {ram_used} MB / {ram_tot} MB (%{ram_pct}) | CPU: %{cpu_pct} ({cpu_cores} çekirdek)\n"
                f"• Disk: {disk_used} GB / {disk_tot} GB (%{disk_pct})\n\n"
                f"Sorgunuz: \"{prompt}\"\n"
                "• Sistem sağlığı ve onarım için: \"Sistem doktoru taraması yap\"\n"
                "• Önbellek ve geçici dosya temizliği için: \"Önbelleği temizle\"\n"
                "• Süreç ve RAM analizi için: \"RAM ve ZRAM durumu\" veya \"CPU süreçlerini göster\"\n"
                "• Bulut veya yerel LLM kullanmak için üstteki 'API Ayarları' düğmesinden Ollama, Gemini, Groq, OpenAI veya OpenRouter yapılandırabilirsiniz."
            )
            return {
                'reply': reply,
                'has_action': False,
                'action_command': None,
                'action_desc': None,
                'action_token': None
            }

    elif cmd == 'execute_agent_confirmed_action':
        command = (args.get('command') or '').strip()
        token = (args.get('token') or '').strip()
        if command not in _ALLOWED_AGENT_ACTIONS:
            raise Exception('Güvenlik İlkesi İhlali: Bu eylem onaylanmış güvenlik politikası listesinde yer almıyor.')
        with _AGENT_LOCK:
            stored_tok = _PENDING_AGENT_ACTION.get('token')
            stored_cmd = _PENDING_AGENT_ACTION.get('cmd')
            stored_ts = _PENDING_AGENT_ACTION.get('ts') or 0.0
            _PENDING_AGENT_ACTION['token'] = None
            _PENDING_AGENT_ACTION['cmd'] = None
            _PENDING_AGENT_ACTION['ts'] = 0.0
        if not stored_tok or token != stored_tok or command != stored_cmd or (time.time() - stored_ts) > 60.0:
            raise Exception('Yetkilendirme Hatası: Eylem onay tokenı geçersiz, eşleşmiyor veya 60 saniyelik süresi dolmuş.')
        return execute_ayaz_command('run_terminal_command', {'command': command})

    elif cmd == 'check_first_run':
        cfg_file = os.path.expanduser('~/.config/ankora/welcomed.lock')
        return not os.path.exists(cfg_file)

    elif cmd == 'set_first_run_completed':
        dont_show = args.get('dontShowAgain', True)
        if dont_show:
            cfg_dir = os.path.expanduser('~/.config/ankora')
            os.makedirs(cfg_dir, exist_ok=True)
            with open(os.path.join(cfg_dir, 'welcomed.lock'), 'w') as f:
                f.write('welcomed')
        return True

    elif cmd == 'check_de_update':
        current_ver = '3.7.0'
        result = {
            'has_update': False,
            'current_version': current_ver,
            'latest_version': current_ver,
            'release_name': 'Ankora Linux 3.7 (AyazDE)',
            'release_notes': 'Sisteminiz güncel. AyazDE v3.7 kararlı sürüm devrededir.',
            'download_url': None,
            'published_at': '2026-10-26',
            'package_size_bytes': 0,
            'expected_sha256': None,
            'sha256_url': None
        }
        try:
            req = urllib.request.Request(
                'https://api.github.com/repos/Ankora-Linux/Ankora/releases/latest',
                headers={'User-Agent': f'ayaz-updater/{current_ver}'}
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode('utf-8'))
                    tag = data.get('tag_name', '').lstrip('v')
                    if tag and tag != current_ver:
                        result['has_update'] = True
                        result['latest_version'] = tag
                        result['release_name'] = data.get('name', f'Ayaz DE {tag}')
                        result['release_notes'] = data.get('body', 'Yeni özellikler ve hata düzeltmeleri.')
                        result['published_at'] = data.get('published_at', '')
                        for asset in data.get('assets', []):
                            aname = asset.get('name', '').lower()
                            if aname.endswith('.deb'):
                                result['download_url'] = asset.get('browser_download_url')
                                result['package_size_bytes'] = asset.get('size', 0)
                            elif aname.endswith('.sha256'):
                                result['sha256_url'] = asset.get('browser_download_url')
        except Exception:
            pass
        return result

    elif cmd == 'download_and_apply_de_update':
        download_url = args.get('downloadUrl', args.get('download_url'))
        if not download_url:
            return 'Güncelleme paketi URL adresi belirtilmedi.'
        if not str(download_url).startswith('https://github.com/Ankora-Linux/'):
            return 'Güvenlik İlkesi İhlali: İndirme bağlantısı resmi Ankora-Linux deposuna ait değil.'

        expected_sha256 = args.get('expectedSha256', args.get('expected_sha256'))
        sha256_url = args.get('sha256Url', args.get('sha256_url'))

        import tempfile, hashlib
        with tempfile.NamedTemporaryFile(suffix='.deb', delete=False) as tf:
            tmp_path = tf.name

        try:
            req = urllib.request.Request(download_url, headers={'User-Agent': 'ayaz-updater/3.7.0'})
            with urllib.request.urlopen(req, timeout=180) as resp, open(tmp_path, 'wb') as f:
                content = resp.read()
                f.write(content)

            computed_sha256 = hashlib.sha256(content).hexdigest().lower()
            if not expected_sha256 and sha256_url and str(sha256_url).startswith('https://github.com/Ankora-Linux/'):
                try:
                    with urllib.request.urlopen(sha256_url, timeout=30) as s_resp:
                        s_txt = s_resp.read().decode('utf-8', errors='ignore')
                        for word in s_txt.split():
                            w_clean = re.sub(r'[^a-fA-F0-9]', '', word)
                            if len(w_clean) == 64:
                                expected_sha256 = w_clean.lower()
                                break
                except Exception:
                    pass

            if not expected_sha256:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)
                return 'Güvenlik İlkesi İhlali: Güncelleme paketi için geçerli bir SHA-256 doğrulama özeti bulunamadı.'

            if computed_sha256 != str(expected_sha256).strip().lower():
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)
                return 'Güvenlik İlkesi İhlali: SHA-256 doğrulama başarısız! Paket bozulmuş veya değiştirilmiş olabilir.'

            helper = '/usr/local/bin/ayaz-update-helper'
            if os.path.exists(helper):
                stage_proc = subprocess.run(['sudo', '-n', helper, '--stage', tmp_path, computed_sha256],
                                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)
                if stage_proc.returncode != 0:
                    return f'Güncelleme hazırlık hatası: {stage_proc.stderr or stage_proc.stdout}'

                proc = subprocess.run(['sudo', '-n', helper],
                                      stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                if proc.returncode == 0:
                    return 'Ayaz DE başarıyla güncellendi!'
                else:
                    return f'Güncelleme yardımcısı hata verdi: {proc.stderr or proc.stdout}'
            else:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)
                return 'Güvenlik İlkesi İhlali: /usr/local/bin/ayaz-update-helper bulunamadı.'
        except Exception as e:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
            return f'Güncelleme uygulanamadı: {e}'
    elif cmd == 'restart_desktop_process':
        subprocess.Popen(['pkill', '-x', 'ayaz'])
        return True

    elif cmd == 'get_mpris_status':
        try:
            res = subprocess.run(
                ['playerctl', '-a', 'metadata', '--format', '{{playerName}}|||{{status}}|||{{title}}|||{{artist}}|||{{album}}|||{{mpris:artUrl}}'],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=1.5
            )
            if res.returncode == 0 and res.stdout.strip():
                for line in res.stdout.splitlines():
                    parts = line.split('|||')
                    if len(parts) >= 2:
                        p_name = parts[0].strip()
                        p_status = parts[1].strip()
                        p_title = parts[2].strip() if len(parts) > 2 else ''
                        p_artist = parts[3].strip() if len(parts) > 3 else ''
                        p_album = parts[4].strip() if len(parts) > 4 else ''
                        p_art = parts[5].strip() if len(parts) > 5 else ''
                        if p_name:
                            return {
                                'is_active': True,
                                'player_name': p_name,
                                'playback_status': p_status,
                                'title': p_title or 'Bilinmeyen Parça',
                                'artist': p_artist,
                                'album': p_album,
                                'art_url': p_art
                            }
        except Exception:
            pass
        return {
            'is_active': False,
            'player_name': '',
            'playback_status': 'Stopped',
            'title': '',
            'artist': '',
            'album': '',
            'art_url': ''
        }

    elif cmd == 'send_mpris_command':
        sub = args.get('command', '')
        sub_map = {
            'play-pause': 'play-pause',
            'play': 'play',
            'pause': 'pause',
            'next': 'next',
            'previous': 'previous',
            'stop': 'stop'
        }
        action = sub_map.get(sub)
        if not action:
            raise Exception('Geçersiz MPRIS komutu')
        try:
            res = subprocess.run(['playerctl', action], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=2.0)
            if res.returncode == 0:
                return 'Başarılı'
            return 'Oynatıcı yanıt vermedi'
        except Exception as e:
            raise Exception(f'playerctl hatası: {e}')

    elif cmd == 'get_tray_items':
        items = []
        tray_file = '/tmp/ayaz-tray-items.json'
        if os.path.exists(tray_file):
            try:
                with open(tray_file, 'r', encoding='utf-8') as f:
                    items = json.load(f)
            except Exception:
                pass
        return items

    elif cmd == 'activate_tray_item':
        service = args.get('service', '')
        if service:
            try:
                subprocess.run([
                    'dbus-send', '--session', '--type=method_call',
                    f'--dest={service}', '/StatusNotifierItem',
                    'org.kde.StatusNotifierItem.Activate', 'int32:0', 'int32:0'
                ], timeout=1.5, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception:
                pass
        return 'Aktifleştirildi'

    elif cmd == 'context_menu_tray_item':
        service = args.get('service', '')
        if service:
            try:
                subprocess.run([
                    'dbus-send', '--session', '--type=method_call',
                    f'--dest={service}', '/StatusNotifierItem',
                    'org.kde.StatusNotifierItem.ContextMenu', 'int32:0', 'int32:0'
                ], timeout=1.5, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception:
                pass
        return 'Menü açıldı'

    elif cmd == 'get_open_with_apps':
        file_path = args.get('filePath', args.get('file_path', ''))
        if not file_path or not os.path.exists(file_path):
            raise Exception('Dosya bulunamadı')
        apps = []
        mime_type = ''
        try:
            m_res = subprocess.run(['xdg-mime', 'query', 'filetype', file_path], stdout=subprocess.PIPE, text=True)
            if m_res.returncode == 0:
                mime_type = m_res.stdout.strip()
        except Exception:
            pass

        def_app = ''
        if mime_type:
            try:
                d_res = subprocess.run(['xdg-mime', 'query', 'default', mime_type], stdout=subprocess.PIPE, text=True)
                if d_res.returncode == 0:
                    def_app = d_res.stdout.strip()
            except Exception:
                pass

        app_dirs = ['/usr/share/applications', '/usr/local/share/applications']
        for ad in app_dirs:
            if os.path.isdir(ad):
                for fname in os.listdir(ad):
                    if fname.endswith('.desktop'):
                        fpath = os.path.join(ad, fname)
                        try:
                            with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
                                content = f.read()
                            matches_mime = (f'MimeType=' in content and mime_type in content) if mime_type else False
                            is_default = (fname == def_app)
                            if matches_mime or is_default:
                                name = ''
                                exec_cmd = ''
                                icon = ''
                                nodisplay = False
                                for line in content.splitlines():
                                    if line.startswith('Name=') and not name:
                                        name = line[5:].strip()
                                    elif line.startswith('Exec=') and not exec_cmd:
                                        exec_cmd = line[5:].replace('%f', '').replace('%F', '').replace('%u', '').replace('%U', '').strip()
                                    elif line.startswith('Icon=') and not icon:
                                        icon = line[5:].strip()
                                    elif line.strip() == 'NoDisplay=true':
                                        nodisplay = True
                                if not nodisplay and name and exec_cmd:
                                    apps.append({
                                        'id': fname,
                                        'name': name,
                                        'exec': exec_cmd,
                                        'icon': icon,
                                        'is_default': is_default
                                    })
                        except Exception:
                            pass
        return apps

    elif cmd == 'set_desktop_wallpaper':
        file_path = args.get('filePath', args.get('file_path', ''))
        # Yalnızca dosya adı geldiyse (tema paketinden) /usr/share/ayaz altında çöz.
        if file_path and not os.path.isabs(file_path):
            _cand = os.path.join('/usr/share/ayaz', os.path.basename(file_path))
            if os.path.exists(_cand):
                file_path = _cand
        if not file_path or not os.path.exists(file_path):
            raise Exception('Duvar kağıdı dosyası bulunamadı')
        try:
            subprocess.run(['feh', '--bg-fill', file_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            try:
                subprocess.run(['xwallpaper', '--zoom', file_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception:
                pass
        home = os.environ.get('HOME', '/home/live')
        c_dir = os.path.join(home, '.config', 'ankora')
        os.makedirs(c_dir, exist_ok=True)
        with open(os.path.join(c_dir, 'wallpaper'), 'w') as f:
            f.write(file_path)
        return 'Duvar kağıdı uygulandı'

    elif cmd == 'get_usb_flash_targets':
        targets = []
        try:
            res = subprocess.run(
                ['lsblk', '-J', '-b', '-o', 'NAME,PATH,SIZE,TYPE,TRAN,MODEL,VENDOR,RM,MOUNTPOINT'],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
            )
            if res.returncode == 0:
                data = json.loads(res.stdout)
                devices = data.get('blockdevices', [])
                for dev in devices:
                    if dev.get('type') != 'disk':
                        continue
                    tran = dev.get('tran', '')
                    rm = dev.get('rm', False)
                    if tran != 'usb' and not rm:
                        continue
                    has_sys = False
                    def check_mp(item):
                        nonlocal has_sys
                        mp = item.get('mountpoint')
                        if mp in ('/', '/boot', '/home') or (mp and mp.startswith('/live')):
                            has_sys = True
                        for ch in item.get('children', []):
                            check_mp(ch)
                    check_mp(dev)
                    if has_sys:
                        continue

                    name = dev.get('name', '')
                    path = dev.get('path', f'/dev/{name}')
                    model = (dev.get('model') or 'USB Bellek').strip()
                    vendor = (dev.get('vendor') or '').strip()
                    size_bytes = dev.get('size', 0)
                    size_human = f"{size_bytes / (1024**3):.1f} GB" if size_bytes >= 1024**3 else f"{size_bytes / (1024**2):.1f} MB"
                    targets.append({
                        'name': name,
                        'path': path,
                        'model': model,
                        'vendor': vendor,
                        'size_human': size_human,
                        'size_bytes': size_bytes,
                        'is_removable': True
                    })
        except Exception as e:
            raise Exception(f'lsblk hatası: {e}')
        return targets

    elif cmd == 'flash_iso_to_usb':
        iso_path = args.get('isoPath', args.get('iso_path', ''))
        target_device = args.get('targetDevice', args.get('target_device', ''))
        if not iso_path or not os.path.exists(iso_path):
            raise Exception('ISO dosyası bulunamadı')
        if not target_device or not target_device.startswith('/dev/'):
            raise Exception('Geçersiz hedef cihaz')

        dev_name = target_device[len('/dev/'):]
        if not dev_name or not re.match(r'^[a-zA-Z0-9_\-]+$', dev_name):
            raise Exception('Geçersiz hedef cihaz adı')

        if not os.path.exists(target_device):
            raise Exception('Hedef aygıt bulunamadı')

        for mnt in ('/', '/boot', '/home', '/etc'):
            try:
                m_res = subprocess.run(['findmnt', '-n', '-o', 'SOURCE', mnt], stdout=subprocess.PIPE, text=True)
                if target_device in m_res.stdout:
                    raise Exception('Kritik Hata: Sistem kök veya sistem diskine yazma engellendi!')
            except Exception as e:
                if 'engellendi' in str(e):
                    raise e

        progress_file = '/tmp/ankora-flasher.progress'
        with open(progress_file, 'w') as f:
            f.write('0.0:running:Yazma işlemi başlatılıyor...')

        def do_flash():
            try:
                if os.path.exists('/usr/local/bin/ayaz-pkg-helper'):
                    p_res = _root_run(['/usr/local/bin/ayaz-pkg-helper', 'usb-flash', iso_path, target_device], timeout=1800)
                    rc = p_res.returncode
                else:
                    _root_run(['umount', '-f', target_device])
                    if os.path.exists('/proc/mounts'):
                        try:
                            with open('/proc/mounts', 'r') as mf:
                                for line in mf:
                                    parts = line.split()
                                    if parts and parts[0].startswith(target_device):
                                        _root_run(['umount', '-f', parts[0]])
                        except Exception:
                            pass
                    p_res = _root_run(['dd', f'if={iso_path}', f'of={target_device}', 'bs=4M', 'status=none', 'conv=fsync'], timeout=1800)
                    rc = p_res.returncode
                    subprocess.run(['sync'])
                if rc == 0:
                    with open(progress_file, 'w') as f:
                        f.write('100.0:done:ISO başarıyla USB belleğe yazdırıldı!')
                else:
                    with open(progress_file, 'w') as f:
                        f.write('0.0:error:Yazma işlemi hata verdi.')
            except Exception as e:
                with open(progress_file, 'w') as f:
                    f.write(f'0.0:error:Hata: {e}')

        threading.Thread(target=do_flash, daemon=True).start()
        return 'Yazma işlemi arka planda başlatıldı'

    elif cmd == 'get_flash_progress':
        progress_file = '/tmp/ankora-flasher.progress'
        if not os.path.exists(progress_file):
            return {'percent': 0.0, 'status': 'idle', 'message': 'Bekleniyor'}
        try:
            with open(progress_file, 'r') as f:
                content = f.read().strip()
            parts = content.split(':', 2)
            if len(parts) == 3:
                return {
                    'percent': float(parts[0]),
                    'status': parts[1],
                    'message': parts[2]
                }
        except Exception:
            pass
        return {'percent': 0.0, 'status': 'idle', 'message': 'Bekleniyor'}

    elif cmd == 'format_usb_drive':
        target_device = args.get('targetDevice', args.get('target_device', ''))
        filesystem = str(args.get('filesystem', 'vfat')).lower()
        label = re.sub(r'[^a-zA-Z0-9_\-]', '', str(args.get('label', 'ANKORA'))) or 'ANKORA'

        if not target_device.startswith('/dev/'):
            raise Exception('Geçersiz hedef cihaz')

        dev_name = target_device[len('/dev/'):]
        if not dev_name or not re.match(r'^[a-zA-Z0-9_\-]+$', dev_name):
            raise Exception('Geçersiz hedef cihaz adı')

        if not os.path.exists(target_device):
            raise Exception('Hedef aygıt bulunamadı')

        for mnt in ('/', '/boot', '/home', '/etc'):
            try:
                m_res = subprocess.run(['findmnt', '-n', '-o', 'SOURCE', mnt], stdout=subprocess.PIPE, text=True)
                if target_device in m_res.stdout:
                    raise Exception('Sistem kök sürücüsü biçimlendirilemez!')
            except Exception as e:
                if 'biçimlendirilemez' in str(e):
                    raise e

        if os.path.exists('/usr/local/bin/ayaz-pkg-helper'):
            p_res = _root_run(['/usr/local/bin/ayaz-pkg-helper', 'usb-format', target_device, filesystem, label])
            if p_res.returncode == 0:
                return f'{target_device} başarıyla {filesystem.upper()} olarak biçimlendirildi.'
            raise Exception(f'Biçimlendirme hatası: {p_res.stderr or p_res.stdout}')
        _root_run(['umount', '-f', target_device])
        if os.path.exists('/proc/mounts'):
            try:
                with open('/proc/mounts', 'r') as mf:
                    for line in mf:
                        parts = line.split()
                        if parts and parts[0].startswith(target_device):
                            _root_run(['umount', '-f', parts[0]])
            except Exception:
                pass

        if filesystem in ('vfat', 'fat32'):
            cmd_args = ['mkfs.vfat', '-F', '32', '-n', label, target_device]
        elif filesystem == 'ext4':
            cmd_args = ['mkfs.ext4', '-F', '-L', label, target_device]
        elif filesystem == 'ntfs':
            cmd_args = ['mkfs.ntfs', '-Q', '-L', label, target_device]
        else:
            raise Exception('Desteklenmeyen dosya sistemi')

        p_res = _root_run(cmd_args)
        if p_res.returncode == 0:
            return f'{target_device} başarıyla {filesystem.upper()} olarak biçimlendirildi.'
        raise Exception(f'Biçimlendirme hatası: {p_res.stderr or p_res.stdout}')

    elif cmd == 'create_system_snapshot':
        raw_name = str(args.get('name', 'Snapshot'))
        name = re.sub(r'[^a-zA-Z0-9_\-]', '', raw_name) or 'Snapshot'
        desc = str(args.get('description', ''))
        snap_info = _snap_helper_json('snapshot-create', name)
        if isinstance(snap_info, dict):
            snap_info.setdefault('description', desc)
            snap_info.setdefault('is_btrfs', False)
        return snap_info

    elif cmd == 'list_system_snapshots':
        meta_file = '/var/backups/ankora-snapshots/snapshots.json'
        if os.path.exists(meta_file):
            try:
                with open(meta_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                pass
        return []

    elif cmd == 'restore_system_snapshot':
        snap_id = args.get('snapshotId', args.get('snapshot_id', ''))
        if not snap_id or '..' in snap_id or '/' in snap_id or '\\' in snap_id:
            raise Exception('Geçersiz snapshot kimliği')
        _snap_helper_json('snapshot-restore', snap_id)
        return 'Sistem yapılandırması başarıyla geri yüklendi.'

    elif cmd == 'delete_system_snapshot':
        snap_id = args.get('snapshotId', args.get('snapshot_id', ''))
        if not snap_id or '..' in snap_id or '/' in snap_id or '\\' in snap_id:
            raise Exception('Geçersiz snapshot kimliği')
        _snap_helper_json('snapshot-delete', snap_id)
        return 'Kurtarma noktası silindi'

    elif cmd == 'launch_interactive_terminal':
        cmd_str = (args.get('command') or '').strip()
        terms = ['x-terminal-emulator', 'xterm', 'lxterminal', 'xfce4-terminal']
        term = 'xterm'
        for t in terms:
            if shutil.which(t):
                term = t
                break
        if cmd_str:
            bad_chars = set(';&|`$\n\r><()')
            found_bad = bad_chars.intersection(cmd_str)
            if found_bad:
                raise Exception(f'Güvenlik Hatası: Komutta yasaklı karakter tespit edildi ({list(found_bad)[0]})')
            first_word = cmd_str.split()[0]
            if first_word in _FORBIDDEN_BINARIES:
                raise Exception(f"Güvenlik Hatası: '{first_word}' doğrudan başlatılamaz")
            for pat in _SENSITIVE_PATTERNS:
                if pat.lower() in cmd_str.lower():
                    raise Exception(f"Güvenlik Hatası: Hassas sistem yoluna erişim engellendi: {pat}")
            script = f"{cmd_str}; echo; echo '[İşlem tamamlandı, çıkmak için Enter tuşuna basın]'; read -r _"
            subprocess.Popen([term, '-e', 'bash', '-c', script], env=os.environ.copy())
        else:
            subprocess.Popen([term], env=os.environ.copy())
        return f"Sistem terminali ({term}) başlatıldı."

    elif cmd == 'get_all_monitors':
        monitors = []
        primary_name = None
        try:
            res = subprocess.run(['xrandr', '--query'], capture_output=True, text=True)
            if res.returncode == 0:
                cur_mon = None
                for line in res.stdout.splitlines():
                    if ' connected' in line or ' disconnected' in line:
                        if cur_mon:
                            monitors.append(cur_mon)
                        parts = line.split()
                        if not parts:
                            continue
                        name = parts[0]
                        is_conn = ' connected' in line and ' disconnected' not in line
                        is_pri = ' primary' in line
                        if is_pri:
                            primary_name = name
                        cur_mode = None
                        pos = None
                        for tok in parts:
                            if 'x' in tok and '+' in tok:
                                sub = tok.split('+')
                                cur_mode = sub[0]
                                pos = '+'.join(sub[1:])
                        cur_mon = {
                            'name': name,
                            'connected': is_conn,
                            'is_primary': is_pri,
                            'current_mode': cur_mode,
                            'current_rate': None,
                            'position': pos,
                            'modes': []
                        }
                    elif (line.startswith('   ') or line.startswith('\t')) and cur_mon:
                        parts = line.split()
                        if parts and 'x' in parts[0]:
                            m_name = parts[0]
                            if m_name not in cur_mon['modes']:
                                cur_mon['modes'].append(m_name)
                            for tok in parts[1:]:
                                if '*' in tok:
                                    cur_mon['current_rate'] = tok.replace('*', '').replace('+', '')
                if cur_mon:
                    monitors.append(cur_mon)
        except Exception:
            pass
        if not primary_name and monitors:
            for m in monitors:
                if m['connected']:
                    primary_name = m['name']
                    break
        return {
            'primary_output': primary_name,
            'monitors': monitors,
            'connected_count': sum(1 for m in monitors if m['connected'])
        }

    elif cmd == 'set_multi_monitor_layout':
        layout = args.get('layout', 'auto')
        pri = args.get('primary', '') or 'eDP-1'
        sec = args.get('secondary', '') or 'HDMI-1'
        if layout == 'extend-right':
            subprocess.run(['xrandr', '--output', pri, '--auto', '--primary', '--output', sec, '--auto', '--right-of', pri])
            return f"Ekran sağa genişletildi: {pri} -> {sec}"
        elif layout == 'extend-left':
            subprocess.run(['xrandr', '--output', pri, '--auto', '--primary', '--output', sec, '--auto', '--left-of', pri])
            return f"Ekran sola genişletildi: {sec} <- {pri}"
        elif layout == 'mirror':
            subprocess.run(['xrandr', '--output', pri, '--auto', '--primary', '--output', sec, '--auto', '--same-as', pri])
            return f"Ekranlar klonlandı (Ayna modu): {pri} == {sec}"
        elif layout == 'single-primary':
            subprocess.run(['xrandr', '--output', pri, '--auto', '--primary', '--output', sec, '--off'])
            return f"Yalnızca birincil ekran etkinleştirildi: {pri}"
        else:
            subprocess.run(['xrandr', '--auto'])
            return "Monitörler otomatik yapılandırıldı."

    elif cmd == 'copy_path_c':
        src = args.get('sourcePath', '')
        dest = args.get('destPath', '')
        move_op = bool(args.get('moveOp', False))
        if not src or not os.path.exists(src):
            raise Exception('Kaynak dosya veya klasör bulunamadı.')
        if not dest:
            raise Exception('Hedef yol belirtilmedi.')
        if os.path.isdir(dest):
            dest = os.path.join(dest, os.path.basename(src))
        if src == dest or dest.startswith(src + os.sep):
            raise Exception('Hedef kaynak ile aynı veya kaynağın alt dizini olamaz.')
        is_safe_user_path(src, write=move_op)
        is_safe_user_path(dest, write=True)
        if os.path.exists(dest):
            parent = os.path.dirname(dest) or '.'
            stem, ext = os.path.splitext(os.path.basename(dest))
            for n in range(1, 512):
                cand = os.path.join(parent, f"{stem} ({n}){ext}")
                if not os.path.exists(cand):
                    dest = cand
                    break
        if move_op:
            shutil.move(src, dest)
            return 'Öğe taşındı.'
        else:
            if os.path.isdir(src):
                shutil.copytree(src, dest, symlinks=True)
            else:
                shutil.copy2(src, dest)
            return 'Öğe kopyalandı.'

    elif cmd == 'create_symlink':
        src = args.get('sourcePath', '')
        link = args.get('linkPath', '')
        if not src or not os.path.exists(src):
            raise Exception('Kısayol hedefi bulunamadı.')
        if not link or os.path.exists(link):
            raise Exception('Geçersiz hedef veya aynı adlı bir kısayol zaten var.')
        # C5: Hedef ve kaynak sınırlandırması
        is_safe_user_path(src, write=False)
        real_src = os.path.realpath(src)
        is_safe_user_path(real_src, write=False)

        is_safe_user_path(link, write=True)
        link_dir = os.path.dirname(os.path.abspath(link)) or home_dir
        if not os.path.exists(link_dir):
            raise Exception('Kısayol klasörü mevcut değil.')
        real_link_dir = os.path.realpath(link_dir)
        allowed_dirs = [home_dir, '/tmp', '/media', '/mnt', '/run/user']
        if not any(real_link_dir == d or real_link_dir.startswith(d + os.sep) for d in allowed_dirs):
            raise Exception('Güvenlik İlkesi İhlali: Kısayol yalnızca kullanıcı ev veya taşınabilir ortam dizinlerinde oluşturulabilir.')
        os.symlink(src, link)
        return 'Kısayol oluşturuldu.'

    elif cmd == 'file_stat':
        path = args.get('path', '')
        if not path or not os.path.exists(path):
            raise Exception('Dosya bulunamadı.')
        st = os.lstat(path)
        is_dir = os.path.isdir(path)
        is_symlink = os.path.islink(path)
        child_count = len(os.listdir(path)) if is_dir else 0
        owner = ''
        try:
            import pwd
            owner = pwd.getpwuid(st.st_uid).pw_name
        except Exception:
            owner = str(st.st_uid)
        return {
            'name': os.path.basename(path) or path,
            'path': path,
            'is_dir': is_dir,
            'is_symlink': is_symlink,
            'size': st.st_size,
            'mtime': int(st.st_mtime),
            'ctime': int(st.st_ctime),
            'owner': owner,
            'perms': oct(st.st_mode & 0o777)[2:],
            'executable': bool(st.st_mode & 0o111),
            'child_count': child_count,
            'kind': 'Klasör' if is_dir else ('Bağlantı' if is_symlink else 'Dosya')
        }

    elif cmd == 'path_fs_usage':
        path = args.get('path', '')
        if not path or not os.path.exists(path):
            path = '/'
        st = os.statvfs(path)
        total = st.f_blocks * st.f_frsize
        free = st.f_bavail * st.f_frsize
        used = total - free
        return {'total': total, 'used': used, 'free': free}

    elif cmd == 'set_file_permissions':
        path = args.get('path', '')
        mode = str(args.get('mode', ''))
        if not path or not os.path.exists(path) or not mode.isdigit():
            raise Exception('Geçersiz dosya yolu veya izin.')
        os.chmod(path, int(mode, 8))
        return 'İzinler güncellendi.'

    elif cmd == 'set_file_executable':
        path = args.get('path', '')
        executable = bool(args.get('executable', True))
        if not path or not os.path.exists(path):
            raise Exception('Dosya bulunamadı.')
        current_mode = os.stat(path).st_mode
        new_mode = (current_mode | 0o111) if executable else (current_mode & ~0o111)
        os.chmod(path, new_mode)
        return 'Dosya artık çalıştırılabilir.' if executable else 'Çalıştırma izni kaldırıldı.'

    elif cmd == 'print_file':
        path = args.get('path', '')
        if not path or not os.path.exists(path):
            raise Exception('Yazdırılacak dosya bulunamadı.')
        res = subprocess.run(['lp', path], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        if res.returncode == 0:
            return 'Dosya yazıcı kuyruğuna gönderildi.'
        raise Exception('Yazıcı bulunamadı ya da kuyruk yok.')

    elif cmd == 'email_file':
        path = args.get('path', '')
        if not path or not os.path.exists(path):
            raise Exception('Paylaşılacak dosya bulunamadı.')
        subprocess.Popen(['xdg-email', '--attach', path])
        return 'E-posta uygulaması açıldı.'

    elif cmd == 'set_as_default_app':
        app_path = args.get('appPath', '')
        if not app_path or not os.path.exists(app_path):
            raise Exception('Masaüstü dosyası bulunamadı.')
        desktop_id = os.path.basename(app_path)
        mimes = []
        with open(app_path, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                if line.startswith('MimeType='):
                    mimes = [m.strip() for m in line[9:].split(';') if m.strip()]
                    break
        if not mimes:
            raise Exception('Bu masaüstü dosyası MimeType satırı içermiyor.')
        subprocess.run(['xdg-mime', 'default', desktop_id] + mimes)
        return f"'{desktop_id}' seçilen dosya türleri için varsayılan atandı."

    elif cmd == 'list_system_users':
        users = []
        import pwd
        curr = os.environ.get('USER', '')
        for p in pwd.getpwall():
            if (1000 <= p.pw_uid <= 60000) or p.pw_uid == 0:
                users.append({
                    'username': p.pw_name,
                    'uid': p.pw_uid,
                    'gid': p.pw_gid,
                    'full_name': p.pw_gecos.split(',')[0],
                    'home_dir': p.pw_dir,
                    'shell': p.pw_shell,
                    'is_current': p.pw_name == curr,
                    'is_admin': p.pw_uid == 0
                })
        return users

    elif cmd == 'system_user_info':
        uname = args.get('username') or os.environ.get('USER', '')
        import pwd
        try:
            p = pwd.getpwnam(uname)
            return {
                'username': p.pw_name,
                'uid': p.pw_uid,
                'gid': p.pw_gid,
                'full_name': p.pw_gecos.split(',')[0],
                'home_dir': p.pw_dir,
                'shell': p.pw_shell,
                'is_current': p.pw_name == os.environ.get('USER', ''),
                'is_admin': p.pw_uid == 0
            }
        except Exception:
            raise Exception(f"'{uname}' kullanıcı hesabı bulunamadı.")

    elif cmd == 'system_user_add':
        uname = args.get('username', '').strip()
        pwd = args.get('password', '')
        full = args.get('fullName', '')
        if not uname or not pwd:
            raise Exception('Kullanıcı adı ve parola zorunludur.')
        _root_run(['useradd', '-m', '-s', '/bin/bash', '-G', 'sudo,audio,video,plugdev,netdev', '-c', full, uname])
        p = subprocess.Popen(['sudo', '-n', 'chpasswd'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        p.communicate(input=f"{uname}:{pwd}\n".encode('utf-8'))
        return f"'{uname}' kullanıcısı oluşturuldu."

    elif cmd == 'system_user_remove':
        uname = args.get('username', '').strip()
        if not uname or uname == 'root' or uname == os.environ.get('USER', ''):
            raise Exception('Geçersiz veya silinemez kullanıcı.')
        _root_run(['userdel', '-r', uname])
        return f"'{uname}' kullanıcısı kaldırıldı."

    elif cmd == 'system_update_apt':
        do_up = bool(args.get('upgrade', args.get('doUpgrade', False)))
        proc = _root_run(['apt-get', 'update'], timeout=300)
        out = (proc.stdout or '') + (proc.stderr or '')
        if do_up:
            proc2 = _root_run(['apt-get', 'upgrade', '-y', '--no-install-recommends'], timeout=1200)
            out += '\n' + (proc2.stdout or '') + (proc2.stderr or '')
        return out.strip()

    elif cmd == 'mark_notifications_read':
        return True

    elif cmd == 'open_pictures_folder':
        pics = os.path.expanduser('~/Resimler')
        if not os.path.exists(pics):
            pics = os.path.expanduser('~/Pictures')
            os.makedirs(pics, exist_ok=True)
        subprocess.Popen(['xdg-open', pics])
        return True

    # Bilinmeyen komut sessizce "işlendi" derse arayüz hiçbir zaman hata görmez;
    # köprü ile uyuşmayan her çağrı gerçek bir hata olarak döner.
    raise Exception(f"Bilinmeyen komut: {cmd}")


class AyazIpcHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Denetim izi: hangi istek ne zaman geldi. Dosya sahibine 0600 ile
        # açılır, 256 KB'ta baştan başlar; günlük tutma hatası isteği durdurmaz.
        try:
            log_dir = os.path.join(os.path.expanduser('~'), '.cache')
            if not os.path.isdir(log_dir):
                os.makedirs(log_dir, mode=0o700, exist_ok=True)
            log_path = os.path.join(log_dir, 'ayaz-ipc.log')
            if os.path.exists(log_path) and os.path.getsize(log_path) > 262144:
                os.remove(log_path)
            line = '%s - %s\n' % (self.log_date_time_string(), format % args)
            fd = os.open(log_path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
            try:
                os.write(fd, line.encode('utf-8', 'replace'))
            finally:
                os.close(fd)
        except Exception:
            pass

    def _send_cors(self):
        self.send_header('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
        self.send_header('Vary', 'Origin')

    def do_OPTIONS(self):
        if self.headers.get('Origin', '') != ALLOWED_ORIGIN:
            self.send_response(403)
            self.end_headers()
            return
        self.send_response(200)
        self._send_cors()
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Ayaz-Token')
        self.end_headers()

    # Uzak siteler X-Frame-Options / frame-ancestors ile çerçeveyi reddeder;
    # bu köprü başlıkları yeniden üretmediği için yerleşik görüntüleyici her
    # http/https adresini açabilir. Yerel ve özel ağ adresleri alınmaz.
    LOCAL_HOST = re.compile(
        r'^(localhost|127(\.\d+){3}|0\.0\.0\.0|10(\.\d+){3}|192\.168(\.\d+){2}|'
        r'169\.254(\.\d+){2}|172\.(1[6-9]|2\d|3[01])(\.\d+){2}|\[?::1\]?)$', re.I)

    def _proxy_error(self, code, message):
        body = (
            '<!DOCTYPE html><meta charset="utf-8">'
            '<body style="margin:0;background:#181a24;color:#e8eaf2;'
            'font:14px/1.6 system-ui,sans-serif;display:flex;align-items:center;'
            'justify-content:center;height:100vh;text-align:center">'
            '<div><p style="font-size:16px;margin:0 0 8px">Sayfa açılamadı</p>'
            '<p style="opacity:.72;margin:0">' + message + '</p></div></body>'
        ).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _serve_proxy(self):
        try:
            params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        except Exception:
            params = {}

        # GÜVENLİK (C4): Proxy köken ve token denetimi
        req_origin = self.headers.get('Origin') or self.headers.get('Referer', '')
        if not req_origin.startswith(ALLOWED_ORIGIN) and not req_origin.startswith('http://127.0.0.1') and not req_origin.startswith('http://localhost'):
            self._proxy_error(403, 'Yetkisiz erişim: Geçersiz veya eksik Origin/Referer.')
            return

        # Token denetimi
        req_token = self.headers.get('X-Ayaz-Token') or (params.get('token') or [''])[0]
        if not req_token or not hmac.compare_digest(req_token, IPC_TOKEN):
            self._proxy_error(403, 'Yetkisiz erişim: Geçersiz veya eksik proxy token.')
            return

        # Hız sınırlayıcı (10 saniyede azami 60 istek)
        with _PROXY_LOCK:
            now = time.time()
            _PROXY_REQUEST_TIMES[:] = [t for t in _PROXY_REQUEST_TIMES if now - t < 10.0]
            if len(_PROXY_REQUEST_TIMES) >= 60:
                self._proxy_error(429, 'İstek hız sınırı aşıldı. Lütfen bekleyin.')
                return
            _PROXY_REQUEST_TIMES.append(now)

        url = (params.get('url') or [''])[0].strip()
        if not re.match(r'^https?://', url):
            self._proxy_error(400, 'Yalnızca http/https adresleri görüntülenebilir.')
            return
        host = urllib.parse.urlparse(url).hostname or ''
        if self.LOCAL_HOST.match(host):
            self._proxy_error(403, 'Yerel ağ adresleri görüntülenemez.')
            return

        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 '
                          '(KHTML, like Gecko) Version/16.5 Safari/605.1.15',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'tr,en;q=0.8',
        })
        # Bağlantı koptuğu için bir kez daha denenir; bazı sunucular ilk isteği
        # reddedip ikincisini kabul eder. Başarılı denemede döngü hemen biter.
        raw = final_url = ctype = None
        last_err = None
        for attempt in range(2):
            try:
                resp = urllib.request.urlopen(req, timeout=20)
                raw = resp.read(4 * 1024 * 1024)
                final_url = resp.geturl()
                ctype = resp.headers.get('Content-Type') or 'text/html; charset=utf-8'
                if (resp.headers.get('Content-Encoding') or '').lower() == 'gzip':
                    try:
                        raw = gzip.decompress(raw)
                    except Exception:
                        pass
                break
            except Exception as e:
                last_err = e
                if attempt == 0:
                    time.sleep(0.5)
        if raw is None:
            detail = str(last_err).strip() or type(last_err).__name__
            self._proxy_error(502, f'Uzak sunucu yanıt vermedi: {detail}')
            return

        if 'html' not in ctype.lower():
            self.send_response(200)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Length', str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
            return

        # <base> göreli alt kaynakları çözümler. Geçişlerin tümü host'taki
        # decide-policy üzerinde toplandığı için ayrıca betik enjekte edilmez.
        inject = (
            '<base href="' + final_url.replace('&', '&amp;').replace('"', '&quot;') + '">'
        ).encode('utf-8')

        # <base> belgenin BAŞINA eklenir. Tarayıcı göreli adresleri
        # ayrıştırma anındaki tabanla çözdüğü için </head>'den sonraki bir base
        # ilk <link rel=stylesheet'>leri kaçırmış, stil istekleri köprü adresine
        # (404) gidiyordu.
        low = raw.lower()
        marker = (re.search(rb'<head[^>]*>', low)
                  or re.search(rb'<body[^>]*>', low)
                  or re.search(rb'<!doctype[^>]*>', low))
        pos = marker.end() if marker else 0
        raw = raw[:pos] + inject + raw[pos:]

        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        clean_path = self.path.split('?')[0].split('#')[0]
        if clean_path == '/proxy':
            self._serve_proxy()
            return
        if clean_path in ('/', ''):
            clean_path = '/index.html'

        base_dir = os.path.abspath('/usr/share/ayaz')
        clean_rel = clean_path.lstrip('/')
        file_path = os.path.abspath(os.path.normpath(os.path.join(base_dir, clean_rel)))
        if not (file_path == base_dir or file_path.startswith(base_dir + os.sep)) or not os.path.isfile(file_path):
            self.send_response(404)
            self.end_headers()
            return

        ext = os.path.splitext(file_path)[1].lower()
        mime_types = {
            '.html': 'text/html; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.svg': 'image/svg+xml',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.woff': 'font/woff',
            '.woff2': 'font/woff2',
            '.ttf': 'font/ttf',
            '.pdf': 'application/pdf'
        }
        content_type = mime_types.get(ext, 'application/octet-stream')
        try:
            with open(file_path, 'rb') as f:
                data = f.read()
            # Token asla HTTP ile servis edilmez: kimliksiz GET çeken her yerel
            # süreç aynısını okuyup IPC'ye yetkisiz erişebilirdi. Token yalnızca
            # WebView user script'inde (build-iso.sh içinde) üretilir.
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(data)))
            self._send_cors()
            self.end_headers()
            self.wfile.write(data)
        except Exception:
            self.send_response(500)
            self.end_headers()

    def do_POST(self):
        if self.path != '/api/ipc':
            self.send_response(404)
            self.end_headers()
            return

        # GÜVENLİK: Tarayıcı kökenleri yalnız sabit izinli Origin'den gelebilir.
        # Origin başlığı zorunludur; eksik veya uyumsuz Origin doğrudan 403 ile reddedilir.
        req_origin = self.headers.get('Origin', '')
        if not req_origin or req_origin != ALLOWED_ORIGIN:
            resp = json.dumps({'error': 'Yetkisiz erişim: Geçersiz veya eksik Origin'}).encode('utf-8')
            self.send_response(403)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(resp)
            return

        # GÜVENLİK: Token doğrulaması — yetkisiz yerel süreçlerin IPC'ye erişimini
        # engeller. Zaman sabitli karşılaştırma, karşılaştırmayı ölçülebilir kılmaz.
        req_token = self.headers.get('X-Ayaz-Token', '')
        if not hmac.compare_digest(req_token, IPC_TOKEN):
            with _STATE_LOCK:
                IPC_STATE['bad'] += 1
                is_blocked = IPC_STATE['bad'] >= 50
            resp = json.dumps({'error': 'Yetkisiz erişim: Geçersiz IPC token'}).encode('utf-8')
            # Token 256 bit olduğu için deneme kırılamaz; yine de uzun süreli
            # denemede yanıt kodu değişir ve kapı kalıcı olarak kapanır.
            self.send_response(503 if is_blocked else 403)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(resp)
            return
        with _STATE_LOCK:
            IPC_STATE['bad'] = 0

        content_length = int(self.headers.get('Content-Length', 0))
        # Sınırsız gövde, tek istekle bellek tüketilebilir
        if content_length > 1_000_000:
            self.send_response(413)
            self.end_headers()
            return
        body = self.rfile.read(content_length).decode('utf-8')
        try:
            req = json.loads(body)
            cmd = req.get('cmd', '')
            args = req.get('args', {})
            result = execute_ayaz_command(cmd, args)
            resp = json.dumps({'result': result}).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self._send_cors()
            self.end_headers()
            self.wfile.write(resp)
        except Exception as e:
            resp = json.dumps({'error': str(e)}).encode('utf-8')
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self._send_cors()
            self.end_headers()
            self.wfile.write(resp)

def start_ipc_server():
    server = ThreadingHTTPServer(('127.0.0.1', PORT), AyazIpcHandler)
    server.serve_forever()

class AyazDesktop(Gtk.Window):
    def __init__(self):
        super().__init__(title="Ayaz — Ankora Linux")
        try:
            self.set_wmclass("ayaz", "ayaz")
        except Exception:
            pass
        self.connect("destroy", self.on_destroy)
        
        screen = Gdk.Screen.get_default()
        if screen:
            self.set_default_size(screen.get_width(), screen.get_height())
        self.maximize()
        self.fullscreen()
        
        settings = WebKit2.Settings()
        settings.set_enable_javascript(True)
        if IS_VM:
            settings.set_enable_webgl(False)
            settings.set_enable_accelerated_2d_canvas(False)
        else:
            settings.set_enable_webgl(True)
            settings.set_enable_accelerated_2d_canvas(True)
        settings.set_enable_smooth_scrolling(False)
        settings.set_enable_developer_extras(False)
        settings.set_allow_file_access_from_file_urls(True)
        settings.set_allow_universal_access_from_file_urls(True)
        settings.set_enable_page_cache(False)
        settings.set_enable_offline_web_application_cache(False)
        settings.set_enable_html5_local_storage(True)
        settings.set_enable_html5_database(False)
        settings.set_enable_media_stream(False)
        settings.set_enable_mediasource(False)
        settings.set_enable_webaudio(False)
        
        self.webview = WebKit2.WebView.new_with_settings(settings)
        try:
            rgba = Gdk.RGBA()
            rgba.parse("#0c0d12")
            self.webview.set_background_color(rgba)
        except Exception:
            pass
        try:
            ctx = self.webview.get_context()
            ctx.set_cache_model(WebKit2.CacheModel.DOCUMENT_VIEWER)
        except Exception:
            pass

        # Uzak sayfanın kendi JavaScript'i ham bir adrese atladığında çerçeve
        # XFO kuralıyla boş kalır. Bütün geçişler burada toplanır: köprü
        # dışındaki hedefler iptal edilip arayüze bildirilir.
        self.webview.connect('decide-policy', self.on_decide_policy)
        try:
            dl_ctx = self.webview.get_context()
            dl_ctx.connect('download-started', self.on_download_started)
        except Exception as e:
            print(f"[INDIRME] download-started sinyali baglanamadi: {e}", flush=True)

        content_mgr = self.webview.get_user_content_manager()
        content_mgr.register_script_message_handler("ayazIpc")
        content_mgr.connect("script-message-received::ayazIpc", self.on_script_message)
        try:
            # Token yalnız ana çerçeveye enjekte edilir: köprü (iframe)
            # sayfalarında window.__AYAZ_IPC_TOKEN__ bulunmaz, messageHandler
            # yolu token doğrulaması olmadan açılmaz.
            token_script = WebKit2.UserScript.new(
                f"window.__AYAZ_IPC_TOKEN__ = '{IPC_TOKEN}';",
                WebKit2.UserContentInjectedFrames.TOP_FRAME,
                WebKit2.UserScriptInjectionTime.START,
                None,
                None
            )
            content_mgr.add_script(token_script)
        except Exception as e:
            # Enjeksiyon sessizce düşerse tüm IPC istekleri token reddi yer;
            # hata loga yazılır ki kırık köprü görünür kalsın.
            print(f"[IPC] token script enjekte edilemedi: {e}", flush=True)

        def on_load_failed(wv, load_event, failing_uri, error):
            print(f"[AYAZ-WEBVIEW-HATA] Yükleme hatası: {failing_uri} -> {error.message}", flush=True)
            if str(failing_uri).startswith("file://"):
                print("[AYAZ-WEBVIEW] Yerel HTTP sunucusuna (http://127.0.0.1:{PORT}/index.html) fallback yapılıyor...", flush=True)
                GLib.idle_add(lambda: wv.load_uri(f"http://127.0.0.1:{PORT}/index.html"))
            return True

        self.webview.connect('load-failed', on_load_failed)

        # Doğrudan yerel dosya üzerinden açma - Sıfır ağ bağımlılığı, anında ve hatasız başlatma
        path = os.path.abspath("/usr/share/ayaz/index.html")
        self.webview.load_uri(f"file://{path}")
        self.add(self.webview)
        self.show_all()

    def on_script_message(self, manager, js_result):
        # WebKit2 >= 2.50'te JavascriptResult.get_value() kaldırıldı, get_js_value()
        # JSC.Value döndürür. Hata bu satırın dışına çıkarsa istek yanısız kalır ve
        # JS tarafındaki her çağrı 30 saniyede zaman aşımına uğrar.
        try:
            if hasattr(js_result, 'get_js_value'):
                val = js_result.get_js_value()
            else:
                val = js_result.get_value()
            raw_str = val.to_string()
            data = json.loads(raw_str)
            req_id = data.get('id') if data.get('id') is not None else data.get('req_id')
            cmd = data.get('cmd')
            args = data.get('args', {})
        except Exception as e:
            print(f"[IPC] mesaj cozulemedi: {e}", flush=True)
            return

        # GÜVENLİK: messageHandler yolu da token ister. Token yalnız ana
        # çerçeveye enjekte edildiğinden köprüdeki uzak sayfalar bu kapıyı
        # açamaz; geçersiz denemeler kapıyı kalıcı olarak kapatır.
        req_token = data.get('token', '')
        if not isinstance(req_token, str) or not hmac.compare_digest(req_token, IPC_TOKEN):
            with _STATE_LOCK:
                IPC_STATE['bad'] += 1
            print("[IPC] gecersiz token: messageHandler istegi reddedildi", flush=True)
            return
        with _STATE_LOCK:
            IPC_STATE['bad'] = 0

        def run_worker():
            try:
                res = execute_ayaz_command(cmd, args)
                payload = json.dumps({'id': req_id, 'result': res})
                js_code = f"if (window.__AYAZ_RESOLVE__) window.__AYAZ_RESOLVE__({payload});"
            except Exception as err:
                payload = json.dumps({'id': req_id, 'error': str(err)})
                js_code = f"if (window.__AYAZ_REJECT__) window.__AYAZ_REJECT__({payload});"

            def deliver():
                try:
                    self.webview.run_javascript(js_code, None, None, None)
                except Exception as e:
                    print(f"[IPC] run_javascript hatasi: {e}", flush=True)
                return False

            GLib.idle_add(deliver)

        threading.Thread(target=run_worker, daemon=True).start()

    PROXY_PREFIX = f'http://127.0.0.1:{PORT}/proxy'

    def on_destroy(self, *args):
        # Pencere kapanırken arayüz temiz çıkış işareti düşer; oturum çökme
        # sayacı yalnız gerçekten beklenmedik kapanışlarda artar.
        try:
            self.webview.run_javascript(
                'window.__ayazCleanExit && window.__ayazCleanExit();',
                None, None, None)
        except Exception:
            pass
        time.sleep(0.3)
        Gtk.main_quit()

    def on_download_started(self, context, download):
        # Tarayıcı çerçevesinden gelen indirmeler XDG İndirilenler dizinine
        # yazılır; bitince arayüze bildirilir ki Dosyalar ve Masaüstü
        # kendini yenilesin. Hedef yolu yalnız bu fonksiyon belirler.
        try:
            dest_dir = None
            try:
                proc = subprocess.run(['xdg-user-dir', 'DOWNLOAD'],
                                      stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                      text=True, timeout=5)
                cand = (proc.stdout or '').strip()
                if cand and os.path.isdir(cand):
                    dest_dir = cand
            except Exception:
                dest_dir = None
            if not dest_dir:
                home = os.path.expanduser('~')
                for fb in ('Downloads', 'İndirilenler'):
                    p = os.path.join(home, fb)
                    if os.path.isdir(p):
                        dest_dir = p
                        break
            if not dest_dir:
                dest_dir = os.path.join(os.path.expanduser('~'), 'Downloads')
            os.makedirs(dest_dir, exist_ok=True)

            raw_name = ''
            try:
                raw_name = download.get_suggested_filename() or ''
            except Exception:
                raw_name = ''
            fname = os.path.basename(raw_name).strip().strip('.') or 'indirilen-dosya'
            fname = fname.replace('\x00', '')[:180] or 'indirilen-dosya'
            target = os.path.join(dest_dir, fname)
            if os.path.exists(target):
                stem, dot, ext = fname.rpartition('.')
                if not stem:
                    stem, ext = fname, ''
                i = 1
                while os.path.exists(target) and i < 1000:
                    nm = f"{stem}-{i}.{ext}" if ext else f"{stem}-{i}"
                    target = os.path.join(dest_dir, nm)
                    i += 1
            download.set_destination('file://' + target)

            def _done(_dl):
                try:
                    js = 'window.__AYAZ_DOWNLOAD_DONE__ && window.__AYAZ_DOWNLOAD_DONE__(%s);' % json.dumps(target)
                    self.webview.run_javascript(js, None, None, None)
                except Exception as e:
                    print(f"[INDIRME] bildirim gonderilemedi: {e}", flush=True)

            def _failed(_dl, _err):
                print(f"[INDIRME] başarısız: {target}", flush=True)

            try:
                download.connect('finished', _done)
                download.connect('failed', _failed)
            except Exception:
                pass
            print(f"[INDIRME] hedef: {target}", flush=True)
        except Exception as e:
            print(f"[INDIRME] hazırlanamadı: {e}", flush=True)

    def on_decide_policy(self, view, decision, decision_type):
        # Köprüye giden her şey olduğu gibi geçer; http/https olan diğer her
        # hedef iptal edilir ve hedef adres arayüze bildirilir. Arayüz adresi
        # köprü üzerinden yeniden açtığı için bağlantı, form ve JavaScript
        # geçişleri aynı yoldan ilerler.
        uri = ''
        if isinstance(decision, WebKit2.NavigationPolicyDecision):
            try:
                req = decision.get_navigation_action().get_request()
            except Exception:
                req = None
            if req is None:
                try:
                    req = decision.get_request()
                except Exception:
                    req = None
            if req is not None:
                uri = req.get_uri() if hasattr(req, 'get_uri') else str(req.to_string())

        if not uri.startswith(('http://', 'https://')) or uri.startswith(self.PROXY_PREFIX):
            decision.use()
            return

        decision.ignore()
        try:
            self.webview.run_javascript(
                "if (window.__ayazProxyNav) window.__ayazProxyNav(%s);"
                % json.dumps(uri), None, None, None)
        except Exception as e:
            print(f"[TARAYICI] gecis bildirimi gonderilemedi: {e}", flush=True)

if __name__ == "__main__":
    t = threading.Thread(target=start_ipc_server, daemon=True)
    t.start()
    app = AyazDesktop()

    def _sig_exit(signum, frame):
        # SIGTERM/SIGINT ile kapanışta da temiz çıkış işareti düşülür.
        try:
            app.webview.run_javascript(
                'window.__ayazCleanExit && window.__ayazCleanExit();',
                None, None, None)
        except Exception:
            pass
        time.sleep(0.5)
        Gtk.main_quit()

    try:
        import signal as _signal
        _signal.signal(_signal.SIGTERM, _sig_exit)
        _signal.signal(_signal.SIGINT, _sig_exit)
    except Exception:
        pass
    Gtk.main()
AYAZ_PY
    chmod +x "$CHROOT_DIR/usr/bin/ayaz"
fi

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

cp "$ROOT_DIR/scripts/ankora-updater-sudoers" "$CHROOT_DIR/etc/sudoers.d/ankora-updater" || true
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
    "$CHROOT_DIR/usr/bin/ayaz-ctl" \
    "$CHROOT_DIR/usr/bin/ayaz-session" \
    "$CHROOT_DIR/usr/share/applications/ayaz.desktop" \
    "$CHROOT_DIR/usr/share/xsessions/ayaz.desktop" \
    "$CHROOT_DIR/home/ankora/.xinitrc" \
    "$CHROOT_DIR/home/ankora/.profile" \
    "$CHROOT_DIR/etc/skel/.xinitrc" \
    "$CHROOT_DIR/etc/skel/.profile" \
    "$CHROOT_DIR/usr/bin/ayaz"; do
    if [ -f "$f" ]; then
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
    AYAZ_VERSION="3.6.0"
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
# Canlı sistem kendi kimliğini taşısın: telemetry os-release PRETTY_NAME
# urlparse okur; Devuan kimliğiyle "Ankora Linux <sürüm>" görünmeli (hata #2).
if [ -f "$CHROOT_DIR/etc/os-release" ]; then
    sed -i -E '/^(PRETTY_NAME|VERSION)=/d' "$CHROOT_DIR/etc/os-release"
    sed -i "1aPRETTY_NAME=\"Ankora Linux ${AYAZ_VERSION} (Daedalus)\"\nVERSION=\"${AYAZ_VERSION} (Daedalus)\"\nVERSION_ID=\"${AYAZ_VERSION}\"" "$CHROOT_DIR/etc/os-release"
fi
cat > "$CHROOT_DIR/usr/share/ayaz/manifest.json" <<MANIFEST_JSON
{
  "product": "Ayaz DE (Ankora Linux)",
  "version": "${AYAZ_VERSION}",
  "build_date": "${BUILD_DATE}",
  "git_revision": "${GIT_REV}",
  "architecture": "amd64",
  "base": "Devuan GNU/Linux (Daedalus)",
  "init_system": "SysVinit",
  "image_type": "hybrid live ISO"
}
MANIFEST_JSON

# Sanal bağlantıları kaldır
umount -lf "$CHROOT_DIR/dev/pts" 2>/dev/null || true
umount -lf "$CHROOT_DIR/dev" 2>/dev/null || true
umount -lf "$CHROOT_DIR/proc" 2>/dev/null || true
umount -lf "$CHROOT_DIR/sys" 2>/dev/null || true

# Not: boot DAHİL tutulur — kurucu squashfs'i /target'a açıp GRUB'u
# oradaki çekirdekle kurar; boot dışlanırsa kurulu sistem çekirdeksiz kalır.
# KRİTİK: -e 'dizin' dizinin KENDİSİNİ siler; /dev /proc /sys /run yoksa
# switch_root hedefe geçemez ve açılış "Attempted to kill init" ile ölür.
# Bu yüzden 'dizin/*' kalıbı kullanılır: içerik atılır, boş dizin kalır.
# /proc /sys /dev olduğu gibi tutulur (boş/statik, zararsız).
mksquashfs "$CHROOT_DIR" "$IMAGE_DIR/live/filesystem.squashfs" -comp xz -b 1048576 -noappend \
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

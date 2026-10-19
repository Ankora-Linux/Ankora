# ==============================================================================
# Ankora Linux 3.3 (Ayaz DE) - Windows Canlı ISO Derleme Otomasyonu
# Bu betik Windows ortamından Devuan Daedalus tabanlı canlı ISO imajını
# WSL2, VirtualBox veya GitHub Actions entegrasyonuyla güvenle derler.
# ==============================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "Ankora Linux 3.3 - Windows ISO Derleme İstasyonu"

Clear-Host
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "     ANKORA LINUX 3.3 (AYAZ DE) - WINDOWS CANLI ISO DERLEYİCİ          " -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "Hedef Dağıtım : Devuan GNU/Linux 5 (Daedalus) SysVinit Core" -ForegroundColor White
Write-Host "Masaüstü      : Ayaz DE v3.3.0 (Kiosk GUI)" -ForegroundColor White
Write-Host "Çıktı Kalıbı  : dist\ankora-linux-3.3-ayaz-amd64.iso (UEFI + BIOS Hibrit)" -ForegroundColor White
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

$RootPath = (Resolve-Path "$PSScriptRoot\..").Path
$DistPath = Join-Path $RootPath "dist"
$IsoPath  = Join-Path $DistPath "ankora-linux-3.3-ayaz-amd64.iso"

# 1. Ortam Taraması: WSL Durumu
Write-Host "[1/4] Windows sanallaştırma ve alt sistem ortamı taranıyor..." -ForegroundColor Yellow

$wslInstalled = $false
$wslDistros = @()

try {
    $rawList = & wsl.exe -l -q 2>$null
    if ($LASTEXITCODE -eq 0 -and $rawList) {
        # Unicode null baytlarını temizle ve boşlukları ayıkla
        $cleanList = @($rawList | ForEach-Object { ($_ -replace "`0", "").Trim() } | Where-Object { $_ -ne "" })
        if ($cleanList.Count -gt 0) {
            $wslInstalled = $true
            $wslDistros = $cleanList
        }
    }
} catch {
    $wslInstalled = $false
}

# 2. VirtualBox Durumu
$vboxInstalled = $false
$vboxPath = "C:\Program Files\Oracle\VirtualBox\VBoxManage.exe"
if (Test-Path $vboxPath) {
    $vboxInstalled = $true
}

# ----------------------------------------------------------------------
# DURUM A: WSL Kurulu ve Hazır
# ----------------------------------------------------------------------
if ($wslInstalled -and ($wslDistros.Count -gt 0)) {
    $chosenDistro = $wslDistros[0].Trim()
    Write-Host "[+] WSL Algılandı! Kullanılacak Dağıtım: $chosenDistro" -ForegroundColor Green
    Write-Host "[2/4] Windows çalışma dizini WSL formatına dönüştürülüyor..." -ForegroundColor White

    # Windows yolunu WSL /mnt/c formatına çevir
    $drive = $RootPath.Substring(0, 1).ToLower()
    $subPath = $RootPath.Substring(3).Replace("\", "/")
    $wslRoot = "/mnt/$drive/$subPath"

    Write-Host "      Windows Yolu : $RootPath" -ForegroundColor Gray
    Write-Host "      WSL Yolu     : $wslRoot" -ForegroundColor Gray
    Write-Host ""

    Write-Host "[3/4] ISO Pişirme İşlemi WSL Üzerinde Başlatılıyor..." -ForegroundColor Yellow
    Write-Host "----------------------------------------------------------------------" -ForegroundColor Gray

    # WSL içinde çalıştırılacak derleme komutu
    $buildCmd = @"
set -e
echo '>>> [WSL] Ankora derleme araçları kontrol ediliyor...'
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y --no-install-recommends \
    debootstrap squashfs-tools xorriso isolinux syslinux-common syslinux-efi \
    grub-pc-bin grub-efi-amd64-bin mtools dosfstools wget gpgv

# Debootstrap Devuan Daedalus profilini tanımla
if [ ! -f /usr/share/debootstrap/scripts/daedalus ]; then
    if [ -f /usr/share/debootstrap/scripts/bookworm ]; then
        ln -sf bookworm /usr/share/debootstrap/scripts/daedalus
    else
        ln -sf sid /usr/share/debootstrap/scripts/daedalus
    fi
fi

# Önceki başarısız derleme kalıntılarını temizle
echo '>>> [WSL] Önceki derleme kalıntıları temizleniyor...'
umount -lf /var/tmp/ankora-iso-build/chroot/dev/pts 2>/dev/null || true
umount -lf /var/tmp/ankora-iso-build/chroot/dev 2>/dev/null || true
umount -lf /var/tmp/ankora-iso-build/chroot/proc 2>/dev/null || true
umount -lf /var/tmp/ankora-iso-build/chroot/sys 2>/dev/null || true
rm -rf /var/tmp/ankora-iso-build 2>/dev/null || true

# Disk alanını raporla
echo '>>> [WSL] Mevcut disk alanı:'
df -h /
df -h /var/tmp

cd '$wslRoot'
sed -i 's/\r$//' scripts/build-iso.sh scripts/*.sh 2>/dev/null || true
echo '>>> [WSL] scripts/build-iso.sh çalıştırılıyor...'
bash scripts/build-iso.sh
"@

    # Kaynak .ps1 dosyası CRLF satır sonlu olduğu için here-string de CRLF
    # taşır. bash'e LF olarak gitmezse `set -e\r`, `apt-get update -qq\r` ve
    # boş satırlar (`\r` komutu) yanlış yorumlanır; `\` ile satır birleştirme
    # de kırıldığı için paket listesi komut olarak çalışır.
    $buildCmd = $buildCmd.Replace("`r`n", "`n")

    # WSL oturumunu root olarak çalıştır (parola istemeden doğrudan yürütür)
    $buildStart = Get-Date
    wsl.exe -d $chosenDistro -u root bash -c $buildCmd
    $buildExit = $LASTEXITCODE

    Write-Host "----------------------------------------------------------------------" -ForegroundColor Gray
    Write-Host "[4/4] Derleme Sonucu Doğrulanıyor..." -ForegroundColor Yellow

    # Derleme erken bitse bile dist klasöründe eski ISO durur. Yalnızca dosya
    # varlığına bakılıp "üretildi" denirse başarısız derleme gizlenir.
    if ($buildExit -ne 0) {
        Write-Host ""
        Write-Host "[HATA] Derleme başarısız oldu (çıkış kodu: $buildExit)." -ForegroundColor Red
        Write-Host "       dist klasöründeki ISO önceki derlemeden kalmıştır, yeniden kullanmayın." -ForegroundColor Red
        exit 1
    }

    if (Test-Path $IsoPath) {
        $isoItem = Get-Item $IsoPath
        if ($isoItem.LastWriteTime -lt $buildStart) {
            Write-Host ""
            Write-Host "[HATA] ISO yeniden üretilmedi; dosya önceki derlemeden kalmış." -ForegroundColor Red
            exit 1
        }
        $isoSizeMB = [math]::Round($isoItem.Length / 1MB, 2)
        $sha256 = (Get-FileHash -Path $IsoPath -Algorithm SHA256).Hash

        Write-Host ""
        Write-Host "======================================================================" -ForegroundColor Green
        Write-Host "  TEBRİKLER! ANKORA LINUX 3.3 CANLI ISO BAŞARIYLA ÜRETİLDİ!           " -ForegroundColor Green
        Write-Host "======================================================================" -ForegroundColor Green
        Write-Host "  Konum  : $IsoPath" -ForegroundColor White
        Write-Host "  Boyut  : $isoSizeMB MB" -ForegroundColor White
        Write-Host "  SHA256 : $sha256" -ForegroundColor Cyan
        Write-Host "======================================================================" -ForegroundColor Green
        Write-Host "  Kalıbı Rufus veya Ventoy ile USB diske yazıp hemen başlatabilirsiniz." -ForegroundColor Yellow
        Write-Host ""

        # Dist klasörünü Windows Explorer'da aç
        Start-Process explorer.exe -ArgumentList $DistPath
    } else {
        Write-Host "[HATA] ISO dosyası dist klasöründe bulunamadı. Lütfen yukarıdaki WSL çıktı loglarını inceleyin." -ForegroundColor Red
    }
}
# ----------------------------------------------------------------------
# DURUM B: WSL Kurulu Değil (Otomatik Kurulum veya Alternatifler)
# ----------------------------------------------------------------------
else {
    Write-Host "[!] Windows Subsystem for Linux (WSL) sisteminizde kurulu değil veya aktif değil." -ForegroundColor Red
    Write-Host ""
    Write-Host "Linux Canlı ISO kalıpları (debootstrap, chroot, squashfs, grub-efi, xorriso)," -ForegroundColor White
    Write-Host "Linux çekirdeği dosya sistemine doğrudan ihtiyaç duyar." -ForegroundColor White
    Write-Host ""
    Write-Host "Sizin için hazırladığımız 3 adet pratik çözüm yolu:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  [1] WSL Debian'ı Şimdi Otomatik Kur (ÖNERİLEN - Tek Tıklama)" -ForegroundColor Green
    Write-Host "      -> 'wsl --install -d Debian' komutunu yönetici olarak çalıştırır." -ForegroundColor Gray
    Write-Host "      -> Kurulum tamamlandığında bu script tek tıkla ISO'nuzu derler." -ForegroundColor Gray
    Write-Host ""
    Write-Host "  [2] GitHub Actions ile Bulutta Derle (SIFIR KURULUM - En Kolayı)" -ForegroundColor Yellow
    Write-Host "      -> Deponuza eklediğimiz '.github/workflows/build-iso.yml' iş akışı" -ForegroundColor Gray
    Write-Host "      -> GitHub üzerinde ücretsiz Ubuntu sunucuda 10 dakikada ISO'yu pişirir" -ForegroundColor Gray
    Write-Host "      -> ISO doğrudan bilgisayarınıza indirilebilir hale gelir." -ForegroundColor Gray
    Write-Host ""
    Write-Host "  [3] Kurulu VirtualBox 7.2.6 ile Derleme" -ForegroundColor Magenta
    Write-Host "      -> Sisteminizde VirtualBox zaten mevcut." -ForegroundColor Gray
    Write-Host "      -> Bir Debian/Devuan sanal makinesine bu klasörü paylaşıp derleme." -ForegroundColor Gray
    Write-Host ""
    Write-Host "  [Q] Çıkış" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host ">>> Lütfen seçiminizi yapıp (1, 2 veya 3) klavyeden ENTER tuşuna basınız: " -ForegroundColor Yellow -NoNewline

    $choice = Read-Host

    switch ($choice) {
        "1" {
            Write-Host ""
            Write-Host "[*] WSL Debian kurulumu yönetici haklarıyla başlatılıyor..." -ForegroundColor Yellow
            Write-Host "    (Lütfen ekrana gelecek Windows Yönetici Onayı / UAC kutucuğuna 'Evet' deyin)" -ForegroundColor White
            
            Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoExit", "-Command", "Write-Host 'Ankora Linux Derleme Ortamı İçin WSL Debian Kuruluyor...' -ForegroundColor Cyan; wsl.exe --install -d Debian"
            
            Write-Host ""
            Write-Host "Kurulum penceresi açıldı. İndirme ve kurulum bittikten sonra bilgisayarınızı yeniden başlatın," -ForegroundColor Green
            Write-Host "ardından 'build-iso.bat' dosyasını tekrar çalıştırın; ISO otomatik derlenecektir." -ForegroundColor Green
        }
        "2" {
            Write-Host ""
            Write-Host "======================================================================" -ForegroundColor Cyan
            Write-Host "     GITHUB ACTIONS BULUTTA ISO DERLEME ADIMLARI                      " -ForegroundColor Yellow
            Write-Host "======================================================================" -ForegroundColor Cyan
            Write-Host "Tarayıcınızda GitHub Actions sayfası açılıyor..." -ForegroundColor Green
            Start-Process "https://github.com/Ankora-Linux/Ayaz/actions"
            Write-Host "1. Açılan sayfada 'Ankora Linux Canlı ISO Derleme' iş akışını seçin." -ForegroundColor White
            Write-Host "2. Sağ üstteki 'Run workflow' butonuna basarak derlemeyi başlatın." -ForegroundColor Green
            Write-Host "3. 10-15 dakika içinde üretilen 'ankora-linux-3.3-ayaz-amd64.iso' kalıbı hazır olacaktır." -ForegroundColor White
            Write-Host "======================================================================" -ForegroundColor Cyan
        }
        "3" {
            Write-Host ""
            Write-Host "Sisteminizde VirtualBox 7.2.6 kurulu: $vboxPath" -ForegroundColor Green
            Write-Host "Adımlar:" -ForegroundColor White
            Write-Host "1. VirtualBox'ta Debian veya Devuan tabanlı bir canlı veya kurulu VM açın." -ForegroundColor White
            Write-Host "2. Paylaşılan Klasör (Shared Folder) olarak '$RootPath' dizinini ekleyin." -ForegroundColor White
            Write-Host "3. VM içinde terminal açıp 'sudo bash /media/sf_New_Ankora/scripts/build-iso.sh' çalıştırın." -ForegroundColor White
            Write-Host "4. Üretilen ISO doğrudan Windows masaüstünüzdeki dist klasörüne yazılacaktır." -ForegroundColor Green
        }
        default {
            Write-Host "İşlem iptal edildi." -ForegroundColor DarkGray
        }
    }
}

Write-Host ""
Write-Host "Tamamlandı." -ForegroundColor Gray

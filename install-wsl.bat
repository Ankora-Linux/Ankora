@echo off
title WSL Debian Kurulumu - Ankora Linux
cd /d "%~dp0"
echo ======================================================================
echo       ANKORA LINUX 4.7.0 - WSL DEBIAN OTOMATIK KURULUM ARACI
echo ======================================================================
echo.
echo Bu islem Windows Subsystem for Linux (WSL) ve Debian tabanini kurar.
echo Eger yonetici haklari gerekiyorsa bu dosyaya sag tiklayip
echo "Yonetici olarak calistir" (Run as administrator) secenegini kullanin.
echo.
echo WSL ve Debian kuruluyor, lutfen bekleyin...
echo.

wsl.exe --install -d Debian

echo.
echo ======================================================================
echo Eger kurulum basarili olduysa bilgisayarinizi bir kez YENIDEN BASLATIN.
echo Ardindan "build-iso.bat" dosyasini calistirdiginizda ISO otomatik pisecektir.
echo ======================================================================
echo.
pause

@echo off
title Ankora Linux 4.7.0 - ISO Derleyici
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-on-windows.ps1"
pause

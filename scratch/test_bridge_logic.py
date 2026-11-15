#!/usr/bin/env python3
"""Ankora Linux / AyazDE tek kaynak Tauri 2 arka ucu ve güvenlik sözleşme testleri."""
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def read_text(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8", errors="replace")


def parse_semver_contract(v: str):
    clean = v.strip().lstrip("vV").split("+", 1)[0]
    if "-" in clean:
        core, _pre = clean.split("-", 1)
        pre_flag = 0
    else:
        core = clean
        pre_flag = 1
    parts = core.split(".")
    nums = []
    for i in range(3):
        if i < len(parts) and parts[i].isdigit():
            nums.append(int(parts[i]))
        elif i < len(parts):
            digits = "".join(ch for ch in parts[i] if ch.isdigit())
            nums.append(int(digits) if digits else 0)
        else:
            nums.append(0)
    return (nums[0], nums[1], nums[2], pre_flag)


def is_newer_version(remote: str, current: str) -> bool:
    if not remote or not current:
        return False
    return parse_semver_contract(remote) > parse_semver_contract(current)


def parse_xdg_user_dirs(content: str, home: str):
    mapping = {
        "XDG_DESKTOP_DIR": "desktop",
        "XDG_DOWNLOAD_DIR": "downloads",
        "XDG_DOCUMENTS_DIR": "documents",
        "XDG_PICTURES_DIR": "pictures",
        "XDG_MUSIC_DIR": "music",
        "XDG_VIDEOS_DIR": "videos",
    }
    res = {v: home for v in mapping.values()}
    for raw in content.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        if key not in mapping:
            continue
        val = val.strip().strip('"').replace("$HOME", home)
        res[mapping[key]] = os.path.normpath(val)
    return res


def is_safe_icon_name(name: str) -> bool:
    if not name or len(name) > 128:
        return False
    return bool(re.fullmatch(r"[A-Za-z0-9._+-]+", name))


def parse_wmctrl_lines(raw: str):
    windows = []
    for line in raw.splitlines():
        parts = line.split(None, 4)
        if len(parts) < 5:
            continue
        win_id, desktop, wm_class, host, title = parts
        windows.append({
            "id": win_id,
            "desktop": desktop,
            "wm_class": wm_class,
            "host": host,
            "title": title,
        })
    return windows


def test_single_desktop_source():
    iso = read_text("scripts/build-iso.sh")
    assert "AYAZ_PY" not in iso, "Eski AYAZ_PY Python köprüsü build-iso.sh içinden tamamen kaldırılmış olmalı"
    assert "ln -sf /usr/bin/ayaz-de" in iso, "build-iso.sh /usr/bin/ayaz -> /usr/bin/ayaz-de sembolik bağını kurmalı"
    assert "https://deb.devuan.org/merged" in iso, "build-iso.sh HTTPS Devuan deposu kullanmalı"

    deb = read_text("scripts/package-deb.sh")
    for required in (
        "usr/bin/ayaz-de",
        "usr/bin/ayaz",
        "usr/bin/ayaz-session",
        "usr/bin/ayaz-ctl",
        "usr/bin/eta-touchdrv",
        "usr/local/bin/ayaz-update-helper",
        "usr/local/bin/ayaz-pkg-helper",
        "etc/sudoers.d/ankora-updater",
        "SHA256SUMS",
    ):
        assert required in deb, f"package-deb.sh içinde eksik payload/çıktı: {required}"

    desktop = read_text("scripts/ayaz.desktop")
    assert "Exec=/usr/bin/ayaz-de" in desktop, "ayaz.desktop Exec=/usr/bin/ayaz-de olmalı"

    for session_file in ("scripts/xinitrc", "scripts/ayaz-session"):
        src = read_text(session_file)
        assert "/usr/bin/ayaz-de" in src, f"{session_file} /usr/bin/ayaz-de başlatmalı"
        assert "bwrap --ro-bind / / /bin/true" in src, f"{session_file} çalışma anında bwrap denemeli"
        assert "/tmp/ayaz-restart-requested" in src, f"{session_file} temiz oturum yeniden başlatma bayrağını desteklemeli"


def test_security_and_sudoers():
    upd = read_text("scripts/ayaz-update-helper.sh")
    assert "--fetch-and-install" in upd
    assert 'if [[ "$MODE" == "--stage" ]]' in upd, "ayaz-update-helper --stage çağrısını açıkça reddetmeli"
    assert "https://github\\.com/Ankora-Linux/" in upd or "https://github.com/Ankora-Linux" in upd
    assert "gpgv" in upd and "/etc/ankora/require-gpg-signature" in upd

    sudoers = read_text("scripts/ankora-updater-sudoers")
    sudoers_active = "\n".join(
        line for line in sudoers.splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    )
    forbidden_sudoers = (
        "install *",
        "remove *",
        "vendor *",
        "usb-flash *",
        "usb-format *",
        "snapshot-create",
        "snapshot-restore",
        "snapshot-delete",
        "--stage",
        "/usr/local/bin/ayaz-update-helper,",
    )
    for bad in forbidden_sudoers:
        assert bad not in sudoers_active, f"sudoers aşırı yetkili wildcard içeriyor: {bad}"
    assert "ayaz-update-helper --fetch-and-install https\\://github.com/Ankora-Linux/*" in sudoers_active
    assert "ayaz-update-helper --check-and-apply" in sudoers_active

    pkg = read_text("scripts/ayaz-pkg-helper.sh")
    assert "BE677C1989D35EAB2C5F26C9351601AD01D6378E" in pkg, "Helium GPG parmak izi sabitlenmiş olmalı"
    assert "validate_usb_block_device" in pkg and "removable" in pkg and "TRAN" in pkg


def test_tauri_and_frontend_hardening():
    conf = json.loads(read_text("src-tauri/tauri.conf.json"))
    assert conf["app"].get("withGlobalTauri") is False, "withGlobalTauri false olmalı"
    csp = conf["app"]["security"]["csp"]
    for directive in ("img-src", "connect-src", "frame-src"):
        m = re.search(rf"{directive}\s+([^;]+)", csp)
        assert m, f"CSP yönergesi eksik: {directive}"
        tokens = m.group(1).split()
        assert "https:" not in tokens, f"CSP {directive} çıplak 'https:' jokerini içermemeli"

    html = read_text("src/index.html")
    assert csp in html, "index.html CSP değeri tauri.conf.json ile birebir eşleşmeli"

    app_js = read_text("src/app.js")
    assert "__TAURI_INTERNALS__" in app_js
    assert "Bubblewrap (bwrap) + Kısıtlı IPC" in app_js
    m_upd = re.search(r"case 'download_and_apply_de_update':(.*?)case 'restart_desktop_process':", app_js, re.S)
    assert m_upd and "throw new Error" in m_upd.group(1), "download_and_apply_de_update sahte simülasyon yerine hata fırlatmalı"

    main_rs = read_text("src-tauri/src/main.rs")
    for expected in (
        "fn protocol_4_endpoint",
        "fn sudo_binary_exists",
        "fn validate_non_system_path",
        "--fetch-and-install",
        "/tmp/ayaz-restart-requested",
        "bwrap",
    ):
        assert expected in main_rs, f"src-tauri/src/main.rs içinde beklenen sembol/güvenlik denetimi eksik: {expected}"
    assert '"--stage"' not in main_rs, "main.rs --stage argümanını kullanmamalı"
    assert 'args(["-x", "ayaz-de"])' not in main_rs, "restart_desktop_process pkill -x ayaz-de kullanmamalı"


def test_protocol_contracts():
    assert is_newer_version("v4.7.0", "4.6.0")
    assert is_newer_version("4.7.0", "4.7.0-rc1")
    assert not is_newer_version("4.7.0", "4.7.0")
    assert not is_newer_version("4.6.9", "4.7.0")
    assert not is_newer_version("", "4.7.0")

    home = "/home/ankora"
    tr = parse_xdg_user_dirs('XDG_DESKTOP_DIR="$HOME/Masaüstü"\nXDG_DOWNLOAD_DIR="$HOME/İndirilenler"\n', home)
    assert tr["desktop"].endswith("Masaüstü")
    assert tr["downloads"].endswith("İndirilenler")

    assert is_safe_icon_name("firefox-esr")
    assert is_safe_icon_name("org.kde.dolphin")
    assert not is_safe_icon_name("../etc/passwd")
    assert not is_safe_icon_name("bad;rm -rf /")

    wins = parse_wmctrl_lines("0x04000003  0 Navigator.firefox  ankora  Ankora Linux Portal — Mozilla Firefox\n")
    assert len(wins) == 1
    assert wins[0]["wm_class"] == "Navigator.firefox"
    assert wins[0]["title"].startswith("Ankora Linux")


def main() -> int:
    test_single_desktop_source()
    test_security_and_sudoers()
    test_tauri_and_frontend_hardening()
    test_protocol_contracts()
    print("KÖPRÜ VE GÜVENLİK SÖZLEŞME TESTLERİ: tümü geçti.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

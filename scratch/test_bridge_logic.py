#!/usr/bin/env python3
"""Gömülü Python köprüsündeki (build-iso.sh içindeki AYAZ_PY) gerçek kod
bloklarını çalıştırıp doğrulayan testler.

Bloklar dosyadan birebir çıkarılıp küçük bir sarmalayıcıda exec edilir;
böylece test edilen kod, gemideki kodun ta kendisidir.
"""
import os
import re
import sys
import tempfile
import textwrap

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_bridge():
    src = open(os.path.join(ROOT, "scripts/build-iso.sh"), encoding="utf-8").read()
    m = re.search(r"cat << 'AYAZ_PY' > .*?\n(.*?\n)AYAZ_PY\n", src, re.S)
    assert m, "AYAZ_PY bloğu bulunamadı"
    return m.group(1)


def extract_block(bridge, cmd):
    lines = bridge.splitlines(keepends=True)
    start = None
    for i, ln in enumerate(lines):
        if ln.strip() == f"elif cmd == '{cmd}':":
            start = i + 1
            break
    assert start is not None, f"komut bloğu yok: {cmd}"
    end = len(lines)
    for j in range(start, len(lines)):
        if re.match(r"    elif cmd == ", lines[j]):
            end = j
            break
    body = textwrap.dedent("".join(lines[start:end]))
    assert body.strip(), f"boş blok: {cmd}"
    return body


def run_block(body, **ns):
    full_ns = {"os": os}
    full_ns.update(ns)
    wrapper = "def _t():\n" + textwrap.indent(body, "    ") + "\n"
    exec(compile(wrapper, "<bridge-block>", "exec"), full_ns)
    return full_ns["_t"]()


def test_xdg_english(bridge):
    body = extract_block(bridge, "get_xdg_user_dirs")
    with tempfile.TemporaryDirectory() as home:
        os.makedirs(os.path.join(home, ".config"))
        with open(os.path.join(home, ".config/user-dirs.dirs"), "w", encoding="utf-8") as fh:
            fh.write('XDG_DOWNLOAD_DIR="$HOME/Downloads"\nXDG_DESKTOP_DIR="$HOME/Desktop"\n')
        os.makedirs(os.path.join(home, "Downloads"))
        os.makedirs(os.path.join(home, "Desktop"))
        res = run_block(body, home_dir=home)
    assert res["download"].replace("\\", "/").endswith("/Downloads"), res
    assert res["desktop"].replace("\\", "/").endswith("/Desktop"), res
    print("[OK  ] xdg: İngilizce dizinler çözüldü")


def test_xdg_turkish(bridge):
    body = extract_block(bridge, "get_xdg_user_dirs")
    with tempfile.TemporaryDirectory() as home:
        os.makedirs(os.path.join(home, ".config"))
        with open(os.path.join(home, ".config/user-dirs.dirs"), "w", encoding="utf-8") as fh:
            fh.write('XDG_DOWNLOAD_DIR="$HOME/İndirilenler"\nXDG_DESKTOP_DIR="$HOME/Masaüstü"\n')
        os.makedirs(os.path.join(home, "İndirilenler"))
        os.makedirs(os.path.join(home, "Masaüstü"))
        res = run_block(body, home_dir=home)
    assert res["download"].replace("\\", "/").endswith("/İndirilenler"), res
    assert res["desktop"].replace("\\", "/").endswith("/Masaüstü"), res
    print("[OK  ] xdg: Türkçe dizinler çözüldü")


def test_xdg_missing_config(bridge):
    body = extract_block(bridge, "get_xdg_user_dirs")
    with tempfile.TemporaryDirectory() as home:
        os.makedirs(os.path.join(home, "Downloads"))
        res = run_block(body, home_dir=home)
    assert res["download"].replace("\\", "/").endswith("/Downloads"), res
    assert res["home"] == home, res
    print("[OK  ] xdg: yapılandırma yokken yedek çalıştı")


def test_icon_found(bridge):
    body = extract_block(bridge, "get_app_icon")
    with tempfile.TemporaryDirectory() as home:
        d = os.path.join(home, ".local/share/icons/hicolor/48x48/apps")
        os.makedirs(d)
        with open(os.path.join(d, "ornek-uygulama.png"), "wb") as fh:
            fh.write(b"\x89PNG\r\n\x1a\n" + b"\x00" * 64)
        url = run_block(body, home_dir=home, args={"names": ["ornek-uygulama"]})
    assert isinstance(url, str) and url.startswith("data:image/png;base64,"), url
    print("[OK  ] ikon: kurulu simge veri URL'sine dönüştü")


def test_icon_missing_and_unsafe(bridge):
    body = extract_block(bridge, "get_app_icon")
    with tempfile.TemporaryDirectory() as home:
        assert run_block(body, home_dir=home, args={"names": ["yok-boyle-ikon"]}) is None
        assert run_block(body, home_dir=home, args={"names": [""]}) is None
        # Resim dışı mutlak yol okunmaz.
        assert run_block(body, home_dir=home, args={"names": ["/etc/hostname"]}) is None
    print("[OK  ] ikon: eksik/güvensiz adaylar None döndü")


def test_native_windows_parsing(bridge):
    import types
    body = extract_block(bridge, "get_native_windows")
    wmctrl_sample = (
        "0x01200003 -1 trayer.panel ankora-live panel\n"
        "0x01400007  0 ayaz.Ayaz ankora-live Ayaz — Ankora\n"
        "0x01800003  0 brave-browser.Brave-browser ankora-live Yeni Sekme - Brave\n"
        "0x02000009  0 vlc.Vlc ankora-live Ders_Kaydi.mp4 - VLC media player\n"
    )

    def fake_which(name):
        return f"/usr/bin/{name}" if name in ("wmctrl", "xdotool") else None

    def fake_run(cmd, **kwargs):
        res = types.SimpleNamespace(returncode=0, stdout="")
        if cmd[0] == "wmctrl":
            res.stdout = wmctrl_sample
        elif cmd[0] == "xdotool":
            res.stdout = str(int("0x01800003", 16))
        return res

    fake_shutil = types.SimpleNamespace(which=fake_which)
    fake_sp = types.SimpleNamespace(run=fake_run, PIPE=-1, DEVNULL=-3)
    wins = run_block(body, shutil=fake_shutil, subprocess=fake_sp)
    assert len(wins) == 2, wins
    assert wins[0]["id"] == "0x01800003"
    assert wins[0]["title"] == "Yeni Sekme - Brave", wins[0]
    assert wins[0]["app_name"] == "Brave-browser", wins[0]
    assert wins[0]["wm_class"] == "brave-browser.Brave-browser", wins[0]
    assert wins[0]["is_active"] is True
    assert wins[1]["title"] == "Ders_Kaydi.mp4 - VLC media player", wins[1]
    assert wins[1]["is_active"] is False
    print("[OK  ] get_native_windows: wmctrl -l -x başlık ve aktif pencere ayrıştırması doğru")


def main():
    bridge = load_bridge()
    test_xdg_english(bridge)
    test_xdg_turkish(bridge)
    test_xdg_missing_config(bridge)
    test_icon_found(bridge)
    test_icon_missing_and_unsafe(bridge)
    test_native_windows_parsing(bridge)
    print("KÖPRÜ MANTIK TESTLERİ: geçti.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

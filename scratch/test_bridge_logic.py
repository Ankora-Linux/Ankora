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


def test_check_de_update_semver(bridge):
    import json
    import re
    import subprocess
    import types
    import urllib.request

    body = extract_block(bridge, "check_de_update")

    class _FakeResp:
        def __init__(self, payload):
            self.status = 200
            self._data = json.dumps(payload).encode("utf-8")

        def read(self):
            return self._data

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    def _run_with_release(tag_name):
        fake_urllib = types.SimpleNamespace(
            request=types.SimpleNamespace(
                Request=urllib.request.Request,
                urlopen=lambda req, timeout=8: _FakeResp({
                    "tag_name": tag_name,
                    "name": f"Ayaz DE {tag_name}",
                    "body": "Test sürüm notu",
                    "published_at": "2026-11-14T12:00:00Z",
                    "assets": [
                        {
                            "name": "ankora-linux-4.6.0-ayaz-amd64.iso.sha256",
                            "browser_download_url": "https://github.com/Ankora-Linux/Ankora/releases/download/v4.6.0/ankora.iso.sha256",
                            "size": 90,
                        },
                        {
                            "name": "ayaz-de-latest-amd64.deb",
                            "browser_download_url": "https://github.com/Ankora-Linux/Ankora/releases/download/v4.6.0/ayaz-de-latest-amd64.deb",
                            "size": 123456,
                            "digest": "sha256:" + ("a" * 64),
                        },
                    ],
                }),
            )
        )
        fake_sp = types.SimpleNamespace(
            run=lambda *a, **kw: types.SimpleNamespace(returncode=1, stdout=""),
            PIPE=-1,
            DEVNULL=-3,
        )
        return run_block(
            body,
            json=json,
            re=re,
            subprocess=fake_sp,
            urllib=fake_urllib,
        )

    older = _run_with_release("v4.6.0")
    assert older["has_update"] is False, older
    newer = _run_with_release("v4.8.0")
    assert newer["has_update"] is True, newer
    assert newer["latest_version"] == "4.8.0", newer
    assert newer["expected_sha256"] == "a" * 64, newer
    assert newer["sha256_url"] is None, newer
    print("[OK  ] check_de_update: semver sürüm sırası ve .deb/.iso ayrımı doğru")


def test_ai_query_and_action_parsing(bridge):
    import json
    import types
    import urllib.request

    m_act = re.search(r"_ALLOWED_AGENT_ACTIONS\s*=\s*\{.*?\}", bridge, re.S)
    assert m_act, "_ALLOWED_AGENT_ACTIONS bulunamadı"
    act_ns = {}
    exec(m_act.group(0), act_ns)
    allowed_actions = act_ns["_ALLOWED_AGENT_ACTIONS"]

    # 1. inspect_package_file (.deb ve .AppImage ends_with regresyon testi)
    pkg_body = extract_block(bridge, "inspect_package_file")
    with tempfile.TemporaryDirectory() as td:
        deb_path = os.path.join(td, "sample.deb")
        app_path = os.path.join(td, "MyTool.AppImage")
        with open(deb_path, "wb") as fh:
            fh.write(b"deb")
        with open(app_path, "wb") as fh:
            fh.write(b"app")

        fake_sp = types.SimpleNamespace(
            run=lambda *a, **kw: types.SimpleNamespace(
                returncode=0,
                stdout=" Package: demo-pkg\n Version: 1.2.3\n Architecture: amd64\n Description: Test paketi\n",
            ),
            PIPE=-1,
        )
        deb_info = run_block(pkg_body, args={"filePath": deb_path}, subprocess=fake_sp)
        assert deb_info["pkg_type"] == "deb", deb_info
        assert deb_info["name"] == "demo-pkg", deb_info
        assert deb_info["version"] == "1.2.3", deb_info

        app_info = run_block(pkg_body, args={"filePath": app_path}, subprocess=fake_sp)
        assert app_info["pkg_type"] == "appimage", app_info
        assert app_info["name"] == "MyTool", app_info

    # 2. query_local_ai (JSON + pipe action directive, vision payload, OpenRouter modeli, yerel yedek)
    ai_body = extract_block(bridge, "query_local_ai")

    class _FakeResp:
        def __init__(self, payload):
            self._data = json.dumps(payload).encode("utf-8")

        def read(self):
            return self._data

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    def _fake_exec(cmd_name, _args):
        if cmd_name == "get_system_telemetry":
            return {
                "memory_used_mb": 420,
                "memory_total_mb": 4096,
                "disk_used_gb": 4.2,
                "disk_total_gb": 20.0,
                "disk_percent": 21,
                "cpu_cores": 4,
                "cpu_percent": 5.0,
                "uptime_seconds": 180,
                "os_name": "Ankora Linux 4.7.0",
                "kernel": "Linux 6.12",
                "init_system": "SysVinit",
            }
        if cmd_name == "get_network_info":
            return {
                "interface": "eth0",
                "ip": "192.168.1.42",
                "gateway": "192.168.1.1",
                "dns": ["1.1.1.1"],
                "connected": True,
            }
        return {}

    captured = {}
    orig_urlopen = urllib.request.urlopen
    try:
        # 2a. OpenRouter + JSON ACTION + imageB64
        def _urlopen_openrouter(req, timeout=20):
            captured["url"] = req.full_url
            captured["payload"] = json.loads(req.data.decode("utf-8"))
            return _FakeResp({
                "choices": [{
                    "message": {
                        "content": 'Ekran analizi tamamlandı. <<<ACTION:{"command":"free -h","desc":"Bellek Tablosu"}>>>'
                    }
                }]
            })

        urllib.request.urlopen = _urlopen_openrouter
        res_or = run_block(
            ai_body,
            args={"prompt": "Buna bak", "provider": "openrouter", "apiKey": "sk-test", "imageB64": "AAAA"},
            json=json,
            re=re,
            _ALLOWED_AGENT_ACTIONS=allowed_actions,
            _generate_agent_action_token=lambda c: f"tok:{c}",
            execute_ayaz_command=_fake_exec,
            _run_capture=lambda _c: "",
        )
        assert res_or["has_action"] is True, res_or
        assert res_or["action_command"] == "free -h", res_or
        assert res_or["action_desc"] == "Bellek Tablosu", res_or
        assert res_or["action_token"] == "tok:free -h", res_or
        assert captured["payload"]["model"] == "anthropic/claude-3.5-sonnet", captured
        assert isinstance(captured["payload"]["messages"][1]["content"], list), captured

        # 2b. Ollama vision model + pipe ACTION
        def _urlopen_ollama(req, timeout=30):
            captured["ollama"] = json.loads(req.data.decode("utf-8"))
            return _FakeResp({
                "response": "RAM durumu iyi. <<<ACTION:free -h|RAM Dökümü>>>"
            })

        urllib.request.urlopen = _urlopen_ollama
        res_ol = run_block(
            ai_body,
            args={"prompt": "Ekrana bak", "provider": "ollama", "model": "llava:latest", "image_b64": "BBBB"},
            json=json,
            re=re,
            _ALLOWED_AGENT_ACTIONS=allowed_actions,
            _generate_agent_action_token=lambda c: f"tok:{c}",
            execute_ayaz_command=_fake_exec,
            _run_capture=lambda _c: "",
        )
        assert res_ol["has_action"] is True, res_ol
        assert res_ol["action_command"] == "free -h", res_ol
        assert res_ol["action_desc"] == "RAM Dökümü", res_ol
        assert captured["ollama"].get("images") == ["BBBB"], captured

        # 2c. Disallowed command rejection + local fallbacks
        urllib.request.urlopen = lambda *_a, **_kw: _FakeResp({"response": "Uyarı <<<ACTION:rm -rf /|Yasak>>>"})
        res_bad = run_block(
            ai_body,
            args={"prompt": "test", "provider": "ollama"},
            json=json,
            re=re,
            _ALLOWED_AGENT_ACTIONS=allowed_actions,
            _generate_agent_action_token=lambda c: f"tok:{c}",
            execute_ayaz_command=_fake_exec,
            _run_capture=lambda _c: "",
        )
        assert res_bad["has_action"] is False, res_bad
        assert res_bad["action_token"] is None, res_bad

        def _urlopen_fail(*_a, **_kw):
            raise ConnectionRefusedError("offline")

        urllib.request.urlopen = _urlopen_fail
        res_scr = run_block(
            ai_body,
            args={"prompt": "Ekranımda ne görüyorsun?", "provider": "ollama", "imageB64": "CCCC"},
            json=json,
            re=re,
            _ALLOWED_AGENT_ACTIONS=allowed_actions,
            _generate_agent_action_token=lambda c: f"tok:{c}",
            execute_ayaz_command=_fake_exec,
            _run_capture=lambda _c: "0x01200003  0 host Ankora Masaüstü\n0x01400001  0 host Terminal\n",
        )
        assert "Ankora Masaüstü" in res_scr["reply"], res_scr

        res_net = run_block(
            ai_body,
            args={"prompt": "Ağ ve IP durumu nedir?", "provider": "ollama"},
            json=json,
            re=re,
            _ALLOWED_AGENT_ACTIONS=allowed_actions,
            _generate_agent_action_token=lambda c: f"tok:{c}",
            execute_ayaz_command=_fake_exec,
            _run_capture=lambda _c: "",
        )
        assert "192.168.1.42" in res_net["reply"], res_net
        assert res_net["action_command"] == "/usr/local/bin/ankora-doctor", res_net
    finally:
        urllib.request.urlopen = orig_urlopen

    print("[OK  ] query_local_ai & inspect_package_file: AI eylem ayrıştırma, görsel yük ve paket kontrolü geçti")


def main():
    bridge = load_bridge()
    test_xdg_english(bridge)
    test_xdg_turkish(bridge)
    test_xdg_missing_config(bridge)
    test_icon_found(bridge)
    test_icon_missing_and_unsafe(bridge)
    test_native_windows_parsing(bridge)
    test_check_de_update_semver(bridge)
    test_ai_query_and_action_parsing(bridge)
    print("KÖPRÜ MANTIK TESTLERİ: geçti.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

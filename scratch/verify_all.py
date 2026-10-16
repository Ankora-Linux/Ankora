#!/usr/bin/env python3
"""Ankora Linux / Ayaz DE — Derleme öncesi bütünlük ve güvenlik denetimi.

CI (`build-iso.yml`) bu betiği çağırır. Herhangi bir denetim başarısız
olursa çıkış kodu 1 döner ve derleme durur.
Denetlenenler:
  1. Kabuk betikleri sözdizimi (`bash -n`)
  2. Arayüz JS sözdizimi (`node --check`)
  3. index.html ayrıştırılabilirliği
  4. CSP eşitliği (index.html <-> tauri.conf.json)
  5. GRUB ve Plymouth tema dosyalarının varlığı
  6. Mağaza zorunlu girdileri (scratch, meb sertifikası, okul uygulamaları)
"""
import html.parser
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FAILURES = []


def check(name, ok, detail=""):
    status = "OK  " if ok else "HATA"
    print(f"[{status}] {name}" + (f": {detail}" if detail else ""))
    if not ok:
        FAILURES.append(name)


def run(cmd):
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        return p.returncode == 0, (p.stderr or p.stdout or "").strip()[:300]
    except Exception as e:  # pragma: no cover
        return False, str(e)[:300]


def main():
    # 1. Kabuk betikleri
    for script in sorted((ROOT / "scripts").glob("*.sh")):
        ok, err = run(["bash", "-n", str(script)])
        check(f"bash -n {script.name}", ok, err)
    for extra in ("scripts/ayaz-session", "scripts/xinitrc", "scripts/ayaz-ctl"):
        p = ROOT / extra
        if p.exists():
            ok, err = run(["bash", "-n", str(p)])
            check(f"bash -n {extra}", ok, err)

    # 2. Arayüz JS
    ok, err = run(["node", "--check", str(ROOT / "src/app.js")])
    check("node --check src/app.js", ok, err)

    # 3. HTML ayrıştırma
    try:
        html.parser.HTMLParser().feed((ROOT / "src/index.html").read_text(encoding="utf-8"))
        check("src/index.html ayrıştırma", True)
    except Exception as e:
        check("src/index.html ayrıştırma", False, str(e)[:200])

    # 4. CSP eşitliği (çift kaynak tek metin olmalı)
    try:
        html_text = (ROOT / "src/index.html").read_text(encoding="utf-8")
        conf = json.loads((ROOT / "src-tauri/tauri.conf.json").read_text(encoding="utf-8"))
        conf_csp = conf["tauri"]["security"]["csp"]
        check("CSP eşitliği (html == tauri.conf)", conf_csp in html_text,
              "" if conf_csp in html_text else "tauri.conf CSP'si index.html içinde bulunamadı")
    except Exception as e:
        check("CSP eşitliği (html == tauri.conf)", False, str(e)[:200])

    # 5. Önyükleyici ve açılış temaları
    for rel in (
        "scripts/grub-theme-ankora/theme.txt",
        "scripts/ankora-grub-default",
        "scripts/plymouth-theme-ankora/ankora.plymouth",
        "scripts/plymouth-theme-ankora/ankora.script",
    ):
        check(f"tema dosyası {rel}", (ROOT / rel).is_file())

    # 6. Mağaza zorunlu girdileri
    try:
        app_js = (ROOT / "src/app.js").read_text(encoding="utf-8")
        for needle, label in (
            ("org.scratch.Scratch", "mağaza: Scratch"),
            ("meb-cert", "mağaza: MEB sertifikası"),
            ("gcompris", "mağaza: GCompris (okul)"),
            ("tuxmath", "mağaza: TuxMath (okul)"),
            ("stellarium", "mağaza: Stellarium (okul)"),
            ("install_meb_certificate", "meb sertifika komutu (js+rs)"),
        ):
            found = needle in app_js
            if needle == "install_meb_certificate":
                found = ("install_meb_certificate" in app_js
                         and "install_meb_certificate" in (ROOT / "src-tauri/src/main.rs").read_text(encoding="utf-8"))
            check(label, found)
    except Exception as e:
        check("mağaza girdileri", False, str(e)[:200])

    # 7. Yardımcı betik eylemleri
    try:
        helper = (ROOT / "scripts/ayaz-pkg-helper.sh").read_text(encoding="utf-8")
        check("ayaz-pkg-helper: mebcert eylemi", "mebcert)" in helper)
    except Exception as e:
        check("ayaz-pkg-helper: mebcert eylemi", False, str(e)[:200])

    # 8. İndirme ve dosya görünürlüğü
    try:
        html_text = (ROOT / "src/index.html").read_text(encoding="utf-8")
        check("iframe: allow-downloads", "allow-downloads" in html_text)
        app_js = (ROOT / "src/app.js").read_text(encoding="utf-8")
        main_rs = (ROOT / "src-tauri/src/main.rs").read_text(encoding="utf-8")
        check("xdg dizin komutu (js+rs)",
              "get_xdg_user_dirs" in app_js and "get_xdg_user_dirs" in main_rs)
        check("gerçek ikon komutu (js+rs)",
              "get_app_icon" in app_js and "get_app_icon" in main_rs)
        check("komut kayıtları (generate_handler)",
              "get_xdg_user_dirs," in main_rs and "get_app_icon," in main_rs
              and "install_meb_certificate," in main_rs)
        check("masaüstü dosyaları (DesktopFiles)", "DesktopFiles" in app_js)
        check("indirme bildirimi (__AYAZ_DOWNLOAD_DONE__)",
              "__AYAZ_DOWNLOAD_DONE__" in app_js)
        check("mağaza: öne çıkanlar", 'data-cat="featured"' in html_text
              and "featured: true" in app_js)
    except Exception as e:
        check("indirme ve dosya görünürlüğü", False, str(e)[:200])

    # 9. Açık tema uyarlamaları (koyu sabit renkli yüzeyler)
    try:
        css = (ROOT / "src/style.css").read_text(encoding="utf-8")
        for needle, label in (
            ("body.theme-light .office-text-frame", "açık tema: office metni"),
            ("body.theme-light .files-sidebar", "açık tema: dosya kenar çubuğu"),
            ("body.theme-light .files-content-area", "açık tema: dosya içeriği"),
            ("body.theme-light .store-source-btn", "açık tema: mağaza kaynak düğmesi"),
            ("body.theme-light .desktop-context-menu", "açık tema: bağlam menüsü"),
            ("body.theme-light .term-toolbar", "açık tema: terminal çubuğu"),
            ("body.theme-light .item-name", "açık tema: masaüstü etiketi"),
        ):
            check(label, needle in css)
    except Exception as e:
        check("açık tema uyarlamaları", False, str(e)[:200])

    # 10. İkon kapsamı: öne çıkan her uygulamanın özel dalı olmalı.
    try:
        app_js = (ROOT / "src/app.js").read_text(encoding="utf-8")
        icon_fn = app_js.split("getAppSvgIcon(app) {", 1)[1].split("\n    },", 1)[0]
        missing = [k for k in (
            "firefox", "chromium", "telegram", "spotify", "vscode",
            "vlc", "scratch", "meb", "gcompris", "xournal", "evince",
            "brave", "libreoffice",
        ) if k not in icon_fn]
        check("ikon kapsamı (öne çıkanlar)", not missing, ",".join(missing))
    except Exception as e:
        check("ikon kapsamı (öne çıkanlar)", False, str(e)[:200])

    # 11. Çalışan mantık testleri (köprü blokları + mağaza verisi)
    ok, err = run([sys.executable, "scratch/test_bridge_logic.py"])
    check("köprü mantık testleri", ok, err if not ok else "")
    ok, err = run(["node", "scratch/test_store_data.js"])
    check("mağaza veri testleri", ok, err if not ok else "")

    # 12. Faz tahta dokunmatik desteği
    try:
        app_js = (ROOT / "src/app.js").read_text(encoding="utf-8")
        html_text = (ROOT / "src/index.html").read_text(encoding="utf-8")
        css = (ROOT / "src/style.css").read_text(encoding="utf-8")
        iso = (ROOT / "scripts/build-iso.sh").read_text(encoding="utf-8")
        xin = (ROOT / "scripts/xinitrc").read_text(encoding="utf-8")
        check("dokunmatik algı (has-touch)", "has-touch" in app_js and "has-touch" in css)
        check("uzun-basım sağ tık", "initLongPress" in app_js and "LONG_PRESS_MS" in app_js)
        check("tahta ayar grubu", "btn-touch-calibrate" in html_text
              and "btn-touch-keyboard" in html_text
              and "btn-touch-eta" in html_text
              and "initTouchControls" in app_js)
        check("iso: kalibrasyon + ekran klavyesi",
              "xinput-calibrator" in iso and re.search(r"^\s*onboard\s*\\\\?$", iso, re.M) is not None)
        check("xinitrc: ped/tahta ayrımı", "ouchpad" in xin and "ouchscreen" in xin)
    except Exception as e:
        check("faz tahta dokunmatik desteği", False, str(e)[:200])

    # 13. ETA dokunmatik sürücüsü (son eklenen sistem)
    try:
        eta = (ROOT / "scripts/eta-touchdrv").read_text(encoding="utf-8")
        check("eta: --enable/--status/--calibrate-gui/--test",
              all(f in eta for f in ("--enable", "--status", "--calibrate", "--test")))
        check("eta: Faz ad eşleşmesi", all(k in eta for k in ("Vestel", "eGalax", "IRTOUCH", "Faz")))
        check("eta: chroot kurulumu", all(k in iso for k in (
            "usr/bin/eta-touchdrv", "99-faz-touch.rules", "99-faz-touch.conf",
            "eta-touchdrv.desktop")))
        check("eta: kurulu hedefe taşınır", "target/usr/bin/eta-touchdrv" in iso)
        check("eta: oturumda otomatik", "eta-touchdrv --enable" in xin
              and "eta-touchdrv --enable" in (ROOT / "scripts/ayaz-session").read_text(encoding="utf-8"))
        import subprocess as _sp
        r = _sp.run(["bash", "-n", "scripts/eta-touchdrv"], cwd=ROOT)
        check("eta: bash -n", r.returncode == 0)
        r = _sp.run(["bash", "scripts/eta-touchdrv", "--help"], cwd=ROOT,
                    capture_output=True, text=True)
        check("eta: --help çalışır", r.returncode == 0 and "Kullanım" in r.stdout)
        r = _sp.run(["bash", "scripts/eta-touchdrv", "--kötü-arg"], cwd=ROOT,
                    capture_output=True, text=True)
        check("eta: kötü argüman reddi", r.returncode == 1)
        udev = (ROOT / "scripts/99-faz-touch.rules").read_text(encoding="utf-8")
        check("udev: eşleşme=çift-esittir atama=tek",
              'ACTION=="add|change"' in udev and 'MODE="0666"' in udev
              and re.search(r'ACTION[^=]=[^=]', udev) is None)
        xorg = (ROOT / "scripts/99-faz-touch.conf").read_text(encoding="utf-8")
        check("xorg: Section dengesi",
              xorg.count("Section ") == xorg.count("EndSection")
              and 'MatchIsTouchscreen "on"' in xorg)
    except Exception as e:
        check("eta dokunmatik sürücüsü", False, str(e)[:200])

    # 14. GRUB + Plymouth önyükleme zinciri
    try:
        theme = (ROOT / "scripts/grub-theme-ankora/theme.txt").read_text(encoding="utf-8")
        check("grub tema: küme dengesi", theme.count("{") == theme.count("}")
              and theme.count("{") > 0)
        check("grub tema: boş resim yolu yok", 'desktop-image: ""' not in theme)
        check("grub tema: gerekli anahtarlar",
              all(k in theme for k in ("desktop-color", "terminal-font", "boot_menu",
                                       "item_font", "selected_item_color", "__timeout__")))
        check("grub cfg: gfxmenu + font kapılı tema",
              "insmod gfxmenu" in iso and 'have_font="1"' in iso
              and '"$have_font" = "1"' in iso)
        check("grub cfg: unicode.pf2 ISO'da", "boot/grub/fonts/unicode.pf2" in iso)
        import subprocess as _sp2
        cfg_src = re.search(
            r"cat << 'EOF' > \"\$IMAGE_DIR/boot/grub/grub\.cfg\"\n(.*?)\nEOF\n",
            iso, re.S)
        if cfg_src and shutil.which("grub-script-check"):
            import tempfile as _tf
            with _tf.NamedTemporaryFile("w", suffix=".cfg", delete=False) as fh:
                fh.write(cfg_src.group(1))
                tmp_cfg = fh.name
            r = _sp2.run(["grub-script-check", tmp_cfg], capture_output=True, text=True)
            check("grub cfg: grub-script-check", r.returncode == 0, r.stderr[:200])
            os.unlink(tmp_cfg)
        else:
            check("grub cfg: grub-script-check", True, "atlandı (araç yok)")
        ply = (ROOT / "scripts/plymouth-theme-ankora/ankora.script").read_text(encoding="utf-8")
        check("plymouth: Math.Min yok", re.search(r"Math\.Min\s*\(", ply) is None)
        check("plymouth: kare-başı img yok",
              "refresh_callback" in ply and ply.split("fun refresh_callback")[1].count("Image.New") == 0)
        check("plymouth: SetClip ilerleme", "SetClip" in ply)
        check("kurulu sistem: splash+keep", 'quiet splash loglevel=3' in
              (ROOT / "scripts/ankora-grub-default").read_text(encoding="utf-8")
              and "GRUB_GFXPAYLOAD_LINUX=keep" in
              (ROOT / "scripts/ankora-grub-default").read_text(encoding="utf-8"))
    except Exception as e:
        check("önyükleme zinciri", False, str(e)[:200])

    print()
    if FAILURES:
        print(f"SONUÇ: {len(FAILURES)} denetim başarısız: {', '.join(FAILURES)}")
        return 1
    print("SONUÇ: tüm denetimler geçti.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

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

    print()
    if FAILURES:
        print(f"SONUÇ: {len(FAILURES)} denetim başarısız: {', '.join(FAILURES)}")
        return 1
    print("SONUÇ: tüm denetimler geçti.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

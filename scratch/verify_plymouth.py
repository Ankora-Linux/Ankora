#!/usr/bin/env python3
"""Plymouth / GRUB başlatıcı dosyalarının offline statik analizi.

Araçlar yoksa (vmstub yoksa) yalnız statik API denetimi yapılır:
  plymouthd önemsiz hataları yoksayar; ÇALIŞMA ZAMANI hatanın kaynağı
  bulunamadığından API problemi metin analiziyle yakalanır.
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = (ROOT / "scripts/plymouth-theme-ankora/ankora.script").read_text(encoding="utf-8")
FAILURES = []


def check(name, ok, detail=""):
    print(("OK  " if ok else "HATA") + f" {name}" + (f": {detail}" if detail else ""))
    if not ok:
        FAILURES.append(name)


# Stok "script" temasında geçen, güvenli API kökü:
SAFE_API = {
    "Window.GetWidth", "Window.GetHeight", "Window.GetX", "Window.GetY",
    "Plymouth.SetBackgroundTopColor", "Plymouth.SetBackgroundBottomColor",
    "Plymouth.SetRefreshFunction", "Plymouth.SetBootProgressFunction",
    "Plymouth.SetMessageFunction", "Plymouth.SetQuitFunction",
    "Plymouth.SetDisplayMessageFunction", "Plymouth.SetDisplayPasswordFunction",
    "Plymouth.SetFunction", "Plymouth.GetMode", "Plymouth.GetProgress",
    "Image.Text", "Image.New", "Image.GetWidth", "Image.GetHeight", "Image.Scale",
    "Sprite.SetImage", "Sprite.SetOpacity", "Sprite.SetPosition",
    "Math.Int", "Math.Minimum", "Math.Clamp", "Math.Cos", "Math.Random",
}

# 1. Doğrudan kullanımda (nesne-görevli: sprite.SetImage gibi) tamam.
# 2. Bildirim tanımlı işlevler (fun ... SetImage ...) tamam.
# 3. Bilinmeyen önekli (X.SetImage) fonksiyon uyarı.
direct = set(re.findall(r"\b((?:Window|Plymouth|Image|Sprite|Math)\.\w+)", SCRIPT))
unknown = sorted(m for m in direct if m not in SAFE_API)
check("plymouth API: doğrudan çağrılarda yalnız güvenli işlevler",
      not unknown, ",".join(unknown))
check("plymouth arg: boş cümle yok", "" not in re.findall(r'"([^"]*)"', SCRIPT))

# Sık yapılan hatalar
check("Math.Min( yok (Minimum değil)", re.search(r"Math\.Min\s*\(", SCRIPT) is None)
check("Math.Mod yok", "Math.Max" not in SCRIPT and "Math[" not in SCRIPT)
check("Fon tanımı + çağrı/kayıt denge", SCRIPT.count("fun ") == 3
      and "SetRefreshFunction" in SCRIPT and "SetBootProgressFunction" in SCRIPT
      and "SetMessageFunction" in SCRIPT)

# vmstub varsa gerçek başlatıcı ile çalıştır
stub = Path(__file__).parent / "plymouth_stub"
if stub.exists():
    ok, err = subprocess.getstatusoutput(f"{stub} scripts/plymouth-theme-ankora/ankora.script")
    print(err[:800] if not ok else "")
    check("plymouth script gerçek çalıştırma", ok == 0)
else:
    print("OK   plymouth script gerçek çalıştırma: atlandı (vmstub yok)")

print()
if FAILURES:
    print(f"SONUÇ: {len(FAILURES)} denetim başarısız")
    sys.exit(1)
print("SONUÇ: tüm denetimler geçti.")

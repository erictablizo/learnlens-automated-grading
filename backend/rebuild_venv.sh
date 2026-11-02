#!/usr/bin/env bash
# Rebuild the backend virtualenv on THIS computer, on a Python that works.
#
# v2, 2026-10-31. The first version fell back to "whatever py -3 gives" when
# it could not find a specific version, and on this machine that is Python
# 3.14, which this project cannot run on:
#
#   pytesseract : cannot import name 'find_loader' from 'pkgutil'
#                 -> pkgutil.find_loader was REMOVED in Python 3.14
#   sqlalchemy  : Can't replace canonical symbol for '__firstlineno__'
#                 -> SQLAlchemy 2.0.30 does not understand that new attribute
#
# Both are the Python version, not missing packages. So this version REFUSES
# to build on anything outside the supported range instead of producing a
# venv that installs cleanly and then cannot import anything.
#
# Eric's original venv was Python 3.11. 3.12 also works (it is what the
# production Docker image uses).
#
# Nothing is deleted. The old venv is RENAMED, so it can be put back.
#
# Run from Git Bash, inside the backend folder:
#     bash rebuild_venv.sh

set -euo pipefail

cd "$(dirname "$0")"
echo "working in: $(pwd)"
echo

if [ ! -f requirements.txt ]; then
    echo "ERROR: no requirements.txt here."
    echo "Put this script in the 'backend' folder and run it from there."
    exit 1
fi

# --- 1. a SUPPORTED Python, or stop ----------------------------------------
# 3.11 first: it is what the project was built and measured on.
PY=""
for cand in "py -3.11" "py -3.12" "python3.11" "python3.12"; do
    if $cand --version >/dev/null 2>&1; then PY="$cand"; break; fi
done

if [ -z "$PY" ]; then
    echo "=============================================================="
    echo " No supported Python found on this computer."
    echo
    echo " This project needs Python 3.11 or 3.12."
    if py -3 --version >/dev/null 2>&1; then
        echo " What you have is: $(py -3 --version 2>&1)"
    fi
    echo
    echo " 3.13 and 3.14 do NOT work. On 3.14, pkgutil.find_loader was"
    echo " removed (pytesseract breaks) and SQLAlchemy 2.0.30 cannot cope"
    echo " with the new __firstlineno__ attribute. Installing packages will"
    echo " APPEAR to succeed and then nothing will import."
    echo
    echo " Install Python 3.11 (64-bit) from:"
    echo "     https://www.python.org/downloads/windows/"
    echo " Tick 'Add python.exe to PATH' in the installer, then run this"
    echo " script again. Installing 3.11 does not remove the Python you"
    echo " already have."
    echo "=============================================================="
    exit 1
fi

echo "using: $PY  ->  $($PY --version 2>&1)"
echo

# --- 2. move the old one aside, do not delete it ---------------------------
if [ -d venv ]; then
    OLD="venv.broken-$(date +%Y%m%d-%H%M%S)"
    mv venv "$OLD"
    echo "old venv renamed to $OLD"
    echo "(you can delete the venv.broken-* folders once everything works)"
    echo
fi

# --- 3. build and fill -----------------------------------------------------
echo "creating venv ..."
$PY -m venv venv

VPY="venv/Scripts/python.exe"
[ -x "$VPY" ] || VPY="venv/bin/python"

echo "installing packages (this takes a few minutes) ..."
"$VPY" -m pip install --upgrade pip
"$VPY" -m pip install -r requirements.txt
echo

# --- 4. prove it works -----------------------------------------------------
echo "checking ..."
"$VPY" - <<'PYCHECK'
import sys
print("  python   :", sys.version.split()[0], "-", sys.executable)
ok = True
for mod in ("sqlalchemy", "fastapi", "pydantic", "cv2", "numpy",
            "pytesseract", "asyncpg", "PIL"):
    try:
        m = __import__(mod)
        print(f"  {mod:12s}: {getattr(m, '__version__', 'installed')}")
    except Exception as exc:
        ok = False
        print(f"  {mod:12s}: MISSING  ({exc})")

# pytesseract imports fine without the binary; the binary is a separate
# Windows install and the OCR cannot run without it.
try:
    import pytesseract
    print("  tesseract:", pytesseract.get_tesseract_version())
except Exception as exc:
    ok = False
    print(f"  tesseract: NOT FOUND ({exc})")
    print("             Install the UB Mannheim build and set its path in")
    print("             backend/.env - the grading needs the tesseract.exe,")
    print("             not just the python package.")
print()
print("ALL OK" if ok else "SOMETHING IS STILL MISSING - send this output back")
PYCHECK

echo
echo "Done. In VS Code: Ctrl+Shift+P -> Python: Select Interpreter"
echo "   -> Enter interpreter path -> backend\\venv\\Scripts\\python.exe"
echo "then Ctrl+Shift+P -> Developer: Reload Window"
"""
Run this BEFORE uvicorn to diagnose import errors:
    python check_imports.py
 
Place this file in the /backend directory (same level as /app).
"""
import sys
 
print(f"Python: {sys.version}")
print()
 
checks = [
    ("fastapi", "FastAPI"),
    ("uvicorn", None),
    ("sqlalchemy", None),
    ("asyncpg", None),
    ("pydantic", None),
    ("pydantic_settings", "BaseSettings"),
    ("email_validator", None),
    ("passlib", None),
    ("jose", "jwt"),
    ("multipart", None),
    ("aiofiles", None),
]
 
all_ok = True
for mod, attr in checks:
    try:
        m = __import__(mod)
        ver = getattr(m, "__version__", "?")
        if attr:
            getattr(m, attr)
        print(f"  ✓  {mod:<25} {ver}")
    except ImportError as e:
        print(f"  ✗  {mod:<25} MISSING → {e}")
        all_ok = False
    except AttributeError as e:
        print(f"  ⚠  {mod:<25} installed but attr missing → {e}")
        all_ok = False
 
print()
if all_ok:
    print("All dependencies OK — trying app import…")
    try:
        from app.main import app  # noqa: F401
        print("  ✓  app.main imported successfully")
    except Exception as e:
        print(f"  ✗  app.main failed: {e}")
        import traceback
        traceback.print_exc()
else:
    print("Fix missing packages above, then re-run.")
    print()
    print("Quick fix command:")
    print("  pip install fastapi uvicorn[standard] sqlalchemy asyncpg pydantic pydantic-settings email-validator passlib[bcrypt] python-jose[cryptography] python-multipart aiofiles")
#!/bin/bash
# ============================================================
#  LearnLens — Backend Setup Script (Python / FastAPI)
#  Run inside your cloned repository root: bash setup.sh
# ============================================================

set -e

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   LearnLens — Backend Setup              ║"
echo "║   Python + FastAPI + PostgreSQL          ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ─────────────────────────────────────────────
# 1. ROOT .env.example
# ─────────────────────────────────────────────
echo "📁 Creating .env.example..."

cat > .env.example << 'EOF'
# ── Frontend ──────────────────────────────────
NEXT_PUBLIC_API_URL=http://localhost:8000

# ── Backend ───────────────────────────────────
DATABASE_URL=postgresql://postgres:password@localhost:5432/learnlens
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# ── OCR / ML ──────────────────────────────────
TESSERACT_PATH=/usr/bin/tesseract
EOF

echo "✅ .env.example created."

# ─────────────────────────────────────────────
# 2. BACKEND FOLDER STRUCTURE
# ─────────────────────────────────────────────
echo ""
echo "📁 Creating backend folder structure..."

mkdir -p backend
cd backend

mkdir -p app/api/routes
mkdir -p app/core
mkdir -p app/models
mkdir -p app/schemas
mkdir -p app/services
mkdir -p app/ml
mkdir -p uploads/exam_keys
mkdir -p uploads/answer_sheets
mkdir -p tests

echo "✅ Folders created."

# ─────────────────────────────────────────────
# 3. VIRTUAL ENVIRONMENT
# ─────────────────────────────────────────────
echo ""
echo "🐍 Creating virtual environment..."

python -m venv venv

# Activate — works in Git Bash on Windows
source venv/Scripts/activate 2>/dev/null || source venv/bin/activate

echo "✅ Virtual environment activated."

# ─────────────────────────────────────────────
# 4. UPGRADE PIP TOOLS (Windows fix)
# ─────────────────────────────────────────────
echo ""
echo "🔧 Upgrading pip, setuptools, and wheel..."
python -m pip install --upgrade pip setuptools wheel
echo "✅ pip tools upgraded."

# ─────────────────────────────────────────────
# 5. GENERATE FILES
# ─────────────────────────────────────────────
echo ""
echo "📝 Generating project files..."

# ── main.py ──────────────────────────────────
cat > main.py << 'EOF'
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import auth, exams, papers

app = FastAPI(title="LearnLens API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,   prefix="/api/auth",   tags=["Auth"])
app.include_router(exams.router,  prefix="/api/exams",  tags=["Exams"])
app.include_router(papers.router, prefix="/api/papers", tags=["Papers"])

@app.get("/")
def root():
    return {"message": "LearnLens API is running"}
EOF

# ── app/ ──────────────────────────────────────
touch app/__init__.py
touch app/core/__init__.py

# ── core/config.py ───────────────────────────
cat > app/core/config.py << 'EOF'
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    class Config:
        env_file = ".env"

settings = Settings()
EOF

# ── core/database.py ─────────────────────────
cat > app/core/database.py << 'EOF'
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
EOF

# ── core/security.py ─────────────────────────
cat > app/core/security.py << 'EOF'
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_access_token(data: dict) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({**data, "exp": expire}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
EOF

# ── models/ ───────────────────────────────────
touch app/models/__init__.py

cat > app/models/user.py << 'EOF'
from sqlalchemy import Column, Integer, String
from app.core.database import Base

class User(Base):
    __tablename__ = "users"
    id       = Column(Integer, primary_key=True, index=True)
    name     = Column(String, nullable=False)
    email    = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False)
EOF

cat > app/models/exam.py << 'EOF'
from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class Exam(Base):
    __tablename__ = "exams"
    id       = Column(Integer, primary_key=True, index=True)
    name     = Column(String, nullable=False)
    key_path = Column(String)
    owner_id = Column(Integer, ForeignKey("users.id"))
    papers   = relationship("Paper", back_populates="exam", cascade="all, delete")
EOF

cat > app/models/paper.py << 'EOF'
from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class Paper(Base):
    __tablename__ = "papers"
    id           = Column(Integer, primary_key=True, index=True)
    student_name = Column(String, nullable=False)
    sheet_path   = Column(String)
    score        = Column(Float, nullable=True)
    exam_id      = Column(Integer, ForeignKey("exams.id"))
    exam         = relationship("Exam", back_populates="papers")
EOF

# ── schemas/ ──────────────────────────────────
touch app/schemas/__init__.py
touch app/schemas/user.py
touch app/schemas/exam.py
touch app/schemas/paper.py

# ── api/routes/ ───────────────────────────────
touch app/api/__init__.py
touch app/api/routes/__init__.py
touch app/api/routes/auth.py     # POST /register  POST /login
touch app/api/routes/exams.py    # GET/POST /exams  DELETE /exams/{id}
touch app/api/routes/papers.py   # GET/POST /papers  POST /papers/{id}/check  DELETE

# ── services/ ─────────────────────────────────
touch app/services/__init__.py
touch app/services/auth_service.py
touch app/services/exam_service.py
touch app/services/paper_service.py

# ── ml/ocr.py ─────────────────────────────────
touch app/ml/__init__.py

cat > app/ml/ocr.py << 'EOF'
"""
OCR Module — Tesseract + OpenCV
Extracts student answers from a scanned answer sheet image.
"""
import cv2
import pytesseract

def preprocess_image(image_path: str):
    img = cv2.imread(image_path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY_INV)
    return thresh

def extract_answers(image_path: str) -> list[str]:
    processed = preprocess_image(image_path)
    raw_text = pytesseract.image_to_string(processed)
    return [line.strip() for line in raw_text.split("\n") if line.strip()]
EOF

# ── ml/grader.py ──────────────────────────────
cat > app/ml/grader.py << 'EOF'
"""
Grader Module
Compares extracted student answers against the answer key.
"""

def grade_paper(student_answers: list[str], answer_key: list[str]) -> dict:
    correct = sum(
        1 for s, k in zip(student_answers, answer_key)
        if s.strip().lower() == k.strip().lower()
    )
    total = len(answer_key)
    score = round((correct / total) * 100, 2) if total > 0 else 0
    return {"correct": correct, "total": total, "score": score}
EOF

# ── tests/ ────────────────────────────────────
touch tests/__init__.py
touch tests/test_auth.py
touch tests/test_exams.py
touch tests/test_ocr.py

echo "✅ Project files generated."

# ─────────────────────────────────────────────
# 6. requirements.txt
# ─────────────────────────────────────────────
cat > requirements.txt << 'EOF'
fastapi==0.111.0
uvicorn[standard]==0.30.1
sqlalchemy==2.0.30
psycopg2-binary==2.9.11
pydantic-settings==2.3.1
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.9
opencv-python==4.10.0.84
pytesseract==0.3.10
pillow>=10.4.0
alembic==1.13.1
python-dotenv==1.0.1
EOF

# ─────────────────────────────────────────────
# 7. INSTALL DEPENDENCIES
#    Binary-first strategy — no C++ compiler needed
# ─────────────────────────────────────────────
echo ""
echo "📦 Installing binary packages (Windows safe)..."
pip install --only-binary=:all: psycopg2-binary==2.9.11
pip install --only-binary=:all: "pillow>=10.4.0"
pip install --only-binary=:all: opencv-python==4.10.0.84

echo "📦 Installing remaining packages..."
pip install \
  fastapi==0.111.0 \
  "uvicorn[standard]==0.30.1" \
  sqlalchemy==2.0.30 \
  pydantic-settings==2.3.1 \
  "python-jose[cryptography]==3.3.0" \
  "passlib[bcrypt]==1.7.4" \
  python-multipart==0.0.9 \
  pytesseract==0.3.10 \
  alembic==1.13.1 \
  python-dotenv==1.0.1

echo "✅ All packages installed."
cd ..

# ─────────────────────────────────────────────
# 8. GIT — commit & push to develop
# ─────────────────────────────────────────────
echo ""
echo "🌿 Committing and pushing to develop branch..."
git add .
git commit -m "chore: scaffold LearnLens backend (FastAPI + OCR)"
git checkout -b develop 2>/dev/null || git checkout develop
git push -u origin develop
echo "✅ Pushed to develop."

# ─────────────────────────────────────────────
# 9. SUMMARY
# ─────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  ✅  Backend scaffold complete!          ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "backend/"
echo "├── main.py                    ← FastAPI entry point"
echo "├── requirements.txt"
echo "├── venv/                      ← virtual environment"
echo "├── uploads/"
echo "│   ├── exam_keys/             ← uploaded answer key images"
echo "│   └── answer_sheets/         ← uploaded student paper images"
echo "├── app/"
echo "│   ├── api/routes/"
echo "│   │   ├── auth.py            ← POST /register  POST /login"
echo "│   │   ├── exams.py           ← GET/POST /exams  DELETE /exams/{id}"
echo "│   │   └── papers.py          ← GET/POST /papers  POST /papers/{id}/check"
echo "│   ├── core/"
echo "│   │   ├── config.py          ← env settings"
echo "│   │   ├── database.py        ← SQLAlchemy session"
echo "│   │   └── security.py        ← JWT + bcrypt"
echo "│   ├── models/"
echo "│   │   ├── user.py"
echo "│   │   ├── exam.py"
echo "│   │   └── paper.py"
echo "│   ├── schemas/               ← Pydantic validators"
echo "│   ├── services/              ← business logic"
echo "│   └── ml/"
echo "│       ├── ocr.py             ← OpenCV + Tesseract"
echo "│       └── grader.py          ← answer comparison + scoring"
echo "└── tests/"
echo ""
echo "────────────────────────────────────────────────────"
echo "Next step — copy and fill in your .env:"
echo "  cp ../.env.example .env"
echo ""
echo "Then start the server:"
echo "  cd backend"
echo "  source venv/Scripts/activate"
echo "  uvicorn main:app --reload"
echo "────────────────────────────────────────────────────"
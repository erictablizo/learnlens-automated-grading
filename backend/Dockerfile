# ==============================================================================
# LearnLens Backend Dockerfile
# Python 3.11 + FastAPI + Tesseract OCR + OpenCV Native Libraries
# ==============================================================================
FROM python:3.11-slim

# Prevent Python from writing .pyc files and enable unbuffered stdout
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# 1. Install OS packages: Tesseract OCR engine, English traineddata, and OpenCV C-libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 2. Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt

# 3. Copy application files
COPY . .

# 4. Create directory structure for uploads
RUN mkdir -p uploads/exam_keys uploads/answer_sheets uploads/avatars

EXPOSE 8000

# 5. Start Uvicorn ASGI server
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

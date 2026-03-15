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

import cv2
from PIL import Image
import pytesseract 
import numpy as np

img_infile = r"C:\Users\Eric\OneDrive\Desktop\learnlens-automated-grading\backend\uploads\test_exam_keys\00_Answer_Key.jpg"

img = cv2.imread(img_infile) 

#Binarization 
def grayscale(image):
    return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
gray_image = grayscale(img)

thresh, im_bw = cv2.threshold(gray_image, 150, 255, cv2.THRESH_BINARY)
img_outfile = r"C:\Users\Eric\OneDrive\Desktop\learnlens-automated-grading\backend\uploads\test_exam_keys_with_preprocessing\Binarization\00_Answer_Key_BW.jpg"
cv2.imwrite(img_outfile, im_bw)

#Removal of Noise
img_infile2 = r"C:\Users\Eric\OneDrive\Desktop\learnlens-automated-grading\backend\uploads\test_exam_keys_with_preprocessing\Binarization\00_Answer_Key_BW.jpg"
img2 = cv2.imread(img_infile2) 
def noise_removal(image):
       import numpy as np
       kernel = np.ones((1, 1), np.uint8)
       image = cv2.dilate(image, kernel, iterations=1)
       kernel = np.ones((1, 1), np.uint8)
       image = cv2.erode(image, kernel, iterations=1)
       image = cv2.morphologyEx(image, cv2.MORPH_CLOSE, kernel)
       image = cv2.medianBlur(image, 3)
       return (image)
no_noise = noise_removal(img2)
img_outfile2 = r"C:\Users\Eric\OneDrive\Desktop\learnlens-automated-grading\backend\uploads\test_exam_keys_with_preprocessing\Noise_Removal\00_Answer_Key_No_Noise.jpg"
cv2.imwrite(img_outfile2, no_noise)




#To dilate Image
img_infile3 = r"C:\Users\Eric\OneDrive\Desktop\learnlens-automated-grading\backend\uploads\test_exam_keys_with_preprocessing\Noise_Removal\00_Answer_Key_No_Noise.jpg"
img3 = cv2.imread(img_infile3) 

def thick_font(image):
       import numpy as np
       image = cv2.bitwise_not(image)
       kernel = np.ones((2,2),np.uint8)
       image = cv2.dilate(image, kernel, iterations=2)
       image = cv2.bitwise_not(image)
       return (image)

dilated_image = thick_font(img3)

img_outfile3 = r"C:\Users\Eric\OneDrive\Desktop\learnlens-automated-grading\backend\uploads\test_exam_keys_with_preprocessing\Dilated\00_Answer_Key_Dilated.jpg"

cv2.imwrite(img_outfile3, dilated_image)

# Load image
img_infile5 = r"C:\Users\Eric\OneDrive\Desktop\learnlens-automated-grading\backend\uploads\test_exam_keys_with_preprocessing\Dilated\00_Answer_Key_Dilated.jpg"

img = cv2.imread(img_infile5)
output = img.copy()

# Convert to grayscale
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

# Blur to reduce noise
blur = cv2.GaussianBlur(gray, (9, 9), 2)

# Detect Circles
circles = cv2.HoughCircles(
    blur,
    cv2.HOUGH_GRADIENT,
    dp=1,
    minDist=30,
    param1=100,
    param2=20, 
    minRadius=15,
    maxRadius=20
)

#Detect Letters (Contours) 
_, thresh = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY_INV)

contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

# Store circle info
circle_list = []
if circles is not None:
    circles = np.round(circles[0, :]).astype("int")
    for (x, y, r) in circles:
        circle_list.append((x, y, r))
        cv2.circle(output, (x, y), r, (0, 255, 0), 2)

encircled_letters = []

for (circle_x, circle_y, radius) in circle_list:

    # Create circular mask
    mask = np.zeros(gray.shape, dtype=np.uint8)
    cv2.circle(mask, (circle_x, circle_y), radius, 255, -1)

    roi = cv2.bitwise_and(gray, gray, mask=mask)

    # Crop bounding box of circle
    x1 = max(circle_x - radius, 0)
    y1 = max(circle_y - radius, 0)
    x2 = min(circle_x + radius, gray.shape[1])
    y2 = min(circle_y + radius, gray.shape[0])

    roi_crop = roi[y1:y2, x1:x2]

    # Threshold for better OCR
    _, roi_thresh = cv2.threshold(
        roi_crop, 0, 255,
        cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
    )

    # Read single letter only
    text = pytesseract.image_to_string(
        roi_thresh,
        config="--psm 10 -c tessedit_char_whitelist=ABCDabcd"
    ).strip()

    if text:
        encircled_letters.append((circle_y, circle_x, text))
        cv2.putText(output, text, (circle_x-10, circle_y+5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 0, 0), 2)

# Sort in reading order (top → bottom, left → right)
row_tolerance = 40
encircled_letters.sort(key=lambda item: (item[0] // row_tolerance, item[1]))

print("Encircled Letters:\n")

for idx, (_, _, letter) in enumerate(encircled_letters, start=1):
    print(f"{idx} - {letter}")

#cv2.imshow("Encircled Letters", output)

img_outfile5 = r"C:\Users\Eric\OneDrive\Desktop\learnlens-automated-grading\backend\uploads\test_exam_keys_with_preprocessing\Encircled\00_Answer_Key_Encircled.jpg"
cv2.imwrite(img_outfile5, output)

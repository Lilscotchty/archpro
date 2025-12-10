import { BackendSpecData } from './types';

export const PYTHON_CLOUD_FUNCTION = `import functions_framework
import cv2
import numpy as np
import json
from google.cloud import vision
from google.cloud import storage

# Initialize Clients
vision_client = vision.ImageAnnotatorClient()
storage_client = storage.Client()

def detect_lines_and_labels(image_content):
    """
    Uses OpenCV for lines and Vision API for text.
    Returns structured grid lines with precise coordinates.
    """
    # 1. OpenCV: Detect Vertical & Horizontal Lines
    nparr = np.fromstring(image_content, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    
    # Probabilistic Hough Transform to find lines
    lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=100, minLineLength=100, maxLineGap=10)
    
    verticals = []
    horizontals = []
    
    if lines is not None:
        for line in lines:
            x1, y1, x2, y2 = line[0]
            # Check for Vertical (x coordinates are similar)
            if abs(x1 - x2) < 5 and abs(y1 - y2) > 50:
                verticals.append((x1 + x2) // 2)
            # Check for Horizontal (y coordinates are similar)
            elif abs(y1 - y2) < 5 and abs(x1 - x2) > 50:
                horizontals.append((y1 + y2) // 2)

    # 2. Vision API: Detect Text (Grid Bubbles)
    image = vision.Image(content=image_content)
    response = vision_client.text_detection(image=image)
    texts = response.text_annotations
    
    grid_data = []
    
    # 3. Match Labels to Lines
    # Simple heuristic: Text label (e.g. "A", "1") is usually very close to the line start/end.
    for text in texts[1:]: # Skip the first one (full text)
        label = text.description
        if len(label) > 3: continue # Ignore long text
        
        v_coord = text.bounding_poly.vertices[0].y
        h_coord = text.bounding_poly.vertices[0].x
        
        # Logic to snap label to nearest detected line would go here
        # ...
        
    return {"gridLines": []} # Returned processed structure

@functions_framework.http
def generate_foundation(request):
    """
    Main Entry Point.
    Handles 'detect_grid' action and 'generate_plan' action.
    """
    request_json = request.get_json(silent=True)
    action = request_json.get('action', 'generate_plan')
    
    if action == 'detect_grid':
        # Fetch image from URL or base64
        image_data = request_json.get('imageBase64')
        # Decode base64...
        # result = detect_lines_and_labels(decoded_image)
        return json.dumps({"status": "mock_response_for_demo"}), 200

    # ... (Existing Foundation Generation Logic with Trenches) ...
    
    return 'Action not supported', 400
`;

export const FIRESTORE_SCHEMA = `{
  "collection": "projects",
  "document": "project_uuid_12345",
  "fields": {
    "ownerId": "user_auth_uid",
    "createdAt": "Timestamp",
    "status": "PROCESSING | COMPLETED",
    "originalPlanUrl": "string",
    "gridDefinition": [
      { "id": "uuid", "label": "A", "type": "vertical", "pos": 1450 }
    ],
    "selectedCoordinates": ["A-1", "B-2"],
    "settings": {
      "scale": 100,
      "gridSpacing": 4000,
      "wallWidth": 230,
      "trenchWidth": 600,
      "footingWidth": 1000
    },
    "generatedFoundationUrl": "string"
  }
}`;

export const REQUIREMENTS_TXT = `functions-framework==3.*
firebase-admin==6.2.0
google-cloud-storage==2.10.0
google-cloud-vision==3.4.4
numpy==1.24.3
opencv-python-headless==4.8.0.76
requests==2.31.0
flask==2.3.2`;

export const BACKEND_SPECS: BackendSpecData[] = [
  {
    fileName: 'main.py',
    language: 'python',
    code: PYTHON_CLOUD_FUNCTION,
    description: 'Cloud Function logic using OpenCV for line detection and Vision API for OCR.'
  },
  {
    fileName: 'firestore_schema.json',
    language: 'json',
    code: FIRESTORE_SCHEMA,
    description: 'Data model including project settings.'
  },
  {
    fileName: 'requirements.txt',
    language: 'text',
    code: REQUIREMENTS_TXT,
    description: 'Python dependencies (now includes google-cloud-vision).'
  }
];
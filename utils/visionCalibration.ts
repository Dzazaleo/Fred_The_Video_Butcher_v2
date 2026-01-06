// Access global OpenCV instance
declare var cv: any;

export interface VisionProfile {
  hsvBounds: {
    lower: number[];
    upper: number[];
  };
  geometry: {
    aspectRatio: number;
    coverageRatio: number;
    width: number;
    height: number;
  };
}

/**
 * Analyzes a Reference Screenshot to create a strict detection profile.
 * - Extracts dominant "Purple" from the center 50% ROI.
 * - Calculates geometry (Aspect Ratio) based on the isolated color mask.
 * - Prevents false positives (Blue UI vs Purple Menu) using tight hue tolerances.
 */
export function calibrateReference(image: HTMLImageElement): VisionProfile {
  if (typeof cv === 'undefined') {
    throw new Error("OpenCV is not loaded yet. Please wait for initialization.");
  }

  // 1. Load Image
  const src = cv.imread(image);
  const hsv = new cv.Mat();
  
  // Convert to HSV (Hue is vital for color differentiation)
  cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
  cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);

  // 2. Define Region of Interest (ROI) - Center 50%
  // We assume the user centers the target in the screenshot
  const roiRect = new cv.Rect(
    Math.floor(hsv.cols * 0.25),
    Math.floor(hsv.rows * 0.25),
    Math.floor(hsv.cols * 0.5),
    Math.floor(hsv.rows * 0.5)
  );
  const roi = hsv.roi(roiRect);

  // 3. Color Analysis in ROI
  const channels = new cv.MatVector();
  cv.split(roi, channels);
  const hue = channels.get(0); // Hue Channel
  const sat = channels.get(1); // Saturation Channel

  // Mask out low saturation pixels (whites/greys/blacks) to find "Color"
  // Saturation threshold > 50 (0-255 scale)
  const satMask = new cv.Mat();
  cv.threshold(sat, satMask, 50, 255, cv.THRESH_BINARY);

  // Calculate Mean Hue of the colored parts in the center
  const mean = cv.mean(hue, satMask);
  const dominantHue = mean[0]; // OpenCV Hue is 0-180

  // 4. Define Strict Bounds
  // Target: Purple (approx 135-155). Blue is 120.
  // We use a tight delta (+/- 10) to avoid bleeding into Blue.
  const hueDelta = 10;
  const hMin = Math.max(0, dominantHue - hueDelta);
  const hMax = Math.min(180, dominantHue + hueDelta);

  // S/V are kept loose to account for lighting/transparency, but S must be > 50
  const lowerBound = [hMin, 50, 50, 0];
  const upperBound = [hMax, 255, 255, 255];

  // Cleanup ROI resources
  roi.delete(); channels.delete(); hue.delete(); sat.delete(); satMask.delete();

  // 5. Geometry Extraction (Full Image)
  // Apply the strict color mask to the whole image to find the shape
  const maskFull = new cv.Mat();
  const lowScalar = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), lowerBound);
  const highScalar = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), upperBound);

  cv.inRange(hsv, lowScalar, highScalar, maskFull);

  // Find contours
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(maskFull, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  // Find the largest contour (The Menu Box)
  let maxArea = 0;
  let bestRect = null;
  const totalArea = src.cols * src.rows;

  for (let i = 0; i < contours.size(); ++i) {
    const cnt = contours.get(i);
    const area = cv.contourArea(cnt);
    if (area > maxArea) {
      maxArea = area;
      bestRect = cv.boundingRect(cnt);
    }
  }

  // 6. Calculate Profile Data
  let aspectRatio = 0;
  let coverageRatio = 0;
  let width = 0;
  let height = 0;

  if (bestRect && maxArea > 0) {
    aspectRatio = bestRect.width / bestRect.height;
    coverageRatio = maxArea / totalArea;
    width = bestRect.width;
    height = bestRect.height;
  } else {
    // Fallback if color match completely failed on the reference itself
    console.warn("Calibration: Could not isolate target object in reference image.");
  }

  // 7. Memory Cleanup (Critical)
  src.delete(); 
  hsv.delete(); 
  maskFull.delete();
  lowScalar.delete(); 
  highScalar.delete(); 
  contours.delete(); 
  hierarchy.delete();

  return {
    hsvBounds: {
      lower: lowerBound,
      upper: upperBound
    },
    geometry: {
      aspectRatio,
      coverageRatio,
      width,
      height
    }
  };
}
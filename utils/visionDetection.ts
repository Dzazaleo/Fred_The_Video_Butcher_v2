import { VisionProfile } from './visionCalibration';

// Access global OpenCV instance
declare var cv: any;

/**
 * Scans a frame using strict Spatial Locking and Color Triad verification.
 * 
 * Logic:
 * 1. Find candidates using MENU_DARK (Background).
 * 2. SPATIAL LOCK: Reject if candidate is not in the same relative position as the reference.
 * 3. TRIAD CHECK: Confirm presence of MENU_LIGHT (Header/Selection) and TEXT_WHITE.
 */
export function scanFrame(srcFrame: any, profile: VisionProfile): boolean {
  if (typeof cv === 'undefined') return false;

  let detected = false;

  // Mats to cleanup
  let hsv: any = null;
  let maskDark: any = null;
  let contours: any = null;
  let hierarchy: any = null;
  let lowP: any = null;
  let highP: any = null;
  
  // Inner loop Mats
  let roi: any = null;
  let maskLight: any = null;
  let maskWhite: any = null;
  let lowL: any = null;
  let highL: any = null;
  let lowW: any = null;
  let highW: any = null;

  try {
    // --- Step 1: Background Segmentation ---
    hsv = new cv.Mat();
    cv.cvtColor(srcFrame, hsv, cv.COLOR_RGBA2RGB);
    cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);

    lowP = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), profile.bounds.dark.lower);
    highP = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), profile.bounds.dark.upper);
    maskDark = new cv.Mat();
    
    cv.inRange(hsv, lowP, highP, maskDark);

    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(maskDark, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // --- Step 2: Spatial Lock & Verification ---
    for (let i = 0; i < contours.size(); ++i) {
      const contour = contours.get(i);
      const rect = cv.boundingRect(contour);
      
      // Calculate Normalized Geometry of Candidate
      const normX = rect.x / srcFrame.cols;
      const normY = rect.y / srcFrame.rows;
      const normW = rect.width / srcFrame.cols;
      const normH = rect.height / srcFrame.rows;

      // SPATIAL LOCK: Check deviation from profile (Tolerance: 15%)
      const target = profile.spatial.normalizedBox;
      const xDiff = Math.abs(normX - target.x);
      const yDiff = Math.abs(normY - target.y);
      const wDiff = Math.abs(normW - target.w);
      const hDiff = Math.abs(normH - target.h);

      if (xDiff > 0.15 || yDiff > 0.15 || wDiff > 0.15 || hDiff > 0.15) {
        continue; // REJECT: Not in the correct position/size
      }

      // --- Step 3: Triad Check (Internal Validation) ---
      // We have the body, now check for "Light Purple" and "White Text" inside
      try {
        roi = hsv.roi(rect);
        const area = rect.width * rect.height;

        // Check A: Menu Light (Header/Selection)
        lowL = new cv.Mat(roi.rows, roi.cols, roi.type(), profile.bounds.light.lower);
        highL = new cv.Mat(roi.rows, roi.cols, roi.type(), profile.bounds.light.upper);
        maskLight = new cv.Mat();
        cv.inRange(roi, lowL, highL, maskLight);
        
        const lightCount = cv.countNonZero(maskLight);
        const lightRatio = lightCount / area;

        // Check B: Text White
        lowW = new cv.Mat(roi.rows, roi.cols, roi.type(), profile.bounds.white.lower);
        highW = new cv.Mat(roi.rows, roi.cols, roi.type(), profile.bounds.white.upper);
        maskWhite = new cv.Mat();
        cv.inRange(roi, lowW, highW, maskWhite);

        const whiteCount = cv.countNonZero(maskWhite);
        const whiteRatio = whiteCount / area;

        // RULE: Both must be present (> 1% coverage)
        if (lightRatio > 0.01 && whiteRatio > 0.01) {
          detected = true;
          // Cleanup loop vars before breaking
          maskLight.delete(); maskWhite.delete();
          lowL.delete(); highL.delete();
          lowW.delete(); highW.delete();
          roi.delete();
          // Clear refs to prevent double delete in finally
          maskLight = null; maskWhite = null; roi = null;
          break; 
        }

        // Cleanup if not detected
        maskLight.delete(); maskLight = null;
        maskWhite.delete(); maskWhite = null;
        lowL.delete(); lowL = null;
        highL.delete(); highL = null;
        lowW.delete(); lowW = null;
        highW.delete(); highW = null;
        roi.delete(); roi = null;

      } catch (err) {
        console.warn("ROI Check Error", err);
      }
    }

  } catch (err) {
    console.error("scanFrame Error", err);
  } finally {
    if (hsv) hsv.delete();
    if (maskDark) maskDark.delete();
    if (contours) contours.delete();
    if (hierarchy) hierarchy.delete();
    if (lowP) lowP.delete();
    if (highP) highP.delete();
    
    // Ensure inner loop mats are gone if error/break occurred
    if (roi) roi.delete();
    if (maskLight) maskLight.delete();
    if (maskWhite) maskWhite.delete();
    if (lowL) lowL.delete();
    if (highL) highL.delete();
    if (lowW) lowW.delete();
    if (highW) highW.delete();
  }

  return detected;
}
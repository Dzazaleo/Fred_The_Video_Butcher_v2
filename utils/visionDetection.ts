import { VisionProfile } from './visionCalibration';

// Access global OpenCV instance
declare var cv: any;

export interface ScanConfig {
  matchingThreshold: number; // Density threshold (e.g., 0.05 for 5%)
}

/**
 * Scans a single video frame for the target UI element defined in the profile.
 * 
 * Algorithm:
 * 1. Color Segmentation (Purple Mask)
 * 2. Geometric Filtering (Area & Aspect Ratio vs Profile)
 * 3. Content Verification (White Text Density)
 * 
 * @param srcFrame - The current video frame (cv.Mat)
 * @param profile - The calibration data (Color bounds + Geometry)
 * @param config - Detection thresholds
 * @returns true if the target is detected
 */
export function scanFrame(
  srcFrame: any, 
  profile: VisionProfile, 
  config: ScanConfig = { matchingThreshold: 0.05 }
): boolean {
  if (typeof cv === 'undefined') return false;

  let detected = false;

  // Mats to be managed for memory cleanup
  let hsv: any = null;
  let maskPurple: any = null;
  let lowP: any = null;
  let highP: any = null;
  let contours: any = null;
  let hierarchy: any = null;
  
  // Inner loop Mats
  let roiWhite: any = null;
  let maskWhite: any = null;
  let lowW: any = null;
  let highW: any = null;

  try {
    // --- Step A: Segmentation (Color) ---
    hsv = new cv.Mat();
    cv.cvtColor(srcFrame, hsv, cv.COLOR_RGBA2RGB);
    cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);

    // Apply strict Purple Bounds from Calibration
    lowP = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), profile.hsvBounds.lower);
    highP = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), profile.hsvBounds.upper);
    maskPurple = new cv.Mat();
    cv.inRange(hsv, lowP, highP, maskPurple);

    // --- Step B: Contour Extraction ---
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(maskPurple, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const frameArea = srcFrame.cols * srcFrame.rows;
    
    // Calculate expected size based on profile coverage ratio
    // We allow the object to be smaller/larger due to camera zoom or different resolutions,
    // but the RELATIVE size should stay somewhat consistent. 
    // We use a loose lower bound (50% of expected coverage).
    const expectedArea = frameArea * profile.geometry.coverageRatio;
    const minArea = expectedArea * 0.5;

    // --- Step C: Geometric Filter ---
    for (let i = 0; i < contours.size(); ++i) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      const rect = cv.boundingRect(contour);

      // 1. Area Check
      if (area < minArea) continue;

      // 2. Aspect Ratio Check
      const currentAspectRatio = rect.width / rect.height;
      const targetAspectRatio = profile.geometry.aspectRatio;
      
      // Calculate deviation percentage
      const deviation = Math.abs(currentAspectRatio - targetAspectRatio) / targetAspectRatio;
      
      // Reject if shape differs by more than 30%
      if (deviation > 0.3) continue;

      // --- Step D: Content Check (White Density) ---
      // If we are here, we have a Purple Box of the correct shape.
      // Now verify it contains "White Text".
      
      try {
        roiWhite = hsv.roi(rect);
        
        // Define White: Low Saturation (< 60), High Value (> 180)
        lowW = new cv.Mat(roiWhite.rows, roiWhite.cols, roiWhite.type(), [0, 0, 180, 0]);
        highW = new cv.Mat(roiWhite.rows, roiWhite.cols, roiWhite.type(), [180, 60, 255, 255]);
        maskWhite = new cv.Mat();
        
        cv.inRange(roiWhite, lowW, highW, maskWhite);

        const whitePixels = cv.countNonZero(maskWhite);
        const density = whitePixels / area;

        // Cleanup inner loop objects immediately
        maskWhite.delete(); maskWhite = null;
        lowW.delete(); lowW = null;
        highW.delete(); highW = null;
        roiWhite.delete(); roiWhite = null;

        if (density > config.matchingThreshold) {
          detected = true;
          break; // Found it!
        }
      } catch (e) {
        console.warn("Error during ROI check", e);
        // Ensure cleanup if error occurred in loop
        if (maskWhite) { maskWhite.delete(); maskWhite = null; }
        if (lowW) { lowW.delete(); lowW = null; }
        if (highW) { highW.delete(); highW = null; }
        if (roiWhite) { roiWhite.delete(); roiWhite = null; }
      }
    }
  } catch (err) {
    console.error("scanFrame Error:", err);
  } finally {
    // --- Cleanup ---
    if (hsv) hsv.delete();
    if (maskPurple) maskPurple.delete();
    if (lowP) lowP.delete();
    if (highP) highP.delete();
    if (contours) contours.delete();
    if (hierarchy) hierarchy.delete();
    
    // Double check inner loop vars are gone
    if (roiWhite) roiWhite.delete();
    if (maskWhite) maskWhite.delete();
    if (lowW) lowW.delete();
    if (highW) highW.delete();
  }

  return detected;
}
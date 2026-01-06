import { useState, useRef, useCallback, useEffect } from 'react';
import { calibrateReference, VisionProfile } from '../utils/visionCalibration';
import { scanFrame } from '../utils/visionDetection';

export interface DetectionEvent {
  timestamp: number;
  confidence: number;
}

interface VisionState {
  isProcessing: boolean;
  progress: number;
  status: 'idle' | 'initializing' | 'calibrating' | 'processing' | 'completed' | 'error';
  detections: DetectionEvent[];
}

// Access global OpenCV instance
declare var cv: any;

export const useVisionEngine = () => {
  const [state, setState] = useState<VisionState>({
    isProcessing: false,
    progress: 0,
    status: 'idle',
    detections: []
  });

  // Refs for processing loop control
  const abortControllerRef = useRef<AbortController | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // Initialize hidden DOM elements
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto'; // Optimize for seeking
    videoElementRef.current = video;

    const canvas = document.createElement('canvas');
    canvasRef.current = canvas;

    return () => {
      // Cleanup
      if (videoElementRef.current) {
        videoElementRef.current.pause();
        videoElementRef.current.removeAttribute('src');
        videoElementRef.current.load();
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const processVideo = useCallback(async (videoUrl: string, referenceImageUrl: string) => {
    // Check for OpenCV availability
    if (typeof cv === 'undefined') {
      console.error("OpenCV is not loaded");
      setState(prev => ({ ...prev, status: 'error' }));
      return;
    }

    // Reset State
    setState({
      isProcessing: true,
      progress: 0,
      status: 'initializing',
      detections: []
    });

    // Setup Abort Controller for cancellation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const { signal } = abortController;

    try {
      // --- Phase 1: Calibration ---
      setState(prev => ({ ...prev, status: 'calibrating' }));
      
      const referenceImage = new Image();
      referenceImage.crossOrigin = "anonymous";
      referenceImage.src = referenceImageUrl;
      
      await new Promise((resolve, reject) => {
        referenceImage.onload = resolve;
        referenceImage.onerror = reject;
      });

      if (signal.aborted) return;

      // Run Calibration Logic
      const profile: VisionProfile = calibrateReference(referenceImage);
      console.log("[VisionEngine] Calibration Profile:", profile);

      // --- Phase 2: Processing Loop ---
      setState(prev => ({ ...prev, status: 'processing' }));
      
      const video = videoElementRef.current!;
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (!ctx) throw new Error("Could not get canvas context");

      // Load Video
      video.src = videoUrl;
      await new Promise((resolve, reject) => {
        video.onloadeddata = resolve;
        video.onerror = reject;
      });

      if (signal.aborted) return;

      const duration = video.duration;
      // Configure scan interval (0.5s as per requirements)
      const interval = 0.5; 
      let currentTime = 0;

      // Processing resolution (Downscale to 640px width for performance)
      const processWidth = 640;
      const scale = processWidth / video.videoWidth;
      const processHeight = video.videoHeight * scale;
      
      canvas.width = processWidth;
      canvas.height = processHeight;

      const newDetections: DetectionEvent[] = [];

      // The Scan Loop
      while (currentTime < duration) {
        if (signal.aborted) break;

        // 1. Seek to timestamp
        video.currentTime = currentTime;
        await new Promise<void>(resolve => {
           const handler = () => {
             video.removeEventListener('seeked', handler);
             resolve();
           };
           video.addEventListener('seeked', handler);
        });

        if (signal.aborted) break;

        // 2. Draw Frame to Canvas
        ctx.drawImage(video, 0, 0, processWidth, processHeight);
        
        // 3. Read Pixels into OpenCV Mat
        const imageData = ctx.getImageData(0, 0, processWidth, processHeight);
        const mat = cv.matFromImageData(imageData);

        // 4. Run Detection Algorithm with Debug Enabled
        const isDetected = scanFrame(mat, profile, true);
        
        // Strict cleanup of frame mat
        mat.delete();

        // 5. Handle Result
        if (isDetected) {
           const event = { timestamp: currentTime, confidence: 1.0 };
           newDetections.push(event);
           // Real-time update
           setState(prev => ({ 
             ...prev, 
             detections: [...newDetections] 
           }));
        }

        // 6. Update Progress
        const progress = Math.min(100, Math.round((currentTime / duration) * 100));
        setState(prev => ({ ...prev, progress }));

        // 7. Yield to main thread (prevent UI freeze)
        await new Promise(r => setTimeout(r, 0));

        // Advance cursor
        currentTime += interval;
      }

      if (!signal.aborted) {
        setState(prev => ({ 
          ...prev, 
          status: 'completed', 
          progress: 100, 
          isProcessing: false 
        }));
      }

    } catch (error) {
      if (!signal.aborted) {
        console.error("[VisionEngine] Processing Error:", error);
        setState(prev => ({ ...prev, status: 'error', isProcessing: false }));
      }
    }
  }, []);

  return {
    ...state,
    processVideo
  };
};
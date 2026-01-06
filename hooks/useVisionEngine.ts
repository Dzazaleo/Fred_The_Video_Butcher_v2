import { useState, useRef, useEffect, useCallback } from 'react';
import { visionWorkerCode } from '../utils/visionWorker';

export interface DetectionEvent {
  timestamp: number;
  confidence: number;
  thumbnailUrl?: string; // Optional: Capture the frame for the UI
}

interface VisionState {
  isProcessing: boolean;
  progress: number; // 0 to 100
  status: 'idle' | 'initializing' | 'calibrating' | 'processing' | 'completed' | 'error';
  detections: DetectionEvent[];
}

export const useVisionEngine = () => {
  const [state, setState] = useState<VisionState>({
    isProcessing: false,
    progress: 0,
    status: 'idle',
    detections: []
  });

  const workerRef = useRef<Worker | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Initialize Worker with OpenCV
  useEffect(() => {
    // Create blob from string to bypass file serving restrictions
    const blob = new Blob(
      [`importScripts('https://docs.opencv.org/4.8.0/opencv.js');`, visionWorkerCode], 
      { type: 'application/javascript' }
    );
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);
    
    worker.onmessage = (e) => {
      if (e.data.type === 'READY') {
        console.log('[Vision] Worker Ready');
      }
    };

    workerRef.current = worker;

    // Create hidden video element
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    videoRef.current = video;

    // Create offscreen canvas
    const canvas = document.createElement('canvas');
    canvasRef.current = canvas;

    return () => {
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      if (videoRef.current) {
        videoRef.current.src = '';
        videoRef.current.load();
      }
    };
  }, []);

  const processVideo = useCallback(async (videoUrl: string, referenceImageUrl: string) => {
    if (!workerRef.current || !videoRef.current || !canvasRef.current) return;

    setState(prev => ({ ...prev, isProcessing: true, status: 'initializing', progress: 0, detections: [] }));

    const worker = workerRef.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx) return;

    // 1. Calibration Phase
    try {
      setState(prev => ({ ...prev, status: 'calibrating' }));
      const img = new Image();
      img.src = referenceImageUrl;
      await new Promise((resolve) => { img.onload = resolve; });
      
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      const calibData = ctx.getImageData(0, 0, img.width, img.height);
      
      worker.postMessage({ type: 'CALIBRATE', payload: calibData }, [calibData.data.buffer]);
    } catch (e) {
      console.error("Calibration failed", e);
    }

    // 2. Video Load Phase
    video.src = videoUrl;
    await new Promise((resolve) => { video.onloadeddata = resolve; });

    // Processing Loop Configuration
    const interval = 0.5; // Seconds
    const duration = video.duration;
    let currentTime = 0;
    
    setState(prev => ({ ...prev, status: 'processing' }));

    // Prepare processing canvas (Downscaled)
    const processWidth = 640;
    const scale = processWidth / video.videoWidth;
    const processHeight = video.videoHeight * scale;
    canvas.width = processWidth;
    canvas.height = processHeight;

    const processNextFrame = () => {
      if (currentTime >= duration) {
        setState(prev => ({ ...prev, isProcessing: false, status: 'completed', progress: 100 }));
        return;
      }

      video.currentTime = currentTime;
    };

    // Handle Seeked Event -> Process Frame
    const onSeeked = () => {
      // Draw to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frameData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Send to worker
      worker.postMessage({ 
        type: 'PROCESS_FRAME', 
        payload: { 
          imageData: frameData, 
          timestamp: currentTime 
        } 
      }, [frameData.data.buffer]);
    };

    // Handle Worker Results
    const onWorkerMessage = (e: MessageEvent) => {
      if (e.data.type === 'FRAME_RESULT') {
        const { detected, timestamp, confidence } = e.data.payload;

        if (detected) {
          setState(prev => ({
            ...prev,
            detections: [...prev.detections, { timestamp, confidence }]
          }));
        }

        // Update progress
        const progress = Math.min(100, Math.round((timestamp / duration) * 100));
        setState(prev => ({ ...prev, progress }));

        // Loop
        currentTime += interval;
        processNextFrame();
      }
    };

    video.addEventListener('seeked', onSeeked);
    worker.addEventListener('message', onWorkerMessage);

    // Start Loop
    processNextFrame();

    // Cleanup listeners when function ends (via closure, tricky but in this scope effectively acts as setup)
    // Note: In a real app we'd need robust cleanup to stop the loop if the component unmounts.
  }, []);

  return {
    ...state,
    processVideo
  };
};
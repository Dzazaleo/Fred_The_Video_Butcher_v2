import React, { useState, useEffect, useCallback } from 'react';
import { VideoDropZone } from './components/VideoDropZone';
import { VideoPreview } from './components/VideoPreview';
import { ReferenceImageDropZone } from './components/ReferenceImageDropZone';
import { VideoAsset, ReferenceAsset } from './types';
import { Clapperboard } from 'lucide-react';

const App: React.FC = () => {
  const [activeAsset, setActiveAsset] = useState<VideoAsset | null>(null);
  const [referenceAsset, setReferenceAsset] = useState<ReferenceAsset | null>(null);

  // Critical Memory Management: Cleanup object URL when component unmounts or asset changes
  useEffect(() => {
    return () => {
      if (activeAsset?.previewUrl) {
        URL.revokeObjectURL(activeAsset.previewUrl);
        console.log(`[Memory] Revoked Video URL: ${activeAsset.previewUrl}`);
      }
    };
  }, [activeAsset]);
  
  const handleFileSelected = useCallback((file: File, url: string) => {
    if (activeAsset) {
      URL.revokeObjectURL(activeAsset.previewUrl);
    }
    setActiveAsset({ file, previewUrl: url });
  }, [activeAsset]);

  const handleReferenceSelected = useCallback((file: File, url: string) => {
    setReferenceAsset({ file, previewUrl: url });
  }, []);

  const handleRemoveVideo = useCallback(() => {
    setActiveAsset(null); 
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Navbar */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded-lg text-white">
              <Clapperboard size={20} />
            </div>
            <h1 className="text-xl font-bold text-slate-100 tracking-tight">Studio<span className="text-blue-500">Ingest</span></h1>
          </div>
          <div className="text-sm text-slate-500">v1.1.0</div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10 space-y-2">
            <h2 className="text-3xl font-bold text-slate-100">
              {activeAsset ? 'Review Footage & Targets' : 'Import Source Footage'}
            </h2>
            <p className="text-slate-400 text-lg">
              {activeAsset 
                ? 'Configure your vision detection targets.' 
                : 'Upload your raw video files to begin the ingestion workflow.'}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            {/* Left Column: Video */}
            <div className="lg:col-span-2 transition-all duration-300">
              {activeAsset ? (
                <VideoPreview asset={activeAsset} onRemove={handleRemoveVideo} />
              ) : (
                <VideoDropZone onFileSelected={handleFileSelected} />
              )}
            </div>

            {/* Right Column: Reference/Configuration */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-800">
                <h3 className="font-semibold text-slate-200 mb-4">Vision Settings</h3>
                <ReferenceImageDropZone onImageLoaded={handleReferenceSelected} />
                
                <div className="mt-6 pt-6 border-t border-slate-800">
                  <div className="text-xs text-slate-500 space-y-2">
                    <p>
                      <span className="font-medium text-slate-400">Status:</span>{' '}
                      {activeAsset && referenceAsset 
                        ? <span className="text-green-500">Ready for processing</span> 
                        : <span className="text-amber-500">Waiting for inputs</span>
                      }
                    </p>
                    <p>
                      Upload a reference screenshot to enable the VisionEngine to track specific UI elements or objects within the footage.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900 mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-6 text-center text-sm text-slate-500">
          <p>&copy; {new Date().getFullYear()} StudioIngest Module. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
import React from 'react';
import { Loader2, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { DetectionEvent } from '../hooks/useVisionEngine';

interface ResultsPanelProps {
  status: string;
  progress: number;
  detections: DetectionEvent[];
}

export const ResultsPanel: React.FC<ResultsPanelProps> = ({ status, progress, detections }) => {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  if (status === 'idle') return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg animate-in slide-in-from-bottom-4 fade-in duration-500">
      <div className="p-6 border-b border-slate-800">
        <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          {status === 'processing' || status === 'initializing' ? (
            <Loader2 className="animate-spin text-blue-500" />
          ) : status === 'completed' ? (
            <CheckCircle2 className="text-green-500" />
          ) : (
            <AlertTriangle className="text-amber-500" />
          )}
          Vision Processing
        </h3>
        
        {/* Progress Bar */}
        <div className="mt-4 w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
          <div 
            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out" 
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-slate-400">
          <span className="capitalize">{status}...</span>
          <span>{progress}%</span>
        </div>
      </div>

      <div className="max-h-[300px] overflow-y-auto p-0">
        {detections.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            {status === 'completed' 
              ? 'No debug menus detected in this footage.' 
              : 'Waiting for detection events...'}
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-950/50 sticky top-0 backdrop-blur-sm">
              <tr>
                <th className="px-6 py-3">Timestamp</th>
                <th className="px-6 py-3">Confidence</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {detections.map((det, idx) => (
                <tr key={idx} className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-3 font-mono text-blue-400 flex items-center gap-2">
                    <Clock size={14} />
                    {formatTime(det.timestamp)}
                  </td>
                  <td className="px-6 py-3 text-slate-300">
                    {(det.confidence * 100).toFixed(1)}%
                  </td>
                  <td className="px-6 py-3">
                    <span className="px-2 py-1 rounded-full bg-purple-900/30 text-purple-400 text-xs border border-purple-900/50">
                      Debug Menu
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      
      {status === 'completed' && detections.length > 0 && (
        <div className="p-4 bg-slate-950 border-t border-slate-800 text-center">
          <p className="text-slate-400 text-xs">
            Found {detections.length} potential occurrences.
          </p>
        </div>
      )}
    </div>
  );
};
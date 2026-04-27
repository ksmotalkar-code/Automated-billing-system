import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, RefreshCcw, X, Check, Loader2 } from 'lucide-react';
import { analyzeMeterImage, MeterReadingResult } from '../lib/meterReader';

interface MeterScannerProps {
  onScan: (result: MeterReadingResult) => void;
  onClose: () => void;
}

export function MeterScanner({ onScan, onClose }: MeterScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        setStream(mediaStream);
      }
      setIsReady(true);
    } catch (err) {
      console.error("Camera error:", err);
      setError("Unable to access camera. Please check permissions.");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const captureAndAnalyze = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setIsAnalyzing(true);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (context) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      const result = await analyzeMeterImage(base64Image);
      
      if (result.error) {
        setError(result.error);
        setIsAnalyzing(false);
      } else {
        onScan(result);
        setIsAnalyzing(false);
        // We don't automatically close so user can see it or retry
      }
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center p-4 md:p-8"
    >
      <div className="relative w-full max-w-lg aspect-[3/4] bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-white/10">
        <video 
          ref={videoRef}
          autoPlay 
          playsInline
          className={`w-full h-full object-cover ${isAnalyzing ? 'opacity-50 grayscale' : ''}`}
        />
        
        {/* Overlay scanning UI */}
        <div className="absolute inset-0 pointer-events-none bg-black/20">
          {/* Main Frame */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-40 border-2 border-white/30 rounded-2xl">
             {/* Corners */}
             <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-blue-500 rounded-tl-lg" />
             <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-blue-500 rounded-tr-lg" />
             <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-blue-500 rounded-bl-lg" />
             <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-blue-500 rounded-br-lg" />
             
             {/* Text Hint */}
             <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs uppercase tracking-widest font-black text-white drop-shadow-md">
                Align Digital Reading Here
             </div>

             {/* Analyzing State Overlay */}
             <AnimatePresence>
               {isAnalyzing && (
                 <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-blue-600/20 backdrop-blur-[2px] rounded-2xl flex flex-col items-center justify-center"
                 >
                    <Loader2 className="w-8 h-8 text-white animate-spin mb-2" />
                    <span className="text-[10px] font-black tracking-tighter text-white uppercase italic">Processing with Gemini AI</span>
                 </motion.div>
               )}
             </AnimatePresence>
          </div>
          
          {/* Animated scanning line - only when active but not analyzing */}
          {!isAnalyzing && (
            <motion.div 
               animate={{ top: ['42%', '58%', '42%'] }}
               transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
               className="absolute left-[calc(50%-144px)] right-[calc(50%-144px)] h-1 bg-gradient-to-r from-transparent via-blue-400 to-transparent shadow-[0_0_20px_#60a5fa] z-10"
            />
          )}
        </div>

        {error && (
          <div className="absolute top-4 left-4 right-4 bg-rose-500 text-white p-3 rounded-xl text-sm font-bold flex items-center gap-2">
            <X className="w-4 h-4 cursor-pointer" onClick={() => setError(null)} />
            {error}
          </div>
        )}

        <div className="absolute top-4 right-4 flex gap-2">
          <button 
            onClick={onClose}
            className="p-3 bg-white/10 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="absolute bottom-10 left-0 right-0 flex justify-center gap-6">
          <button 
            disabled={isAnalyzing || !isReady}
            onClick={captureAndAnalyze}
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
              isAnalyzing ? 'bg-slate-700' : 'bg-white shadow-[0_0_30px_rgba(255,255,255,0.4)] hover:scale-105 active:scale-95'
            }`}
          >
            {isAnalyzing ? (
              <Loader2 className="w-10 h-10 text-white animate-spin" />
            ) : (
              <Camera className="w-10 h-10 text-slate-900" />
            )}
          </button>
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
      
      <div className="mt-8 text-center text-white/60 max-w-sm">
        <p className="text-sm font-medium">AI-Powered Meter Reading</p>
        <p className="text-xs mt-1">Point your camera at a water or electric meter and press the shutter button to automatically extract the reading.</p>
      </div>
    </motion.div>
  );
}

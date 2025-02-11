
import { useState } from "react";
import { Play, Pause, SkipForward, SkipBack } from "lucide-react";

const RecordPlayer = () => {
  const [isPlaying, setIsPlaying] = useState(false);

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto p-8 bg-wood rounded-lg shadow-2xl transform transition-all duration-500 hover:scale-[1.02]">
      <div className="absolute top-4 right-4 flex gap-2">
        <span className="px-3 py-1 bg-brass/20 text-brass-dark rounded-full text-xs font-inter">
          Vintage Series
        </span>
      </div>
      
      {/* Turntable */}
      <div className="relative h-96 bg-wood-dark rounded-lg p-8 overflow-hidden">
        {/* Platter */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-vinyl shadow-lg">
          {/* Record */}
          <div className={`w-full h-full rounded-full border-4 border-vinyl-groove ${isPlaying ? 'animate-spin-slow' : ''} transition-all duration-1000`}>
            {/* Label */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full bg-brass-light flex items-center justify-center">
              <span className="text-vinyl text-xs font-playfair font-semibold">33⅓ RPM</span>
            </div>
          </div>
        </div>

        {/* Tonearm */}
        <div className={`absolute top-12 right-12 w-40 h-4 bg-brass-dark rounded-full origin-right transform transition-all duration-1000 ${isPlaying ? 'rotate-12' : 'rotate-0'}`}>
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-8 bg-brass"></div>
        </div>
      </div>

      {/* Controls */}
      <div className="mt-8 flex items-center justify-center gap-8">
        <button
          className="p-3 rounded-full bg-brass/10 hover:bg-brass/20 transition-colors"
          onClick={() => console.log('Previous')}
        >
          <SkipBack className="w-6 h-6 text-brass-dark" />
        </button>
        
        <button
          className="p-4 rounded-full bg-brass hover:bg-brass-light transition-colors transform hover:scale-105"
          onClick={togglePlay}
        >
          {isPlaying ? (
            <Pause className="w-8 h-8 text-wood-dark" />
          ) : (
            <Play className="w-8 h-8 text-wood-dark" />
          )}
        </button>

        <button
          className="p-3 rounded-full bg-brass/10 hover:bg-brass/20 transition-colors"
          onClick={() => console.log('Next')}
        >
          <SkipForward className="w-6 h-6 text-brass-dark" />
        </button>
      </div>

      {/* Now Playing */}
      <div className="mt-6 text-center">
        <p className="font-playfair text-brass-dark text-sm">Now Playing</p>
        <h2 className="font-playfair text-xl font-semibold mt-1 text-brass">Vintage Vibes</h2>
        <p className="font-inter text-brass-dark/80 text-sm mt-1">Classic Collection</p>
      </div>
    </div>
  );
};

export default RecordPlayer;

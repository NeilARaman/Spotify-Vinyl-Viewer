import { useState, useEffect } from "react";
import { Play, Pause, SkipForward, SkipBack } from "lucide-react";
import { spotifyService } from "../integrations/spotify";

interface RecordPlayerProps {
  isPlaying?: boolean;
  currentTrack?: {
    name: string;
    artist: string;
  };
}

const RecordPlayer = ({ isPlaying = false, currentTrack }: RecordPlayerProps) => {
  const [isControlDisabled, setIsControlDisabled] = useState(false);
  
  const handlePlayPause = async () => {
    if (!spotifyService.isLoggedIn() || isControlDisabled) return;
    
    setIsControlDisabled(true);
    try {
      await spotifyService.togglePlayback();
    } catch (error) {
      console.error('Failed to toggle playback:', error);
    } finally {
      // Re-enable button after a short delay to prevent rapid clicking
      setTimeout(() => setIsControlDisabled(false), 300);
    }
  };

  const handleNext = async () => {
    if (!spotifyService.isLoggedIn() || isControlDisabled) return;
    
    setIsControlDisabled(true);
    try {
      await spotifyService.nextTrack();
    } catch (error) {
      console.error('Failed to skip to next track:', error);
    } finally {
      setTimeout(() => setIsControlDisabled(false), 300);
    }
  };

  const handlePrevious = async () => {
    if (!spotifyService.isLoggedIn() || isControlDisabled) return;
    
    setIsControlDisabled(true);
    try {
      await spotifyService.previousTrack();
    } catch (error) {
      console.error('Failed to go to previous track:', error);
    } finally {
      setTimeout(() => setIsControlDisabled(false), 300);
    }
  };

  // Determine if controls should appear disabled
  const buttonDisabledClass = isControlDisabled ? 'opacity-50 cursor-not-allowed' : '';

  return (
    <div className="relative w-full max-w-2xl mx-auto p-8 bg-wood rounded-lg shadow-2xl transform transition-all duration-500 hover:scale-[1.02]">
      {/* Vintage Series Badge - repositioned to be on top of the box rather than overlapping */}
      <div className="absolute -top-3 right-6 z-10">
        <span className="px-3 py-1 bg-brass text-wood-dark rounded-full text-xs font-semibold shadow-md">
          Vintage Series
        </span>
      </div>
      
      {/* Turntable */}
      <div className="relative h-96 bg-wood-dark rounded-lg p-8 overflow-hidden">
        {/* Platter */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-vinyl shadow-lg">
          {/* Record */}
          <div className={`w-full h-full rounded-full record-groove ${isPlaying ? 'animate-spin-slow' : ''} transition-all duration-1000`}>
            {/* Label */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full bg-brass-light flex items-center justify-center">
              <span className="text-vinyl text-xs font-playfair font-semibold">33⅓ RPM</span>
            </div>
          </div>
        </div>

        {/* Tonearm */}
        <div className={`absolute top-16 right-16 w-48 h-4 bg-brass-dark rounded-full origin-right transform transition-all duration-1000 ${isPlaying ? 'rotate-15' : 'rotate-2'}`}>
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-8 bg-brass"></div>
        </div>
      </div>

      {/* Controls */}
      <div className="mt-8 flex items-center justify-center gap-8">
        <button
          className={`p-3 rounded-full bg-brass/10 hover:bg-brass/20 transition-colors ${buttonDisabledClass}`}
          onClick={handlePrevious}
          disabled={isControlDisabled}
          aria-label="Previous track"
        >
          <SkipBack className="w-6 h-6 text-brass-dark" />
        </button>
        
        <button
          className={`p-4 rounded-full bg-brass hover:bg-brass-light transition-colors transform hover:scale-105 ${buttonDisabledClass}`}
          onClick={handlePlayPause}
          disabled={isControlDisabled}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <Pause className="w-8 h-8 text-wood-dark" />
          ) : (
            <Play className="w-8 h-8 text-wood-dark" />
          )}
        </button>

        <button
          className={`p-3 rounded-full bg-brass/10 hover:bg-brass/20 transition-colors ${buttonDisabledClass}`}
          onClick={handleNext}
          disabled={isControlDisabled}
          aria-label="Next track"
        >
          <SkipForward className="w-6 h-6 text-brass-dark" />
        </button>
      </div>

      {/* Now Playing */}
      <div className="mt-6 text-center">
        <p className="font-playfair text-brass-dark text-sm">Now Playing</p>
        <h2 className="font-playfair text-xl font-semibold mt-1 text-brass line-clamp-1">
          {currentTrack?.name || 'Select a Playlist'}
        </h2>
        <p className="font-inter text-brass-dark/80 text-sm mt-1 line-clamp-1">
          {currentTrack?.artist || 'Your Vinyl Collection'}
        </p>
      </div>
    </div>
  );
};

export default RecordPlayer;

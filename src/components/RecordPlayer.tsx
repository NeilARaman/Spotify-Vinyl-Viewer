import { useState, useEffect, useRef } from "react";
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX } from "lucide-react";
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
  const [isMuteDisabled, setIsMuteDisabled] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showTrackChange, setShowTrackChange] = useState(false);
  const prevTrackRef = useRef<string | undefined>();
  
  // Reset mute state when a new track starts playing
  useEffect(() => {
    if (isPlaying && isMuted) {
      // If playback starts and we're muted, automatically unmute
      handleMuteToggle(false);
    }
  }, [isPlaying, currentTrack]);
  
  // Show visual indicator when track changes
  useEffect(() => {
    const currentTrackName = currentTrack?.name;
    
    // Check if this is an actual track change (not initial load)
    if (prevTrackRef.current && currentTrackName && prevTrackRef.current !== currentTrackName) {
      // Show track change indicator
      setShowTrackChange(true);
      
      // Hide it after a short delay
      const timeout = setTimeout(() => {
        setShowTrackChange(false);
      }, 2000);
      
      return () => clearTimeout(timeout);
    }
    
    // Update the ref for next comparison
    if (currentTrackName) {
      prevTrackRef.current = currentTrackName;
    }
  }, [currentTrack?.name]);

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

  const handleMuteToggle = async (newMuteState: boolean) => {
    if (!spotifyService.isLoggedIn() || isMuteDisabled) return;
    
    // Update UI state immediately for a responsive feel
    setIsMuted(newMuteState);
    
    // Set a brief timeout for the disabled state to prevent double-clicks
    setIsMuteDisabled(true);
    setTimeout(() => setIsMuteDisabled(false), 300);
    
    // Call the service in the background - don't await it
    spotifyService.toggleMute(newMuteState).catch(error => {
      console.error('Failed to toggle mute state:', error);
      // Only revert UI if there's an error
      setIsMuted(!newMuteState);
    });
  };

  // Determine if controls should appear disabled
  const buttonDisabledClass = isControlDisabled ? 'opacity-50 cursor-not-allowed' : '';
  const muteDisabledClass = isMuteDisabled ? 'opacity-50 cursor-not-allowed' : '';

  return (
    <div className="relative w-full max-w-2xl mx-auto p-8 bg-wood rounded-lg shadow-2xl transform transition-all duration-500 hover:scale-[1.02]">
      {/* Vintage Series Badge - repositioned to be on top of the box rather than overlapping */}
      <div className="absolute -top-3 right-6 z-10">
        <span className="px-3 py-1 bg-brass text-wood-dark rounded-full text-xs font-semibold shadow-md">
          Vintage Series
        </span>
      </div>
      
      {/* Track change indicator */}
      {showTrackChange && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-brass-light/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg animate-fade-in">
          <span className="text-wood-dark text-sm font-medium">Now Playing: {currentTrack?.name}</span>
        </div>
      )}
      
      {/* Turntable */}
      <div className="relative h-96 bg-wood-dark rounded-lg p-8 overflow-hidden">
        {/* Platter */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-vinyl shadow-lg">
          {/* Record */}
          <div 
            className={`w-full h-full rounded-full record-groove transition-all duration-300 ${isPlaying ? 'animate-spin-slow' : ''}`}
            style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
          >
            {/* Label */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full bg-brass-light flex items-center justify-center">
              <span className="text-vinyl text-xs font-playfair font-semibold">33⅓ RPM</span>
            </div>
          </div>
        </div>

        {/* Tonearm */}
        <div className={`absolute top-16 right-16 w-48 h-4 bg-brass-dark rounded-full origin-right transform transition-all duration-300 ${isPlaying ? 'rotate-15' : 'rotate-2'}`}>
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-8 bg-brass"></div>
        </div>

        {/* Volume control */}
        <button 
          onClick={() => handleMuteToggle(!isMuted)}
          className={`absolute bottom-4 right-4 p-2 rounded-full ${isMuted ? 'bg-brass/30' : 'bg-brass/10'} hover:bg-brass/30 transition-colors ${muteDisabledClass}`}
          title={isMuted ? "Unmute" : "Mute"}
          disabled={isMuteDisabled}
        >
          {isMuted ? (
            <VolumeX className="w-5 h-5 text-brass-dark" />
          ) : (
            <Volume2 className="w-5 h-5 text-brass-dark" />
          )}
        </button>
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
        <h2 className="font-playfair text-xl font-semibold mt-1 text-brass line-clamp-1 transition-all duration-300">
          {currentTrack?.name || 'Select a Playlist'}
        </h2>
        <p className="font-inter text-brass-dark/80 text-sm mt-1 line-clamp-1 transition-all duration-300">
          {currentTrack?.artist || 'Your Vinyl Collection'}
        </p>
      </div>
    </div>
  );
};

export default RecordPlayer;

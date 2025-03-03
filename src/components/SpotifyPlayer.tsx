import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { spotifyService } from '../integrations/spotify';
import { Loader2 } from 'lucide-react';

interface SpotifyPlayerProps {
  onPlaybackStateChange?: (isPlaying: boolean) => void;
  onTrackChange?: (trackName: string, artistName: string) => void;
}

// Possible states for the player
type PlayerStatus = 
  | 'initializing'   // First load, checking auth
  | 'authenticating' // Handling login callback 
  | 'connecting'     // Setting up player SDK
  | 'ready'          // Player is ready to use
  | 'error';         // Something went wrong

export function SpotifyPlayer({ onPlaybackStateChange, onTrackChange }: SpotifyPlayerProps) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<PlayerStatus>('initializing');
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentPlaylist, setCurrentPlaylist] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [noPlaylists, setNoPlaylists] = useState(false);
  const [playlistsLoaded, setPlaylistsLoaded] = useState(false);
  
  // Check for authentication on component mount
  useEffect(() => {
    const checkAuth = async () => {
      // Handle the callback from Spotify auth
      if (window.location.hash) {
        setStatus('authenticating');
        try {
          const success = spotifyService.handleCallback();
          if (success) {
            // Redirect to home page after successful login
            navigate('/', { replace: true });
            // Skip to connecting since we have a token
            await initializePlayer();
          } else {
            setError('Unable to connect to Spotify. Please try again.');
            setStatus('error');
          }
        } catch (err) {
          console.error('Authentication error:', err);
          setError('Error connecting to Spotify. Please try again.');
          setStatus('error');
        }
      } else if (spotifyService.isLoggedIn()) {
        // Already logged in, initialize player
        await initializePlayer();
      } else {
        // Not logged in, ready to authenticate
        setStatus('ready');
      }
    };
    
    checkAuth();
  }, [navigate]);
  
  // Initialize the player
  const initializePlayer = async () => {
    if (status === 'connecting') return; // Already connecting
    
    setStatus('connecting');
    setError(null);
    
    // Load the Spotify Web Playback SDK
    try {
      if (!document.getElementById('spotify-player')) {
        // Create a promise to track when the SDK is ready
        const sdkReadyPromise = new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.id = 'spotify-player';
          script.src = 'https://sdk.scdn.co/spotify-player.js';
          script.async = true;
          
          // Set timeout for SDK loading
          const timeout = setTimeout(() => {
            reject(new Error('Spotify SDK loading timed out'));
          }, 10000); // 10 second timeout
          
          // Set up global callback
          window.onSpotifyWebPlaybackSDKReady = () => {
            clearTimeout(timeout);
            resolve();
          };
          
          // Handle script load errors
          script.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('Failed to load Spotify SDK'));
          };
          
          document.body.appendChild(script);
        });
        
        // Wait for SDK to be ready
        await sdkReadyPromise;
      }
      
      // Initialize the player once SDK is ready
      const success = await spotifyService.initializePlayer((state) => {
        // Update playing state
        const isCurrentlyPlaying = !state?.paused;
        setIsPlaying(isCurrentlyPlaying);
        onPlaybackStateChange?.(isCurrentlyPlaying);
        
        // Update track info when it changes
        if (state?.track_window?.current_track) {
          const { name, artists } = state.track_window.current_track;
          onTrackChange?.(name, artists[0]?.name || 'Unknown Artist');
        }
      });
      
      if (success) {
        setStatus('ready');
        loadPlaylists();
      } else {
        setError('Please ensure you have Spotify Premium and are logged in with the correct account.');
        setStatus('error');
      }
    } catch (err) {
      console.error('Player initialization error:', err);
      setError('Could not connect to Spotify. Please ensure you have Spotify Premium and try again.');
      setStatus('error');
    }
  };
  
  // Load user playlists
  const loadPlaylists = async () => {
    if (playlistsLoaded) return; // Don't reload if already loaded
    
    try {
      const userPlaylists = await spotifyService.getUserPlaylists();
      setPlaylists(userPlaylists);
      setNoPlaylists(userPlaylists.length === 0);
      setPlaylistsLoaded(true);
    } catch (err) {
      console.error('Failed to load playlists:', err);
      setError('Could not load your playlists. Please try again.');
    }
  };
  
  // Handle login action
  const handleLogin = () => {
    try {
      spotifyService.login();
    } catch (err) {
      console.error('Login error:', err);
      setError('Could not connect to Spotify. Please try again.');
    }
  };
  
  // Play a playlist
  const playPlaylist = async (playlistId: string) => {
    if (status !== 'ready') {
      setError('Player is not ready yet. Please wait a moment and try again.');
      return;
    }
    
    try {
      setCurrentPlaylist(playlistId);
      await spotifyService.playPlaylist(playlistId);
    } catch (err) {
      console.error('Playback error:', err);
      setError('Could not play this playlist. Please try again or choose another playlist.');
      
      // If we get a 403 error, likely not premium
      if (err instanceof Error && err.message.includes('403')) {
        setError('Playback failed. Spotify Premium is required to use the Web Playback SDK.');
      }
    }
  };
  
  const handleRetry = () => {
    // Clear error state
    setError(null);
    // Reset status to initializing
    setStatus('initializing');
    
    // Add a loading state for better user feedback
    const loadingTimeout = setTimeout(() => {
      // If initialization takes too long, show a more specific message
      // Use a function to get the current state to avoid closure issues
      setStatus(currentStatus => {
        if (currentStatus === 'initializing') {
          return 'connecting';
        }
        return currentStatus;
      });
    }, 2000);
    
    // Try to initialize the player again
    initializePlayer()
      .then(success => {
        clearTimeout(loadingTimeout);
        if (!success) {
          setError("Could not connect to Spotify. Please check that you have Spotify Premium and try again.");
          setStatus('error');
        }
      })
      .catch(err => {
        clearTimeout(loadingTimeout);
        console.error("Failed to reinitialize player:", err);
        setError("Failed to connect to Spotify. Please try again or check your Spotify Premium subscription.");
        setStatus('error');
      });
  };
  
  // Render different views based on status
  
  // Loading state
  if (status === 'initializing' || status === 'authenticating' || status === 'connecting') {
    return (
      <div className="flex flex-col items-center justify-center p-10 text-center">
        <Loader2 className="h-12 w-12 animate-spin text-brass mb-4" />
        <h3 className="text-xl font-semibold text-brass mb-2">
          {status === 'initializing' ? 'Checking Spotify connection...' :
           status === 'authenticating' ? 'Connecting to Spotify...' :
           'Starting Spotify player...'}
        </h3>
        <p className="text-brass-dark">
          {status === 'connecting' && 'This may take a moment. Please ensure you have Spotify Premium.'}
        </p>
      </div>
    );
  }
  
  // Error state
  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 bg-wood-light/30 rounded-full flex items-center justify-center mb-4">
          <svg viewBox="0 0 24 24" className="w-8 h-8 text-brass" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-brass mb-2">Connection Issue</h3>
        <p className="text-brass-dark mb-6 max-w-md">{error}</p>
        <div className="flex flex-col space-y-3">
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-brass text-wood-dark rounded-lg hover:bg-brass-light transition-colors font-semibold"
          >
            Try Again
          </button>
          <button
            onClick={handleLogin}
            className="px-6 py-3 bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors flex items-center justify-center space-x-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
            </svg>
            <span>Connect with Spotify</span>
          </button>
        </div>
      </div>
    );
  }
  
  // Not logged in
  if (status === 'ready' && !spotifyService.isLoggedIn()) {
    return (
      <div className="flex flex-col items-center justify-center p-10 text-center">
        <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-6">
          <svg className="w-10 h-10 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
        </div>
        <h3 className="text-2xl font-semibold text-brass mb-2">Connect Your Music</h3>
        <p className="text-brass-dark mb-6 max-w-md">
          Sign in with your Spotify Premium account to play your playlists on this vintage record player.
        </p>
        <button
          onClick={handleLogin}
          className="px-6 py-3 bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors flex items-center space-x-2"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
          </svg>
          <span>Connect with Spotify</span>
        </button>
      </div>
    );
  }
  
  // Ready with playlists
  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-6 text-brass">Your Vinyl Collection</h2>
      
      {noPlaylists && (
        <div className="bg-wood-light/10 backdrop-blur-sm rounded-lg p-6 text-center mb-6">
          <p className="text-brass-dark">
            No playlists found in your Spotify account. Create some playlists and they'll appear here.
          </p>
          <button
            onClick={handleLogin}
            className="mt-4 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm"
          >
            Refresh Playlists
          </button>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {playlists.map((playlist) => (
          <div
            key={playlist.id}
            className={`bg-wood-light/20 backdrop-blur-sm rounded-lg p-4 hover:shadow-lg transition-all cursor-pointer transform hover:scale-105 ${
              currentPlaylist === playlist.id ? 'ring-2 ring-brass' : ''
            }`}
            onClick={() => playPlaylist(playlist.id)}
          >
            {playlist.images?.[0]?.url ? (
              <img
                src={playlist.images[0].url}
                alt={playlist.name}
                className="w-full h-48 object-cover rounded-md mb-4"
              />
            ) : (
              <div className="w-full h-48 bg-brass/20 flex items-center justify-center rounded-md mb-4">
                <span className="text-brass">No Cover</span>
              </div>
            )}
            <h3 className="font-semibold text-lg text-brass">{playlist.name}</h3>
            <p className="text-brass/80">{playlist.tracks.total} tracks</p>
          </div>
        ))}
      </div>
    </div>
  );
} 
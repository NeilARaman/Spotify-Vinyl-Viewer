import { useEffect, useState, useCallback } from 'react';
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
  const [retryCount, setRetryCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  
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
    try {
      if (!spotifyService.isLoggedIn()) {
        console.log('User not logged in, redirecting to login');
        setStatus('authenticating');
        handleLogin();
        return false;
      }
      
      setStatus('connecting');
      console.log('Initializing Spotify player...');
      
      // First, load the Spotify Web Playback SDK if it hasn't been loaded yet
      if (!window.Spotify || !document.getElementById('spotify-player')) {
        console.log('Loading Spotify SDK script...');
        
        // Create a promise to track when the SDK is ready
        const sdkReadyPromise = new Promise<void>((resolve, reject) => {
          // Create script element
          const script = document.createElement('script');
          script.id = 'spotify-player';
          script.src = 'https://sdk.scdn.co/spotify-player.js';
          script.async = true;
          
          // Set timeout for SDK loading
          const timeout = setTimeout(() => {
            reject(new Error('Spotify SDK loading timed out after 20 seconds'));
          }, 20000); // 20 second timeout
          
          // Set up global callback that Spotify calls when SDK is ready
          window.onSpotifyWebPlaybackSDKReady = () => {
            console.log('Spotify SDK is ready');
            clearTimeout(timeout);
            resolve();
          };
          
          // Handle script load errors
          script.onerror = (error) => {
            console.error('Failed to load Spotify SDK:', error);
            clearTimeout(timeout);
            reject(new Error('Failed to load Spotify SDK. Please check your internet connection and try again.'));
          };
          
          document.body.appendChild(script);
        });
        
        try {
          // Wait for SDK to be ready
          await sdkReadyPromise;
          console.log('Spotify SDK loaded successfully');
        } catch (error) {
          console.error('Error loading Spotify SDK:', error);
          setError(error instanceof Error ? error.message : 'Failed to load Spotify SDK');
          setStatus('error');
          return false;
        }
      }
      
      // Add a listener for uncaught promise rejections to catch 404 errors
      const rejectionHandler = (event: PromiseRejectionEvent) => {
        console.error('Uncaught promise rejection in Spotify Player:', event.reason);
        if (event.reason && event.reason.message && 
           (event.reason.message.includes('404') || 
            event.reason.message.includes('Not Found') ||
            event.reason.toString().includes('PlayLoad event failed'))) {
          setError("Spotify API endpoint returned 404 Not Found. This is likely a temporary issue with Spotify's servers.");
          setStatus('error');
        }
      };
      
      window.addEventListener('unhandledrejection', rejectionHandler);
      
      // Initialize the player with a timeout
      const success = await Promise.race([
        spotifyService.initializePlayer((state) => {
          // Update playing state
          const isCurrentlyPlaying = !state?.paused;
          setIsPlaying(isCurrentlyPlaying);
          onPlaybackStateChange?.(isCurrentlyPlaying);
          
          // Update track info when it changes
          if (state?.track_window?.current_track) {
            const { name, artists } = state.track_window.current_track;
            onTrackChange?.(name, artists[0]?.name || 'Unknown Artist');
          }
        }),
        new Promise<boolean>(resolve => setTimeout(() => resolve(false), 30000))
      ]);
      
      // Remove the listener
      window.removeEventListener('unhandledrejection', rejectionHandler);

      if (!success) {
        console.error('Failed to initialize Spotify player');
        
        // Check if there's already an error set from the rejection handler
        if (status !== 'error') {
          setError("Could not connect to Spotify. Please check that you have Spotify Premium and try again.");
          setStatus('error');
        }
        
        return false;
      }

      console.log('Spotify player initialized successfully');
      setStatus('ready');
      // Load playlists after successful player initialization
      loadPlaylists();
      return true;
    } catch (err) {
      console.error('Error initializing Spotify player:', err);
      
      let errorMessage = "Failed to connect to Spotify.";
      if (err instanceof Error) {
        errorMessage = err.message;
        
        // Check for 404 errors
        if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
          errorMessage = "Spotify API endpoint returned 404 Not Found. This is likely a temporary issue with Spotify's servers.";
        }
      }
      
      setError(errorMessage);
      setStatus('error');
      return false;
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
  
  const handleRetry = useCallback(() => {
    // Clear error and reset status
    setError(null);
    setStatus('initializing');
    setIsLoading(true);
    setRetryCount(prev => prev + 1);
    
    // Log the retry attempt
    console.log(`Retry attempt ${retryCount + 1} for Spotify connection`);
    
    // Add a delay before attempting reconnection
    setTimeout(() => {
      // Check if we're still in initialization state
      if (status === 'initializing') {
        console.log('Still initializing after timeout, setting to connecting');
        setStatus('connecting');
      }
      
      console.log('Attempting to reinitialize Spotify player');
      spotifyService.logout(); // Force logout to clear any bad state
      
      // Small delay to ensure tokens are cleared
      setTimeout(() => {
        // Login and then initialize player
        spotifyService.login();
        // Wait a bit before initializing
        setTimeout(() => {
          initializePlayer().catch(error => {
            console.error('Failed to initialize player during retry:', error);
            setError('Failed to connect to Spotify. Please try again.');
            setIsLoading(false);
          });
        }, 1000);
      }, 500);
    }, 1000);
  }, [status, retryCount, initializePlayer]);
  
  // Add a function to analyze errors and determine the most helpful message
  const getErrorMessage = (error: string | null): { message: string, cause: string, solutions: string[] } => {
    if (!error) {
      return {
        message: "Unknown connection error",
        cause: "There was a problem connecting to Spotify",
        solutions: [
          "Check your Spotify Premium subscription",
          "Make sure you're logged into the correct account",
          "Try refreshing the page"
        ]
      };
    }
    
    // SDK loading errors
    if (error.includes('SDK') || error.includes('script')) {
      return {
        message: "Spotify SDK Loading Failed",
        cause: error,
        solutions: [
          "Check your internet connection",
          "Make sure you don't have any content blockers active",
          "Try using a different browser",
          "Clear your browser cache and refresh the page"
        ]
      };
    }
    
    // Error contains 404
    if (error.includes('404') || error.toLowerCase().includes('not found')) {
      return {
        message: "Spotify API Connection Issue",
        cause: "We couldn't reach Spotify's servers (404 Not Found)",
        solutions: [
          "This is likely a temporary Spotify service issue",
          "Wait a few minutes and try again",
          "Try using Spotify in another app to confirm it's working",
          "Try logging out and back in"
        ]
      };
    }
    
    // Error contains timeout
    if (error.toLowerCase().includes('timeout') || error.toLowerCase().includes('timed out')) {
      return {
        message: "Connection Timeout",
        cause: "The connection to Spotify took too long to establish",
        solutions: [
          "Check your internet connection speed",
          "Try again when you have a stronger connection",
          "Disable any VPN or proxy services",
          "Try using a different network"
        ]
      };
    }
    
    // Error contains authentication or token
    if (error.toLowerCase().includes('auth') || error.toLowerCase().includes('token')) {
      return {
        message: "Authentication Problem",
        cause: "There was an issue with your Spotify authentication",
        solutions: [
          "Try logging out and back in",
          "Clear your browser cache and cookies",
          "Make sure you're giving permission to the app when logging in"
        ]
      };
    }
    
    // Error contains premium
    if (error.toLowerCase().includes('premium')) {
      return {
        message: "Spotify Premium Required",
        cause: "This feature requires a Spotify Premium subscription",
        solutions: [
          "Verify you have an active Spotify Premium subscription",
          "Make sure you're logged in with your Premium account",
          "If you just upgraded to Premium, try restarting your browser"
        ]
      };
    }
    
    // Default case
    return {
      message: "Connection Issue",
      cause: error,
      solutions: [
        "Check your Spotify Premium subscription",
        "Make sure you're logged into the correct account",
        "Try refreshing the page",
        "Check that no other device is using your Spotify account"
      ]
    };
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
    const errorInfo = getErrorMessage(error);
    
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 rounded-lg bg-wood-dark/80 backdrop-blur-sm border border-brass/30 shadow-xl">
        <div className="w-16 h-16 mb-6 text-brass">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        
        <h3 className="text-2xl font-bold text-brass mb-2">{errorInfo.message}</h3>
        
        <div className="text-center mb-6 max-w-md">
          <p className="text-brass-light mb-3">{errorInfo.cause}</p>
          <p className="text-sm text-brass/70">
            {error && error.includes('404') 
              ? "This appears to be a temporary issue with Spotify's servers rather than your account." 
              : "To use this feature, you need an active Spotify Premium subscription and must be logged in with your Premium account."}
          </p>
        </div>
        
        <div className="space-y-3 w-full max-w-xs">
          <button
            onClick={handleRetry}
            disabled={isLoading}
            className="w-full px-6 py-3 bg-brass text-wood-dark rounded-md flex items-center justify-center transition-all hover:bg-brass-light disabled:opacity-50 font-medium"
          >
            {isLoading ? (
              <>
                <span className="mr-2 h-4 w-4 rounded-full border-2 border-wood-dark border-t-transparent animate-spin"></span>
                Connecting...
              </>
            ) : (
              <>
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Try Again
              </>
            )}
          </button>
          
          <button
            onClick={() => {
              setIsLoading(true);
              spotifyService.logout(); // First logout to clear any state
              setTimeout(() => {
                spotifyService.login(); // Then login again
              }, 500);
            }}
            disabled={isLoading}
            className="w-full px-6 py-3 bg-wood-light text-brass border border-brass/30 rounded-md flex items-center justify-center transition-all hover:bg-wood disabled:opacity-50 font-medium"
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
            </svg>
            Connect with Spotify
          </button>
          
          <div className="mt-5 pt-4 border-t border-brass/20 text-xs text-brass/60">
            <p className="mb-1">Troubleshooting:</p>
            <ul className="list-disc list-inside space-y-1">
              {errorInfo.solutions.map((solution, index) => (
                <li key={index} className={index === 0 ? "text-brass-light" : ""}>{solution}</li>
              ))}
            </ul>
          </div>
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
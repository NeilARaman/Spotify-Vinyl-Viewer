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
  const [currentTrack, setCurrentTrack] = useState<{ name: string, artist: string } | null>(null);

  // Check for authentication on component mount
  useEffect(() => {
    const checkAuth = async () => {
      // Handle the callback from Spotify auth - now using query params instead of hash
      if (window.location.search && window.location.search.includes('code=')) {
        setStatus('authenticating');
        try {
          // Debug: Check if code verifier exists
          const codeVerifier = localStorage.getItem('spotify_code_verifier');
          console.log('Code verifier exists before callback?', !!codeVerifier);
          if (!codeVerifier) {
            console.log('Missing code verifier! This may be causing the authentication problem.');
          }
          
          const success = await spotifyService.handleCallback();
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

    // Add global error handler to suppress known Spotify SDK messaging error
    const handleGlobalErrors = (event: ErrorEvent) => {
      // Suppress the message channel closed error
      if (event.message && event.message.includes('message channel closed before a response was received')) {
        console.log('Suppressed Spotify SDK message channel error');
        event.preventDefault();
        return true;
      }
      
      // Suppress CloudPlaybackClientError errors related to analytics
      if (event.error && 
          (event.error.toString().includes('CloudPlaybackClientError') || 
           event.error.toString().includes('PlayLoad event failed with status 404') ||
           event.error.toString().includes('Failed to load resource') ||
           event.error.toString().includes('api.spotify.com'))) {
        console.log('Suppressed Spotify SDK analytics error');
        event.preventDefault();
        return true;
      }
      
      return false;
    };

    // Add global unhandled rejection handler to suppress the same error in promises
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      // Check if this is a Spotify SDK error we want to suppress
      if (event.reason && 
          (event.reason.toString().includes('message channel closed before a response was received') ||
           event.reason.toString().includes('CloudPlaybackClientError') ||
           event.reason.toString().includes('PlayLoad event failed with status 404') ||
           event.reason.toString().includes('cpapi.spotify.com') ||
           event.reason.toString().includes('api.spotify.com/v1/me/player/play'))) {
        console.log('Suppressed Spotify SDK promise rejection:', 
                    event.reason.toString().substring(0, 100) + '...');
        event.preventDefault();
        return true;
      }
      return false;
    };

    // Special handling for Brave browser
    const isBrave = (navigator as any).brave !== undefined || 
                   (navigator.userAgent && navigator.userAgent.includes('Brave'));
    
    if (isBrave) {
      console.log('Brave browser detected, adding additional error handling for Spotify SDK');
      
      // Intercept fetch calls to cpapi.spotify.com to prevent 404 errors
      const originalFetch = window.fetch;
      window.fetch = async function(input: RequestInfo | URL, init?: RequestInit) {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        
        // If this is a request to Spotify's analytics endpoint, handle specially
        if (url.includes('cpapi.spotify.com') || url.includes('event/item_before_load')) {
          try {
            const response = await originalFetch(input, init);
            
            // If we get a 404 or 400, return a fake successful response
            if (response.status === 404 || response.status === 400) {
              console.log(`Intercepted ${response.status} response for ${url.split('?')[0]}`);
              return new Response(JSON.stringify({success: true}), {
                status: 200,
                headers: {'Content-Type': 'application/json'}
              });
            }
            return response;
          } catch (error) {
            console.log(`Intercepted fetch error for ${url.split('?')[0]}`);
            // Return a fake successful response instead of throwing
            return new Response(JSON.stringify({success: true}), {
              status: 200,
              headers: {'Content-Type': 'application/json'}
            });
          }
        }
        
        // Pass through normal requests
        return originalFetch(input, init);
      };
    }

    // Register error handlers
    window.addEventListener('error', handleGlobalErrors);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    // Clean up
    return () => {
      window.removeEventListener('error', handleGlobalErrors);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [navigate]);

  // Call onPlaybackStateChange when isPlaying changes
  useEffect(() => {
    if (onPlaybackStateChange) {
      onPlaybackStateChange(isPlaying);
    }
  }, [isPlaying, onPlaybackStateChange]);

  // Call onTrackChange when currentTrack changes
  useEffect(() => {
    if (currentTrack && onTrackChange) {
      onTrackChange(currentTrack.name, currentTrack.artist);
    }
  }, [currentTrack, onTrackChange]);

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
          
          // Update track info if available
          if (state?.track_window?.current_track) {
            const { name, artists } = state.track_window.current_track;
            setCurrentTrack({
              name,
              artist: artists[0]?.name || 'Unknown Artist'
            });
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
      // The login method in spotifyService will handle checking for the force_login flag
      spotifyService.login();
    } catch (err) {
      console.error('Login error:', err);
      setError('Could not connect to Spotify. Please try again.');
    }
  };

  // Handle logout action
  const handleLogout = useCallback(() => {
    try {
      console.log('Logging out of Spotify...');
      spotifyService.logout();
      
      // Reload the page to reset the UI state
      window.location.reload();
    } catch (err) {
      console.error('Logout error:', err);
      setError('Error during logout. Please try again.');
    }
  }, []);

  // Play a playlist
  const playPlaylist = async (playlistId: string) => {
    if (status !== 'ready') {
      setError('Player is not ready yet. Please wait a moment and try again.');
      return;
    }
    
    try {
      setCurrentPlaylist(playlistId);
      setIsLoading(true);
      console.log(`Attempting to play playlist: ${playlistId}`);
      
      await spotifyService.playPlaylist(playlistId);
      
      // Clear any previous errors if playback succeeds
      setError(null);
    } catch (err) {
      console.error('Playback error:', err);
      let errorMessage = 'Could not play this playlist. Please try again or choose another playlist.';
      
      if (err instanceof Error) {
        const errMsg = err.message.toLowerCase();
        
        // Check for specific errors
        if (errMsg.includes('403') || errMsg.includes('forbidden')) {
          errorMessage = 'Playback failed. Spotify Premium is required to use the Web Playback SDK.';
        } else if (errMsg.includes('404') || errMsg.includes('not found')) {
          errorMessage = 'This content could not be found. It may have been removed or made private.';
        } else if (errMsg.includes('400') || errMsg.includes('bad request')) {
          // For liked songs, provide specific guidance
          if (playlistId === 'liked-songs') {
            errorMessage = 'Could not play Liked Songs. Please try refreshing the page or logging out and back in.';
          } else {
            errorMessage = 'Invalid request. The playlist may be empty or unavailable.';
          }
        } else if (errMsg.includes('401') || errMsg.includes('unauthorized')) {
          // Force logout and re-login for auth issues
          errorMessage = 'Your Spotify session has expired. Please log in again.';
          spotifyService.logout();
          setTimeout(() => handleLogin(), 1500);
        }
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
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
  
  // Helper function to analyze error messages
  const getErrorMessage = (error: Error | string): { title: string, cause: string, solutions: string[] } => {
    const errorStr = error instanceof Error ? error.message : error;
    
    // SDK not loaded error
    if (errorStr.includes('SDK') && (errorStr.includes('loading') || errorStr.includes('timed out') || errorStr.includes('not loaded'))) {
      return {
        title: 'Failed to load Spotify SDK',
        cause: 'The Spotify Web Playback SDK script could not be loaded.',
        solutions: [
          'Check your internet connection',
          'Disable any content blockers or ad blockers',
          'Try using a different browser',
          'Clear your browser cache'
        ]
      };
    }
    
    // CloudPlaybackClientError with 404
    if (errorStr.includes('CloudPlaybackClient') || errorStr.includes('PlayLoad event failed with status 404')) {
      return {
        title: 'Spotify Connection Issue',
        cause: 'The Spotify Web Player had trouble communicating with Spotify servers.',
        solutions: [
          'Log out and log back in',
          'Make sure you have Spotify Premium',
          'Try disabling any VPN or proxy',
          'Use a different browser or clear your cache',
          'Check if Spotify services are experiencing issues'
        ]
      };
    }
    
    // Premium Required Error
    if (errorStr.includes('Premium') || errorStr.includes('forbidden') || errorStr.includes('403')) {
      return {
        title: 'Spotify Premium Required',
        cause: 'The Spotify Web Playback SDK requires a Spotify Premium subscription.',
        solutions: [
          'Upgrade to Spotify Premium',
          'If you already have Spotify Premium, try logging out and back in',
          'Check if your subscription is active'
        ]
      };
    }
    
    // Default error message
    return {
      title: 'Connection Issue',
      cause: 'Could not connect to Spotify.',
      solutions: [
        'Check your internet connection',
        'Try again in a few moments',
        'Log out and log back in'
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
    // Analyze the error message to provide better guidance
    const errorDetails = getErrorMessage(error || 'Unknown error');
    
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full">
        <div className="bg-wood-light/10 backdrop-blur-sm rounded-lg p-8 max-w-md w-full text-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-16 h-16 mx-auto mb-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          
          <h3 className="text-xl font-bold text-brass mb-2">{errorDetails.title}</h3>
          <p className="text-brass-dark mb-4">{errorDetails.cause}</p>
          
          {errorDetails.solutions.length > 0 && (
            <div className="mb-6 text-left">
              <p className="font-semibold text-brass-dark mb-2">Try these solutions:</p>
              <ul className="list-disc pl-5 text-brass-dark">
                {errorDetails.solutions.map((solution, index) => (
                  <li key={index} className="mb-1">{solution}</li>
                ))}
              </ul>
            </div>
          )}
          
          <div className="flex flex-col gap-2">
            <button
              onClick={handleRetry}
              disabled={isLoading}
              className="px-6 py-3 bg-brass text-dark-wood rounded-lg hover:bg-brass/80 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin w-5 h-5" />
                  <span>Reconnecting...</span>
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 2v6h-6"></path>
                    <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
                    <path d="M3 22v-6h6"></path>
                    <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
                  </svg>
                  <span>Try Again</span>
                </>
              )}
            </button>
            
        <button
              onClick={handleLogout}
              className="flex items-center space-x-1 bg-amber-800/30 text-amber-400 hover:text-amber-300 py-1.5 px-3 rounded-md font-medium"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
              <span>Logout</span>
            </button>
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
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-brass">Your Vinyl Collection</h2>
        
        {/* Logout button */}
        {spotifyService.isLoggedIn() && (
          <button
            onClick={handleLogout}
            className="flex items-center space-x-1 bg-amber-800/30 text-amber-400 hover:text-amber-300 py-1.5 px-3 rounded-md font-medium"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span>Logout</span>
          </button>
        )}
      </div>
      
      {noPlaylists && (
        <div className="bg-wood-light/10 backdrop-blur-sm rounded-lg p-6 text-center mb-6 min-h-[120px]">
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
            {playlist.type === 'liked-songs' ? (
              // Special visual treatment for Liked Songs
              <div className="w-full h-48 bg-gradient-to-br from-purple-700 to-blue-400 rounded-md mb-4 flex items-center justify-center">
                <div className="text-white flex flex-col items-center">
                  <svg className="w-20 h-20 mb-2" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                  <span className="font-semibold text-xl">Liked Songs</span>
                </div>
              </div>
            ) : (
              <img
                src={playlist.images?.[0]?.url ? playlist.images[0].url : '/default-playlist.jpg'}
                alt={playlist.name}
                className="w-full h-48 object-cover rounded-md mb-4"
              />
            )}
            <h3 className="font-semibold text-lg text-brass">
              {playlist.type === 'liked-songs' ? 'Liked Songs' : playlist.name}
            </h3>
            <p className="text-brass/80">{playlist.tracks?.total || 0} tracks</p>
          </div>
        ))}
      </div>
    </div>
  );
} 
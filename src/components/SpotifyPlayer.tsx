import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { spotifyService } from '../integrations/spotify';
import { Loader2 } from 'lucide-react';

interface SpotifyPlayerProps {
  onPlaybackStateChange?: (isPlaying: boolean) => void;
  onTrackChange?: (trackName: string, artistName: string) => void;
}

export function SpotifyPlayer({ onPlaybackStateChange, onTrackChange }: SpotifyPlayerProps) {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPlaylist, setCurrentPlaylist] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Handle the callback from Spotify auth
    if (window.location.hash) {
      console.log('SpotifyPlayer: Found hash in URL, attempting callback handling');
      console.log('SpotifyPlayer: Hash content:', window.location.hash);
      
      try {
        const success = spotifyService.handleCallback();
        console.log('SpotifyPlayer: Callback handling result:', success);
        
        if (success) {
          console.log('SpotifyPlayer: Login successful, redirecting home');
          setIsLoggedIn(true);
          // Navigate back to home page after successful login
          navigate('/', { replace: true });
        } else {
          console.error('SpotifyPlayer: Failed to get access token from Spotify');
          setError('Failed to get access token from Spotify. Please try logging in again.');
        }
      } catch (err) {
        console.error('SpotifyPlayer: Error handling Spotify callback:', err);
        setError('Error handling Spotify authentication. Please try again.');
      }
    } else {
      console.log('SpotifyPlayer: No hash in URL, checking if already logged in');
    }

    // Check if already logged in
    const isAlreadyLoggedIn = spotifyService.isLoggedIn();
    console.log('SpotifyPlayer: Already logged in status:', isAlreadyLoggedIn);
    
    if (isAlreadyLoggedIn) {
      setIsLoggedIn(true);
      initializePlayer();
    }
    
    setIsLoading(false);
  }, [navigate]);

  useEffect(() => {
    if (isLoggedIn) {
      loadPlaylists();
      initializePlayer();
    }
  }, [isLoggedIn]);

  const initializePlayer = async () => {
    // Load the Spotify Web Playback SDK
    if (!document.getElementById('spotify-player')) {
      const script = document.createElement('script');
      script.id = 'spotify-player';
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;

      // Add event listener for when the SDK is ready
      window.onSpotifyWebPlaybackSDKReady = async () => {
        const success = await spotifyService.initializePlayer((state) => {
          // Update playing state
          setIsPlaying(!state?.paused);
          onPlaybackStateChange?.(!state?.paused);

          // Update track info
          if (state?.track_window?.current_track) {
            const { name, artists } = state.track_window.current_track;
            onTrackChange?.(name, artists[0]?.name || 'Unknown Artist');
          }
        });
        
        if (success) {
          setIsPlayerReady(true);
        } else {
          setError('Failed to initialize Spotify player. Please ensure you have Spotify Premium.');
        }
      };

      document.body.appendChild(script);
    }
  };

  const loadPlaylists = async () => {
    setIsLoading(true);
    try {
      const userPlaylists = await spotifyService.getUserPlaylists();
      setPlaylists(userPlaylists);
    } catch (err) {
      console.error('Error loading playlists:', err);
      setError('Failed to load your playlists. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = () => {
    console.log('SpotifyPlayer: Initiating Spotify login');
    try {
      spotifyService.login();
    } catch (err) {
      console.error('SpotifyPlayer: Login error:', err);
      setError('Error initiating Spotify login. Please try again.');
    }
  };

  const playPlaylist = async (playlistId: string) => {
    if (!isPlayerReady) {
      setError('Player not ready yet. Please wait a moment and try again.');
      return;
    }
    
    try {
      setIsLoading(true);
      setCurrentPlaylist(playlistId);
      await spotifyService.playPlaylist(playlistId);
    } catch (err) {
      console.error('Error playing playlist:', err);
      setError('Failed to play playlist. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-brass" />
        <p className="mt-4 text-brass-dark">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <p className="text-red-500 mb-4">{error}</p>
        <button
          onClick={() => setError(null)}
          className="px-4 py-2 mb-2 bg-brass-light text-wood-dark rounded-lg hover:bg-brass transition-colors"
        >
          Dismiss
        </button>
        <button
          onClick={handleLogin}
          className="px-6 py-3 bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors"
        >
          Reconnect with Spotify
        </button>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <button
          onClick={handleLogin}
          className="px-6 py-3 bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors"
        >
          Connect with Spotify
        </button>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-6 text-brass">Your Vinyl Collection</h2>
      {!isPlayerReady && (
        <p className="text-yellow-600 mb-4">Initializing Spotify player... Please ensure you have Spotify Premium to play music.</p>
      )}
      {playlists.length === 0 && !isLoading && (
        <p className="text-brass-dark mb-4">No playlists found. Create some playlists in your Spotify account to see them here.</p>
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
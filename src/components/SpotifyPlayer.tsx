import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { spotifyService } from '../integrations/spotify';

export function SpotifyPlayer() {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPlaylist, setCurrentPlaylist] = useState<string | null>(null);

  useEffect(() => {
    // Handle the callback from Spotify auth
    if (window.location.hash) {
      console.log('Found hash in URL, attempting callback handling');
      try {
        const success = spotifyService.handleCallback();
        console.log('Callback handling result:', success);
        if (success) {
          setIsLoggedIn(true);
          // Navigate back to home page after successful login
          navigate('/', { replace: true });
        } else {
          setError('Failed to get access token from Spotify');
        }
      } catch (err) {
        console.error('Error handling Spotify callback:', err);
        setError('Error handling Spotify authentication');
      }
    }

    // Check if already logged in
    const isAlreadyLoggedIn = spotifyService.isLoggedIn();
    console.log('Already logged in:', isAlreadyLoggedIn);
    if (isAlreadyLoggedIn) {
      setIsLoggedIn(true);
      initializePlayer();
    }
  }, [navigate]);

  useEffect(() => {
    if (isLoggedIn) {
      loadPlaylists();
      initializePlayer();
    }
  }, [isLoggedIn]);

  const initializePlayer = async () => {
    console.log('Initializing Spotify player...');
    // Load the Spotify Web Playback SDK
    if (!document.getElementById('spotify-player')) {
      const script = document.createElement('script');
      script.id = 'spotify-player';
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;

      // Add event listener for when the SDK is ready
      window.onSpotifyWebPlaybackSDKReady = async () => {
        console.log('Spotify Web Playback SDK Ready');
        const success = await spotifyService.initializePlayer();
        console.log('Player initialization result:', success);
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
    const userPlaylists = await spotifyService.getUserPlaylists();
    setPlaylists(userPlaylists);
  };

  const handleLogin = () => {
    spotifyService.login();
  };

  const playPlaylist = async (playlistId: string) => {
    if (!isPlayerReady) {
      console.log('Player not ready yet');
      return;
    }
    
    try {
      setCurrentPlaylist(playlistId);
      await spotifyService.playPlaylist(playlistId);
      console.log('Started playing playlist:', playlistId);
    } catch (err) {
      console.error('Error playing playlist:', err);
      setError('Failed to play playlist. Please try again.');
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <p className="text-red-500 mb-4">{error}</p>
        <button
          onClick={handleLogin}
          className="px-6 py-3 bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors"
        >
          Try Again
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {playlists.map((playlist) => (
          <div
            key={playlist.id}
            className={`bg-wood-light/20 backdrop-blur-sm rounded-lg p-4 hover:shadow-lg transition-all cursor-pointer transform hover:scale-105 ${
              currentPlaylist === playlist.id ? 'ring-2 ring-brass' : ''
            }`}
            onClick={() => playPlaylist(playlist.id)}
          >
            {playlist.images?.[0]?.url && (
              <img
                src={playlist.images[0].url}
                alt={playlist.name}
                className="w-full h-48 object-cover rounded-md mb-4"
              />
            )}
            <h3 className="font-semibold text-lg text-brass">{playlist.name}</h3>
            <p className="text-brass/80">{playlist.tracks.total} tracks</p>
          </div>
        ))}
      </div>
    </div>
  );
} 
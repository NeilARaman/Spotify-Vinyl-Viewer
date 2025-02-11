import { useEffect, useState } from 'react';
import { spotifyService } from '../integrations/spotify';

export function SpotifyPlayer() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [isPlayerReady, setIsPlayerReady] = useState(false);

  useEffect(() => {
    // Handle the callback from Spotify auth
    if (window.location.hash) {
      const success = spotifyService.handleCallback();
      if (success) {
        setIsLoggedIn(true);
        initializePlayer();
      }
    }

    // Check if already logged in
    setIsLoggedIn(spotifyService.isLoggedIn());
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      loadPlaylists();
    }
  }, [isLoggedIn]);

  const initializePlayer = async () => {
    // Load the Spotify Web Playback SDK
    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    document.body.appendChild(script);

    window.onSpotifyWebPlaybackSDKReady = async () => {
      const success = await spotifyService.initializePlayer();
      setIsPlayerReady(success);
    };
  };

  const loadPlaylists = async () => {
    const userPlaylists = await spotifyService.getUserPlaylists();
    setPlaylists(userPlaylists);
  };

  const handleLogin = () => {
    spotifyService.login();
  };

  const playPlaylist = (playlistId: string) => {
    spotifyService.playPlaylist(playlistId);
  };

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
      <h2 className="text-2xl font-bold mb-6">Your Spotify Playlists</h2>
      {!isPlayerReady && (
        <p className="text-yellow-600">Initializing Spotify player...</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {playlists.map((playlist) => (
          <div
            key={playlist.id}
            className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => playPlaylist(playlist.id)}
          >
            {playlist.images?.[0]?.url && (
              <img
                src={playlist.images[0].url}
                alt={playlist.name}
                className="w-full h-48 object-cover rounded-md mb-4"
              />
            )}
            <h3 className="font-semibold text-lg">{playlist.name}</h3>
            <p className="text-gray-600">{playlist.tracks.total} tracks</p>
          </div>
        ))}
      </div>
    </div>
  );
} 
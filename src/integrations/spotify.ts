const SPOTIFY_CLIENT_ID = 'd0469a1618e4427b87de47779818f74c';
const REDIRECT_URI = 'https://spotify-vinyl-project.vercel.app/callback';

const SCOPES = [
  'user-read-private',
  'user-read-email',
  'playlist-read-private',
  'playlist-read-collaborative',
  'streaming',
  'user-read-playback-state',
  'user-modify-playback-state'
];

console.log('Spotify Auth URL:', `https://accounts.spotify.com/authorize?client_id=${SPOTIFY_CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPES.join(' '))}`);

export class SpotifyService {
  private static instance: SpotifyService;
  private accessToken: string | null = null;
  private player: Spotify.Player | null = null;

  private constructor() {}

  static getInstance(): SpotifyService {
    if (!SpotifyService.instance) {
      SpotifyService.instance = new SpotifyService();
    }
    return SpotifyService.instance;
  }

  login() {
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${SPOTIFY_CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(
      REDIRECT_URI
    )}&scope=${encodeURIComponent(SCOPES.join(' '))}`;
    console.log('Attempting login with URL:', authUrl);
    window.location.href = authUrl;
  }

  handleCallback() {
    console.log('Handling callback with hash:', window.location.hash);
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    this.accessToken = params.get('access_token');
    console.log('Got access token:', this.accessToken ? 'yes' : 'no');
    if (this.accessToken) {
      localStorage.setItem('spotify_access_token', this.accessToken);
      return true;
    }
    return false;
  }

  async initializePlayer(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!window.Spotify) {
        resolve(false);
        return;
      }

      this.player = new window.Spotify.Player({
        name: 'Vinyl Smooth Player',
        getOAuthToken: (cb) => {
          cb(this.accessToken || '');
        }
      });

      this.player.connect().then((success) => {
        resolve(success);
      });
    });
  }

  async getUserPlaylists(): Promise<any[]> {
    if (!this.accessToken) return [];
    
    try {
      const response = await fetch('https://api.spotify.com/v1/me/playlists', {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });
      const data = await response.json();
      return data.items || [];
    } catch (error) {
      console.error('Error fetching playlists:', error);
      return [];
    }
  }

  async playPlaylist(playlistId: string) {
    if (!this.player || !this.accessToken) return;

    try {
      await fetch(`https://api.spotify.com/v1/me/player/play`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          context_uri: `spotify:playlist:${playlistId}`
        })
      });
    } catch (error) {
      console.error('Error playing playlist:', error);
    }
  }

  isLoggedIn(): boolean {
    return !!this.accessToken;
  }
}

export const spotifyService = SpotifyService.getInstance(); 
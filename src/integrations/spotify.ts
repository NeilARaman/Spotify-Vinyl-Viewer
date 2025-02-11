const SPOTIFY_CLIENT_ID = 'd0469a1618e4427b87de47779818f74c';
const REDIRECT_URI = 'https://spotify-vinyl-project.vercel.app/callback';

const SCOPES = [
  'user-read-private',
  'user-read-email',
  'playlist-read-private',
  'playlist-read-collaborative',
  'streaming',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing'
];

console.log('Spotify Auth URL:', `https://accounts.spotify.com/authorize?client_id=${SPOTIFY_CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPES.join(' '))}`);

export class SpotifyService {
  private static instance: SpotifyService;
  private accessToken: string | null = null;
  private player: Spotify.Player | null = null;
  private deviceId: string | null = null;
  private stateCallback: ((state: Spotify.PlaybackState | null) => void) | null = null;

  private constructor() {
    // Try to restore the access token from localStorage
    const storedToken = localStorage.getItem('spotify_access_token');
    if (storedToken) {
      this.accessToken = storedToken;
    }
  }

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

  async initializePlayer(onStateChange?: (state: Spotify.PlaybackState | null) => void): Promise<boolean> {
    return new Promise((resolve) => {
      if (!window.Spotify) {
        console.error('Spotify SDK not loaded');
        resolve(false);
        return;
      }

      this.stateCallback = onStateChange || null;

      this.player = new window.Spotify.Player({
        name: 'Vinyl Smooth Player',
        getOAuthToken: (cb) => {
          cb(this.accessToken || '');
        },
        volume: 0.5
      });

      // Error handling
      this.player.addListener('initialization_error', ({ message }) => {
        console.error('Failed to initialize:', message);
        resolve(false);
      });

      this.player.addListener('authentication_error', ({ message }) => {
        console.error('Failed to authenticate:', message);
        resolve(false);
      });

      this.player.addListener('account_error', ({ message }) => {
        console.error('Failed to validate Spotify account:', message);
        resolve(false);
      });

      // Playback status updates
      this.player.addListener('player_state_changed', (state) => {
        console.log('Player State Changed:', state);
        if (this.stateCallback) {
          this.stateCallback(state);
        }
      });

      // Ready
      this.player.addListener('ready', ({ device_id }) => {
        console.log('Ready with Device ID:', device_id);
        this.deviceId = device_id;
        resolve(true);
      });

      // Connect to the player
      this.player.connect();
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
    if (!this.player || !this.accessToken || !this.deviceId) {
      console.error('Player not ready:', { 
        player: !!this.player, 
        token: !!this.accessToken, 
        deviceId: !!this.deviceId 
      });
      return;
    }

    try {
      await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${this.deviceId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          context_uri: `spotify:playlist:${playlistId}`,
          position_ms: 0
        })
      });
      console.log('Started playback of playlist:', playlistId);
    } catch (error) {
      console.error('Error playing playlist:', error);
      throw error;
    }
  }

  isLoggedIn(): boolean {
    return !!this.accessToken;
  }

  async togglePlayback(): Promise<void> {
    if (!this.player) return;
    const state = await this.player.getCurrentState();
    if (state?.paused) {
      await this.player.resume();
    } else {
      await this.player.pause();
    }
  }

  async nextTrack(): Promise<void> {
    if (!this.player) return;
    await this.player.nextTrack();
  }

  async previousTrack(): Promise<void> {
    if (!this.player) return;
    await this.player.previousTrack();
  }
}

export const spotifyService = SpotifyService.getInstance(); 
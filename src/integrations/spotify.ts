// Hardcoded values that are known to work
const SPOTIFY_CLIENT_ID = 'd0469a1618e4427b87de47779818f74c';
// For production, use the hardcoded URL, for development use the current origin
const REDIRECT_URI = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? `${window.location.origin}/callback`
  : 'https://spotify-vinyl-project.vercel.app/callback';

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

// Console log the actual redirect URL being used - can be removed after debugging
console.log('Using Spotify redirect URL:', REDIRECT_URI);

console.log('Spotify Auth URL:', `https://accounts.spotify.com/authorize?client_id=${SPOTIFY_CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPES.join(' '))}`);

export class SpotifyService {
  private static instance: SpotifyService;
  private accessToken: string | null = null;
  private tokenExpiration: number | null = null;
  private player: Spotify.Player | null = null;
  private deviceId: string | null = null;
  private stateCallback: ((state: Spotify.PlaybackState | null) => void) | null = null;

  private constructor() {
    // Try to restore the access token from localStorage
    const storedToken = localStorage.getItem('spotify_access_token');
    const storedExpiration = localStorage.getItem('spotify_token_expiration');
    
    if (storedToken && storedExpiration) {
      const expirationTime = parseInt(storedExpiration, 10);
      
      // Check if token is still valid (with 5-minute buffer)
      if (Date.now() < expirationTime - 300000) {
        this.accessToken = storedToken;
        this.tokenExpiration = expirationTime;
      } else {
        // Clear expired token
        localStorage.removeItem('spotify_access_token');
        localStorage.removeItem('spotify_token_expiration');
      }
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
    
    console.log('Redirecting to Spotify auth with URL:', authUrl);
    window.location.href = authUrl;
  }

  handleCallback() {
    console.log('Handling callback with hash:', window.location.hash);
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    this.accessToken = params.get('access_token');
    const expiresIn = params.get('expires_in');
    
    // Debug params
    console.log('Access token present:', !!this.accessToken);
    console.log('Expires in:', expiresIn);
    
    if (this.accessToken && expiresIn) {
      // Calculate expiration time (in milliseconds)
      const expirationTime = Date.now() + parseInt(expiresIn, 10) * 1000;
      this.tokenExpiration = expirationTime;
      
      // Store in localStorage
      localStorage.setItem('spotify_access_token', this.accessToken);
      localStorage.setItem('spotify_token_expiration', expirationTime.toString());
      return true;
    }
    return false;
  }

  isTokenExpired(): boolean {
    if (!this.tokenExpiration) return true;
    // Consider token expired 5 minutes before actual expiration
    return Date.now() > this.tokenExpiration - 300000;
  }

  async initializePlayer(onStateChange?: (state: Spotify.PlaybackState | null) => void): Promise<boolean> {
    // Check if token is expired before initializing player
    if (this.isTokenExpired()) {
      console.warn('Spotify access token is expired. Please login again.');
      return false;
    }
    
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
          // Check token expiration
          if (this.isTokenExpired()) {
            console.warn('Token expired during playback. Redirecting to login...');
            this.login();
            return;
          }
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
    if (!this.accessToken || this.isTokenExpired()) {
      console.warn('Token missing or expired when fetching playlists');
      return [];
    }
    
    try {
      const response = await fetch('https://api.spotify.com/v1/me/playlists', {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });
      
      if (response.status === 401) {
        // Token is invalid or expired
        console.warn('Spotify token expired or invalid. Clearing token.');
        localStorage.removeItem('spotify_access_token');
        localStorage.removeItem('spotify_token_expiration');
        this.accessToken = null;
        this.tokenExpiration = null;
        return [];
      }
      
      const data = await response.json();
      return data.items || [];
    } catch (error) {
      console.error('Error fetching playlists:', error);
      return [];
    }
  }

  async playPlaylist(playlistId: string) {
    if (!this.player || !this.accessToken || !this.deviceId || this.isTokenExpired()) {
      console.error('Player not ready or token expired');
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
    return !!this.accessToken && !this.isTokenExpired();
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
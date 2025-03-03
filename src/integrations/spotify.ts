// Add missing type definitions for Spotify SDK
declare global {
  interface Window {
    Spotify: {
      Player: new (options: any) => Spotify.Player;
    };
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}

namespace Spotify {
  export interface Player {
    connect(): Promise<boolean>;
    disconnect(): void;
    addListener(event: 'ready', callback: (event: ReadyEvent) => void): void;
    addListener(event: 'not_ready', callback: (event: NotReadyEvent) => void): void;
    addListener(event: 'player_state_changed', callback: (state: PlaybackState | null) => void): void;
    addListener(event: 'initialization_error' | 'authentication_error' | 'account_error', callback: (event: ErrorEvent) => void): void;
    getCurrentState(): Promise<PlaybackState | null>;
    resume(): Promise<void>;
    pause(): Promise<void>;
    nextTrack(): Promise<void>;
    previousTrack(): Promise<void>;
  }

  export interface ReadyEvent {
    device_id: string;
  }

  export interface NotReadyEvent {
    device_id: string;
  }

  export interface ErrorEvent {
    message: string;
  }

  export interface PlaybackState {
    paused: boolean;
    track_window: {
      current_track: {
        name: string;
        artists: Array<{ name: string }>;
      };
    };
  }
}

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
  private initializationPromise: Promise<boolean> | null = null;
  private connectionAttempts: number = 0;
  private readonly MAX_CONNECTION_ATTEMPTS = 3;

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
        this.clearTokens();
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
    // Reset connection attempts on new login
    this.connectionAttempts = 0;
    
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

  private clearTokens() {
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_token_expiration');
    this.accessToken = null;
    this.tokenExpiration = null;
  }

  isTokenExpired(): boolean {
    if (!this.tokenExpiration) return true;
    // Consider token expired 5 minutes before actual expiration
    return Date.now() > this.tokenExpiration - 300000;
  }

  async initializePlayer(onStateChange?: (state: Spotify.PlaybackState | null) => void): Promise<boolean> {
    // If already initializing, return the existing promise
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    
    // Check if token is expired before initializing player
    if (this.isTokenExpired()) {
      console.warn('Spotify access token is expired. Please login again.');
      return false;
    }
    
    // Increment connection attempts
    this.connectionAttempts++;
    
    // Create a new initialization promise
    this.initializationPromise = new Promise<boolean>((resolve) => {
      if (!window.Spotify) {
        console.error('Spotify SDK not loaded');
        this.initializationPromise = null;
        resolve(false);
        return;
      }

      this.stateCallback = onStateChange || null;

      // Create player with more robust error handling
      this.player = new window.Spotify.Player({
        name: 'Vinyl Smooth Player',
        getOAuthToken: (cb) => {
          // Check token expiration
          if (this.isTokenExpired()) {
            this.clearTokens();
            resolve(false);
            return;
          }
          cb(this.accessToken || '');
        },
        volume: 0.5
      });

      // Set a timeout to prevent hanging initialization
      const timeoutId = setTimeout(() => {
        console.warn('Spotify player initialization timed out');
        this.initializationPromise = null;
        resolve(false);
      }, 15000); // 15 second timeout

      // Error handling with better logging
      this.player.addListener('initialization_error', ({ message }) => {
        console.error('Spotify initialization error:', message);
        clearTimeout(timeoutId);
        this.initializationPromise = null;
        resolve(false);
      });

      this.player.addListener('authentication_error', ({ message }) => {
        console.error('Spotify authentication error:', message);
        clearTimeout(timeoutId);
        this.clearTokens(); // Invalid token, clear it
        this.initializationPromise = null;
        resolve(false);
      });

      this.player.addListener('account_error', ({ message }) => {
        console.error('Spotify account error (Premium required):', message);
        clearTimeout(timeoutId);
        this.initializationPromise = null;
        resolve(false);
      });

      // Playback status updates
      this.player.addListener('player_state_changed', (state) => {
        console.log('Player State Changed:', state);
        if (this.stateCallback) {
          this.stateCallback(state);
        }
      });

      // Ready handler
      this.player.addListener('ready', ({ device_id }) => {
        console.log('Spotify player ready with device ID:', device_id);
        this.deviceId = device_id;
        clearTimeout(timeoutId);
        this.initializationPromise = null;
        
        // Reset connection attempts on successful connection
        this.connectionAttempts = 0;
        resolve(true);
      });

      // Not ready handler
      this.player.addListener('not_ready', ({ device_id }) => {
        console.warn('Spotify player disconnected:', device_id);
        // Only clear the device ID, don't resolve yet
        this.deviceId = null;
      });

      // Connect to the player
      this.player.connect()
        .then(success => {
          if (!success) {
            console.error('Failed to connect to Spotify');
            clearTimeout(timeoutId);
            this.initializationPromise = null;
            resolve(false);
          }
        })
        .catch(error => {
          console.error('Error connecting to Spotify:', error);
          clearTimeout(timeoutId);
          this.initializationPromise = null;
          resolve(false);
        });
    });
    
    return this.initializationPromise;
  }

  async getUserPlaylists(): Promise<any[]> {
    if (!this.accessToken || this.isTokenExpired()) {
      console.warn('Token missing or expired when fetching playlists');
      return [];
    }
    
    try {
      const response = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });
      
      if (response.status === 401) {
        // Token is invalid or expired
        console.warn('Spotify token expired or invalid. Clearing token.');
        this.clearTokens();
        return [];
      }
      
      if (!response.ok) {
        throw new Error(`Failed to fetch playlists: ${response.status} ${response.statusText}`);
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
      const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${this.deviceId}`, {
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
      
      if (!response.ok) {
        const errorText = await response.text();
        // Extract helpful info from the error
        const error = new Error(`Error ${response.status}: ${errorText}`);
        console.error('Playback error:', error);
        throw error;
      }
    } catch (error) {
      console.error('Failed to play playlist:', error);
      throw error;
    }
  }

  isLoggedIn(): boolean {
    return !!this.accessToken && !this.isTokenExpired();
  }

  async togglePlayback(): Promise<void> {
    if (!this.player) return;
    
    try {
      const state = await this.player.getCurrentState();
      if (state?.paused) {
        await this.player.resume();
      } else {
        await this.player.pause();
      }
    } catch (err) {
      console.error('Error toggling playback:', err);
    }
  }

  async nextTrack(): Promise<void> {
    if (!this.player) return;
    
    try {
      await this.player.nextTrack();
    } catch (err) {
      console.error('Error skipping to next track:', err);
    }
  }

  async previousTrack(): Promise<void> {
    if (!this.player) return;
    
    try {
      await this.player.previousTrack();
    } catch (err) {
      console.error('Error going to previous track:', err);
    }
  }
}

export const spotifyService = SpotifyService.getInstance(); 
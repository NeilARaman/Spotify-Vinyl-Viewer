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
    setVolume(volume: number): Promise<void>;
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
  'user-read-currently-playing',
  'user-library-read'
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
  private forceCleanLogin: boolean = false;

  private constructor() {
    // Restore tokens from local storage if available
    const storedToken = localStorage.getItem('spotify_access_token');
    const storedExpiration = localStorage.getItem('spotify_token_expiration');
    
    if (storedToken && storedExpiration) {
      this.accessToken = storedToken;
      this.tokenExpiration = parseInt(storedExpiration, 10);
    }
    
    // Override fetch to intercept and handle cpapi.spotify.com requests
    // These are analytics events and 404/400 errors are non-critical
    const originalFetch = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      // Get the URL string regardless of input type
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      
      try {
        // Process normally
        const response = await originalFetch(input, init);
        
        // If it's a cpapi request with a 404 or 400 status, log but don't error
        if (url.includes('cpapi.spotify.com') && (response.status === 404 || response.status === 400)) {
          console.log(`Non-critical Spotify analytics error: ${response.status} for ${url}`);
          // Return a synthetic OK response to prevent errors from bubbling up
          return new Response(JSON.stringify({ok: true}), {
            status: 200,
            headers: {'Content-Type': 'application/json'}
          });
        }
        
        return response;
      } catch (error) {
        // If it's a cpapi request, log but don't throw
        if (url.includes('cpapi.spotify.com')) {
          console.log(`Suppressed Spotify analytics error for ${url}:`, error);
          // Return a synthetic OK response
          return new Response(JSON.stringify({ok: true}), {
            status: 200,
            headers: {'Content-Type': 'application/json'}
          });
        }
        
        // Re-throw for other requests
        throw error;
      }
    };
  }

  static getInstance(): SpotifyService {
    if (!SpotifyService.instance) {
      SpotifyService.instance = new SpotifyService();
      
      // Add fetch override to intercept and handle problematic requests gracefully
      const originalFetch = window.fetch;
      window.fetch = async function(input, init) {
        const url = input instanceof Request ? input.url : input.toString();
        
        // If this is a request to cpapi.spotify.com, which often 404s but doesn't affect core functionality
        if (url.includes('cpapi.spotify.com') && url.includes('event')) {
          try {
            const response = await originalFetch(input, init);
            // Just log these errors without throwing
            if (!response.ok && (response.status === 404 || response.status === 400)) {
              console.debug(`Handled non-critical Spotify event API error: ${response.status} for ${url}`);
              // Return a synthetic "OK" response to prevent errors bubbling up
              return new Response(JSON.stringify({ handled: true }), { 
                status: 200, 
                headers: new Headers({ 'Content-Type': 'application/json' }) 
              });
            }
            return response;
          } catch (error) {
            // For network errors on these endpoints, return a synthetic response
            console.debug(`Suppressed network error to Spotify event API: ${url}`, error);
            return new Response(JSON.stringify({ handled: true }), { 
              status: 200, 
              headers: new Headers({ 'Content-Type': 'application/json' }) 
            });
          }
        }
        
        // All other requests proceed normally
        return originalFetch(input, init);
      };
    }
    
    return SpotifyService.instance;
  }

  login() {
    // Reset connection attempts on new login
    this.connectionAttempts = 0;
    
    // Base authorization URL
    let authUrl = `https://accounts.spotify.com/authorize?client_id=${SPOTIFY_CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(
      REDIRECT_URI
    )}&scope=${encodeURIComponent(SCOPES.join(' '))}`;
    
    // Check if we need to force login dialog
    const forceLogin = localStorage.getItem('spotify_force_login') === 'true';
    
    if (forceLogin) {
      // Force Spotify to show the login dialog
      authUrl += `&show_dialog=true`;
      
      // Clear the flag
      localStorage.removeItem('spotify_force_login');
    }
    
    console.log('Redirecting to Spotify auth with URL:', authUrl);
    window.location.href = authUrl;
  }

  handleCallback() {
    console.log('Handling callback with hash:', window.location.hash);
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    this.accessToken = params.get('access_token');
    const expiresIn = params.get('expires_in');
    
    // Check if we're coming from a logout (this could be redundant, but better safe than sorry)
    if (this.isReturningFromLogout()) {
      console.log('Detected callback after logout, clearing logged out state');
      localStorage.removeItem('spotify_just_logged_out');
    }
    
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
      console.warn('Spotify access token is expired. Refreshing...');
      // Force a new login if token is expired
      this.clearTokens();
      this.login();
      return false;
    }
    
    // Increment connection attempts
    this.connectionAttempts++;
    
    // Log information for debugging
    console.log('Starting Spotify player initialization (attempt ' + this.connectionAttempts + ')');
    
    // Create a new initialization promise
    this.initializationPromise = new Promise<boolean>((resolve) => {
      if (!window.Spotify) {
        console.error('Spotify SDK not loaded');
        this.initializationPromise = null;
        resolve(false);
        return;
      }

      this.stateCallback = onStateChange || null;

      // Create player with more robust error handling and specify robustness level
      this.player = new window.Spotify.Player({
        name: 'Vinyl Smooth Player',
        getOAuthToken: (cb) => {
          if (this.isTokenExpired()) {
            this.clearTokens();
            resolve(false);
            return;
          }
          console.log('Providing access token to Spotify SDK');
          cb(this.accessToken || '');
        },
        volume: 0.5,
        // Add robustness level to prevent warnings
        enableMediaSession: true,
        audioQuality: {
          robustness: 'SW_SECURE_CRYPTO',
          preferredAudioCodecs: ['AAC'] 
        }
      });

      // Set a timeout to prevent hanging initialization
      const timeoutId = setTimeout(() => {
        console.warn('Spotify player initialization timed out after 15 seconds');
        this.initializationPromise = null;
        resolve(false);
      }, 15000); // 15 second timeout

      // Error handling with better logging
      this.player.addListener('initialization_error', ({ message }) => {
        console.error('Spotify initialization error:', message);
        clearTimeout(timeoutId);
        // Check for specific errors
        if (message.includes('404') || message.includes('Not Found')) {
          console.error('Spotify API endpoint not found. This may be a temporary Spotify service issue.');
        }
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
        console.error('Spotify account error:', message);
        console.error('Error details:', message);
        clearTimeout(timeoutId);
        this.initializationPromise = null;
        resolve(false);
      });

      // Playback status updates
      this.player.addListener('player_state_changed', (state) => {
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
        this.deviceId = null;
      });

      // Connect to the player with proper error handling
      console.log('Attempting to connect Spotify player...');
      this.player.connect()
        .then(success => {
          if (!success) {
            console.error('Explicit failure connecting to Spotify (connect() returned false)');
            clearTimeout(timeoutId);
            this.initializationPromise = null;
            resolve(false);
          }
        })
        .catch(error => {
          console.error('Error connecting to Spotify:', error);
          if (error && error.message && (error.message.includes('404') || error.message.includes('Not Found'))) {
            console.error('Spotify API endpoint not found. This may be a temporary Spotify service issue.');
          }
          clearTimeout(timeoutId);
          this.initializationPromise = null;
          resolve(false);
        });
    });
    
    return this.initializationPromise;
  }

  async getUserSavedTracks(): Promise<any> {
    if (!this.accessToken || !this.isLoggedIn()) {
      console.error('Not logged in to Spotify');
      return null;
    }

    try {
      const response = await fetch('https://api.spotify.com/v1/me/tracks?limit=50', {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          console.error('Access token expired or invalid');
          this.clearTokens();
          return null;
        }
        throw new Error(`Error fetching saved tracks: ${response.status}`);
      }

      const data = await response.json();
      
      // Create a "playlist-like" object for the Liked Songs
      return {
        id: 'liked-songs',
        name: 'Liked Songs',
        description: 'Your Liked Songs collection',
        images: [{ url: 'https://misc.scdn.co/liked-songs/liked-songs-640.png' }],
        tracks: {
          total: data.total
        },
        type: 'liked-songs',
        uri: 'spotify:user:liked-songs'
      };
    } catch (error) {
      console.error('Error fetching user saved tracks:', error);
      return null;
    }
  }

  async getUserPlaylists(): Promise<any[]> {
    if (!this.accessToken || !this.isLoggedIn()) {
      console.error('Not logged in to Spotify');
      return [];
    }

    try {
      const response = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          console.error('Access token expired or invalid');
          this.clearTokens();
          return [];
        }
        throw new Error(`Error fetching playlists: ${response.status}`);
      }

      const data = await response.json();
      
      // Get the Liked Songs collection
      const likedSongs = await this.getUserSavedTracks();
      
      // Add Liked Songs at the beginning of the playlists array if available
      return likedSongs 
        ? [likedSongs, ...data.items] 
        : data.items;
    } catch (error) {
      console.error('Error fetching user playlists:', error);
      return [];
    }
  }

  async playPlaylist(playlistId: string) {
    if (!this.deviceId) {
      console.error('No active device');
      return;
    }

    try {
      // Special handling for liked songs
      if (playlistId === 'liked-songs') {
        console.log('Playing liked songs collection');
        
        // Skip the context_uri approach since it's failing with 400 errors
        // and go directly to playing track URIs
        console.log('Using track-by-track approach for liked songs...');
        // Get the first 50 liked tracks
        const tracksResponse = await fetch('https://api.spotify.com/v1/me/tracks?limit=50', {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        });
        
        if (tracksResponse.ok) {
          const tracksData = await tracksResponse.json();
          if (tracksData.items && tracksData.items.length > 0) {
            // Extract track URIs
            const trackUris = tracksData.items.map((item: any) => item.track.uri);
            
            // Play these specific tracks
            const playResponse = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${this.deviceId}`, {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                uris: trackUris
              })
            });
            
            if (!playResponse.ok) {
              const errorText = await playResponse.text();
              console.error(`Error playing liked songs: Status ${playResponse.status}`, errorText);
              throw new Error(`Failed to play liked songs: ${playResponse.status} ${errorText}`);
            }
          } else {
            console.log('No liked songs found');
          }
        } else {
          const errorText = await tracksResponse.text();
          console.error(`Error fetching liked songs: Status ${tracksResponse.status}`, errorText);
          throw new Error(`Failed to fetch liked songs: ${tracksResponse.status} ${errorText}`);
        }
        return;
      }

      // Regular playlist
      console.log(`Playing playlist: ${playlistId}`);
      const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${this.deviceId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          context_uri: `spotify:playlist:${playlistId}`
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error playing playlist: Status ${response.status}`, errorText);
        throw new Error(`Failed to play playlist: ${response.status} ${errorText}`);
      }
    } catch (error) {
      console.error('Error playing playlist:', error);
      throw error; // Re-throw to allow handling in the component
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

  async setVolume(volumePercent: number): Promise<void> {
    if (!this.player) return;
    
    try {
      // Ensure volume is between 0 and 1
      const volume = Math.max(0, Math.min(1, volumePercent));
      await this.player.setVolume(volume);
    } catch (err) {
      console.error('Error setting volume:', err);
    }
  }

  // Add a dedicated method to clear Spotify cookies
  private clearSpotifyCookies() {
    // Try to clear all cookies from spotify.com domain
    const cookies = document.cookie.split(';');
    
    // Clear cookies by setting their expiration to a past date
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i];
      const eqPos = cookie.indexOf('=');
      const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
      
      // Try to identify Spotify-related cookies and clear them
      if (name.toLowerCase().includes('spotify') || 
          name.toLowerCase().includes('sp_') || 
          name.toLowerCase().includes('_sp')) {
        console.log(`Clearing Spotify cookie: ${name}`);
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.spotify.com`;
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=accounts.spotify.com`;
      }
    }
    
    // Also clear all localStorage data related to Spotify
    Object.keys(localStorage).forEach(key => {
      if (key.toLowerCase().includes('spotify')) {
        console.log(`Clearing localStorage item: ${key}`);
        localStorage.removeItem(key);
      }
    });
    
    // Set a flag to indicate we've cleared cookies
    localStorage.setItem('spotify_cookies_cleared', 'true');
  }

  // Add the logout method to the SpotifyService class
  logout(): void {
    console.log('Logging out of Spotify');
    
    // Clear all tokens and state
    this.clearTokens();
    
    // Clear player state
    if (this.player) {
      try {
        this.player.disconnect();
      } catch (error) {
        console.error('Error disconnecting Spotify player:', error);
      }
      this.player = null;
    }
    
    this.deviceId = null;
    this.initializationPromise = null;
    this.connectionAttempts = 0;
    
    // Set flag to force show_dialog on next login
    localStorage.setItem('spotify_force_login', 'true');
  }

  // Method to check if the page was just reloaded after a logout
  isReturningFromLogout(): boolean {
    return localStorage.getItem('spotify_just_logged_out') === 'true';
  }
}

export const spotifyService = SpotifyService.getInstance(); 
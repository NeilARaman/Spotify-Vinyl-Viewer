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
  private previousVolume: number = 0.5; // Store previous volume when muting
  private trackMetadataCache: Map<string, any> = new Map(); // Cache for track metadata
  private playbackQueue: string[] = []; // Store URIs of upcoming tracks

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

  /**
   * Preloads track metadata for a playlist to speed up transitions
   * @param playlistId The ID of the playlist to preload
   */
  async preloadPlaylistTracks(playlistId: string): Promise<void> {
    if (!this.isLoggedIn()) return;
    
    try {
      // Don't preload if we're dealing with liked songs, as they can be numerous
      if (playlistId === 'liked-songs') {
        return;
      }
      
      console.log(`Preloading metadata for playlist: ${playlistId}`);
      const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });
      
      if (!response.ok) return;
      
      const data = await response.json();
      
      // Cache the track metadata by track URI
      data.items.forEach((item: any) => {
        if (item.track) {
          this.trackMetadataCache.set(item.track.uri, item.track);
        }
      });
      
      console.log(`Preloaded ${data.items.length} tracks for playlist ${playlistId}`);
    } catch (error) {
      console.warn('Failed to preload playlist tracks:', error);
    }
  }

  /**
   * Preloads the next few tracks in the queue for faster transitions
   */
  async preloadQueue(): Promise<void> {
    if (!this.isLoggedIn() || !this.deviceId) return;
    
    try {
      console.log('Preloading queue data for smoother transitions');
      const response = await fetch('https://api.spotify.com/v1/me/player/queue', {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });
      
      if (!response.ok) {
        console.warn(`Failed to get queue: ${response.status}`);
        return;
      }
      
      const data = await response.json();
      
      // Store the queue URIs for faster track changes
      if (data.queue && Array.isArray(data.queue)) {
        this.playbackQueue = data.queue.slice(0, 5).map((track: any) => track.uri);
        console.log(`Preloaded ${this.playbackQueue.length} tracks in queue`);
      }
    } catch (error) {
      console.warn('Failed to preload queue:', error);
    }
  }

  // Modify the playPlaylist method to trigger queue preloading
  async playPlaylist(playlistId: string, deviceId?: string): Promise<void> {
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

      // After successful playback start, preload queue in the background
      if (response.ok) {
        // Don't await these - let them happen in the background
        this.preloadPlaylistTracks(playlistId);
        this.preloadQueue();
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

  // Add faster track skipping by using preloaded queue info
  async nextTrack(): Promise<void> {
    if (!this.player) {
      console.error('Player not initialized');
      return;
    }
    
    // If we have preloaded queue data, we can optimize transitions
    if (this.playbackQueue.length > 0) {
      console.log('Using preloaded queue data for faster track change');
      // Update UI immediately for a more responsive feel
      this.notifyStateChange();
    }
    
    // Then actually change the track
    await this.player.nextTrack();
    
    // After changing track, preload queue again in the background
    this.preloadQueue();
  }

  // Helper to notify about state changes immediately for a more responsive UI
  private notifyStateChange(): void {
    if (this.stateCallback) {
      // Create a minimal PlaybackState to trigger UI updates faster
      const state = this.lastState || {
        paused: false,
        track_window: {
          current_track: {
            name: "Loading next track...",
            artists: [{ name: "Please wait" }]
          }
        }
      };
      
      this.stateCallback(state);
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
  
  async mute(): Promise<void> {
    if (!this.player) return;
    
    try {
      // Store current volume before muting
      const state = await this.player.getCurrentState();
      if (state) {
        // Get current volume if available from SDK
        // Note: getCurrentState doesn't provide volume info directly,
        // so we'll use the stored value
        this.previousVolume = 0.5; // Default if no previous volume
      }
      
      // Set volume to 0
      await this.player.setVolume(0);
    } catch (err) {
      console.error('Error muting player:', err);
    }
  }
  
  async unmute(): Promise<void> {
    if (!this.player) return;
    
    try {
      // Restore previous volume
      await this.player.setVolume(this.previousVolume);
    } catch (err) {
      console.error('Error unmuting player:', err);
    }
  }
  
  async toggleMute(isMuted: boolean): Promise<void> {
    // Ensure the Spotify Player is available
    if (!this.player) return;
    
    try {
      // Set volume immediately - don't wait for the async operations to complete
      // This makes the mute action feel more responsive
      if (isMuted) {
        // For muting, set volume to 0 immediately
        if (this.player.setVolume) {
          this.player.setVolume(0);
        }
        
        // Then store the previous volume asynchronously
        this.mute().catch(err => console.error('Error in background mute operation:', err));
      } else {
        // For unmuting, restore volume immediately
        if (this.player.setVolume) {
          this.player.setVolume(this.previousVolume);
        }
        
        // No need for additional async operation here
      }
    } catch (err) {
      console.error('Error toggling mute:', err);
    }
  }

  // Add the logout method to the SpotifyService class
  logout(): void {
    console.log('Logging out of Spotify');
    this.clearTokens();
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
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_refresh_token');
    localStorage.removeItem('spotify_expires_at');
  }

  // Add a method to get cached track metadata if available
  getTrackMetadata(trackUri: string): any | null {
    return this.trackMetadataCache.get(trackUri) || null;
  }
}

export const spotifyService = SpotifyService.getInstance(); 
declare namespace Spotify {
  interface PlayerInit {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume?: number;
  }

  interface PlaybackState {
    context: {
      uri: string;
      metadata: any;
    };
    disallows: {
      pausing: boolean;
      peeking_next: boolean;
      peeking_prev: boolean;
      resuming: boolean;
      seeking: boolean;
      skipping_next: boolean;
      skipping_prev: boolean;
    };
    track_window: {
      current_track: {
        name: string;
        uri: string;
        artists: Array<{ name: string }>;
      };
    };
    paused: boolean;
    position: number;
    duration: number;
    repeat_mode: number;
    shuffle: boolean;
  }

  interface ErrorEvent {
    message: string;
  }

  interface ReadyEvent {
    device_id: string;
  }

  class Player {
    constructor(config: PlayerInit);
    connect(): Promise<boolean>;
    addListener(event: 'ready', callback: (event: ReadyEvent) => void): void;
    addListener(event: 'player_state_changed', callback: (state: PlaybackState | null) => void): void;
    addListener(event: 'initialization_error' | 'authentication_error' | 'account_error', callback: (event: ErrorEvent) => void): void;
    removeListener(event: string, callback?: Function): void;
    getCurrentState(): Promise<PlaybackState | null>;
    setVolume(volume: number): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    togglePlay(): Promise<void>;
    seek(position_ms: number): Promise<void>;
    previousTrack(): Promise<void>;
    nextTrack(): Promise<void>;
  }
}

interface Window {
  Spotify: {
    Player: typeof Spotify.Player;
  };
  onSpotifyWebPlaybackSDKReady: () => void;
} 
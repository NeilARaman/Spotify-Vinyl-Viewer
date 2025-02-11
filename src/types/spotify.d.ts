declare namespace Spotify {
  class Player {
    constructor(config: { name: string; getOAuthToken: (cb: (token: string) => void) => void });
    connect(): Promise<boolean>;
  }
}

interface Window {
  Spotify: {
    Player: typeof Spotify.Player;
  };
  onSpotifyWebPlaybackSDKReady: () => void;
} 
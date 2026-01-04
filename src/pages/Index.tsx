import { useState } from "react";
import RecordPlayer from "../components/RecordPlayer";
import { SpotifyPlayer } from "../components/SpotifyPlayer";

const Index = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<{ name: string; artist: string } | undefined>();

  return (
    <div className="min-h-screen bg-gradient-to-b from-wood-dark/90 to-wood-dark flex items-center justify-center p-6">
      <div className="w-full max-w-4xl animate-fade-in">
        <h1 className="text-4xl md:text-5xl font-playfair text-brass text-center mb-12">
          Vintage Record Player
        </h1>
        <div className="grid grid-cols-1 gap-8">
          <RecordPlayer isPlaying={isPlaying} currentTrack={currentTrack} />
          <div className="bg-wood-light/10 backdrop-blur-sm rounded-lg p-6 min-h-[200px]">
            <SpotifyPlayer 
              onPlaybackStateChange={setIsPlaying}
              onTrackChange={(name, artist) => setCurrentTrack({ name, artist })}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;

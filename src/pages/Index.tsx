
import RecordPlayer from "../components/RecordPlayer";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-player-dark/95 to-player-dark flex items-center justify-center p-6">
      <div className="w-full max-w-4xl animate-fade-in">
        <h1 className="text-4xl md:text-5xl font-playfair text-player-accent text-center mb-12">
          Vintage Record Player
        </h1>
        <RecordPlayer />
      </div>
    </div>
  );
};

export default Index;

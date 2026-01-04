import { Toaster } from "./components/ui/toaster";
import { Toaster as Sonner } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { SpotifyPlayer } from "./components/SpotifyPlayer";

const queryClient = new QueryClient();

// Dedicated callback component that ensures the SpotifyPlayer is mounted
const SpotifyCallback = () => {
  console.log('Rendering SpotifyCallback component');
  console.log('Current URL:', window.location.href);
  
  // Check for code parameter in search (query parameters) instead of hash
  if (!window.location.search || !window.location.search.includes('code=')) {
    console.log('No authorization code found, redirecting to home');
    return <Navigate to="/" replace />;
  }
  
  console.log('Authorization code found, processing login');
  
  return (
    <div>
      <p style={{ position: 'fixed', top: 0, left: 0, background: 'rgba(0,0,0,0.7)', color: 'white', padding: '10px', zIndex: 9999 }}>
        Processing Spotify login...
      </p>
      <SpotifyPlayer />
    </div>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/callback" element={<SpotifyCallback />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

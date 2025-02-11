import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { SpotifyPlayer } from "./components/SpotifyPlayer";

const queryClient = new QueryClient();

// Dedicated callback component that ensures the SpotifyPlayer is mounted
const SpotifyCallback = () => {
  console.log('Rendering SpotifyCallback component');
  if (!window.location.hash) {
    console.log('No hash found, redirecting to home');
    return <Navigate to="/" replace />;
  }
  return <SpotifyPlayer />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
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

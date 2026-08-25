import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Organizer from "./pages/Organizer";
import Admin from "./pages/Admin";
import Venues from "./pages/Venues";
import VenueSourcesAdmin from "./pages/VenueSourcesAdmin";
import NotificationSettings from "./pages/NotificationSettings";
import GameThread from "./pages/GameThread";
import ModeratorConsole from "./pages/ModeratorConsole";
import OrganizerGameSettings from "./pages/OrganizerGameSettings";
import OrganizerGameUpdate from "./pages/OrganizerGameUpdate";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/organizer"} component={Organizer} />
      <Route path={"/organizer/games/:gameId"} component={OrganizerGameSettings} />
      <Route path={"/organizer/games/:gameId/update"} component={OrganizerGameUpdate} />
      <Route path={"/admin"} component={Admin} />
      <Route path={"/venues"} component={Venues} />
      <Route path={"/admin/venues"} component={VenueSourcesAdmin} />
      <Route path={"/settings/notifications"} component={NotificationSettings} />
      <Route path={"/games/:gameId/thread"} component={GameThread} />
      <Route path={"/moderator"} component={ModeratorConsole} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

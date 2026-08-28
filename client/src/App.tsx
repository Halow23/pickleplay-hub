import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import { Suspense, lazy } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

// Route-level code splitting: admin/moderator/organizer consoles must not
// ship in the entry chunk that every visitor downloads.
const Organizer = lazy(() => import("./pages/Organizer"));
const Admin = lazy(() => import("./pages/Admin"));
const Venues = lazy(() => import("./pages/Venues"));
const VenueSourcesAdmin = lazy(() => import("./pages/VenueSourcesAdmin"));
const NotificationSettings = lazy(() => import("./pages/NotificationSettings"));
const GameThread = lazy(() => import("./pages/GameThread"));
const ModeratorConsole = lazy(() => import("./pages/ModeratorConsole"));
const OrganizerGameSettings = lazy(() => import("./pages/OrganizerGameSettings"));
const OrganizerGameUpdate = lazy(() => import("./pages/OrganizerGameUpdate"));
const NotFound = lazy(() => import("./pages/NotFound"));

function PageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f3eb]">
      <div className="h-10 w-10 animate-pulse rounded-full bg-[#e4e5dc]" aria-label="Loading page" />
    </div>
  );
}

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Suspense fallback={<PageFallback />}>
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
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

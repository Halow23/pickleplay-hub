import { useEffect } from "react";

// Per-route document titles; pages pass a suffix so the site-wide default in
// index.html stays intact for the initial paint.
export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · PicklePlay` : "PicklePlay — Find Your Next Game";
    return () => {
      document.title = "PicklePlay — Find Your Next Game";
    };
  }, [title]);
}

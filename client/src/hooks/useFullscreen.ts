import { useCallback, useEffect, useState, type RefObject } from "react";

// Wraps the (still somewhat vendor-prefixed) Fullscreen API. Note: iOS Safari does not
// support requesting fullscreen on arbitrary elements (only <video>), so this hook is a
// no-op there — the "full screen" affordance for iPhone/iPad is the responsive canvas
// sizing itself (useResizableCanvas), not this button.
export function useFullscreen(targetRef: RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [supported] = useState(
    () => typeof document !== "undefined" && (document.fullscreenEnabled || (document as any).webkitFullscreenEnabled),
  );

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!(document.fullscreenElement || (document as any).webkitFullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  const toggle = useCallback(() => {
    const el = targetRef.current as any;
    if (!el) return;
    if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
    } else if (el.requestFullscreen) {
      el.requestFullscreen();
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    }
  }, [targetRef]);

  return { isFullscreen, supported, toggle };
}

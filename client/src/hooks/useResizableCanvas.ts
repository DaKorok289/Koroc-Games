import { useEffect, type RefObject } from "react";

// Fits the largest canvas of a given aspect ratio inside its container's available
// space (whichever dimension is the binding constraint), instead of being purely
// width-driven — so the game actually uses the full screen on both portrait phones
// and wide desktop windows. Caps devicePixelRatio and skips zero-size measurements
// (mobile layout can report 0x0 briefly before settling).
export function useResizableCanvas(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  containerRef: RefObject<HTMLDivElement | null>,
  aspectRatio = 1,
): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const resize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;

      let width = rect.width;
      let height = width / aspectRatio;
      if (height > rect.height) {
        height = rect.height;
        width = height * aspectRatio;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [canvasRef, containerRef, aspectRatio]);
}

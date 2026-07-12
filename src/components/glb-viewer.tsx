"use client";

import { useEffect, useState } from "react";

// In-browser GLB viewer. @google/model-viewer registers a custom element and
// touches window at import time, so it's loaded dynamically on the client —
// never during SSR.
export function GlbViewer({ src, alt }: { src: string; alt: string }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("@google/model-viewer").then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex h-96 w-full items-center justify-center rounded-lg border border-foreground/10 opacity-60">
        Loading viewer…
      </div>
    );
  }

  return (
    <model-viewer
      src={src}
      alt={alt}
      camera-controls
      auto-rotate
      shadow-intensity="1"
      style={{ width: "100%", height: "24rem" }}
      className="rounded-lg border border-foreground/10"
    />
  );
}

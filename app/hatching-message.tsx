"use client";

import { useEffect, useRef, useState } from "react";

export function HatchingMessage() {
  const messageRef = useRef<HTMLDivElement>(null);
  const [isRevealed, setIsRevealed] = useState(false);

  useEffect(() => {
    const message = messageRef.current;
    const mobileOrTouchLike = window.matchMedia(
      "(max-width: 720px), (hover: none), (pointer: coarse)",
    );

    if (!message || !mobileOrTouchLike.matches) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsRevealed(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: "0px 0px -28% 0px",
        threshold: 0.15,
      },
    );

    observer.observe(message);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={`hatchingContent${isRevealed ? " isRevealed" : ""}`}
      ref={messageRef}
    >
      <h2 id="hatching-title">Still hatching.</h2>
    </div>
  );
}

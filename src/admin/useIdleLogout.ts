import { useEffect, useRef } from "react";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove"] as const;

/**
 * Deconectează automat după `timeoutMs` fără activitate. Protejează contul de
 * administrator lăsat deschis pe un calculator comun (laborator, secretariat).
 */
export function useIdleLogout(timeoutMs: number, onIdle: () => void) {
  const onIdleRef = useRef(onIdle);

  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  useEffect(() => {
    let timer = window.setTimeout(() => onIdleRef.current(), timeoutMs);
    let lastReset = Date.now();

    const reset = () => {
      const now = Date.now();
      if (now - lastReset < 1000) return; // fără resetări la fiecare mișcare de mouse
      lastReset = now;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => onIdleRef.current(), timeoutMs);
    };

    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, reset, { passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, reset);
    };
  }, [timeoutMs]);
}

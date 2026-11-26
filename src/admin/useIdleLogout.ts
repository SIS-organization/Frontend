import { useEffect, useRef } from "react";
import { ADMIN_ACTIVITY_KEY, AUTH_TOKEN_KEY } from "../api/client";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove"] as const;

/** Ora ultimei activități salvate (sau null dacă nu există / localStorage e indisponibil). */
function readLastActivity(): number | null {
  try {
    const value = Number(localStorage.getItem(ADMIN_ACTIVITY_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeLastActivity(time: number) {
  try {
    localStorage.setItem(ADMIN_ACTIVITY_KEY, String(time));
  } catch {
    // localStorage indisponibil (ex. mod privat): rămâne doar cronometrul din pagină.
  }
}

function clearLastActivity() {
  try {
    localStorage.removeItem(ADMIN_ACTIVITY_KEY);
  } catch {
    // nimic de șters
  }
}

/**
 * Deconectează automat după `timeoutMs` fără activitate. Protejează contul de
 * administrator lăsat deschis pe un calculator comun (laborator, secretariat).
 *
 * Ora ultimei activități e salvată în localStorage, deci regula ține și dacă:
 *   - browserul a fost închis: la redeschidere, dacă au trecut peste `timeoutMs`,
 *     deconectarea are loc imediat;
 *   - adminul lucrează în mai multe file: o filă nu deconectează cât timp alta e folosită;
 *   - calculatorul a stat în repaus: la revenirea în filă se verifică imediat.
 */
export function useIdleLogout(timeoutMs: number, onIdle: () => void) {
  const onIdleRef = useRef(onIdle);

  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  useEffect(() => {
    /** Timpul expirat: ștergem ora salvată și deconectăm. */
    const expire = () => {
      clearLastActivity();
      onIdleRef.current();
    };

    // 0. Fără token salvat (deja deconectat) nu avem ce proteja și nu scriem nimic.
    //    Dacă localStorage nu poate fi citit, mergem mai departe doar cu cronometrul din pagină.
    let signedOut = false;
    try {
      signedOut = localStorage.getItem(AUTH_TOKEN_KEY) === null;
    } catch {
      signedOut = false;
    }
    if (signedOut) return;

    // 1. La deschidere: o activitate mai veche de `timeoutMs` înseamnă sesiune expirată.
    const saved = readLastActivity();
    if (saved !== null && Date.now() - saved >= timeoutMs) {
      expire();
      return;
    }

    let lastLocal = Date.now();
    writeLastActivity(lastLocal);
    let timer = 0;

    // 2. Când expiră cronometrul, verificăm ora comună: altă filă poate fi fost activă între timp.
    const check = () => {
      const latest = Math.max(readLastActivity() ?? 0, lastLocal);
      const idleFor = Date.now() - latest;
      if (idleFor >= timeoutMs) expire();
      else schedule(timeoutMs - idleFor);
    };
    const schedule = (delay: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(check, delay);
    };
    schedule(timeoutMs);

    const reset = () => {
      const now = Date.now();
      if (now - lastLocal < 1000) return; // fără scrieri la fiecare mișcare de mouse
      lastLocal = now;
      writeLastActivity(now);
      schedule(timeoutMs);
    };

    // 3. La revenirea în filă (sau după repausul calculatorului) verificăm imediat.
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };

    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, reset, { passive: true });
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, reset);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [timeoutMs]);
}

import { useEffect, useState } from "react";

// Ora curentă, actualizată periodic, ca butoanele dependente de timp să apară și să dispară singure.
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}

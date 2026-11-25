import { useEffect, useState, type ReactNode } from "react";
import { getCurrentUser } from "../../api/auth";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/useAuth";
import AccessDenied from "./AccessDenied";

type Check = "checking" | "allowed" | "denied";

/**
 * Lasă să treacă doar administratorii.
 *
 * Rolul se cere din nou de la server (GET /users/me) la fiecare intrare în zona
 * de administrare. Nu ne bazăm pe ce e salvat în browser (localStorage, conținutul
 * token-ului), pentru că acelea pot fi modificate de oricine din consolă.
 *
 * Garda e doar pentru experiența utilizatorului: protecția reală e pe backend,
 * care răspunde 401 / 403 la orice cerere /admin/* fără drepturi.
 */
export default function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const userId = user?.userId;
  // Rezultatul verificării ține minte PENTRU CE cont a fost făcut: dacă se schimbă
  // contul, rezultatul vechi nu mai contează și verificarea se reface.
  const [result, setResult] = useState<{ userId: string | undefined; check: Check }>({
    userId: undefined,
    check: "checking",
  });
  const check: Check = result.userId === userId ? result.check : "checking";

  useEffect(() => {
    const controller = new AbortController();
    getCurrentUser({ signal: controller.signal })
      .then((fresh) => {
        const allowed = fresh.role === "admin" && fresh.userId === userId;
        setResult({ userId, check: allowed ? "allowed" : "denied" });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          logout(); // sesiune expirată: RequireAuth trimite la /login
          return;
        }
        setResult({ userId, check: "denied" });
      });
    return () => controller.abort();
  }, [userId, logout]);

  // Cât timp se verifică nu afișăm nimic (nicio bucată din interfața de admin).
  if (check === "checking") return null;
  if (check === "denied") return <AccessDenied />;
  return children;
}

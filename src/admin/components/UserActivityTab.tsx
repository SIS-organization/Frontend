// Fila „Activitate” din profilul unui utilizator: acțiunile făcute de această persoană,
// din jurnalul de acțiuni (GET /admin/audit-log?actorId={userId}) — rezervări confirmate,
// anulări, cote restituite etc. Cele mai noi primele, paginate.
// Textele vin de la server, dar React le afișează ca text simplu (fără HTML).

import { useEffect, useState } from "react";
import { ApiError } from "../../api/client";
import { getAuditLog, type AuditEventType, type AuditPage } from "../api";
import { bucharestParts, formatClock } from "../time";
import { Card, secondaryButton } from "./ActivityForm";
import Pagination from "./Pagination";

/** Câte intrări pe pagină. */
const PAGE_SIZE = 20;

/** Denumirea evenimentului, dacă serverul nu trimite un titlu. */
const EVENT_LABEL: Record<AuditEventType, string> = {
  maintenance_closure: "Închidere de mentenanță",
  booking_cancelled: "Rezervare anulată",
  quota_refunded: "Cotă restituită",
  notification_sent: "Notificare trimisă",
  notification_failed: "Notificare eșuată",
  notification_retried: "Notificare retrimisă",
  reservation_confirmed: "Rezervare confirmată",
  activity_created: "Activitate adăugată",
  activity_updated: "Activitate modificată",
  activity_cancelled: "Activitate anulată",
  facility_reopened: "Facilitate redeschisă",
  user_access_changed: "Acces modificat",
  user_profile_viewed: "Profil consultat",
};

/** Culoarea rezultatului: anulările și eșecurile ies în evidență. */
function resultTone(type: AuditEventType | null) {
  if (type === "booking_cancelled" || type === "notification_failed") return "text-[#ac443c]";
  return "text-primary";
}

/** „26 nov. 2026 · 14:32” — momentul evenimentului, în ora României. */
function momentLabel(iso: string) {
  const { date } = bucharestParts(iso);
  const day = new Date(`${date}T12:00:00.000Z`).toLocaleDateString("ro-RO", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${day} · ${formatClock(iso)}`;
}

/** Mesajul pentru administrator, după eroarea primită de la server. */
function describeError(error: unknown) {
  if (error instanceof ApiError && error.status === 403) return "Contul tău nu mai are drepturi de administrator.";
  if (error instanceof ApiError && (error.status === 404 || error.status === 501)) return "Serverul nu oferă încă jurnalul de acțiuni.";
  return error instanceof Error ? error.message : "Activitatea nu a putut fi încărcată.";
}

const th = "px-3 py-2.5 text-[10px] font-semibold tracking-wide text-muted uppercase";

export default function UserActivityTab(props: {
  userId: string;
  /** Pagina din adresă (deja verificată de pagina părinte). */
  page: number;
  onPage: (page: number) => void;
  /** Sesiune expirată (401): pagina părinte face delogarea. */
  onUnauthorized: () => void;
}) {
  const { userId, page, onPage, onUnauthorized } = props;
  const [reload, setReload] = useState(0);
  const requestKey = `${userId}#${page}#${reload}`;
  const [result, setResult] = useState<{
    key: string;
    data: AuditPage | null;
    error: string | null;
  } | null>(null);

  // Pagina cerută din jurnal, doar cu acțiunile acestei persoane.
  useEffect(() => {
    const controller = new AbortController();
    getAuditLog({ actorId: userId, page, pageSize: PAGE_SIZE }, controller.signal)
      .then((data) => setResult({ key: requestKey, data, error: null }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) onUnauthorized();
        else setResult({ key: requestKey, data: null, error: describeError(err) });
      });
    return () => controller.abort();
    // `requestKey` conține deja id-ul, pagina și numărul de reîncercări.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, onUnauthorized]);

  const current = result && result.key === requestKey ? result : null;
  // Cât se încarcă pagina nouă, păstrăm vizibil rezultatul anterior (estompat).
  const shown = current ?? result;
  const data = shown?.data ?? null;
  const loading = !current;

  return (
    <>
      <Card className="flex flex-col gap-4 p-5">
        {shown?.error && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg bg-[#fcedea] px-4 py-3 text-sm text-[#ac443c]">
            {shown.error}
            <button type="button" className={secondaryButton} onClick={() => setReload((n) => n + 1)}>
              Reîncearcă
            </button>
          </div>
        )}
        <div className={`overflow-x-auto ${loading && data ? "opacity-50" : ""}`} aria-busy={loading}>
          {!data && !shown?.error && <p className="py-8 text-center text-sm text-muted">Se încarcă activitatea…</p>}
          {data && data.items.length === 0 && (
            <p className="py-8 text-center text-sm text-muted">Nu există activitate înregistrată pentru acest utilizator.</p>
          )}
          {data && data.items.length > 0 && (
            <table className="w-full min-w-[760px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="bg-[#eef3f1]">
                  <th scope="col" className={th}>
                    Data și ora
                  </th>
                  <th scope="col" className={th}>
                    Acțiune
                  </th>
                  <th scope="col" className={th}>
                    Detalii
                  </th>
                  <th scope="col" className={th}>
                    Referință
                  </th>
                  <th scope="col" className={th}>
                    Rezultat
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e.id} className="border-b border-[#eef3f1] align-top last:border-0">
                    <td className="px-3 py-3 whitespace-nowrap text-muted">{momentLabel(e.occurredAt)}</td>
                    <td className="px-3 py-3 font-semibold text-heading">{e.title ?? (e.type ? EVENT_LABEL[e.type] : "Acțiune")}</td>
                    <td className="px-3 py-3 text-heading">{e.description ?? "—"}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-heading">{e.reference ?? "—"}</td>
                    <td className={`px-3 py-3 text-xs font-semibold ${resultTone(e.type)}`}>{e.result ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {data && (
        <Pagination
          page={data.page}
          totalPages={data.totalPages}
          totalItems={data.totalItems}
          shown={data.items.length}
          loading={loading}
          onPage={onPage}
        />
      )}
    </>
  );
}

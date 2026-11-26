// Fila „Rezervări” din profilul unui utilizator: toate rezervările persoanei, paginate
// (GET /admin/users/{userId}/bookings). „Vezi detalii →” deschide fereastra rezervării
// (GET /admin/bookings/{bookingId}), aceeași ca în orar și în pagina „Rezervări”.

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../../api/client";
import { getAdminUserBookings, type UserBookingsPage } from "../api";
import { Card, secondaryButton } from "./ActivityForm";
import BookingDetailsDialog from "./BookingDetailsDialog";
import Pagination from "./Pagination";
import UserBookingsTable from "./UserBookingsTable";

/** Câte rezervări pe pagină. */
const PAGE_SIZE = 20;

/** Mesajul pentru administrator, după eroarea primită de la server. */
function describeError(error: unknown) {
  if (error instanceof ApiError && error.status === 403) return "Contul tău nu mai are drepturi de administrator.";
  if (error instanceof ApiError && error.status === 404) return "Utilizatorul nu există sau contul a fost șters.";
  if (error instanceof ApiError && error.status === 501) return "Serverul nu oferă încă rezervările utilizatorilor.";
  return error instanceof Error ? error.message : "Rezervările nu au putut fi încărcate.";
}

export default function UserBookingsTab(props: {
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
    data: UserBookingsPage | null;
    error: string | null;
  } | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const closeDetails = useCallback(() => setDetailsId(null), []);

  // Pagina cerută; o cerere veche se anulează când se schimbă pagina.
  useEffect(() => {
    const controller = new AbortController();
    getAdminUserBookings(userId, { page, pageSize: PAGE_SIZE }, controller.signal)
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
          {!data && !shown?.error && <p className="py-8 text-center text-sm text-muted">Se încarcă rezervările…</p>}
          {data && data.items.length === 0 && <p className="py-8 text-center text-sm text-muted">Utilizatorul nu are rezervări.</p>}
          {data && data.items.length > 0 && <UserBookingsTable items={data.items} onDetails={(b) => setDetailsId(b.id)} />}
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

      <BookingDetailsDialog bookingId={detailsId} onClose={closeDetails} onUnauthorized={onUnauthorized} />
    </>
  );
}

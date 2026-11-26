// Tabelul cu rezervările unui utilizator (Figma: „Utilizatori · Detalii student”):
// Rezervare | Facilitate | Interval | Stare, plus, opțional, „Detalii” pe fiecare rând.
// Folosit în profil, în fila „Profil și acces” (cele mai recente) și în fila „Rezervări” (toate).
// Textele vin de la server, dar React le afișează ca text simplu (fără HTML).

import type { AdminBooking, BookingStatus } from "../api";
import { BOOKING_STATUS } from "../bookingText";
import { bucharestParts, formatTimeRange } from "../time";

/** Culoarea statusului (ca în Figma: doar textul colorat). */
const STATUS_TEXT: Record<BookingStatus, string> = {
  confirmed: "text-primary",
  completed: "text-primary",
  in_verification: "text-[#926018]",
  awaiting_transfer: "text-[#926018]",
  rejected: "text-[#ac443c]",
  cancelled: "text-[#ac443c]",
};

/** „20 oct.” — ziua rezervării, în ora României. */
function shortDay(iso: string) {
  const { date } = bucharestParts(iso);
  return new Date(`${date}T12:00:00.000Z`).toLocaleDateString("ro-RO", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  });
}

const th = "px-3 py-2.5 text-[10px] font-semibold tracking-wide text-muted uppercase";

export default function UserBookingsTable(props: {
  items: AdminBooking[];
  /** Dacă e dat, fiecare rând are butonul „Detalii” (deschide fereastra rezervării). */
  onDetails?: (booking: AdminBooking) => void;
}) {
  const { items, onDetails } = props;
  return (
    <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
      <thead>
        <tr className="bg-[#eef3f1]">
          <th scope="col" className={th}>
            Rezervare
          </th>
          <th scope="col" className={th}>
            Facilitate
          </th>
          <th scope="col" className={th}>
            Interval
          </th>
          <th scope="col" className={th}>
            Stare
          </th>
          {onDetails && (
            <th scope="col" className={th}>
              Acțiune
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {items.map((b) => (
          <tr key={b.id} className="border-b border-[#eef3f1] last:border-0">
            <td className="px-3 py-3 font-semibold whitespace-nowrap text-heading">{b.code}</td>
            <td className="px-3 py-3 text-heading">{b.facilityName}</td>
            <td className="px-3 py-3 whitespace-nowrap text-heading">
              {shortDay(b.startTime)} · {formatTimeRange(b.startTime, b.endTime)}
            </td>
            <td className={`px-3 py-3 text-xs font-semibold whitespace-nowrap ${STATUS_TEXT[b.status]}`}>{BOOKING_STATUS[b.status]}</td>
            {onDetails && (
              <td className="px-3 py-3">
                <button
                  type="button"
                  onClick={() => onDetails(b)}
                  className="text-xs font-semibold whitespace-nowrap text-primary hover:underline"
                >
                  Vezi detalii →
                </button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

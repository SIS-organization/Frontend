// Fereastra „Vezi solicitarea” (lista de așteptare, vedere administrator).
//
// Contractul nu are un endpoint de administrator pentru o singură înscriere, așa că
// fereastra arată datele deja primite în listă (GET /admin/waitlist). La o mutare,
// „Vezi rezervarea actuală” deschide detaliile rezervării care ar fi înlocuită.

import type { WaitlistItem } from "../api";
import { WAITLIST_STATUS } from "../bookingText";
import { bucharestParts, formatClock, formatDayMonth, formatDayMonthYear, formatTimeRange } from "../time";
import AdminDialog from "./AdminDialog";

/** „26 noiembrie · 14:32” pentru un moment ISO. */
function momentLabel(iso: string) {
  return `${formatDayMonth(bucharestParts(iso).date)} · ${formatClock(iso)}`;
}

export default function WaitlistDetailsDialog(props: {
  entry: WaitlistItem;
  onClose: () => void;
  /** Deschide detaliile rezervării actuale (doar la mutări). */
  onShowBooking: (bookingId: string) => void;
}) {
  const { entry, onClose, onShowBooking } = props;
  const status = WAITLIST_STATUS[entry.status];

  const fields: [string, string][] = [
    ["Persoană", entry.userName ?? "—"],
    ["Poziție în coadă", entry.position ? `#${entry.position}` : "—"],
    ["Facilitate", entry.facilityName],
    ["Data", formatDayMonthYear(bucharestParts(entry.startTime).date)],
    ["Interval", formatTimeRange(entry.startTime, entry.endTime)],
    ["Tip", entry.replaceBookingId ? "Mutarea unei rezervări existente" : "Rezervare nouă"],
    ["Înscrisă", entry.createdAt ? momentLabel(entry.createdAt) : "—"],
  ];
  if (entry.status === "offered" && entry.offerExpiresAt) fields.push(["Oferta expiră", momentLabel(entry.offerExpiresAt)]);

  return (
    <AdminDialog
      title="Solicitare pe lista de așteptare"
      width={560}
      onClose={onClose}
      subtitle={
        <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
          {entry.userName ?? "Utilizator"}
          <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${status.tone}`}>{status.label}</span>
        </p>
      }
    >
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5">
            <dt className="text-xs font-semibold text-muted">{label}</dt>
            <dd className="text-sm text-heading">{value}</dd>
          </div>
        ))}
      </dl>
      {entry.replaceBookingId && (
        <div>
          <button
            type="button"
            onClick={() => onShowBooking(entry.replaceBookingId!)}
            className="rounded-[7px] bg-primary px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
          >
            Vezi rezervarea actuală
          </button>
        </div>
      )}
    </AdminDialog>
  );
}

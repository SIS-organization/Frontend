import { useState } from "react";
import type { WaitlistEntry } from "../../api/waitlist";
import type { Booking } from "../../types";
import { ListOrderedIcon } from "../common/AppIcons";
import { relativeDayLabel, slotFromIso } from "../../utils/bookingDisplay";
import { hourLabel } from "../../utils/dates";

type Props = {
  entry: WaitlistEntry;
  bookings: Booking[];
  onLeave: (id: string) => Promise<void>;
};

// Cardul „Lista de așteptare” din coloana dreaptă a paginii „Programările mele”.
export default function WaitlistCard({ entry, bookings, onLeave }: Props) {
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState(false);
  const slot = slotFromIso(entry.startTime);
  const replaced = bookings.find((booking) => booking.id === entry.replaceBookingId);

  const leave = async () => {
    setLeaving(true);
    setError(false);
    try {
      await onLeave(entry.id);
    } catch {
      setError(true);
      setLeaving(false);
    }
  };

  return (
    <section aria-label="Lista de așteptare" className="rounded-2xl border border-black/10 bg-white p-6">
      <h2 className="flex items-center gap-2.5 text-base text-heading">
        <ListOrderedIcon className="size-5 text-primary" />
        Lista de așteptare
      </h2>
      <p className="mt-4 w-fit rounded-md bg-[#e3f0ee] px-2.5 py-1 text-[11px] font-semibold text-primary">
        {entry.status === "offered" ? "Ofertă primită" : `Activă · poziția ${entry.position ?? "–"}`}
      </p>
      <p className="mt-3 text-[13px] font-semibold text-heading">
        {entry.facility.name} · {relativeDayLabel(slot.date)}, {hourLabel(slot.hour)}–{hourLabel(slot.hour + 1)}
      </p>
      <p className="mt-3 text-[13px] leading-relaxed text-muted">
        {replaced
          ? `Te anunțăm dacă se eliberează. O mutare va înlocui rezervarea de la ${hourLabel(replaced.hour)}, fără să adauge una nouă.`
          : "Te anunțăm dacă se eliberează un loc în acest interval."}
      </p>
      <button
        type="button"
        disabled={leaving}
        onClick={leave}
        className="mt-4 text-[13px] font-semibold text-primary hover:underline disabled:opacity-50"
      >
        {leaving ? "Se renunță…" : "Renunță la lista de așteptare"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700">
          Nu am putut renunța. Încearcă din nou.
        </p>
      )}
    </section>
  );
}

import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import Button from "../components/common/Button";
import TimeGrid from "../components/booking/TimeGrid";
import { facilities } from "../mock/data";
import { useBookings } from "../context/BookingsContext";
import type { Booking } from "../types";
import { formatDate, hourLabel, weekDays } from "../utils/dates";

export default function FacilityDetailPage() {
  const { id } = useParams();
  const facility = facilities.find((f) => f.id === Number(id));
  const { addBooking } = useBookings();
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<{ date: string; hour: number } | null>(null);
  const [confirmed, setConfirmed] = useState<Booking | null>(null);

  if (!facility) {
    return (
      <p>
        Facilitatea nu există. <Link to="/" className="text-primary underline">Înapoi la facilități</Link>
      </p>
    );
  }

  const confirm = async () => {
    if (!selected) return;
    const b = await addBooking({ facilityId: facility.id, facilityName: facility.name, ...selected });
    setConfirmed(b);
    setSelected(null);
  };

  return (
    <>
      <Link to="/" className="text-sm text-primary underline">Înapoi la facilități</Link>
      <h1 className="mt-2 text-2xl font-bold">{facility.name}</h1>
      <p className="mb-6 text-muted">{facility.amenities.join(" · ")}</p>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-4 flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setOffset(0)}>Astăzi</Button>
            <Button variant="outline" onClick={() => setOffset(offset - 1)} aria-label="Săptămâna anterioară">←</Button>
            <Button variant="outline" onClick={() => setOffset(offset + 1)} aria-label="Săptămâna următoare">→</Button>
          </div>
          <TimeGrid
            facilityId={facility.id}
            days={weekDays(offset)}
            selected={selected}
            onSelect={(date, hour) => { setConfirmed(null); setSelected({ date, hour }); }}
          />
          <p className="mt-4 text-xs text-muted">
            Legendă: alb = liber, verde închis = ales, gri = ocupat, albastru = curs USV, galben = mentenanță.
          </p>
        </section>

        <aside className="flex flex-col gap-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            {confirmed ? (
              <>
                <h2 className="mb-1 font-semibold">Rezervare confirmată</h2>
                <p className="text-sm text-muted">Cod: {confirmed.code}</p>
                <Link to="/programari" className="mt-3 inline-block text-sm font-medium text-primary underline">
                  Vezi programările mele
                </Link>
              </>
            ) : selected ? (
              <>
                <h2 className="mb-2 font-semibold">Intervalul ales</h2>
                <p className="text-sm">{facility.name}</p>
                <p className="mb-4 text-sm text-muted">
                  {formatDate(selected.date)}, {hourLabel(selected.hour)}–{hourLabel(selected.hour + 1)}
                </p>
                <Button className="w-full" onClick={confirm}>Confirmă rezervarea</Button>
              </>
            ) : (
              <p className="text-sm text-muted">Alege un interval liber din calendar.</p>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-3 text-sm text-muted">Intervalul dorit e ocupat? Te anunțăm dacă se eliberează.</p>
            <Button variant="outline" className="w-full">Intră pe lista de așteptare</Button>
          </div>
        </aside>
      </div>
    </>
  );
}

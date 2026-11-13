import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Button from "../components/common/Button";
import TimeGrid from "../components/booking/TimeGrid";
import { getFacilities, getFacilityAvailability, type FacilityAvailability } from "../api/facilities";
import { useBookings } from "../context/BookingsContext";
import type { Booking, Facility } from "../types";
import { formatDate, hourLabel, slotKey, toISO, weekDays } from "../utils/dates";

const messageOf = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

export default function FacilityDetailPage() {
  const { id } = useParams();
  const facilityId = Number(id);
  const { addBooking } = useBookings();

  // undefined = se încarcă, null = nu există
  const [facility, setFacility] = useState<Facility | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [slots, setSlots] = useState<Record<string, FacilityAvailability>>({});
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<{ date: string; hour: number } | null>(null);
  const [confirmed, setConfirmed] = useState<Booking | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const days = useMemo(() => weekDays(offset), [offset]);

  useEffect(() => {
    let active = true;
    getFacilities()
      .then((list) => {
        if (active) setFacility(list.find((f) => f.id === facilityId) ?? null);
      })
      .catch((err) => {
        if (active) setLoadError(messageOf(err, "Nu s-a putut încărca facilitatea."));
      });
    return () => {
      active = false;
    };
  }, [facilityId]);

  useEffect(() => {
    let active = true;
    getFacilityAvailability(facilityId, toISO(days[0]), toISO(days[6]))
      .then((items) => {
        if (active) setSlots(Object.fromEntries(items.map((s) => [slotKey(s.date, s.hour), s])));
      })
      .catch((err) => {
        if (active) setError(messageOf(err, "Nu s-a putut încărca disponibilitatea."));
      });
    return () => {
      active = false;
    };
  }, [facilityId, days, reload]);

  if (loadError) {
    return (
      <p>
        {loadError} <Link to="/" className="text-primary underline">Înapoi la facilități</Link>
      </p>
    );
  }

  if (facility === undefined) return <p className="text-muted">Se încarcă…</p>;

  if (facility === null) {
    return (
      <p>
        Facilitatea nu există. <Link to="/" className="text-primary underline">Înapoi la facilități</Link>
      </p>
    );
  }

  const confirm = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const b = await addBooking({ facilityId: facility.id, facilityName: facility.name, ...selected });
      setConfirmed(b);
    } catch (err) {
      setError(messageOf(err, "Rezervarea nu a putut fi făcută."));
    } finally {
      setSelected(null);
      setSaving(false);
      setReload((r) => r + 1); // reîncarcă disponibilitatea
    }
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
            days={days}
            slots={slots}
            selected={selected}
            onSelect={(date, hour) => {
              setConfirmed(null);
              setError(null);
              setSelected({ date, hour });
            }}
          />
          <p className="mt-4 text-xs text-muted">
            Legendă: alb = liber, verde închis = ales, gri = ocupat, albastru = curs USV, galben = mentenanță.
            {facility.capacity && facility.capacity > 1 ? " La acest bazin, „3/4 locuri” înseamnă câte culoare mai sunt libere." : ""}
          </p>
        </section>

        <aside className="flex flex-col gap-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            {error && (
              <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
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
                <Button className="w-full" onClick={confirm} disabled={saving}>
                  {saving ? "Se rezervă…" : "Confirmă rezervarea"}
                </Button>
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

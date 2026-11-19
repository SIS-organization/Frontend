import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Button from "../components/common/Button";
import Modal from "../components/common/Modal";
import TimeGrid from "../components/booking/TimeGrid";
import { createBooking, type BookingResponse } from "../api/bookings";
import { ApiError } from "../api/client";
import { getFacility, getFacilityAvailability, type DayAvailability, type Facility, type SlotCell } from "../api/facilities";
import { formatDate, toISO, weekDays } from "../utils/dates";

type SelectedSlot = { facilityId: string; date: string; slot: SlotCell } | null;

function timeLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat("ro-RO", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

export default function FacilityDetailPage() {
  const { id } = useParams();
  const [facilityLoad, setFacilityLoad] = useState<{
    id: string;
    facility: Facility | null;
    error: string | null;
  } | null>(null);
  const [availabilityLoad, setAvailabilityLoad] = useState<{
    key: string;
    days: DayAvailability[];
    error: string | null;
  } | null>(null);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<SelectedSlot>(null);
  const [availabilityVersion, setAvailabilityVersion] = useState(0);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingResult, setBookingResult] = useState<BookingResponse | null>(null);
  const [bookingSlot, setBookingSlot] = useState<SelectedSlot>(null);

  const week = weekDays(offset);
  const from = toISO(week[0]);
  const to = toISO(week[6]);
  const availabilityKey = JSON.stringify([id, from, to, availabilityVersion]);
  const matchingFacilityLoad = facilityLoad?.id === id ? facilityLoad : null;
  const loadingFacility = Boolean(id) && facilityLoad?.id !== id;
  const facility = matchingFacilityLoad?.facility ?? null;
  const facilityError = !id
    ? "Identificatorul facilității lipsește."
    : matchingFacilityLoad?.error ?? null;
  const loadingAvailability = Boolean(id) && availabilityLoad?.key !== availabilityKey;
  const days = availabilityLoad?.key === availabilityKey ? availabilityLoad.days : [];
  const availabilityError = availabilityLoad?.key === availabilityKey ? availabilityLoad.error : null;
  const currentSelection = selected?.facilityId === id ? selected : null;

  useEffect(() => {
    if (!id) return;

    let active = true;

    getFacility(id)
      .then((result) => {
        if (active) setFacilityLoad({ id, facility: result, error: null });
      })
      .catch((requestError: unknown) => {
        if (active) {
          setFacilityLoad({
            id,
            facility: null,
            error: requestError instanceof Error ? requestError.message : "Facilitatea nu a putut fi încărcată.",
          });
        }
      })

    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;

    let active = true;

    getFacilityAvailability(id, from, to)
      .then((availability) => {
        if (active) setAvailabilityLoad({ key: availabilityKey, days: availability.days, error: null });
      })
      .catch((requestError: unknown) => {
        if (active) {
          setAvailabilityLoad({
            key: availabilityKey,
            days: [],
            error: requestError instanceof Error ? requestError.message : "Disponibilitatea nu a putut fi încărcată.",
          });
        }
      })

    return () => {
      active = false;
    };
  }, [id, from, to, availabilityKey]);

  if (loadingFacility) return <p className="text-muted">Se încarcă facilitatea…</p>;

  if (facilityError || !facility) {
    return (
      <div>
        <p role="alert" className="mb-3 text-red-700">
          Facilitatea nu a putut fi afișată{facilityError ? `: ${facilityError}` : "."}
        </p>
        <Link to="/" className="text-primary underline">Înapoi la facilități</Link>
      </div>
    );
  }

  const timezone = facility.timezone ?? "Europe/Bucharest";
  const bookingPreview = currentSelection ?? bookingSlot;
  const closeBookingModal = () => {
    if (bookingSubmitting) return;
    setBookingModalOpen(false);
    setBookingError(null);
    setBookingSlot(null);
    if (bookingResult) {
      setSelected(null);
      setBookingResult(null);
    }
  };
  const changeWeek = (nextOffset: number) => {
    setOffset(nextOffset);
    setSelected(null);
  };
  const submitBooking = async () => {
    if (!currentSelection || bookingSubmitting || bookingResult) return;

    setBookingSlot(currentSelection);
    setBookingSubmitting(true);
    setBookingError(null);
    try {
      const result = await createBooking({
        facilityId: facility.id,
        startTime: currentSelection.slot.startTime,
        endTime: currentSelection.slot.endTime,
      });
      setBookingResult(result);
      setSelected(null);
      setAvailabilityVersion((version) => version + 1);
    } catch (requestError: unknown) {
      if (requestError instanceof ApiError && requestError.status === 409) {
        setSelected(null);
        setAvailabilityVersion((version) => version + 1);
      }
      setBookingError(
        requestError instanceof Error ? requestError.message : "Rezervarea nu a putut fi efectuată.",
      );
    } finally {
      setBookingSubmitting(false);
    }
  };

  return (
    <>
      <Link to="/" className="text-sm font-medium text-primary underline">Înapoi la facilități</Link>
      {facility.imageUrl && (
        <img
          src={facility.imageUrl}
          alt={facility.name}
          className="mb-5 mt-3 h-56 w-full rounded-xl object-cover md:h-80"
        />
      )}
      <header className="mb-6 mt-3">
        <p className="text-sm font-medium text-primary">{facility.sports.map((sport) => sport.label).join(" · ")}</p>
        <h1 className="mt-1 text-2xl font-bold">{facility.name}</h1>
        <p className="mt-2 text-muted">
          {facility.description ?? facility.campus ?? "Alege un interval de 60 de minute din programul facilității."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-sm text-muted">
          {facility.slotDurationMinutes && <span>Durată: {facility.slotDurationMinutes} minute</span>}
          {facility.openingTime && facility.closingTime && (
            <span>Program: {facility.openingTime}–{facility.closingTime}</span>
          )}
          {facility.amenities.map((amenity) => (
            <span key={amenity.code} className="rounded-full bg-white px-3 py-1">{amenity.label}</span>
          ))}
        </div>
        {facility.status !== "operational" && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            {facility.statusNote ?? "Facilitatea poate avea intervale indisponibile."}
          </p>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {formatDate(from)} – {formatDate(to)}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => changeWeek(0)}>Astăzi</Button>
              <Button
                variant="outline"
                onClick={() => changeWeek(offset - 1)}
                aria-label="Săptămâna anterioară"
              >
                ←
              </Button>
              <Button
                variant="outline"
                onClick={() => changeWeek(offset + 1)}
                aria-label="Săptămâna următoare"
              >
                →
              </Button>
            </div>
          </div>

          {availabilityError && (
            <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              Disponibilitatea nu a putut fi încărcată: {availabilityError}
            </p>
          )}
          {loadingAvailability ? (
            <p className="py-6 text-center text-sm text-muted">Se încarcă disponibilitatea…</p>
          ) : !availabilityError && days.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Nu există intervale publicate pentru această săptămână.</p>
          ) : (
            <TimeGrid
              days={days}
              timezone={timezone}
              selectedStartTime={currentSelection?.slot.startTime ?? null}
              onSelect={(date, slot) => setSelected({ facilityId: facility.id, date, slot })}
            />
          )}

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-gray-100 pt-4 text-xs text-muted">
            <span><i className="mr-1 inline-block h-3 w-3 rounded border border-gray-300 bg-white" />Liber</span>
            <span><i className="mr-1 inline-block h-3 w-3 rounded bg-primary" />Selectat</span>
            <span><i className="mr-1 inline-block h-3 w-3 rounded bg-gray-200" />Ocupat</span>
            <span><i className="mr-1 inline-block h-3 w-3 rounded bg-blue-100" />Activitate USV</span>
            <span><i className="mr-1 inline-block h-3 w-3 rounded bg-amber-100" />Mentenanță</span>
          </div>
          <p className="mt-3 text-xs text-muted">
            Selecția nu rezervă intervalul. Disponibilitatea se reverifică la confirmarea rezervării.
          </p>
        </section>

        <aside className="flex flex-col gap-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="mb-2 font-semibold">Intervalul selectat</h2>
            {currentSelection ? (
              <>
                <p className="text-sm">{facility.name}</p>
                <p className="mt-1 text-sm text-muted">
                  {formatDate(currentSelection.date)}, {timeLabel(currentSelection.slot.startTime, timezone)}–
                  {timeLabel(currentSelection.slot.endTime, timezone)}
                </p>
                {currentSelection.slot.label && <p className="mt-2 text-sm text-muted">{currentSelection.slot.label}</p>}
                <Button
                  className="mt-4 w-full"
                  onClick={() => {
                    setBookingError(null);
                    setBookingSlot(currentSelection);
                    setBookingModalOpen(true);
                  }}
                >
                  Rezervă acest interval
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted">Alege un interval liber din calendar pentru a vedea detaliile.</p>
            )}
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="mb-2 font-semibold">Disponibilitate actualizată</h2>
            <p className="text-sm text-muted">
              Intervalele de curs, evenimentele USV, mentenanța și orele închise nu pot fi selectate. O alegere din
              calendar nu blochează intervalul și poate deveni indisponibilă până la confirmare.
            </p>
          </div>
        </aside>
      </div>

      <Modal
        open={bookingModalOpen}
        onClose={closeBookingModal}
        title={bookingResult ? "Rezervare confirmată" : "Confirmă rezervarea"}
      >
        {bookingResult ? (
          <div>
            <p className="text-sm text-muted">
              Rezervarea la {bookingResult.facility.name} a fost înregistrată pentru{" "}
              {formatDate(currentSelection?.date ?? bookingResult.startTime.slice(0, 10))},{" "}
              {timeLabel(bookingResult.startTime, timezone)}–{timeLabel(bookingResult.endTime, timezone)}.
            </p>
            <p className="mt-3 rounded-lg bg-gray-50 p-3 text-sm">
              Cod rezervare: <strong>{bookingResult.code}</strong>
            </p>
            <p className="mt-2 text-xs text-muted">ID rezervare: {bookingResult.id}</p>
            <Button className="mt-5 w-full" onClick={closeBookingModal}>Închide</Button>
          </div>
        ) : (
          <div>
            <p className="text-sm text-muted">
              Confirmi rezervarea pentru {facility.name}, {bookingPreview && (
                <>
                  {formatDate(bookingPreview.date)}, {timeLabel(bookingPreview.slot.startTime, timezone)}–
                  {timeLabel(bookingPreview.slot.endTime, timezone)}
                </>
              )}
              ?
            </p>
            {bookingError && (
              <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {bookingError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={closeBookingModal} disabled={bookingSubmitting}>Renunță</Button>
              <Button onClick={submitBooking} disabled={bookingSubmitting || !currentSelection}>
                {bookingSubmitting ? "Se rezervă…" : "Confirmă rezervarea"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

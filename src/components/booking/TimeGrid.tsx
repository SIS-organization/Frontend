import { Fragment } from "react";
import type { DayAvailability, SlotCell, SlotStatus } from "../../api/facilities";

type Props = {
  days: DayAvailability[];
  timezone: string;
  selectedStartTime: string | null;
  onSelect: (date: string, slot: SlotCell) => void;
};

const styles: Record<SlotStatus | "selected" | "unavailable", string> = {
  free: "border-gray-200 bg-white hover:bg-lime/50",
  selected: "border-primary bg-primary text-white",
  booked: "cursor-not-allowed border-transparent bg-gray-200 text-muted",
  university_course: "cursor-not-allowed border-transparent bg-blue-100 text-blue-800",
  university_event: "cursor-not-allowed border-transparent bg-indigo-100 text-indigo-800",
  maintenance: "cursor-not-allowed border-transparent bg-amber-100 text-amber-900",
  past: "cursor-not-allowed border-transparent bg-gray-100 text-gray-400",
  closed: "cursor-not-allowed border-transparent bg-gray-100 text-gray-500",
  unavailable: "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-500",
};

const labels: Record<SlotStatus | "selected" | "unavailable", string> = {
  free: "Liber",
  selected: "Ales",
  booked: "Ocupat",
  university_course: "Curs",
  university_event: "Eveniment",
  maintenance: "Mentenanță",
  past: "Trecut",
  closed: "Închis",
  unavailable: "Indisponibil",
};

function localTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("ro-RO", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

function dateLabel(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, 12).toLocaleDateString("ro-RO", {
    weekday: "short",
    day: "numeric",
  });
}

export default function TimeGrid({ days, timezone, selectedStartTime, onSelect }: Props) {
  const slotTimes = Array.from(
    new Set(days.flatMap((day) => day.slots.map((slot) => localTime(slot.startTime, timezone)))),
  ).sort();

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[650px] grid-cols-[52px_repeat(7,minmax(72px,1fr))] gap-1 text-xs">
        <div />
        {days.map((day) => (
          <div key={day.date} className="pb-1 text-center font-medium capitalize text-muted">
            {dateLabel(day.date)}
          </div>
        ))}

        {slotTimes.map((time) => (
          <Fragment key={time}>
            <div className="flex items-center text-muted">{time}</div>
            {days.map((day) => {
              const slot = day.slots.find((item) => localTime(item.startTime, timezone) === time);
              if (!slot) return <div key={`${day.date}-${time}`} aria-hidden="true" />;

              const isSelected = selectedStartTime === slot.startTime;
              const canBook = slot.status === "free" && slot.bookable !== false;
              const key = isSelected
                ? "selected"
                : slot.status === "free" && !canBook
                  ? "unavailable"
                  : slot.status;
              const statusLabel = slot.bookedByMe ? "Rezervarea ta" : labels[key];
              const ariaLabel = `${dateLabel(day.date)}, ${time}, ${statusLabel}${slot.label ? `, ${slot.label}` : ""}`;

              return (
                <button
                  key={`${day.date}-${slot.startTime}`}
                  type="button"
                  disabled={!canBook && !isSelected}
                  aria-label={ariaLabel}
                  aria-pressed={isSelected}
                  title={slot.waitlistAvailable ? "Lista de așteptare este disponibilă" : slot.label ?? undefined}
                  onClick={() => onSelect(day.date, slot)}
                  className={`min-h-10 rounded border px-1 text-[10px] leading-tight ${styles[key]}`}
                >
                  {statusLabel}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

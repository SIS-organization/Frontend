import type { UserQuota } from "../../api/bookings";

type Props = {
  quota: UserQuota | null;
  error?: boolean;
};

// KAN-37: bannerul cu cota lunară (maximum 4 rezervări pe lună).
export default function QuotaCard({ quota, error }: Props) {
  if (error) {
    return (
      <p role="alert" className="mb-5 max-w-3xl rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
        Nu am putut încărca cota lunară. Reîncarcă pagina ca să încerci din nou.
      </p>
    );
  }

  if (!quota) {
    return <div aria-hidden className="mb-5 h-[84px] max-w-3xl animate-pulse rounded-xl bg-gray-200" />;
  }

  const { remaining, included, used } = quota;
  if (remaining === null || included === null) {
    return (
      <section aria-label="Cota lunară" className="mb-5 max-w-3xl rounded-xl border border-gray-200 bg-white p-4">
        <p className="font-semibold">Nu se aplică o cotă lunară inclusă acestui cont.</p>
      </section>
    );
  }
  const exhausted = remaining <= 0;

  return (
    <section
      aria-label="Cota lunară"
      className={`mb-5 max-w-3xl rounded-xl border p-4 ${exhausted ? "border-red-200 bg-red-50" : "border-gray-200 bg-white"}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={`font-semibold ${exhausted ? "text-red-700" : ""}`}>
          {exhausted
            ? "Ai atins limita lunară de rezervări"
            : `Îți ${remaining === 1 ? "mai rămâne o rezervare" : `mai rămân ${remaining} rezervări`} luna aceasta`}
        </p>
        <p className="text-sm text-muted">
          {used} din {included} folosite
        </p>
      </div>

      <div
        role="progressbar"
        aria-label="Rezervări folosite luna aceasta"
        aria-valuemin={0}
        aria-valuemax={included}
        aria-valuenow={used}
        className="mt-3 flex gap-1.5"
      >
        {Array.from({ length: included }, (_, i) => (
          <span
            key={i}
            className={`h-2 flex-1 rounded-full ${i < used ? (exhausted ? "bg-red-400" : "bg-primary") : "bg-gray-200"}`}
          />
        ))}
      </div>

      {exhausted && (
        <p className="mt-3 text-sm text-red-700">
          Poți rezerva din nou luna viitoare sau după ce anulezi o rezervare cu cel puțin 2 ore înainte.
        </p>
      )}
    </section>
  );
}

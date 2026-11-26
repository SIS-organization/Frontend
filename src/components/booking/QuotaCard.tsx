import type { UserQuota } from "../../api/bookings";
import { monthName } from "../../utils/dates";

type Props = {
  quota: UserQuota | null;
  error?: boolean;
};

const resetLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("ro-RO", { day: "numeric", month: "long" });

// KAN-37: cardul cu cota lunară (maximum 4 rezervări incluse pe lună), ca în designul „Programările mele”.
export default function QuotaCard({ quota, error }: Props) {
  if (error) {
    return (
      <p role="alert" className="rounded-2xl bg-red-50 px-5 py-4 text-sm text-red-700">
        Nu am putut încărca cota lunară. Reîncarcă pagina ca să încerci din nou.
      </p>
    );
  }

  if (!quota) {
    return <div aria-hidden className="h-[272px] animate-pulse rounded-2xl bg-sidebar/80" />;
  }

  const { remaining, included, used } = quota;
  const month = monthName(quota.month);
  const [year] = quota.month.split("-");

  if (remaining === null || included === null) {
    return (
      <section aria-label="Cota lunară" className="rounded-2xl bg-sidebar p-6 text-white">
        <p className="text-[11px] uppercase tracking-wide text-white/70">
          {month} {year}
        </p>
        <p className="mt-4 text-lg font-semibold">Fără cotă lunară inclusă</p>
        <p className="mt-3 text-[13px] leading-relaxed text-white/75">
          Nu se aplică o cotă lunară inclusă acestui cont.
        </p>
      </section>
    );
  }

  const exhausted = remaining <= 0;
  const percent = included > 0 ? Math.min(100, (used / included) * 100) : 0;

  return (
    <section aria-label="Cota lunară" className="rounded-2xl bg-sidebar p-6 text-white">
      <p className="text-[11px] uppercase tracking-wide text-white/70">
        {month} {year}
      </p>
      <p className="mt-3 flex items-baseline gap-2.5">
        <span className="text-[44px] leading-none text-lime">
          {used} din {included}
        </span>
        <span className="text-[13px] text-white/75">utilizate</span>
      </p>

      <div
        role="progressbar"
        aria-label="Rezervări folosite luna aceasta"
        aria-valuemin={0}
        aria-valuemax={included}
        aria-valuenow={used}
        className="mt-6 h-1 rounded-full bg-white/15"
      >
        <div className="h-full rounded-full bg-lime" style={{ width: `${percent}%` }} />
      </div>

      <h2 className="mt-6 text-base font-semibold">
        {exhausted
          ? "Limita lunară a fost atinsă"
          : `${remaining === 1 ? "Mai ai o rezervare inclusă" : `Mai ai ${remaining} rezervări incluse`}`}
      </h2>
      <p className="mt-3 text-[13px] leading-relaxed text-white/75">
        {exhausted
          ? `Nu poți adăuga o nouă rezervare inclusă în ${month}. Poți gestiona rezervările existente.`
          : `Le poți folosi oricând în ${month}. O anulare cu cel puțin 2 ore înainte restituie ora în cotă.`}
      </p>
      {quota.resetsOn && (
        <p className="mt-4 text-[13px] font-medium text-lime">Următoarea reînnoire: {resetLabel(quota.resetsOn)}</p>
      )}
    </section>
  );
}

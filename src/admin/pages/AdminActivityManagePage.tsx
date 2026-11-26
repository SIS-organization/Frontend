// Pagina „Gestionează activitatea USV” (Figma: „Admin · Gestionează activitatea USV”).
// Se deschide din orar, cu click pe un curs sau un eveniment USV.
//
// Meniul activității are trei acțiuni, conform Swagger:
//   - Vezi detalii          → GET    /admin/activities/{id} (formular doar de citit)
//   - Editează activitatea  → PUT    /admin/activities/{id}
//       Serverul reverifică intervalul. Dacă noul interval are rezervări (409),
//       le arătăm și cerem confirmarea explicită (resolveConflicts: true).
//   - Anulează activitatea  → DELETE /admin/activities/{id}?scope=…
//       Cere confirmare. Se eliberează numai intervalele viitoare.
// Id-ul din adresă este verificat înainte de a fi trimis la server.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/useAuth";
import { ID_PATTERN, formFromActivity, validate, type ActivityForm } from "../activityForm";
import {
  ACTIVITY_TYPE_LABEL,
  cancelActivity,
  getActivity,
  getFacilityKinds,
  previewActivity,
  updateActivity,
  type Activity,
  type ActivityPreview,
  type FacilityKind,
} from "../api";
import { ActivityFields, AffectedList, Card, primaryButton, secondaryButton } from "../components/ActivityForm";
import { bucharestParts, formatDayMonth, formatDayMonthYear, formatTimeRange, isValidIsoDate } from "../time";

/** Ce arată pagina: detaliile, formularul de editare sau confirmarea anulării. */
type Mode = "view" | "edit" | "cancel";

/** Mesajul pentru administrator, după eroarea primită de la server. */
function describeError(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "Contul tău nu mai are drepturi de administrator.";
  if (error instanceof ApiError && error.status === 404) return "Activitatea nu există sau a fost ștearsă.";
  if (error instanceof ApiError && error.status === 501) return "Serverul nu oferă încă gestionarea activităților.";
  return error instanceof Error ? error.message : "Operația nu a reușit. Încearcă din nou.";
}

/** Momentul de sfârșit al ultimei apariții (la repetare: ziua `until`, aceeași oră). */
function lastEnd(activity: Activity): number {
  const { recurrence } = activity;
  if (recurrence.frequency !== "weekly" || !recurrence.until) return Date.parse(activity.endTime);
  const startDay = bucharestParts(activity.startTime).date;
  // Numărul de zile până la ultima apariție, adăugat la sfârșitul primei apariții.
  const days = Math.round((Date.parse(`${recurrence.until}T12:00:00Z`) - Date.parse(`${startDay}T12:00:00Z`)) / 86_400_000);
  return Date.parse(activity.endTime) + Math.floor(days / 7) * 7 * 86_400_000;
}

export default function AdminActivityManagePage() {
  const { logout } = useAuth();
  const { activityId = "" } = useParams();
  const [params] = useSearchParams();
  const validId = ID_PATTERN.test(activityId);

  const [activity, setActivity] = useState<Activity | null>(null);
  const [facilities, setFacilities] = useState<FacilityKind[]>([]);
  const [loadError, setLoadError] = useState<string | null>(validId ? null : "Adresa activității nu este validă.");
  const [form, setForm] = useState<ActivityForm | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Rezervările care s-ar anula la salvare (după un 409 de la server) și confirmarea lor.
  const [review, setReview] = useState<ActivityPreview | null>(null);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  // Momentul deschiderii paginii, folosit ca să știm dacă activitatea s-a încheiat.
  const [openedAt] = useState(() => Date.now());

  // Încărcăm activitatea și lista facilităților o singură dată.
  useEffect(() => {
    if (!validId) return;
    const controller = new AbortController();
    Promise.all([getActivity(activityId, controller.signal), getFacilityKinds(controller.signal)])
      .then(([loaded, list]) => {
        setActivity(loaded);
        setForm(formFromActivity(loaded));
        setFacilities(list);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) logout();
        else setLoadError(describeError(err));
      });
    return () => controller.abort();
  }, [activityId, validId, logout]);

  // O activitate deja începută își păstrează ziua și ora de început (sunt în trecut).
  const started = useMemo(() => {
    if (!activity || Date.parse(activity.startTime) > openedAt) return undefined;
    const saved = formFromActivity(activity);
    return { date: saved.date, startHour: saved.startHour };
  }, [activity, openedAt]);
  const validation = useMemo(() => (form ? validate(form, facilities, started) : null), [form, facilities, started]);
  // Butonul de salvare e activ doar dacă s-a schimbat ceva față de activitatea salvată.
  const original = useMemo(
    () => (activity ? JSON.stringify(validate(formFromActivity(activity), facilities, started).body) : ""),
    [activity, facilities, started],
  );
  const changed = Boolean(validation?.body) && JSON.stringify(validation?.body) !== original;

  const dayParam = params.get("zi");
  const facilityParam = params.get("facilitate");
  const activityDay = activity ? bucharestParts(activity.startTime).date : null;
  const backQuery = new URLSearchParams();
  const backDay = isValidIsoDate(dayParam) ? dayParam : activityDay;
  if (backDay) backQuery.set("zi", backDay);
  if (facilityParam && ID_PATTERN.test(facilityParam)) backQuery.set("facilitate", facilityParam);
  const backLink = `/admin/orar${backQuery.size ? `?${backQuery.toString()}` : ""}`;

  const facilityName = activity ? (facilities.find((f) => f.id === activity.facilityId)?.name ?? "Facilitate") : "";
  const cancelled = activity?.status === "cancelled";
  // O activitate încheiată nu mai poate fi editată sau anulată (nu mai are intervale viitoare).
  const ended = activity ? lastEnd(activity) <= openedAt : false;
  const locked = cancelled || ended;
  const weekly = activity?.recurrence.frequency === "weekly";

  /** Erorile comune: sesiune expirată → login; altfel mesajul rămâne pe pagină. */
  const handleError = (err: unknown) => {
    if (err instanceof ApiError && err.status === 401) logout();
    else setError(describeError(err));
  };

  /** Schimbă ce arată pagina (din cardul „Meniu activitate”). */
  const choose = (next: Mode) => {
    setError(null);
    setNotice(null);
    setReview(null);
    if (next !== "edit" && activity) {
      // Ieșirea din editare renunță la modificările nesalvate.
      setForm(formFromActivity(activity));
      setShowErrors(false);
    }
    setMode(next);
  };

  /** Modifică un câmp din formular (doar în modul de editare). */
  const update = <K extends keyof ActivityForm>(key: K, value: ActivityForm[K]) => {
    setError(null);
    setReview(null);
    setForm((current) => {
      if (!current) return current;
      const next = { ...current, [key]: value };
      if (key === "startHour" && next.endHour <= next.startHour) next.endHour = Math.min(next.startHour + 1, 21);
      return next;
    });
  };

  /** Salvează modificările. `resolveConflicts` = administratorul a confirmat anularea rezervărilor. */
  const save = async (resolveConflicts: boolean) => {
    setShowErrors(true);
    setError(null);
    const body = validation?.body;
    if (!activity || !body || busy) return;
    setBusy(true);
    try {
      const saved = await updateActivity(activity.id, { ...body, resolveConflicts });
      setActivity(saved);
      setForm(formFromActivity(saved));
      setReview(null);
      setShowErrors(false);
      setMode("view");
      setNotice("Modificările au fost salvate. Orarul afișează noul interval.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === "ACTIVITY_CONFLICTS_WITH_BOOKINGS") {
        // Arătăm rezervările afectate și cerem confirmarea; nu anulăm nimic pe ascuns.
        try {
          const fresh = await previewActivity(body);
          setReview(fresh);
          setReviewConfirmed(false);
        } catch (previewError) {
          handleError(previewError);
        }
      } else {
        handleError(err);
      }
    } finally {
      setBusy(false);
    }
  };

  /** Anulează activitatea după confirmare. La repetare săptămânală se anulează toată seria. */
  const confirmCancel = async () => {
    if (!activity || busy) return;
    setBusy(true);
    setError(null);
    try {
      await cancelActivity(activity.id, weekly ? "series" : "this_occurrence");
      setActivity({ ...activity, status: "cancelled" });
      setMode("view");
      setNotice("Activitatea a fost anulată. Intervalul este din nou disponibil în calendar.");
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <div className="flex flex-col items-start gap-4 md:flex-row md:items-end">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-[11px] font-bold text-primary">ADMINISTRATORUL BAZEI SPORTIVE</p>
        <h1 className="text-[28px] leading-[1.16] text-heading">Gestionează activitatea USV</h1>
        {activity && activityDay && (
          <p className="text-[13px] leading-normal text-muted">
            {[activity.code, ACTIVITY_TYPE_LABEL[activity.type], facilityName, formatDayMonthYear(activityDay)]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </div>
      <Link to={backLink} className={secondaryButton}>
        ← Înapoi la orar
      </Link>
    </div>
  );

  if (loadError || !activity || !form) {
    return (
      <>
        {header}
        <Card className="p-6">
          {loadError ? (
            <p role="alert" className="text-sm text-[#ac443c]">
              {loadError}
            </p>
          ) : (
            <p className="text-sm text-muted">Se încarcă activitatea…</p>
          )}
        </Card>
      </>
    );
  }

  const timeRange = formatTimeRange(activity.startTime, activity.endTime);
  const menuItems: { mode: Mode; label: string; disabled: boolean }[] = [
    { mode: "view", label: "Vezi detalii", disabled: false },
    { mode: "edit", label: "Editează activitatea", disabled: locked },
    { mode: "cancel", label: "Anulează activitatea", disabled: locked },
  ];

  return (
    <>
      {header}

      {/* Fila activă; acțiunile (detalii, editare, anulare) sunt în cardul „Meniu activitate”. */}
      <div className="flex text-xs font-semibold">
        <span className="rounded-lg border border-primary bg-primary px-3 py-2.5 text-white sm:w-[190px]">
          Detalii și editare
        </span>
      </div>

      {notice && (
        <p role="status" className="rounded-lg bg-[#e7f2ef] px-4 py-3 text-sm text-primary">
          {notice}
        </p>
      )}
      {cancelled && !notice && (
        <p className="rounded-lg bg-[#fcedea] px-4 py-3 text-sm text-[#ac443c]">
          Activitatea este anulată. Detaliile rămân vizibile, dar nu mai pot fi modificate.
        </p>
      )}
      {!cancelled && ended && (
        <p className="rounded-lg bg-bg px-4 py-3 text-sm text-muted">
          Activitatea s-a încheiat. Detaliile rămân vizibile, dar nu mai pot fi modificate.
        </p>
      )}

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        {/* Stânga: detaliile activității; câmpurile devin editabile doar în modul „Editează”. */}
        <Card className="flex min-w-0 flex-1 flex-col gap-4 p-6">
          <h2 className="text-xl text-heading">Detaliile activității</h2>
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (mode === "edit") void save(false);
            }}
          >
            {/* În modul de editare erorile apar imediat, ca să fie clar de ce nu se poate salva. */}
            <ActivityFields
              form={form}
              facilities={facilities}
              errors={(showErrors || mode === "edit") && validation ? validation.errors : {}}
              disabled={mode !== "edit" || busy}
              lockSchedule={Boolean(started)}
              onChange={update}
            />

            {mode === "edit" && started && (
              <p className="rounded-lg bg-bg px-3 py-2 text-xs text-muted">
                Activitatea a început deja: poți modifica detaliile și ora de sfârșit, dar nu facilitatea, ziua, ora de
                început sau repetarea. Pentru alt interval, anulează activitatea și adaug-o din nou.
              </p>
            )}

            {review && (
              <div className="flex flex-col gap-3 rounded-xl bg-[#fdf3e3] p-4 text-[13px] text-[#926018]">
                <p className="font-semibold">
                  Noul interval are {review.affectedBookings.length}{" "}
                  {review.affectedBookings.length === 1 ? "rezervare care va fi anulată" : "rezervări care vor fi anulate"}
                </p>
                <AffectedList preview={review} />
                <label className="flex items-start gap-2 text-heading">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-primary"
                    checked={reviewConfirmed}
                    onChange={(e) => setReviewConfirmed(e.target.checked)}
                  />
                  Am verificat rezervările afectate și accept anularea lor.
                </label>
              </div>
            )}

            {error && mode !== "cancel" && (
              <p role="alert" className="rounded-lg bg-[#fcedea] px-3 py-2 text-sm text-[#ac443c]">
                {error}
              </p>
            )}

            {mode === "edit" ? (
              <div className="flex flex-wrap gap-3">
                {review ? (
                  <button
                    type="button"
                    className={primaryButton}
                    disabled={!reviewConfirmed || busy}
                    onClick={() => void save(true)}
                  >
                    {busy ? "Se salvează…" : "Salvează și anulează rezervările"}
                  </button>
                ) : (
                  <button type="submit" className={primaryButton} disabled={!changed || busy}>
                    {busy ? "Se salvează…" : "Salvează modificările"}
                  </button>
                )}
                <button type="button" className={secondaryButton} disabled={busy} onClick={() => choose("view")}>
                  Renunță
                </button>
              </div>
            ) : (
              !locked && (
                <div>
                  <button type="button" className={primaryButton} onClick={() => choose("edit")}>
                    Editează activitatea
                  </button>
                </div>
              )
            )}
          </form>
        </Card>

        {/* Dreapta: meniul activității și confirmarea anulării. */}
        <Card className="flex min-w-0 flex-1 flex-col gap-3 p-6 leading-normal">
          <h2 className="mb-1 text-xl text-heading">Meniu activitate</h2>
          {menuItems.map((item) => {
            const active = mode === item.mode;
            const tone =
              item.mode === "cancel"
                ? "bg-[#fcedea] text-[#ac443c]"
                : active
                  ? "bg-[#e7f2ef] text-primary"
                  : "text-heading hover:bg-bg";
            return (
              <button
                key={item.mode}
                type="button"
                aria-pressed={active}
                disabled={item.disabled}
                onClick={() => choose(item.mode)}
                className={`flex h-[52px] items-center rounded-lg px-4 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 ${tone}`}
              >
                {item.label}
              </button>
            );
          })}

          {mode === "cancel" && !locked && (
            <div className="flex flex-col gap-3 rounded-xl bg-[#eef3f1] p-4">
              <h3 className="text-xl text-heading">
                {activity.type === "course" ? "Anulezi cursul universitar?" : "Anulezi evenimentul universitar?"}
              </h3>
              <p className="text-[13px] text-heading">
                {facilityName} · {activityDay && formatDayMonth(activityDay)} · {timeRange}
                <br />
                {weekly && activity.recurrence.until
                  ? `Se anulează toate aparițiile viitoare ale seriei (până la ${formatDayMonth(activity.recurrence.until)}). `
                  : ""}
                Intervalul va redeveni disponibil în calendar. Organizatorul va fi informat.
              </p>
              {error && (
                <p role="alert" className="rounded-lg bg-[#fcedea] px-3 py-2 text-sm text-[#ac443c]">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                <button type="button" className={primaryButton} disabled={busy} onClick={() => void confirmCancel()}>
                  {busy ? "Se anulează…" : "Confirmă anularea"}
                </button>
                <button type="button" className={secondaryButton} disabled={busy} onClick={() => choose("view")}>
                  Păstrează activitatea
                </button>
              </div>
            </div>
          )}

          <p className="text-xs text-muted">
            Modificările și anulările sunt înregistrate în jurnal. Revalidarea intervalului previne suprapunerile.
          </p>
        </Card>
      </div>

      <div className="flex flex-col gap-1 rounded-xl bg-[#e7f2ef] px-5 py-4 text-primary">
        <p className="text-[13px] font-semibold">Anularea activității eliberează intervalul</p>
        <p className="text-xs">
          Din înregistrarea din orar: Vezi detalii · Editează activitatea · Anulează activitatea. Anularea eliberează numai
          intervalele viitoare ale activității selectate.
        </p>
      </div>
    </>
  );
}

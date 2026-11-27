// Pagina „Profil utilizator” (/admin/utilizatori/:userId) — Figma: „Utilizatori · Detalii student”.
// Se deschide din director, cu „Vezi profilul →”.
//
//   - antet: nume · categorie · cum a fost verificată identitatea, „← Înapoi la utilizatori”;
//   - în cardul contului: „Suspendă accesul” (cont activ) sau „Reactivează accesul” (cont suspendat),
//     cu confirmare și motiv obligatoriu (UserAccessDialog, PATCH /admin/users/{userId}/access);
//   - trei file (fila aleasă stă în adresă: ?fila=rezervari | activitate, cu ?pagina=):
//       „Profil și acces”: cardul cu datele contului (e-mail, facultate / departament,
//         campus, verificare, stare acces, ultima autentificare, acces prioritar USV)
//         și cele mai recente rezervări ale persoanei;
//       „Rezervări · N”: toate rezervările, paginate, cu detaliile fiecăreia (UserBookingsTab);
//       „Activitate”: acțiunile persoanei din jurnal (UserActivityTab).
//
// Date:
//   GET /admin/users/{userId}           → profilul (backend-ul înregistrează accesul în jurnal)
//   GET /admin/users/{userId}/bookings  → rezervările (cele recente + numărul total pentru filă)
//   GET /admin/audit-log?actorId=…      → activitatea (în UserActivityTab)
// Id-ul din adresă e verificat înainte de a fi trimis la server; răspunsurile sunt
// verificate în api.ts. Categoria vine din SSO și nu se poate schimba de aici.

import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/useAuth";
import { ID_PATTERN } from "../activityForm";
import { getAdminUser, getAdminUserBookings, type AccessStatus, type UserBookingsPage, type UserProfile, type UserRole } from "../api";
import { Card, primaryButton, secondaryButton } from "../components/ActivityForm";
import UserAccessDialog, { type AccessAction } from "../components/UserAccessDialog";
import UserActivityTab from "../components/UserActivityTab";
import UserBookingsTab from "../components/UserBookingsTab";
import UserBookingsTable from "../components/UserBookingsTable";
import { bucharestParts, formatShortDate } from "../time";

/** Câte rezervări arată fila „Profil și acces” (lista completă e în fila „Rezervări”). */
const RECENT_BOOKINGS = 5;

/** Filele profilului: valoarea din adresă (?fila=) → fila. Fără parametru = „Profil și acces”. */
type Tab = "profile" | "bookings" | "activity";
const TAB_PARAM: Record<Tab, string | null> = {
  profile: null,
  bookings: "rezervari",
  activity: "activitate",
};

/** Filtrele directorului care pot fi păstrate la întoarcere (restul sunt ignorate). */
const DIRECTORY_KEYS = ["cauta", "categorie", "acces", "pagina"];

/** Categoria din antet (ex. „Student USV”). */
const ROLE_TITLE: Record<UserRole, string> = {
  student: "Student USV",
  professor: "Cadru didactic USV",
  external: "Public extern",
  administrator: "Administrator",
};

/** Categoria din card (ex. „Student · Facultatea de Inginerie Electrică”). */
const ROLE_LABEL: Record<UserRole, string> = {
  student: "Student",
  professor: "Cadru didactic",
  external: "Public extern",
  administrator: "Administrator",
};

/** Starea accesului, cu culoarea textului (suspendat / neconfirmat ies în evidență). */
const ACCESS_LABEL: Record<AccessStatus, { text: string; tone: string }> = {
  active: { text: "Acces activ", tone: "text-muted" },
  suspended: { text: "Acces suspendat", tone: "font-semibold text-[#ac443c]" },
  unverified: {
    text: "Cont neconfirmat",
    tone: "font-semibold text-[#926018]",
  },
};

/** Mesajul pentru administrator, după eroarea primită de la server. */
function describeError(error: unknown, what: "profile" | "bookings") {
  if (error instanceof ApiError && error.status === 403) return "Contul tău nu mai are drepturi de administrator.";
  if (error instanceof ApiError && error.status === 404) return "Utilizatorul nu există sau contul a fost șters.";
  if (error instanceof ApiError && error.status === 501) return "Serverul nu oferă încă profilul utilizatorilor.";
  if (error instanceof Error) return error.message;
  return what === "profile" ? "Profilul nu a putut fi încărcat." : "Rezervările nu au putut fi încărcate.";
}

/** Cum a fost verificată identitatea (antet): SSO USV sau e-mail (public extern). */
function identityText(profile: UserProfile) {
  if (profile.identitySource === "sso") return "Identitate verificată prin SSO";
  if (profile.identitySource === "external_email") {
    return profile.accessStatus === "unverified" ? "E-mail neconfirmat" : "E-mail verificat";
  }
  return null;
}

/** Același lucru, mai scurt, pentru rândul cu campusul din card. */
function identityShort(profile: UserProfile) {
  if (profile.identitySource === "sso") return "SSO USV verificat";
  if (profile.identitySource === "external_email") {
    return profile.accessStatus === "unverified" ? "e-mail neconfirmat" : "e-mail verificat";
  }
  return null;
}

/**
 * Filtrele directorului de unde s-a venit (trimise prin `state` de „Vezi profilul →”),
 * ca „← Înapoi la utilizatori” să redeschidă aceeași listă. Păstrăm doar cheile cunoscute.
 */
function directoryLink(state: unknown) {
  const raw = typeof state === "object" && state !== null && "directory" in state ? state.directory : null;
  if (typeof raw !== "string" || raw.length > 300) return "/admin/utilizatori";
  const from = new URLSearchParams(raw);
  const kept = new URLSearchParams();
  for (const key of DIRECTORY_KEYS) {
    const value = from.get(key);
    if (value) kept.set(key, value.slice(0, 100));
  }
  return `/admin/utilizatori${kept.size ? `?${kept.toString()}` : ""}`;
}

export default function AdminUserProfilePage() {
  const { logout } = useAuth();
  const location = useLocation();
  const { userId = "" } = useParams();
  const validId = ID_PATTERN.test(userId);
  const [params, setParams] = useSearchParams();

  // Fila și pagina din adresă, verificate (o valoare necunoscută înseamnă fila / pagina implicită).
  const tab: Tab = params.get("fila") === "rezervari" ? "bookings" : params.get("fila") === "activitate" ? "activity" : "profile";
  const rawPage = Number(params.get("pagina") ?? 1);
  const page = Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 1000 ? rawPage : 1;

  /**
   * Schimbă fila și / sau pagina în adresă. `state` (filtrele directorului) se păstrează,
   * ca „Înapoi la utilizatori” să ducă tot la lista de unde s-a venit.
   */
  const go = useCallback(
    (nextTab: Tab, nextPage = 1) => {
      const search = new URLSearchParams();
      const fila = TAB_PARAM[nextTab];
      if (fila) search.set("fila", fila);
      if (fila && nextPage > 1) search.set("pagina", String(nextPage));
      setParams(search, { replace: true, state: location.state });
    },
    [setParams, location.state],
  );

  // Rezultatele sunt legate de id-ul cerut: la schimbarea adresei nu se amestecă profilurile.
  const [profile, setProfile] = useState<{
    key: string;
    data: UserProfile | null;
    error: string | null;
  } | null>(null);
  // Fereastra de suspendare / reactivare și mesajul de confirmare (legat de profilul afișat).
  const [accessAction, setAccessAction] = useState<AccessAction | null>(null);
  const [notice, setNotice] = useState<{ key: string; text: string } | null>(null);
  const [bookingsReload, setBookingsReload] = useState(0);
  const bookingsKey = `${userId}#${bookingsReload}`;
  const [bookings, setBookings] = useState<{
    key: string;
    data: UserBookingsPage | null;
    error: string | null;
  } | null>(null);

  // Profilul: o singură cerere pentru fiecare id valid.
  useEffect(() => {
    if (!validId) return;
    const controller = new AbortController();
    getAdminUser(userId, controller.signal)
      .then((data) => setProfile({ key: userId, data, error: null }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) logout();
        else
          setProfile({
            key: userId,
            data: null,
            error: describeError(err, "profile"),
          });
      });
    return () => controller.abort();
  }, [userId, validId, logout]);

  // Rezervările recente (prima pagină) și numărul lor total, pentru eticheta filei „Rezervări”.
  useEffect(() => {
    if (!validId) return;
    const controller = new AbortController();
    getAdminUserBookings(userId, { page: 1, pageSize: RECENT_BOOKINGS }, controller.signal)
      .then((data) => setBookings({ key: bookingsKey, data, error: null }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) logout();
        else
          setBookings({
            key: bookingsKey,
            data: null,
            error: describeError(err, "bookings"),
          });
      });
    return () => controller.abort();
    // `bookingsKey` conține deja id-ul și numărul de reîncercări.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingsKey, validId, logout]);

  const current = profile && profile.key === userId ? profile : null;
  const user = current?.data ?? null;
  const loadError = validId ? (current?.error ?? null) : "Adresa profilului nu este validă.";
  const shownBookings = bookings && bookings.key === bookingsKey ? bookings : null;
  const backLink = directoryLink(location.state);

  const header = (
    <div className="flex flex-col items-start gap-4 md:flex-row md:items-end">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-[11px] font-bold text-primary">ADMINISTRATORUL BAZEI SPORTIVE</p>
        <h1 className="text-[28px] leading-[1.16] text-heading">Profil utilizator</h1>
        <p className="text-[13px] leading-normal text-muted">
          {user
            ? [user.name, ROLE_TITLE[user.role], identityText(user)].filter(Boolean).join(" · ")
            : "Identitatea, accesul și rezervările unui membru al comunității."}
        </p>
      </div>
      <Link to={backLink} className={secondaryButton}>
        ← Înapoi la utilizatori
      </Link>
    </div>
  );

  if (loadError || !user) {
    return (
      <>
        {header}
        <Card className="p-6">
          {loadError ? (
            <p role="alert" className="text-sm text-[#ac443c]">
              {loadError}
            </p>
          ) : (
            <p className="text-sm text-muted">Se încarcă profilul…</p>
          )}
        </Card>
      </>
    );
  }

  const access = user.accessStatus ? ACCESS_LABEL[user.accessStatus] : null;
  // Doar conturile active sau suspendate își pot schimba accesul de aici. Un cont neconfirmat
  // devine activ doar după confirmarea e-mailului; administratorii nu se gestionează din această pagină.
  const accessActionFor: AccessAction | null =
    user.role === "administrator"
      ? null
      : user.accessStatus === "active"
        ? "suspend"
        : user.accessStatus === "suspended"
          ? "reactivate"
          : null;
  const shownNotice = notice && notice.key === user.id ? notice.text : null;

  /** Accesul a fost schimbat: actualizăm profilul afișat cu starea confirmată de server. */
  const accessChanged = (status: AccessStatus) => {
    setProfile((prev) => (prev && prev.data && prev.key === user.id ? { ...prev, data: { ...prev.data, accessStatus: status } } : prev));
    setAccessAction(null);
    setNotice({
      key: user.id,
      text:
        status === "suspended"
          ? `Accesul lui ${user.name} a fost suspendat. Persoana nu mai poate face rezervări noi.`
          : `Accesul lui ${user.name} a fost reactivat. Persoana poate rezerva din nou.`,
    });
  };
  const lastLogin = user.lastLoginAt
    ? `Ultima autentificare: ${formatShortDate(bucharestParts(user.lastLoginAt).date)}`
    : "Nu s-a autentificat încă";
  const totalBookings = shownBookings?.data?.totalItems;

  const tabs: { value: Tab; label: string }[] = [
    { value: "profile", label: "Profil și acces" },
    {
      value: "bookings",
      label: typeof totalBookings === "number" ? `Rezervări · ${totalBookings}` : "Rezervări",
    },
    { value: "activity", label: "Activitate" },
  ];

  return (
    <>
      {header}

      <div role="tablist" aria-label="Profil utilizator" className="flex flex-wrap gap-3 text-xs font-semibold">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => tab !== t.value && go(t.value)}
            className={`rounded-lg border px-3 py-2.5 text-left sm:w-[160px] ${
              tab === t.value ? "border-primary bg-primary text-white" : "border-[#dde5e2] bg-white text-heading hover:bg-bg"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {shownNotice && (
        <p role="status" className="rounded-lg bg-[#e7f2ef] px-4 py-3 text-sm text-primary">
          {shownNotice}
        </p>
      )}

      {tab === "bookings" && <UserBookingsTab userId={user.id} page={page} onPage={(n) => go("bookings", n)} onUnauthorized={logout} />}
      {tab === "activity" && <UserActivityTab userId={user.id} page={page} onPage={(n) => go("activity", n)} onUnauthorized={logout} />}
      {tab === "profile" && (
        <>
          {/* Datele contului. Textele vin de la server, dar React le afișează ca text simplu (fără HTML). */}
          <Card className="flex flex-col gap-3 p-6 leading-normal">
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
              <div className="flex min-w-0 flex-col gap-3">
                <h2 className="text-xl text-heading">{user.name}</h2>
                <p className="text-[13px] break-all text-primary">{user.email}</p>
              </div>
              {accessActionFor === "suspend" && (
                <button
                  type="button"
                  onClick={() => setAccessAction("suspend")}
                  className="flex h-10 shrink-0 items-center rounded-lg border border-[#ecc8c3] bg-white px-4 text-[13px] font-semibold text-[#ac443c] hover:bg-[#fcedea]"
                >
                  Suspendă accesul
                </button>
              )}
              {accessActionFor === "reactivate" && (
                <button type="button" onClick={() => setAccessAction("reactivate")} className={`${primaryButton} shrink-0`}>
                  Reactivează accesul
                </button>
              )}
            </div>
            <div className="flex flex-col gap-0.5 text-[13px] text-muted">
              <p>{[ROLE_LABEL[user.role], user.faculty ?? user.department].filter(Boolean).join(" · ")}</p>
              {(user.campus || identityShort(user)) && <p>{[user.campus, identityShort(user)].filter(Boolean).join(" · ")}</p>}
              <p>
                {access && <span className={access.tone}>{access.text}</span>}
                {access && " · "}
                {lastLogin}
              </p>
            </div>
            {user.priority && (
              <div className="flex flex-col gap-1 rounded-lg bg-[#e7f2ef] px-4 py-3">
                <p className="text-[13px] font-semibold text-primary">Acces prioritar USV</p>
                <p className="text-xs text-muted">
                  Rolul este sincronizat cu identitatea universitară. Modificările de eligibilitate sunt preluate de la instituție.
                </p>
              </div>
            )}
          </Card>

          {/* Cele mai recente rezervări ale persoanei. */}
          <Card className="flex flex-col gap-4 p-5">
            {shownBookings?.error && (
              <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg bg-[#fcedea] px-4 py-3 text-sm text-[#ac443c]">
                {shownBookings.error}
                <button type="button" className={secondaryButton} onClick={() => setBookingsReload((n) => n + 1)}>
                  Reîncearcă
                </button>
              </div>
            )}
            <div className="overflow-x-auto" aria-busy={!shownBookings}>
              {!shownBookings && <p className="py-8 text-center text-sm text-muted">Se încarcă rezervările…</p>}
              {shownBookings?.data && shownBookings.data.items.length === 0 && (
                <p className="py-8 text-center text-sm text-muted">Utilizatorul nu are rezervări.</p>
              )}
              {shownBookings?.data && shownBookings.data.items.length > 0 && <UserBookingsTable items={shownBookings.data.items} />}
            </div>
          </Card>
        </>
      )}

      {accessAction && accessActionFor === accessAction && (
        <UserAccessDialog
          user={user}
          action={accessAction}
          onClose={() => setAccessAction(null)}
          onChanged={accessChanged}
          onUnauthorized={logout}
        />
      )}
    </>
  );
}

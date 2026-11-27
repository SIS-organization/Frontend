// Pagina „Utilizatori” (/admin/utilizatori): directorul comunității (Figma: „Utilizatori ·
// Director și filtre”).
//
//   - 4 carduri cu totaluri: total, studenți USV, cadre didactice, public extern;
//   - căutare după nume sau e-mail, filtre pe categorie și stare de acces;
//   - tabel: utilizator, categorie, verificare / acces, „Vezi profilul →” (deschide profilul);
//   - „Categorii disponibile”: scurtături pentru filtrul de categorie;
//   - „Exportă utilizatori” (GET /admin/users/export, CSV).
// Datele vin din GET /admin/users. Categoria (rolul) vine din SSO și nu se schimbă de aici.
//
// Filtrele stau în adresă (?cauta=&categorie=&acces=&pagina=) și sunt verificate înainte de folosire.

import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/useAuth";
import {
  SEARCH_MAX,
  exportUsers,
  getAdminUsers,
  type AccessStatus,
  type UserRole,
  type UsersPage,
} from "../api";
import { Card, Select, input, secondaryButton } from "../components/ActivityForm";
import Pagination from "../components/Pagination";
import { saveFile } from "../download";
import { todayInBucharest } from "../time";

/** Câte rânduri pe pagină. */
const PAGE_SIZE = 20;
/** Cât așteptăm după ultima tastă înainte de căutare (ms). */
const SEARCH_DELAY = 350;

/** Categoriile din filtru: valoarea din adresă → rolul din contract și eticheta. */
const CATEGORIES: { param: string; role: UserRole; label: string; plural: string }[] = [
  { param: "student", role: "student", label: "Student", plural: "Studenți" },
  { param: "cadru-didactic", role: "professor", label: "Cadru didactic", plural: "Cadre didactice" },
  { param: "extern", role: "external", label: "Public extern", plural: "Public extern" },
];

/** Stările de acces din filtru: valoarea din adresă → valoarea din contract și eticheta. */
const ACCESS: { param: string; value: AccessStatus; label: string }[] = [
  { param: "activ", value: "active", label: "Activ" },
  { param: "suspendat", value: "suspended", label: "Suspendat" },
  { param: "neconfirmat", value: "unverified", label: "Neconfirmat" },
];

/** Eticheta categoriei în tabel. */
const ROLE_LABEL: Record<UserRole, string> = {
  student: "Student",
  professor: "Cadru didactic",
  external: "Public extern",
  administrator: "Administrator",
};

/** Mesajul pentru administrator, după eroarea primită de la server. */
function describeError(error: unknown) {
  if (error instanceof ApiError && error.status === 403) return "Contul tău nu mai are drepturi de administrator.";
  if (error instanceof ApiError && (error.status === 404 || error.status === 501)) return "Serverul nu oferă încă lista de utilizatori.";
  return error instanceof Error ? error.message : "Utilizatorii nu au putut fi încărcați.";
}

const th = "px-3 py-2.5 text-[10px] font-semibold tracking-wide text-muted uppercase";

export default function AdminUsersPage() {
  const { logout } = useAuth();
  const [params, setParams] = useSearchParams();
  const location = useLocation();

  // Filtrele din adresă, verificate (o valoare necunoscută e ignorată, nu trimisă la server).
  const q = (params.get("cauta") ?? "").slice(0, SEARCH_MAX);
  const category = CATEGORIES.find((c) => c.param === params.get("categorie")) ?? null;
  const access = ACCESS.find((a) => a.param === params.get("acces")) ?? null;
  const rawPage = Number(params.get("pagina") ?? 1);
  const page = Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 1000 ? rawPage : 1;

  // Textul din căutare se trimite cu o mică întârziere; urmează adresa la Înapoi / Înainte.
  const [searchText, setSearchText] = useState(q);
  const [syncedQ, setSyncedQ] = useState(q);
  if (q !== syncedQ) {
    setSyncedQ(q);
    setSearchText(q);
  }
  const [reload, setReload] = useState(0);
  const requestKey = JSON.stringify([q, category?.role, access?.value, page, reload]);
  const [result, setResult] = useState<{ key: string; data: UsersPage | null; error: string | null } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  /** Schimbă unul sau mai multe filtre din adresă; orice filtru nou duce la pagina 1. */
  const setFilters = useCallback(
    (next: Record<string, string | null>, keepPage = false) => {
      setParams(
        (current) => {
          const search = new URLSearchParams(current);
          for (const [key, value] of Object.entries(next)) {
            if (value) search.set(key, value);
            else search.delete(key);
          }
          if (!keepPage) search.delete("pagina");
          return search;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // Căutarea: după o scurtă pauză în tastare, textul ajunge în adresă (și declanșează cererea).
  useEffect(() => {
    const trimmed = searchText.trim();
    if (trimmed === q) return;
    const timer = window.setTimeout(() => setFilters({ cauta: trimmed || null }), SEARCH_DELAY);
    return () => window.clearTimeout(timer);
  }, [searchText, q, setFilters]);

  // Pagina curentă din director; se reîncarcă la orice schimbare de filtru.
  useEffect(() => {
    const controller = new AbortController();
    getAdminUsers({ q, role: category?.role ?? null, accessStatus: access?.value ?? null, page, pageSize: PAGE_SIZE }, controller.signal)
      .then((data) => setResult({ key: requestKey, data, error: null }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) logout();
        else setResult({ key: requestKey, data: null, error: describeError(err) });
      });
    return () => controller.abort();
    // `requestKey` conține deja toate valorile folosite mai sus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, logout]);

  /** „Exportă utilizatori”: fișierul CSV vine de la server (toată comunitatea). */
  const exportList = async () => {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const file = await exportUsers();
      saveFile(file.blob, file.filename ?? `utilizatori-${todayInBucharest()}.csv`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) logout();
      else setExportError(err instanceof Error ? err.message : "Exportul nu a reușit.");
    } finally {
      setExporting(false);
    }
  };

  const current = result && result.key === requestKey ? result : null;
  // Cât se încarcă pagina nouă, păstrăm vizibil rezultatul anterior (estompat).
  const shown = current ?? result;
  const data = shown?.data ?? null;
  const loading = !current;
  const hasFilters = Boolean(q || category || access);

  const cards: [string, number | null | undefined][] = [
    ["Total utilizatori", data?.totals.total],
    ["Studenți USV", data?.totals.students],
    ["Cadre didactice", data?.totals.professors],
    ["Public extern", data?.totals.external],
  ];

  return (
    <>
      <div className="flex flex-col items-start gap-4 md:flex-row md:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="text-[11px] font-bold text-primary">ADMINISTRATORUL BAZEI SPORTIVE</p>
          <h1 className="text-[28px] leading-[1.16] text-heading">Utilizatori</h1>
          <p className="max-w-[710px] text-[13px] leading-normal text-muted">
            Identitate verificată, acces pe categorii și rezervările comunității USV.
          </p>
        </div>
        <button type="button" className={secondaryButton} disabled={exporting} onClick={() => void exportList()}>
          {exporting ? "Se exportă…" : "Exportă utilizatori"}
        </button>
      </div>

      {exportError && (
        <p role="alert" className="rounded-lg bg-[#fcedea] px-4 py-3 text-sm text-[#ac443c]">
          {exportError}
        </p>
      )}

      {/* Totalurile (toată comunitatea). */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <Card key={label} className="flex flex-col gap-2 px-4 py-3">
            <p className="text-xs text-muted">{label}</p>
            <p className="text-[28px] leading-none text-primary">{typeof value === "number" ? value : "—"}</p>
          </Card>
        ))}
      </div>

      {/* Filtrele. */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[240px] flex-[2] flex-col gap-1.5">
          <label htmlFor="users-search" className="sr-only">
            Caută nume sau e-mail
          </label>
          <input
            id="users-search"
            type="search"
            className={input}
            value={searchText}
            maxLength={SEARCH_MAX}
            placeholder="Caută nume sau e-mail"
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
        <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <label htmlFor="users-category" className="sr-only">
            Categorie
          </label>
          <Select id="users-category" value={category?.param ?? ""} onChange={(e) => setFilters({ categorie: e.target.value || null })}>
            {/* Opțiunile arată doar categoria; prima spune ce filtrează, ca selectul închis să fie clar. */}
            <option value="">Toate categoriile</option>
            {CATEGORIES.map((c) => (
              <option key={c.param} value={c.param}>
                {c.plural}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <label htmlFor="users-access" className="sr-only">
            Acces
          </label>
          <Select id="users-access" value={access?.param ?? ""} onChange={(e) => setFilters({ acces: e.target.value || null })}>
            {/* Opțiunile arată doar starea; prima spune ce filtrează, ca selectul închis să fie clar. */}
            <option value="">Toate stările de acces</option>
            {ACCESS.map((a) => (
              <option key={a.param} value={a.param}>
                {a.label}
              </option>
            ))}
          </Select>
        </div>
        <button
          type="button"
          className={secondaryButton}
          disabled={!hasFilters && !searchText}
          onClick={() => {
            setSearchText("");
            setFilters({ cauta: null, categorie: null, acces: null });
          }}
        >
          Resetează
        </button>
      </div>

      <Card className="flex flex-col gap-4 p-5">
        {shown?.error && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg bg-[#fcedea] px-4 py-3 text-sm text-[#ac443c]">
            {shown.error}
            <button type="button" className={secondaryButton} onClick={() => setReload((n) => n + 1)}>
              Reîncearcă
            </button>
          </div>
        )}

        {/* Tabelul. Textele vin de la server, dar React le afișează ca text simplu (fără HTML). */}
        <div className={`overflow-x-auto ${loading && data ? "opacity-50" : ""}`} aria-busy={loading}>
          {!data && !shown?.error && <p className="py-10 text-center text-sm text-muted">Se încarcă utilizatorii…</p>}
          {data && data.items.length === 0 && (
            <p className="py-10 text-center text-sm text-muted">
              {hasFilters ? "Niciun utilizator nu corespunde filtrelor alese." : "Nu există utilizatori."}
            </p>
          )}
          {data && data.items.length > 0 && (
            <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="bg-[#eef3f1]">
                  <th scope="col" className={th}>Utilizator</th>
                  <th scope="col" className={th}>Categorie</th>
                  <th scope="col" className={th}>Verificare / acces</th>
                  <th scope="col" className={th}>Acțiune</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((u) => (
                  <tr key={u.id} className="border-b border-[#eef3f1] last:border-0">
                    <td className="px-3 py-3 font-semibold text-heading">{u.name}</td>
                    <td className="px-3 py-3 text-heading">{u.role ? ROLE_LABEL[u.role] : "—"}</td>
                    <td className="px-3 py-3 text-heading">{u.verification ?? "—"}</td>
                    <td className="px-3 py-3">
                      {/* Filtrele curente merg cu profilul, ca „Înapoi la utilizatori” să redeschidă aceeași listă.
                          Id-ul a fost verificat la sosire (api.ts) și e codificat în adresă. */}
                      <Link
                        to={`/admin/utilizatori/${encodeURIComponent(u.id)}`}
                        state={{ directory: location.search }}
                        className="text-xs font-semibold whitespace-nowrap text-primary hover:underline"
                      >
                        Vezi profilul →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {data && (
        <Pagination
          page={data.page}
          totalPages={data.totalPages}
          totalItems={data.totalItems}
          shown={data.items.length}
          loading={loading}
          onPage={(n) => setFilters({ pagina: n > 1 ? String(n) : null }, true)}
        />
      )}

      {/* „Categorii disponibile”: scurtături pentru filtrul de categorie (ca în Figma). */}
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs font-semibold text-muted">Categorii disponibile</p>
        {[{ param: null, plural: "Toate" }, ...CATEGORIES].map((c) => {
          const active = (category?.param ?? null) === c.param;
          return (
            <button
              key={c.plural}
              type="button"
              aria-pressed={active}
              onClick={() => setFilters({ categorie: c.param })}
              className={`rounded-lg border px-4 py-2 text-xs font-semibold ${
                active ? "border-primary bg-primary text-white" : "border-[#dde5e2] bg-white text-heading hover:bg-bg"
              }`}
            >
              {c.plural}
            </button>
          );
        })}
      </div>
    </>
  );
}

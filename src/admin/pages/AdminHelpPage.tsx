// Pagina „Ajutor și regulament” (/admin/ajutor) — Figma: „Administrare · Ajutor și regulament · Desktop”.
//
//   - „Descarcă regulamentul”: salvează regulile într-un fișier text (.txt), generat în browser;
//   - „Regulile platformei”: lista numerotată, primită de la server (GET /rules, public);
//   - „Unde găsești fiecare acțiune”: ce face fiecare secțiune din meniu (legături spre cele gata);
//   - „Trasabilitate pentru fiecare intervenție”: cum sunt înregistrate acțiunile administrative.
// Față de Figma lipsesc, la cerere: căutarea în reguli, caseta de sprijin tehnic și
// „Copiază rezumatul pentru suport”.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../api/client";
import { COMING_SOON, adminSections } from "../adminNav";
import { getRules, type PlatformRules } from "../api";
import { Card, secondaryButton } from "../components/ActivityForm";
import { saveFile } from "../download";

/**
 * Secțiunile din „Unde găsești fiecare acțiune”, câte una pentru fiecare element din meniu, în aceeași
 * ordine (primele trei au textele din Figma), și pagina fiecăreia. Cele încă neimplementate nu sunt legături.
 */
const WHERE: { title: string; path: string; description: string }[] = [
  {
    title: "Orar și incidente",
    path: "orar",
    description: "Adaugă cursuri și evenimente; gestionează perioadele de mentenanță și redeschiderea.",
  },
  { title: "Rezervări", path: "rezervari", description: "Consultă programările viitoare, istoricul, anulările și lista de așteptare." },
  { title: "Utilizatori", path: "utilizatori", description: "Verifică identitatea, eligibilitatea și rezervările asociate." },
  {
    title: "Rapoarte",
    path: "rapoarte",
    description: "Consultă activitatea agregată și exportă rapoarte despre utilizarea bazei sportive.",
  },
  {
    title: "Jurnal și notificări",
    path: "jurnal",
    description: "Urmărește acțiunile administrative și notificările trimise; vezi alertele nereușite.",
  },
  { title: "Cont și preferințe", path: "cont", description: "Gestionează contul de administrator și preferințele de notificare." },
];

/** Mesajul pentru administrator, după eroarea primită de la server. */
function describeError(error: unknown) {
  if (error instanceof ApiError && (error.status === 404 || error.status === 501)) return "Serverul nu oferă încă regulamentul.";
  return error instanceof Error ? error.message : "Regulamentul nu a putut fi încărcat.";
}

/**
 * Textul fișierului descărcat: titlul, versiunea, regulile și valorile de bază.
 * Rânduri Windows (CRLF) și BOM, ca diacriticele să apară corect și în Notepad.
 */
function rulesDocument(data: PlatformRules) {
  const p = data.parameters;
  const values = [
    p.slotDurationMinutes && `Durata unui interval: ${p.slotDurationMinutes} de minute`,
    p.monthlyIncludedBookings && `Rezervări incluse pe lună (studenți): ${p.monthlyIncludedBookings}`,
    p.minCancellationNoticeHours && `Anulare de către utilizator: cu cel puțin ${p.minCancellationNoticeHours} ore înainte`,
    p.reminderLeadHours && `Memento înainte de rezervare: cu ${p.reminderLeadHours} ore înainte`,
    p.timezone && `Fus orar: ${p.timezone}`,
  ].filter(Boolean);
  const lines = [
    "Regulamentul platformei USV Sport",
    data.version ? `Versiunea ${data.version}` : "",
    "",
    ...data.rules.flatMap((r) => [`${r.code ? `${r.code} · ` : ""}${r.title}`, r.description, ""]),
    ...(values.length ? ["Valori de bază", ...values.map((v) => `- ${v}`)] : []),
  ];
  return new Blob([`﻿${lines.join("\r\n")}\r\n`], { type: "text/plain;charset=utf-8" });
}

export default function AdminHelpPage() {
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<{ key: number; data: PlatformRules | null; error: string | null } | null>(null);

  // Regulile de la server; „Reîncearcă” le cere din nou.
  useEffect(() => {
    const controller = new AbortController();
    getRules(controller.signal)
      .then((data) => setResult({ key: reload, data, error: null }))
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setResult({ key: reload, data: null, error: describeError(err) });
      });
    return () => controller.abort();
  }, [reload]);

  const current = result && result.key === reload ? result : null;
  const rules = current?.data ?? null;

  /** Salvează regulamentul ca fișier text (numele conține versiunea, dacă există). */
  const download = () => {
    if (!rules) return;
    saveFile(rulesDocument(rules), `regulament-usv-sport${rules.version ? `-${rules.version}` : ""}.txt`);
  };

  return (
    <>
      <div className="flex flex-col items-start gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-bold text-primary">ADMINISTRATORUL BAZEI SPORTIVE</p>
          <h1 className="text-[28px] leading-[1.16] text-heading">Ajutor și regulament</h1>
          <p className="text-[13px] leading-normal text-muted">Repere pentru o administrare sigură și predictibilă a bazei sportive.</p>
        </div>
        <button type="button" className={secondaryButton} disabled={!rules || rules.rules.length === 0} onClick={download}>
          Descarcă regulamentul
        </button>
      </div>

      {/* Cele două carduri au aceeași înălțime (se întind până la cel mai înalt). */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        {/* Regulile primite de la server. Textele sunt afișate ca text simplu (fără HTML). */}
        <Card className="flex flex-1 flex-col gap-4 p-6">
          <h2 className="text-xl text-heading">Regulile platformei</h2>
          <div className="flex flex-col gap-4" aria-busy={!current}>
            {!current && <p className="text-sm text-muted">Se încarcă regulamentul…</p>}
            {current?.error && (
              <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg bg-[#fcedea] px-4 py-3 text-sm text-[#ac443c]">
                {current.error}
                <button type="button" className={secondaryButton} onClick={() => setReload((n) => n + 1)}>
                  Reîncearcă
                </button>
              </div>
            )}
            {rules && rules.rules.length === 0 && <p className="text-sm text-muted">Regulamentul nu conține încă reguli.</p>}
            {rules && rules.rules.length > 0 && (
              <ol className="flex flex-col gap-4">
                {rules.rules.map((r, index) => (
                  <li key={`${r.code}-${index}`} className="flex flex-col gap-1">
                    <p className="text-[13px] font-semibold text-heading">
                      {r.code ? `${r.code} · ` : ""}
                      {r.title}
                    </p>
                    <p className="text-xs leading-normal text-muted">{r.description}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Card>

        {/* Unde se află fiecare acțiune; secțiunile încă neimplementate nu sunt legături. */}
        <Card className="flex flex-1 flex-col gap-4 p-6">
          <h2 className="text-xl text-heading">Unde găsești fiecare acțiune</h2>
          <ul className="flex flex-col gap-4">
            {WHERE.map((w) => {
              const ready = adminSections.find((s) => s.path === w.path)?.ready === true;
              return (
                <li key={w.path} className="flex flex-col gap-1">
                  {ready ? (
                    <Link to={`/admin/${w.path}`} className="self-start text-[13px] font-semibold text-primary hover:underline">
                      {w.title}
                    </Link>
                  ) : (
                    <span title={COMING_SOON} className="self-start text-[13px] font-semibold text-primary/60">
                      {w.title}
                    </span>
                  )}
                  <p className="text-xs leading-normal text-muted">{w.description}</p>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <div className="flex flex-col gap-1 rounded-xl bg-[#e7f2ef] px-5 py-4">
        <p className="text-[13px] font-semibold text-primary">Trasabilitate pentru fiecare intervenție</p>
        <p className="text-xs text-primary">
          Acțiunile administrative sunt asociate contului autentificat. Disponibilitatea este reverificată la confirmare pentru a preveni
          rezervările suprapuse.
        </p>
      </div>
    </>
  );
}

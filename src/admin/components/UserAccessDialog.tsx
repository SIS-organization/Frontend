// Fereastra „Suspendă accesul” / „Reactivează accesul”, deschisă din profilul unui utilizator.
//
// Fluxul, conform Swagger (PATCH /admin/users/{userId}/access):
//   - contul activ poate fi suspendat, iar cel suspendat reactivat (cel neconfirmat nu apare aici);
//   - motivul e obligatoriu (3–300 de caractere) și rămâne în jurnal, cu numele administratorului;
//   - identitatea din SSO și cota lunară nu se schimbă (regulamentul nu poate fi ocolit).
// Cât rulează cererea, fereastra nu se poate închide (ca să nu pierdem răspunsul).

import { useState } from "react";
import { ApiError } from "../../api/client";
import { ACCESS_REASON_MAX, ACCESS_REASON_MIN, updateUserAccess, type AccessStatus } from "../api";
import AdminDialog from "./AdminDialog";

/** Ce face fereastra: suspendă un cont activ sau reactivează unul suspendat. */
export type AccessAction = "suspend" | "reactivate";

/** Textele care diferă între cele două acțiuni. */
const TEXT: Record<
  AccessAction,
  { title: string; label: string; placeholder: string; submit: string; busy: string; effects: string[]; button: string }
> = {
  suspend: {
    title: "Suspendă accesul",
    label: "Motivul suspendării (rămâne în jurnal)",
    placeholder: "Ex.: Trei rezervări consecutive la care persoana nu s-a prezentat.",
    submit: "Suspendă accesul",
    busy: "Se suspendă…",
    effects: [
      "Persoana nu mai poate face rezervări noi până când accesul este reactivat.",
      "Identitatea din SSO și cota lunară rămân neschimbate.",
      "Suspendarea este înregistrată în jurnal, împreună cu numele administratorului și motivul.",
    ],
    button: "bg-[#ac443c]",
  },
  reactivate: {
    title: "Reactivează accesul",
    label: "Motivul reactivării (rămâne în jurnal)",
    placeholder: "Ex.: Situația a fost clarificată cu persoana.",
    submit: "Reactivează accesul",
    busy: "Se reactivează…",
    effects: [
      "Persoana poate face din nou rezervări, în limita cotei lunare.",
      "Reactivarea este înregistrată în jurnal, împreună cu numele administratorului și motivul.",
    ],
    button: "bg-primary",
  },
};

/** Mesajul pentru administrator, după eroarea primită de la server. */
function describeError(error: unknown) {
  if (error instanceof ApiError && error.status === 403) return "Contul tău nu mai are drepturi de administrator.";
  if (error instanceof ApiError && error.status === 404) return "Utilizatorul nu mai există.";
  if (error instanceof ApiError && error.status === 501) return "Serverul nu oferă încă schimbarea accesului.";
  return error instanceof Error ? error.message : "Schimbarea accesului nu a reușit. Încearcă din nou.";
}

export default function UserAccessDialog(props: {
  user: { id: string; name: string; email: string };
  action: AccessAction;
  onClose: () => void;
  /** Schimbarea a reușit: pagina părinte actualizează profilul și afișează confirmarea. */
  onChanged: (status: AccessStatus) => void;
  /** Sesiune expirată (401): pagina părinte face delogarea. */
  onUnauthorized: () => void;
}) {
  const { user, action, onClose, onChanged, onUnauthorized } = props;
  const text = TEXT[action];
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = reason.trim();
  const valid = trimmed.length >= ACCESS_REASON_MIN && trimmed.length <= ACCESS_REASON_MAX;

  /** Trimite schimbarea; la reușită anunță pagina părinte cu starea confirmată de server. */
  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const status = await updateUserAccess(user.id, action === "suspend" ? "suspended" : "active", trimmed);
      onChanged(status);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onUnauthorized();
      else setError(describeError(err));
      setBusy(false);
    }
  };

  return (
    <AdminDialog title={text.title} width={560} locked={busy} onClose={onClose}>
      {/* Contul vizat și schimbarea de stare. */}
      <div className="flex flex-col gap-0.5 rounded-xl bg-bg p-4">
        <p className="text-base text-heading">{user.name}</p>
        <p className="text-[13px] break-all text-muted">{user.email}</p>
        <p className="mt-1 text-[13px] text-heading">
          {action === "suspend" ? "Acces activ → " : "Acces suspendat → "}
          <span className={`font-semibold ${action === "suspend" ? "text-[#ac443c]" : "text-primary"}`}>
            {action === "suspend" ? "Acces suspendat" : "Acces activ"}
          </span>
        </p>
      </div>

      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="access-reason" className="text-xs font-semibold text-muted">
            {text.label}
          </label>
          <textarea
            id="access-reason"
            rows={3}
            value={reason}
            maxLength={ACCESS_REASON_MAX}
            disabled={busy}
            placeholder={text.placeholder}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            className="w-full resize-none rounded-lg border border-[#dde5e2] bg-white px-3 py-2 text-sm text-heading outline-none focus:border-primary disabled:bg-bg"
          />
          <p className="flex justify-between text-xs text-muted">
            <span>{trimmed.length > 0 && !valid ? `Cel puțin ${ACCESS_REASON_MIN} caractere.` : ""}</span>
            <span>
              {reason.length}/{ACCESS_REASON_MAX}
            </span>
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-[#fcedea] px-3 py-2 text-sm text-[#ac443c]">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={!valid || busy}
            className={`flex h-10 items-center rounded-lg px-5 text-[13px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${text.button}`}
          >
            {busy ? text.busy : text.submit}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="flex h-10 items-center rounded-lg border border-[#dde5e2] bg-white px-4 text-[13px] font-semibold text-heading hover:bg-bg disabled:opacity-50"
          >
            Renunță
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}

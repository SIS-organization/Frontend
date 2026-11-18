import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import Button from "../components/common/Button";
import { useAuth } from "../context/useAuth";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  CircleCheckIcon,
  DumbbellIcon,
  LandmarkIcon,
  PulseIcon,
  ShieldCheckIcon,
  TargetIcon,
  VolleyballIcon,
  WavesIcon,
} from "../components/auth/LoginIcons";

const sportIcons = [DumbbellIcon, WavesIcon, TargetIcon, VolleyballIcon];

// Pagina de login (KAN-23), după designul „Autentificare” din Figma.
export default function LoginPage() {
  const { user, loading, loginWithUsv, loginAsGuest } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [pending, setPending] = useState<"usv" | "guest" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const redirectTo = (location.state as { from?: string } | null)?.from ?? "/";

  if (loading) {
    return null;
  }

  if (user && !pending) {
    return <Navigate to={redirectTo} replace />;
  }

  const handleLogin = async (kind: "usv" | "guest") => {
    setPending(kind);
    setError(null);
    try {
      await (kind === "usv" ? loginWithUsv() : loginAsGuest());
      navigate(redirectTo, { replace: true });
    } catch {
      setError("Autentificarea nu a reușit. Încearcă din nou.");
      setPending(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="flex h-20 shrink-0 items-center justify-between border-b border-black/10 bg-white px-5 md:px-12">
        <div className="flex items-center gap-3">
          <span className="grid size-[34px] place-items-center rounded-md bg-lime text-heading">
            <PulseIcon className="size-5" />
          </span>
          <span className="flex flex-col">
            <span className="text-xl leading-tight text-heading">USV Sport</span>
            <span className="text-[9px] font-semibold uppercase tracking-wide text-heading/80">Campus în mișcare</span>
          </span>
        </div>

        <div className="flex items-center gap-8 text-xs">
          <span className="hidden text-muted md:inline">Universitatea „Ștefan cel Mare” din Suceava</span>
          <span className="hidden h-5 w-px bg-black/10 md:block" />
          <button type="button" className="flex items-center gap-1 font-semibold text-primary hover:underline">
            Ai nevoie de ajutor?
            <ArrowUpRightIcon className="size-3" />
          </button>
        </div>
      </header>

      <main className="flex flex-1 gap-[76px] p-5 md:p-6">
        {/* Cardul din stânga. Gradientul ține locul fotografiei din campus până la exportul ei din Figma. */}
        <section className="relative hidden w-[664px] shrink-0 flex-col justify-between overflow-hidden rounded-2xl bg-linear-to-b from-[#a9b8bc] via-[#5f7064] to-[#0e2129] p-12 text-white lg:flex">
          <div className="absolute inset-0 bg-linear-to-b from-black/5 via-transparent to-black/50" />

          <div className="relative flex items-center gap-3">
            <span className="grid size-[46px] place-items-center rounded-md border border-white/60 text-base font-bold">
              USV
            </span>
            <div>
              <p className="text-[13px] font-semibold">Universitatea „Ștefan cel Mare”</p>
              <p className="text-[11px] text-white/60">Suceava · România</p>
            </div>
          </div>

          <div className="relative mt-16 flex flex-col">
            <span className="w-fit rounded bg-lime px-2 py-1 text-[11px] font-semibold uppercase text-heading">
              Campus în mișcare
            </span>
            <h2 className="mt-4 text-5xl leading-[1.1] font-semibold tracking-tight">
              Mai multă mișcare.
              <br />
              Mai aproape de tine.
            </h2>
            <p className="mt-7 max-w-[460px] text-[15px] leading-relaxed text-white/85">
              Teren, fitness, bazin sau sală de sport. Spațiile campusului, într-un singur loc.
            </p>
            <div className="mt-9 flex items-center gap-4">
              {sportIcons.map((SportIcon, index) => (
                <span key={index} className="grid size-11 place-items-center rounded-full border border-white/40">
                  <SportIcon className="size-5" />
                </span>
              ))}
              <span className="ml-1 text-[11px] text-white/70">Un campus. Mai multe posibilități.</span>
            </div>
          </div>
        </section>

        <section className="mx-auto flex w-full max-w-[576px] flex-col self-center py-8 lg:mx-0">
          <p className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-primary">
            <ShieldCheckIcon className="size-4" />
            Autentificare securizată
          </p>
          <h1 className="mt-4 text-[40px] leading-[1.15] font-normal tracking-tight text-heading">
            Bine ai venit
            <br />
            în USV Sport.
          </h1>
          <p className="mt-6 text-sm text-muted">
            Intră în cont pentru a vedea disponibilitatea și a-ți rezerva următoarea oră de sport.
          </p>

          <div className="mt-7 rounded-2xl border border-black/10 bg-white p-6">
            <div className="flex items-start gap-4">
              <LandmarkIcon className="size-7 shrink-0 text-heading" />
              <div>
                <h2 className="text-[17px] text-heading">Faci parte din USV?</h2>
                <p className="mt-0.5 text-xs text-muted">Studenți și cadre didactice</p>
              </div>
            </div>
            <p className="mt-5 text-[13px] leading-relaxed text-muted">
              Folosește contul instituțional. Rolul tău este recunoscut automat; nu trebuie să creezi un cont separat.
            </p>
            <Button
              className="mt-5 inline-flex items-center gap-3 px-[18px] font-semibold md:h-11!"
              disabled={pending !== null}
              onClick={() => handleLogin("usv")}
            >
              {pending === "usv" ? "Se conectează…" : "Continuă cu contul USV"}
              <ArrowRightIcon className="size-4" />
            </Button>
            <p className="mt-5 flex items-center gap-2 text-[11px] text-primary">
              <CircleCheckIcon className="size-4 shrink-0" />
              Acces prioritar pentru comunitatea USV, cu identitate validată de instituție.
            </p>
          </div>

          <div className="my-6 flex items-center gap-3 text-[10px] uppercase text-muted">
            <span className="h-px flex-1 bg-black/10" />
            Sau
            <span className="h-px flex-1 bg-black/10" />
          </div>

          <div className="flex items-center justify-between gap-4">
            <h2 className="text-[15px] text-heading">Nu ai un cont instituțional?</h2>
            <span className="rounded bg-black/5 px-2 py-1 text-[11px] font-medium text-heading/80">Public extern</span>
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-muted">
            Accesul publicului extern are prioritate redusă și este limitat la intervalele eligibile rămase după
            activitățile și rezervările comunității USV.
          </p>
          <Button
            variant="outline"
            className="mt-5 inline-flex w-fit items-center gap-3 border-black/10! px-[18px] font-semibold text-heading! md:h-11!"
            disabled={pending !== null}
            onClick={() => handleLogin("guest")}
          >
            {pending === "guest" ? "Se conectează…" : "Continuă ca public extern"}
            <ArrowUpRightIcon className="size-4" />
          </Button>

          {error && (
            <p role="alert" className="mt-5 text-sm text-red-600">
              {error}
            </p>
          )}

          <p className="mt-9 text-[10px] leading-relaxed text-muted">
            Prin continuare, accepți regulamentul facilităților și politica de confidențialitate. Eligibilitatea este
            verificată conform regulilor instituției.
          </p>
        </section>
      </main>

      <footer className="flex flex-col gap-2 px-5 py-6 text-[11px] text-muted md:flex-row md:justify-between md:px-12">
        <span>© 2026 USV Sport. Universitatea „Ștefan cel Mare” din Suceava.</span>
        <span className="flex gap-4">
          <span>Regulament</span>
          <span>Confidențialitate</span>
          <span>Contact</span>
        </span>
      </footer>
    </div>
  );
}

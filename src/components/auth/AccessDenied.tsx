import { Link } from "react-router-dom";

// Afișat când contul nu are rolul de administrator (sau l-a pierdut între timp).
// Nu dezvăluie nimic despre conținutul zonei de administrare.
export default function AccessDenied() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-6">
      <section role="alert" className="w-full max-w-md rounded-xl border border-[#dde5e2] bg-white p-6">
        <p className="text-[11px] font-bold uppercase text-[#ac443c]">Acces interzis</p>
        <h1 className="mt-2 text-2xl text-heading">Nu ai acces la această pagină.</h1>
        <p className="mt-3 text-sm text-muted">
          Zona de administrare este disponibilă doar conturilor cu rol de administrator.
        </p>
        <Link
          to="/"
          className="mt-5 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-white"
        >
          Înapoi la facilități
        </Link>
      </section>
    </main>
  );
}

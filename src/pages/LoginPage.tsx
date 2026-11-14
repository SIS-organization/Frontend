import Button from "../components/common/Button";

// Structura paginii de login (KAN-23). Stilizarea finală vine după designul din Figma.
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <section className="flex w-full max-w-sm flex-col gap-6">
        <header className="flex flex-col gap-1 text-center">
          <h1 className="text-2xl font-semibold">Autentificare</h1>
          <p className="text-sm text-muted">Alege cum vrei să continui.</p>
        </header>

        <div className="flex flex-col gap-3">
          <Button>Continuă cu contul USV</Button>
          <Button variant="outline">Continuă ca public extern</Button>
        </div>
      </section>
    </main>
  );
}

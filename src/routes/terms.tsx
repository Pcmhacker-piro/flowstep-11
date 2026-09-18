import { createFileRoute, Link } from "@tanstack/react-router";
import logoAsset from "@/assets/logo.png";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Use — Flowstep" },
      { name: "description", content: "The terms that apply when you use Flowstep to generate, edit and export product designs." },
      { property: "og:title", content: "Terms of Use — Flowstep" },
      { property: "og:description", content: "The terms that apply when you use Flowstep to generate, edit and export product designs." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalShell title="Terms of Use" updated="18 September 2026">
      <p>
        These terms apply to everyone who uses Flowstep. By creating an account you agree to them. This is
        placeholder wording written by the Flowstep team — replace it with your reviewed legal copy before
        launch.
      </p>
      <h2>Your account</h2>
      <p>
        You are responsible for the activity on your account and for keeping your password and any provider
        API keys you add confidential. You must be old enough to enter a contract in your country.
      </p>
      <h2>What you generate</h2>
      <p>
        You own the designs and code you generate with Flowstep. You are responsible for checking that what you
        publish does not infringe anyone else's rights, and for any content you upload as a reference.
      </p>
      <h2>Acceptable use</h2>
      <p>
        Do not use Flowstep to create unlawful, hateful, deceptive or infringing material, to attempt to break
        or overload the service, or to resell raw model access.
      </p>
      <h2>Your own model keys</h2>
      <p>
        When you add a provider API key, generation runs against your account with that provider and their terms
        and billing apply. Keys are stored encrypted and used only to fulfil your requests.
      </p>
      <h2>Availability and liability</h2>
      <p>
        Flowstep is provided as-is. We work to keep it available but cannot guarantee uninterrupted service, and
        our liability is limited to the amount you paid us in the previous twelve months.
      </p>
      <h2>Ending your use</h2>
      <p>
        You can delete your account at any time from account settings. We may suspend accounts that breach these
        terms.
      </p>
      <h2>Contact</h2>
      <p>Questions about these terms: add your support email address here.</p>
    </LegalShell>
  );
}

export function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-black/5 px-6 py-5">
        <Link to="/" className="flex items-center gap-2" aria-label="Back to Flowstep home">
          <img src={logoAsset} alt="Flowstep" className="h-7 w-7 rounded-lg" />
          <span className="text-lg font-semibold tracking-tight text-[#0b1220]">flowstep</span>
        </Link>
      </header>
      <main className="mx-auto max-w-2xl px-6 py-14">
        <h1 className="text-3xl font-semibold tracking-tight text-[#0b1220]">{title}</h1>
        <p className="mt-2 text-sm text-[#0b1220]/50">Last updated {updated}</p>
        <div className="mt-8 space-y-5 text-sm leading-relaxed text-[#0b1220]/75 [&_h2]:pt-3 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-[#0b1220]">
          {children}
        </div>
        <Link to="/" className="mt-12 inline-block text-sm font-medium text-[#2b6bff] hover:underline">
          ← Back to Flowstep
        </Link>
      </main>
    </div>
  );
}

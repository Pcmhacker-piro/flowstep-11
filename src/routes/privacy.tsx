import { createFileRoute } from "@tanstack/react-router";
import { LegalShell } from "./terms";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Flowstep" },
      { name: "description", content: "How Flowstep handles your account data, designs, and provider API keys." },
      { property: "og:title", content: "Privacy Policy — Flowstep" },
      { property: "og:description", content: "How Flowstep handles your account data, designs, and provider API keys." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="18 September 2026">
      <p>
        This describes what Flowstep stores and why. It is placeholder wording written by the Flowstep team —
        replace it with your reviewed policy before launch.
      </p>
      <h2>What we store</h2>
      <p>
        Your email address and sign-in details, the designs and prompts you save to your library, and basic usage
        records such as which model a generation used and when it ran.
      </p>
      <h2>Provider API keys</h2>
      <p>
        Keys you add are encrypted before they are stored and are only decrypted to send your own generation
        requests. They are never shown back to you in full and never shared with other users.
      </p>
      <h2>Model providers</h2>
      <p>
        Prompts, reference images, and design context are sent to the model provider you select so it can produce
        a result. Their handling of that data is governed by their own privacy terms.
      </p>
      <h2>Sharing</h2>
      <p>
        A design is private until you create a public link for it. Anyone with that link can view the design until
        you turn sharing off.
      </p>
      <h2>Your choices</h2>
      <p>
        You can rename or delete any saved design, remove a stored API key, and delete your whole account from
        account settings. Deleting your account removes your designs and keys.
      </p>
      <h2>Contact</h2>
      <p>Privacy questions or data requests: add your support email address here.</p>
    </LegalShell>
  );
}

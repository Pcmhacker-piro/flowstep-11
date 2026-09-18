import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import { getSharedDesign } from "@/lib/designs.functions";
import logoAsset from "@/assets/logo.png";

type SharedScreen = { id: string; html: string; screenName?: string };

export const Route = createFileRoute("/d/$token")({
  loader: async ({ params }) => {
    const design = await getSharedDesign({ data: { token: params.token } });
    if (!design) throw notFound();
    const screens = (design.items as Array<Record<string, unknown>>)
      .filter((item) => item?.["type"] === "design" && typeof item["html"] === "string")
      .map((item, index) => ({
        id: String(item["id"] ?? index),
        html: String(item["html"]),
        screenName: typeof item["screenName"] === "string" ? item["screenName"] : undefined,
      })) satisfies SharedScreen[];
    return { design, screens };
  },
  head: ({ loaderData }) => {
    const title = loaderData ? `${loaderData.design.name} — shared on Flowstep` : "Shared design — Flowstep";
    const description = loaderData?.design.prompt
      ? loaderData.design.prompt.slice(0, 160)
      : "A product design generated with Flowstep.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  errorComponent: () => <SharedFallback title="This design couldn't be loaded" />,
  notFoundComponent: () => <SharedFallback title="This link isn't available" />,
  component: SharedDesignPage,
});

const WIDTHS = { desktop: 1440, tablet: 834, mobile: 390 } as const;
type Device = keyof typeof WIDTHS;

function SharedFallback({ title }: { title: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#f7f8fb] px-6">
      <div className="max-w-sm rounded-2xl border border-black/5 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-[#0b1220]">{title}</h1>
        <p className="mt-2 text-sm text-[#0b1220]/65">
          The owner may have turned sharing off, or the link is mistyped.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-lg bg-[#2b6bff] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1f57df]"
        >
          Go to Flowstep
        </Link>
      </div>
    </div>
  );
}

function SharedDesignPage() {
  const { design, screens } = Route.useLoaderData();
  const [device, setDevice] = useState<Device>("desktop");
  const width = WIDTHS[device];

  return (
    <div className="min-h-screen bg-[#f7f8fb]">
      <header className="sticky top-0 z-10 border-b border-black/5 bg-white/85 backdrop-blur">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-6 py-4 sm:flex sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight text-[#0b1220]">
              {design.name}
            </h1>
            <p className="truncate text-xs text-[#0b1220]/55">
              {design.screenCount} screen{design.screenCount === 1 ? "" : "s"} · shared with Flowstep
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg bg-[#f4f4f5] p-1">
              <DeviceButton current={device} value="desktop" onSelect={setDevice}>
                <Monitor className="h-4 w-4" />
              </DeviceButton>
              <DeviceButton current={device} value="tablet" onSelect={setDevice}>
                <Tablet className="h-4 w-4" />
              </DeviceButton>
              <DeviceButton current={device} value="mobile" onSelect={setDevice}>
                <Smartphone className="h-4 w-4" />
              </DeviceButton>
            </div>
            <Link
              to="/auth"
              className="hidden items-center gap-2 rounded-lg bg-[#2b6bff] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1f57df] sm:inline-flex"
            >
              <img src={logoAsset} alt="" className="h-4 w-4 rounded" />
              Build yours free
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-6 py-10">
        {screens.length === 0 && (
          <p className="rounded-xl border border-black/5 bg-white px-4 py-6 text-center text-sm text-[#0b1220]/60">
            This design has no screens yet.
          </p>
        )}
        {screens.map((screen, index) => (
          <section key={screen.id}>
            <h2 className="mb-3 text-sm font-medium text-[#0b1220]/70">
              {screen.screenName ?? `Screen ${index + 1}`}
            </h2>
            <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
              <div className="mx-auto" style={{ width: Math.min(width, 1440), maxWidth: "100%" }}>
                <iframe
                  title={screen.screenName ?? `Screen ${index + 1}`}
                  srcDoc={screen.html}
                  sandbox="allow-scripts"
                  loading="lazy"
                  className="h-[900px] w-full border-0"
                />
              </div>
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}

function DeviceButton({
  current,
  value,
  onSelect,
  children,
}: {
  current: Device;
  value: Device;
  onSelect: (value: Device) => void;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      aria-label={value}
      aria-pressed={active}
      onClick={() => onSelect(value)}
      className={`rounded-md p-2 transition-colors duration-150 ${
        active ? "bg-white text-[#0b1220] shadow-sm" : "text-[#0b1220]/50 hover:text-[#0b1220]"
      }`}
    >
      {children}
    </button>
  );
}

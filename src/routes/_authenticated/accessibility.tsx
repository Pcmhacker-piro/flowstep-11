import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, ImageUp, Loader2, ScanEye, Trash2 } from "lucide-react";
import {
  reviewScreenshotAccessibility,
  type A11yReport,
  type A11ySeverity,
} from "@/lib/accessibilityReview.functions";
import logoAsset from "@/assets/logo.png";

export const Route = createFileRoute("/_authenticated/accessibility")({
  head: () => ({
    meta: [
      { title: "Accessibility review — Flowstep" },
      {
        name: "description",
        content:
          "Upload a screenshot of any screen and get an AI accessibility review: contrast, target sizes, hierarchy and legibility issues with concrete design fixes.",
      },
      { property: "og:title", content: "Accessibility review — Flowstep" },
      {
        property: "og:description",
        content:
          "Upload a design screenshot and get prioritised accessibility issues with WCAG references and fixes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AccessibilityPage,
});

const SEVERITY: Record<A11ySeverity, { label: string; tone: string }> = {
  critical: { label: "Critical", tone: "bg-[#ef4444]/12 text-[#dc2626]" },
  serious: { label: "Serious", tone: "bg-[#f97316]/14 text-[#c2410c]" },
  moderate: { label: "Moderate", tone: "bg-[#f59e0b]/16 text-[#b45309]" },
  minor: { label: "Minor", tone: "bg-[#0b1220]/8 text-[#0b1220]/65" },
};

const MAX_BYTES = 6 * 1024 * 1024;

function scoreTone(score: number) {
  if (score >= 85) return "text-[#059669]";
  if (score >= 60) return "text-[#b45309]";
  return "text-[#dc2626]";
}

function AccessibilityPage() {
  const review = useServerFn(reviewScreenshotAccessibility);
  const inputRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [report, setReport] = useState<A11yReport | null>(null);
  const [dragging, setDragging] = useState(false);

  const mutation = useMutation({
    mutationFn: (payload: { image: string; note?: string }) => review({ data: payload }),
    onSuccess: (result) => setReport(result),
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Couldn't review that screenshot"),
  });

  const loadFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file (PNG, JPG or WebP).");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("That image is over 6 MB — export a smaller screenshot.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImage(typeof reader.result === "string" ? reader.result : null);
      setFileName(file.name);
      setReport(null);
    };
    reader.onerror = () => toast.error("Couldn't read that file.");
    reader.readAsDataURL(file);
  };

  const reset = () => {
    setImage(null);
    setFileName(null);
    setReport(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="min-h-screen bg-[#f7f8fb]">
      <header className="sticky top-0 z-10 border-b border-black/5 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-4">
          <Link
            to="/library"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#0b1220]/60 transition-colors duration-150 hover:bg-[#f4f4f5] hover:text-[#0b1220]"
            aria-label="Back to your designs"
            title="Back to your designs"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <img src={logoAsset} alt="Flowstep" className="h-7 w-7 shrink-0 rounded-lg" />
          <span className="truncate text-base font-semibold tracking-tight text-[#0b1220]">
            Accessibility review
          </span>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-6 py-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#2b6bff]/10 text-[#2b6bff]">
              <ScanEye className="h-4 w-4" />
            </span>
            <h2 className="text-sm font-semibold text-[#0b1220]">Upload a screenshot</h2>
          </div>

          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files?.[0];
              if (file) loadFile(file);
            }}
            className={`mt-4 rounded-xl border-2 border-dashed p-4 transition-colors duration-150 ${
              dragging ? "border-[#2b6bff] bg-[#2b6bff]/5" : "border-black/10 bg-[#f7f8fb]"
            }`}
          >
            {image ? (
              <div>
                <img
                  src={image}
                  alt={fileName ?? "Uploaded screenshot"}
                  className="max-h-80 w-full rounded-lg border border-black/5 bg-white object-contain"
                />
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-[#0b1220]/55">{fileName}</span>
                  <button
                    type="button"
                    onClick={reset}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-[#dc2626] transition-colors duration-150 hover:bg-[#fef2f2]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 px-4 py-10 text-center"
              >
                <ImageUp className="h-6 w-6 text-[#0b1220]/40" />
                <span className="text-sm font-medium text-[#0b1220]">
                  Drop a screenshot, or click to choose
                </span>
                <span className="text-xs text-[#0b1220]/50">PNG, JPG or WebP, up to 6 MB</span>
              </button>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) loadFile(file);
            }}
          />

          <label className="mt-4 block text-xs font-medium text-[#0b1220]/60" htmlFor="a11y-note">
            Anything we should know? (optional)
          </label>
          <input
            id="a11y-note"
            value={note}
            maxLength={400}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. This is the mobile checkout step"
            className="mt-1.5 w-full rounded-lg border border-black/8 bg-[#f7f8fb] px-3.5 py-2.5 text-sm text-[#0b1220] outline-none transition-colors duration-150 focus:border-[#2b6bff]/45 focus:bg-white"
          />

          <button
            type="button"
            disabled={!image || mutation.isPending}
            onClick={() =>
              image && mutation.mutate({ image, note: note.trim() ? note.trim() : undefined })
            }
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#2b6bff] px-4 py-2.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#1f57df] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mutation.isPending ? "Reviewing…" : "Check accessibility"}
          </button>
        </section>

        <section>
          {mutation.isPending ? (
            <div className="flex items-center gap-2 rounded-xl bg-white p-6 text-sm text-[#0b1220]/60 shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Looking at contrast, sizes, hierarchy and legibility…
            </div>
          ) : report ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-white p-5 shadow-sm">
                <div className="flex items-baseline gap-3">
                  <span className={`text-3xl font-semibold tracking-tight ${scoreTone(report.score)}`}>
                    {report.score}
                  </span>
                  <span className="text-xs uppercase tracking-wide text-[#0b1220]/45">
                    Accessibility score
                  </span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[#0b1220]/80">{report.summary}</p>
              </div>

              {report.issues.map((issue, index) => {
                const meta = SEVERITY[issue.severity];
                return (
                  <article key={`${issue.title}-${index}`} className="rounded-xl bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${meta.tone}`}
                      >
                        {meta.label}
                      </span>
                      {issue.guideline ? (
                        <span className="text-xs text-[#0b1220]/45">WCAG {issue.guideline}</span>
                      ) : null}
                    </div>
                    <h3 className="mt-2.5 text-sm font-semibold text-[#0b1220]">{issue.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-[#0b1220]/70">
                      {issue.problem}
                    </p>
                    <p className="mt-3 rounded-lg bg-[#f7f8fb] p-3.5 text-sm leading-relaxed text-[#0b1220]/85">
                      <span className="font-medium text-[#0b1220]">Fix: </span>
                      {issue.fix}
                    </p>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl bg-white p-10 text-center shadow-sm">
              <p className="text-base font-medium text-[#0b1220]">No review yet</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-[#0b1220]/55">
                Upload a screenshot of any screen and you'll get prioritised accessibility
                problems — contrast, tap targets, hierarchy, legibility — each with a concrete
                design fix.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

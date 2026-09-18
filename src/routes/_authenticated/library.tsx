import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  History,
  ScanEye,

  Loader2,
  Pencil,
  Plus,
  Search,
  Share2,
  Trash2,
} from "lucide-react";
import {
  deleteMyDesign,
  duplicateMyDesign,
  listMyDesigns,
  renameMyDesign,
  setMyDesignSharing,
  type SavedDesignSummary,
} from "@/lib/designs.functions";
import logoAsset from "@/assets/logo.png";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({
    meta: [
      { title: "Your designs — Flowstep" },
      { name: "description", content: "Every screen you've generated with Flowstep, saved and ready to reopen, share or export." },
      { property: "og:title", content: "Your designs — Flowstep" },
      { property: "og:description", content: "Every screen you've generated with Flowstep, saved and ready to reopen, share or export." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LibraryPage,
});

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function Thumbnail({ html }: { html: string | null }) {
  if (!html) {
    return (
      <div className="grid h-full w-full place-items-center bg-[#f4f4f5] text-xs text-[#0b1220]/40">
        No preview
      </div>
    );
  }
  return (
    <div className="pointer-events-none h-full w-full overflow-hidden bg-white">
      <iframe
        title="Design preview"
        srcDoc={html}
        sandbox="allow-scripts"
        loading="lazy"
        scrolling="no"
        tabIndex={-1}
        className="h-[1600px] w-[1440px] origin-top-left border-0"
        style={{ transform: "scale(0.24)" }}
      />
    </div>
  );
}

function LibraryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchDesigns = useServerFn(listMyDesigns);
  const rename = useServerFn(renameMyDesign);
  const remove = useServerFn(deleteMyDesign);
  const duplicate = useServerFn(duplicateMyDesign);
  const setSharing = useServerFn(setMyDesignSharing);

  const [search, setSearch] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["my-designs"],
    queryFn: () => fetchDesigns(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["my-designs"] });

  const renameMutation = useMutation({
    mutationFn: (vars: { id: string; name: string }) => rename({ data: vars }),
    onSuccess: () => {
      setRenamingId(null);
      toast.success("Renamed");
      invalidate();
    },
    onError: () => toast.error("Couldn't rename that design"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Design deleted");
      invalidate();
    },
    onError: () => toast.error("Couldn't delete that design"),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => duplicate({ data: { id } }),
    onSuccess: () => {
      toast.success("Duplicated");
      invalidate();
    },
    onError: () => toast.error("Couldn't duplicate that design"),
  });

  const shareMutation = useMutation({
    mutationFn: (vars: { id: string; isPublic: boolean }) => setSharing({ data: vars }),
    onSuccess: (row) => {
      invalidate();
      if (row.isPublic && row.shareToken) {
        const url = `${window.location.origin}/d/${row.shareToken}`;
        navigator.clipboard?.writeText(url).catch(() => {});
        toast.success("Share link copied to clipboard");
      } else {
        toast.success("Sharing turned off");
      }
    },
    onError: () => toast.error("Couldn't update sharing"),
  });

  const designs = useMemo(() => {
    const list = data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (d) => d.name.toLowerCase().includes(q) || d.prompt.toLowerCase().includes(q),
    );
  }, [data, search]);

  function openDesign(design: SavedDesignSummary) {
    navigate({ to: "/app", search: { design: design.id } as never });
  }

  return (
    <div className="min-h-screen bg-[#f7f8fb]">
      <header className="sticky top-0 z-10 border-b border-black/5 bg-white/85 backdrop-blur">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-6 py-4 sm:flex sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/app"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#0b1220]/60 transition-colors duration-150 hover:bg-[#f4f4f5] hover:text-[#0b1220]"
              aria-label="Back to canvas"
              title="Back to canvas"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <Link to="/app" className="flex items-center gap-2">
              <img src={logoAsset} alt="Flowstep" className="h-7 w-7 shrink-0 rounded-lg" />
              <span className="truncate text-base font-semibold tracking-tight text-[#0b1220]">
                Your designs
              </span>
            </Link>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              to="/accessibility"
              className="inline-flex items-center gap-2 rounded-lg border border-black/8 bg-white px-3.5 py-2.5 text-sm font-medium text-[#0b1220]/75 transition-colors duration-150 hover:bg-[#f4f4f5] hover:text-[#0b1220]"
            >
              <ScanEye className="h-4 w-4" />
              Accessibility
            </Link>
            <Link
              to="/activity"
              className="inline-flex items-center gap-2 rounded-lg border border-black/8 bg-white px-3.5 py-2.5 text-sm font-medium text-[#0b1220]/75 transition-colors duration-150 hover:bg-[#f4f4f5] hover:text-[#0b1220]"
            >
              <History className="h-4 w-4" />
              Activity
            </Link>

            <Link
              to="/app"
              className="inline-flex items-center gap-2 rounded-lg bg-[#2b6bff] px-4 py-2.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#1f57df]"
            >
              <Plus className="h-4 w-4" />
              New design
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="relative mb-6 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0b1220]/35" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your designs"
            className="w-full rounded-lg border border-transparent bg-white py-2.5 pl-9 pr-4 text-sm text-[#0b1220] shadow-sm outline-none transition-colors duration-150 placeholder:text-[#0b1220]/35 focus:border-[#2b6bff] focus:ring-2 focus:ring-[#2b6bff]/20"
          />
        </div>

        {isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-64 animate-pulse rounded-2xl bg-white/70" />
            ))}
          </div>
        ) : error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            We couldn't load your designs. Refresh the page to try again.
          </p>
        ) : designs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/10 bg-white px-8 py-16 text-center">
            <h2 className="text-xl font-semibold tracking-tight text-[#0b1220]">
              {search ? "No matches" : "Nothing saved yet"}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-[#0b1220]/65">
              {search
                ? "Try a different word from the design name or prompt."
                : "Generate a screen on the canvas and hit Save — it'll show up here, ready to reopen or share."}
            </p>
            {!search && (
              <Link
                to="/app"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#2b6bff] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1f57df]"
              >
                <Plus className="h-4 w-4" />
                Create your first design
              </Link>
            )}
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {designs.map((design) => (
              <article
                key={design.id}
                className="group overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm transition-shadow duration-150 hover:shadow-[0_18px_40px_-24px_rgba(11,18,32,0.4)]"
              >
                <button
                  type="button"
                  onClick={() => openDesign(design)}
                  className="block h-40 w-full overflow-hidden border-b border-black/5 text-left"
                  aria-label={`Open ${design.name}`}
                >
                  <Thumbnail html={design.thumbnailHtml} />
                </button>

                <div className="p-4">
                  {renamingId === design.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!draftName.trim()) return;
                        renameMutation.mutate({ id: design.id, name: draftName.trim() });
                      }}
                      className="flex items-center gap-2"
                    >
                      <input
                        autoFocus
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onBlur={() => setRenamingId(null)}
                        className="min-w-0 flex-1 rounded-md border border-[#2b6bff] bg-white px-2 py-1 text-sm outline-none"
                      />
                      <button
                        type="submit"
                        className="shrink-0 rounded-md bg-[#2b6bff] px-2.5 py-1 text-xs font-medium text-white"
                      >
                        Save
                      </button>
                    </form>
                  ) : (
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openDesign(design)}
                        className="truncate text-left text-sm font-semibold text-[#0b1220] hover:text-[#2b6bff]"
                      >
                        {design.name}
                      </button>
                      {design.isPublic && (
                        <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                          Shared
                        </span>
                      )}
                    </div>
                  )}

                  <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-[#0b1220]/55">
                    {design.prompt || "No prompt saved"}
                  </p>

                  <div className="mt-3 flex items-center justify-between text-[11px] text-[#0b1220]/45">
                    <span>
                      {design.screenCount} screen{design.screenCount === 1 ? "" : "s"}
                    </span>
                    <span>{relativeTime(design.updatedAt)}</span>
                  </div>

                  <div className="mt-3 flex items-center gap-1 border-t border-black/5 pt-3">
                    <IconAction
                      label="Rename"
                      onClick={() => {
                        setRenamingId(design.id);
                        setDraftName(design.name);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </IconAction>
                    <IconAction
                      label="Duplicate"
                      busy={duplicateMutation.isPending}
                      onClick={() => duplicateMutation.mutate(design.id)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </IconAction>
                    <IconAction
                      label={design.isPublic ? "Stop sharing" : "Share link"}
                      busy={shareMutation.isPending}
                      onClick={() =>
                        shareMutation.mutate({ id: design.id, isPublic: !design.isPublic })
                      }
                    >
                      <Share2 className="h-3.5 w-3.5" />
                    </IconAction>
                    {design.isPublic && design.shareToken && origin && (
                      <a
                        href={`${origin}/d/${design.shareToken}`}
                        target="_blank"
                        rel="noreferrer"
                        title="Open public link"
                        className="rounded-md p-2 text-[#0b1220]/55 transition-colors duration-150 hover:bg-[#f4f4f5] hover:text-[#0b1220]"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <div className="flex-1" />
                    <IconAction
                      label="Delete"
                      danger
                      busy={deleteMutation.isPending}
                      onClick={() => {
                        if (!window.confirm(`Delete "${design.name}"? This can't be undone.`)) return;
                        deleteMutation.mutate(design.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconAction>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function IconAction({
  label,
  onClick,
  children,
  danger,
  busy,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={busy}
      className={`rounded-md p-2 transition-colors duration-150 disabled:opacity-50 ${
        danger
          ? "text-[#0b1220]/55 hover:bg-red-50 hover:text-red-600"
          : "text-[#0b1220]/55 hover:bg-[#f4f4f5] hover:text-[#0b1220]"
      }`}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : children}
    </button>
  );
}

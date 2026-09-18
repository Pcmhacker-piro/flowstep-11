import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  Copy,
  FilePlus2,
  Link2,
  Link2Off,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import {
  clearMyActivity,
  listMyActivity,
  type ActivityAction,
  type ActivityEntry,
} from "@/lib/activity.functions";
import logoAsset from "@/assets/logo.png";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({
    meta: [
      { title: "Activity history — Flowstep" },
      {
        name: "description",
        content:
          "A timestamped record of every change to your Flowstep designs: created, renamed, saved, duplicated, deleted and share status updates.",
      },
      { property: "og:title", content: "Activity history — Flowstep" },
      {
        property: "og:description",
        content:
          "A timestamped record of every change to your Flowstep designs, newest first.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ActivityPage,
});

const ACTION_META: Record<
  ActivityAction,
  { label: string; icon: typeof Save; tone: string }
> = {
  created: { label: "Created", icon: FilePlus2, tone: "bg-[#2b6bff]/10 text-[#2b6bff]" },
  updated: { label: "Saved", icon: Save, tone: "bg-[#0b1220]/8 text-[#0b1220]/70" },
  renamed: { label: "Renamed", icon: Pencil, tone: "bg-[#8b5cf6]/12 text-[#7c3aed]" },
  duplicated: { label: "Duplicated", icon: Copy, tone: "bg-[#0ea5e9]/12 text-[#0284c7]" },
  deleted: { label: "Deleted", icon: Trash2, tone: "bg-[#ef4444]/10 text-[#dc2626]" },
  shared: { label: "Share link on", icon: Link2, tone: "bg-[#10b981]/12 text-[#059669]" },
  unshared: { label: "Share link off", icon: Link2Off, tone: "bg-[#f59e0b]/14 text-[#b45309]" },
};

const FILTERS: { key: "all" | ActivityAction; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "created", label: "Created" },
  { key: "updated", label: "Saved" },
  { key: "renamed", label: "Renamed" },
  { key: "duplicated", label: "Duplicated" },
  { key: "shared", label: "Sharing" },
  { key: "deleted", label: "Deleted" },
];

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

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(date, today)) return "Today";
  if (same(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function ActivityPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchActivity = useServerFn(listMyActivity);
  const clearActivity = useServerFn(clearMyActivity);
  const [filter, setFilter] = useState<"all" | ActivityAction>("all");

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["my-activity"],
    queryFn: () => fetchActivity(),
  });

  const clearMutation = useMutation({
    mutationFn: () => clearActivity({ data: {} }),
    onSuccess: () => {
      toast.success("History cleared");
      queryClient.invalidateQueries({ queryKey: ["my-activity"] });
    },
    onError: () => toast.error("Couldn't clear the history"),
  });

  const groups = useMemo(() => {
    const entries = (data ?? []).filter((entry) => {
      if (filter === "all") return true;
      if (filter === "shared") return entry.action === "shared" || entry.action === "unshared";
      return entry.action === filter;
    });
    const map = new Map<string, ActivityEntry[]>();
    for (const entry of entries) {
      const key = dayLabel(entry.createdAt);
      const list = map.get(key);
      if (list) list.push(entry);
      else map.set(key, [entry]);
    }
    return [...map.entries()];
  }, [data, filter]);

  return (
    <div className="min-h-screen bg-[#f7f8fb]">
      <header className="sticky top-0 z-10 border-b border-black/5 bg-white/85 backdrop-blur">
        <div className="mx-auto grid max-w-4xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
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
              Activity history
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 rounded-lg border border-black/8 bg-white px-3 py-2 text-sm font-medium text-[#0b1220]/75 transition-colors duration-150 hover:bg-[#f4f4f5]"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              type="button"
              disabled={clearMutation.isPending || !(data ?? []).length}
              onClick={() => clearMutation.mutate()}
              className="inline-flex items-center gap-2 rounded-lg border border-black/8 bg-white px-3 py-2 text-sm font-medium text-[#dc2626] transition-colors duration-150 hover:bg-[#fef2f2] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Trash2 className="h-4 w-4" />
              Clear
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6 flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 ${
                filter === item.key
                  ? "bg-[#0b1220] text-white"
                  : "bg-white text-[#0b1220]/65 shadow-sm hover:text-[#0b1220]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 rounded-xl bg-white p-6 text-sm text-[#0b1220]/60 shadow-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your history…
          </div>
        ) : error ? (
          <div className="rounded-xl bg-white p-6 text-sm text-[#dc2626] shadow-sm">
            Couldn't load your history. Try refreshing.
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-xl bg-white p-10 text-center shadow-sm">
            <p className="text-base font-medium text-[#0b1220]">Nothing here yet</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-[#0b1220]/55">
              Every design you create, rename, save, duplicate, share or delete will show up
              here with the exact time it happened.
            </p>
            <Link
              to="/app"
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#2b6bff] px-4 py-2.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#1f57df]"
            >
              Start a design
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {groups.map(([day, entries]) => (
              <section key={day}>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#0b1220]/45">
                  {day}
                </h2>
                <ol className="overflow-hidden rounded-xl bg-white shadow-sm">
                  {entries.map((entry) => {
                    const meta = ACTION_META[entry.action];
                    const Icon = meta.icon;
                    const openable = Boolean(entry.designId) && entry.action !== "deleted";
                    return (
                      <li
                        key={entry.id}
                        className="flex items-start gap-3 border-b border-black/5 px-5 py-4 last:border-b-0"
                      >
                        <span
                          className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${meta.tone}`}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-[#0b1220]">
                            <span className="font-medium">{meta.label}</span>{" "}
                            {openable ? (
                              <button
                                type="button"
                                onClick={() =>
                                  navigate({
                                    to: "/app",
                                    search: { design: entry.designId } as never,
                                  })
                                }
                                className="font-medium text-[#2b6bff] underline-offset-2 hover:underline"
                              >
                                {entry.designName}
                              </button>
                            ) : (
                              <span className="font-medium text-[#0b1220]/70">
                                {entry.designName}
                              </span>
                            )}
                          </p>
                          {entry.detail ? (
                            <p className="mt-0.5 truncate text-sm text-[#0b1220]/55">
                              {entry.detail}
                            </p>
                          ) : null}
                        </div>
                        <time
                          dateTime={entry.createdAt}
                          title={new Date(entry.createdAt).toLocaleString()}
                          className="shrink-0 pt-0.5 text-xs text-[#0b1220]/45"
                        >
                          {relativeTime(entry.createdAt)}
                        </time>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

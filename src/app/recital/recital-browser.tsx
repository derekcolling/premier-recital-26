"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUp,
  BookOpenText,
  Check,
  Info,
  ListChecks,
  MapPin,
  Music2,
  Plus,
  Search,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Elev8ProgramData, Elev8ProgramItem, Elev8ProgramShow } from "@/lib/elev8-program";

type BrowserMode = "my-dances" | "program" | "info";
type LegacySelections = Record<string, number[]>;

const TRACKER_STORAGE_KEY = "premier-recital-program-tracker-v1";
const LEGACY_TRACKER_STORAGE_KEY = "premier-recital-tracker-v1";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const QUICK_CHANGE_DANCE_THRESHOLD = 3;

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function showStorageKey(showNumber: number) {
  return String(showNumber);
}

function parseStoredIds(value: string | null) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function migrateLegacySelections(value: string | null, shows: Elev8ProgramShow[]) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as LegacySelections;

    return shows.flatMap((show) => {
      const selectedOrders = new Set(parsed[showStorageKey(show.showNumber)] ?? []);

      return show.items
        .filter((item) => item.type === "dance" && typeof item.order === "number" && selectedOrders.has(item.order))
        .map((item) => item.id);
    });
  } catch {
    return [];
  }
}

function filterKnownDanceIds(ids: string[], shows: Elev8ProgramShow[]) {
  const validIds = new Set(
    shows.flatMap((show) => show.items.filter((item) => item.type === "dance").map((item) => item.id)),
  );

  return ids.filter((id) => validIds.has(id));
}

function getDayGroups(shows: Elev8ProgramShow[]) {
  const groups = new Map<string, number[]>();

  for (const show of shows) {
    groups.set(show.day, [...(groups.get(show.day) ?? []), show.showNumber]);
  }

  return [...groups.entries()].map(([label, showNumbers]) => ({ label, showNumbers }));
}

function getTypeLabel(item: Elev8ProgramItem) {
  switch (item.type) {
    case "intermission":
      return "Intermission";
    case "filler":
      return "Filler";
    case "featured":
      return "Featured";
    case "finale":
      return "Finale";
    case "marker":
      return "Program";
    default:
      return "Dance";
  }
}

function getSearchText(item: Elev8ProgramItem) {
  return [
    item.title,
    item.order?.toString() ?? "",
    item.type,
    item.teacher ?? "",
    item.songTitle ?? "",
    item.dancers.join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

function getTrackedDanceRows(show: Elev8ProgramShow, selectedIds: Set<string>) {
  const tracked = show.items.filter((item) => item.type === "dance" && selectedIds.has(item.id));

  return tracked.map((item, trackedIndex) => {
    const itemIndex = show.items.findIndex((candidate) => candidate.id === item.id);
    const previousTracked = tracked[trackedIndex - 1];
    const previousTrackedIndex = previousTracked
      ? show.items.findIndex((candidate) => candidate.id === previousTracked.id)
      : -1;
    const itemsBefore = show.items.slice(previousTrackedIndex + 1, itemIndex);
    const dancesBefore = itemsBefore.filter((candidate) => candidate.type === "dance");

    return {
      item,
      isFirstTrackedDance: trackedIndex === 0,
      programItemsBefore: itemsBefore.length,
      dancesBefore: dancesBefore.length,
      previousTracked,
      isQuickChange:
        trackedIndex > 0 && dancesBefore.length <= QUICK_CHANGE_DANCE_THRESHOLD,
    };
  });
}

function DanceDetailModal({
  dance,
  isTracked,
  onClose,
  onToggle,
}: {
  dance: Elev8ProgramItem;
  isTracked: boolean;
  onClose: () => void;
  onToggle: () => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end bg-black/70 px-3 pb-3 pt-16 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${dance.title} details`}
      onClick={onClose}
    >
      <div
        className="max-h-[86dvh] w-full max-w-2xl overflow-y-auto rounded-[8px] border border-white/12 bg-[#101114] shadow-2xl shadow-black/50"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-white/10 bg-[#101114]/95 p-4 backdrop-blur">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8ea4ff]">
              {dance.order ? `Program #${dance.order}` : "Dance"}
            </p>
            <h2 className="mt-1 text-xl font-bold leading-7 text-white">{dance.title}</h2>
            {dance.songTitle ? <p className="mt-1 text-sm text-white/55">{dance.songTitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        <div className="grid gap-4 p-4">
          <section className="grid gap-3 rounded-[6px] border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center gap-3">
              <UserRound aria-hidden="true" className="size-5 text-[#1C4EFF]" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">Teacher</p>
                <p className="mt-0.5 text-sm font-semibold text-white">{dance.teacher ?? "Teacher not listed"}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Users aria-hidden="true" className="size-5 text-[#1C4EFF]" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">Dancers</p>
                <p className="mt-0.5 text-sm font-semibold text-white">{pluralize(dance.dancers.length, "dancer")}</p>
              </div>
            </div>
          </section>

          {dance.programNote ? (
            <section className="rounded-[6px] border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">Program Note</p>
              <p className="mt-1 text-sm leading-6 text-white/75">{dance.programNote}</p>
            </section>
          ) : null}

          <section className="rounded-[6px] border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">Roster</p>
            {dance.dancers.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {dance.dancers.map((dancer) => (
                  <span
                    key={dancer}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-white/80"
                  >
                    {dancer}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm text-white/60">No dancers listed.</p>
            )}
          </section>

          {dance.stageNote ? (
            <details className="rounded-[6px] border border-white/10 bg-white/[0.03] p-3">
              <summary className="cursor-pointer text-sm font-semibold text-white/75">Stage note</summary>
              <p className="mt-2 text-sm leading-6 text-white/60">{dance.stageNote}</p>
            </details>
          ) : null}

          <button
            type="button"
            onClick={onToggle}
            aria-pressed={isTracked}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-[6px] text-sm font-bold transition ${
              isTracked
                ? "border border-[#1C4EFF] bg-[#0b1d3d] text-white"
                : "bg-[#1C4EFF] text-white hover:bg-[#2d5cff]"
            }`}
          >
            {isTracked ? <Check aria-hidden="true" className="size-5" /> : <Plus aria-hidden="true" className="size-5" />}
            {isTracked ? "Tracked" : "Track Dance"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RecitalBrowser({ program }: { program: Elev8ProgramData }) {
  const [selectedShowNumber, setSelectedShowNumber] = useState(program.shows[0]?.showNumber ?? 1);
  const [mode, setMode] = useState<BrowserMode>("program");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [momHelperEnabled, setMomHelperEnabled] = useState(true);
  const [activeDance, setActiveDance] = useState<Elev8ProgramItem | null>(null);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const currentShow = program.shows.find((show) => show.showNumber === selectedShowNumber) ?? program.shows[0];
  const dayGroups = useMemo(() => getDayGroups(program.shows), [program.shows]);
  const selectedDayGroup = dayGroups.find((group) => group.showNumbers.includes(selectedShowNumber)) ?? dayGroups[0];
  const selectedDayShows =
    selectedDayGroup?.showNumbers
      .map((showNumber) => program.shows.find((show) => show.showNumber === showNumber))
      .filter((show): show is Elev8ProgramShow => Boolean(show)) ?? [];
  const normalizedQuery = query.trim().toLowerCase();

  const filteredProgramItems = useMemo(() => {
    if (!currentShow) return [];
    if (!normalizedQuery) return currentShow.items;
    return currentShow.items.filter((item) => getSearchText(item).includes(normalizedQuery));
  }, [currentShow, normalizedQuery]);

  const trackedRows = useMemo(() => {
    if (!currentShow) return [];
    return getTrackedDanceRows(currentShow, selectedIdSet);
  }, [currentShow, selectedIdSet]);

  const trackedCountForShow = trackedRows.length;
  const totalTrackedCount = selectedIds.length;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedIds = filterKnownDanceIds(
        parseStoredIds(window.localStorage.getItem(TRACKER_STORAGE_KEY)),
        program.shows,
      );

      if (savedIds.length > 0) {
        setSelectedIds(savedIds);
        return;
      }

      const migratedIds = filterKnownDanceIds(
        migrateLegacySelections(window.localStorage.getItem(LEGACY_TRACKER_STORAGE_KEY), program.shows),
        program.shows,
      );
      if (migratedIds.length > 0) {
        setSelectedIds(migratedIds);
        window.localStorage.setItem(TRACKER_STORAGE_KEY, JSON.stringify(migratedIds));
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [program.shows]);

  if (!currentShow) return null;

  function persistSelections(nextIds: string[]) {
    try {
      window.localStorage.setItem(TRACKER_STORAGE_KEY, JSON.stringify(nextIds));
    } catch {
      // Tracking still works for this session if localStorage is unavailable.
    }
  }

  function toggleDance(danceId: string) {
    setSelectedIds((previous) => {
      const existing = new Set(previous);

      if (existing.has(danceId)) {
        existing.delete(danceId);
      } else {
        existing.add(danceId);
      }

      const next = program.shows.flatMap((show) =>
        show.items.filter((item) => item.type === "dance" && existing.has(item.id)).map((item) => item.id),
      );
      persistSelections(next);
      return next;
    });
  }

  function selectShow(showNumber: number) {
    setSelectedShowNumber(showNumber);
    setQuery("");
    setActiveDance(null);
  }

  const modeOptions = [
    { id: "my-dances" as const, label: "My Dances", icon: ListChecks },
    { id: "program" as const, label: "Program", icon: BookOpenText },
    { id: "info" as const, label: "Info", icon: Info },
  ];

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07080b] px-3 py-2 sm:px-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Link href="/" aria-label="Premier Dance home" className="flex min-w-0 flex-1 items-center gap-3">
            <Image
              src={`${BASE_PATH}/elev82.svg`}
              alt="ELEV8"
              width={175}
              height={95}
              priority
              className="h-14 w-auto shrink-0 sm:h-16"
            />
            <div className="min-w-0 border-l border-white/15 pl-3 leading-tight">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-white">{program.event.dateRange}</p>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.1em] text-white/55">
                {program.event.venue.name}
              </p>
            </div>
          </Link>
        </div>
      </header>

      <section className="bg-[#07080b] px-3 pb-28 pt-3 sm:px-4 lg:px-8">
        <div className="mx-auto grid max-w-3xl gap-4">
          {mode !== "info" ? (
            <div
              className="grid gap-2 rounded-[8px] border border-white/10 bg-white/5 p-2"
              role="tablist"
              aria-label="Select recital show"
            >
              <div className="grid grid-cols-2 gap-1 rounded-[6px] bg-black/20 p-1" aria-label="Select recital day">
                {dayGroups.map((group) => {
                  const isSelected = group.label === selectedDayGroup?.label;
                  const firstShowNumber = group.showNumbers[0];

                  return (
                    <button
                      key={group.label}
                      type="button"
                      onClick={() => selectShow(firstShowNumber)}
                      className={`min-h-9 rounded-[5px] text-xs font-bold uppercase tracking-[0.14em] transition ${
                        isSelected ? "bg-[#1C4EFF] text-white" : "text-white/55 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {group.label}
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-1.5 rounded-[6px] bg-black/20 p-1.5">
                {selectedDayShows.map((show) => {
                  const isSelected = show.showNumber === currentShow.showNumber;

                  return (
                    <button
                      key={show.id}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      onClick={() => selectShow(show.showNumber)}
                      className={`flex min-h-14 items-center justify-between gap-3 rounded-[6px] px-3 py-2 text-left transition ${
                        isSelected
                          ? "bg-[#1C4EFF] text-white shadow-[0_0_0_1px_rgba(255,255,255,0.18)]"
                          : "bg-white/[0.03] text-white hover:bg-white/10"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block text-[10px] font-medium uppercase tracking-[0.16em] opacity-70">
                          Show {show.showNumber}
                        </span>
                        <span className="mt-0.5 block text-base font-semibold leading-5">{show.startTime}</span>
                      </span>
                      <span className="shrink-0 rounded-full border border-white/15 px-2 py-1 text-[11px] font-medium text-white/75">
                        {show.danceCount} dances
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {mode === "program" ? (
            <>
              <label className="relative block">
                <span className="sr-only">Search program</span>
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/45"
                />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search title, teacher, or dancer"
                  className="min-h-12 rounded-[4px] border-white/15 bg-white/5 pl-10 text-base text-white placeholder:text-white/45 focus-visible:border-white focus-visible:ring-white/20"
                />
              </label>

              <div className="grid gap-2" aria-live="polite">
                {filteredProgramItems.length === 0 ? (
                  <div className="rounded-[6px] border border-white/10 bg-white/5 p-5 text-sm leading-6 text-white/70">
                    No program items match this search in Show {currentShow.showNumber}.
                  </div>
                ) : null}

                {filteredProgramItems.map((item) => {
                  const isTracked = selectedIdSet.has(item.id);

                  if (item.type !== "dance") {
                    return (
                      <div
                        key={item.id}
                        className="grid grid-cols-[2.5rem_1fr] gap-3 rounded-[6px] border border-white/10 bg-transparent px-2 py-3 text-white/70"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-[4px] border border-white/10 text-xs font-bold text-white/45">
                          {item.order ?? "•"}
                        </div>
                        <div className="min-w-0 border-l border-white/10 pl-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8ea4ff]">
                            {getTypeLabel(item)}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-white/78">{item.title}</p>
                          {item.programNote ? <p className="mt-1 text-xs text-white/45">{item.programNote}</p> : null}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <article
                      key={item.id}
                      className={`rounded-[6px] border transition ${
                        isTracked
                          ? "border-[#1C4EFF] bg-[#0b1d3d]"
                          : "border-white/10 bg-white/5 hover:border-[#1C4EFF] hover:bg-white/8"
                      }`}
                    >
                      <div className="flex items-stretch gap-2 p-2">
                        <button
                          type="button"
                          onClick={() => setActiveDance(item)}
                          className="flex min-w-0 flex-1 items-center gap-3 rounded-[4px] p-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C4EFF]"
                        >
                          <span
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[4px] text-sm font-bold ${
                              isTracked
                                ? "bg-[#1C4EFF] text-white"
                                : "border border-white/10 bg-black/10 text-white"
                            }`}
                          >
                            {item.order}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-base font-semibold leading-6 text-white">{item.title}</span>
                            <span className="mt-0.5 block truncate text-xs font-medium text-white/50">
                              {item.teacher ?? "Teacher not listed"}
                              {item.songTitle ? ` · ${item.songTitle}` : ""}
                            </span>
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleDance(item.id)}
                          aria-label={`${isTracked ? "Remove" : "Track"} ${item.title}`}
                          aria-pressed={isTracked}
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition ${
                            isTracked
                              ? "bg-[#1C4EFF] text-white"
                              : "border border-white/15 text-white/75 hover:border-[#1C4EFF] hover:bg-[#1C4EFF] hover:text-white"
                          }`}
                        >
                          {isTracked ? <Check aria-hidden="true" className="size-5" /> : <Plus aria-hidden="true" className="size-5" />}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          ) : null}

          {mode === "my-dances" ? (
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-3 rounded-[8px] border border-white/10 bg-white/5 p-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Tracked</p>
                  <p className="mt-1 text-lg font-bold leading-6 text-white">
                    {trackedCountForShow} of {currentShow.danceCount} dances
                  </p>
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-black/15 px-3 py-2 text-xs font-bold text-white/75">
                  <input
                    type="checkbox"
                    checked={momHelperEnabled}
                    onChange={(event) => setMomHelperEnabled(event.target.checked)}
                    className="size-4 accent-[#1C4EFF]"
                  />
                  Mom Helper
                </label>
              </div>

              {trackedRows.length === 0 ? (
                <div className="rounded-[8px] border border-white/10 bg-white/5 p-5">
                  <Music2 aria-hidden="true" className="size-7 text-[#1C4EFF]" />
                  <h2 className="mt-3 text-lg font-bold text-white">No tracked dances for this show</h2>
                  <p className="mt-2 text-sm leading-6 text-white/60">
                    Open the Program tab and tap the plus next to each dance you want to follow.
                  </p>
                  <button
                    type="button"
                    onClick={() => setMode("program")}
                    className="mt-4 flex min-h-11 items-center justify-center rounded-[6px] bg-[#1C4EFF] px-4 text-sm font-bold text-white"
                  >
                    Open Program
                  </button>
                </div>
              ) : (
                <div className="grid gap-2">
                  {trackedRows.map((row) => (
                    <article key={row.item.id} className="rounded-[6px] border border-white/10 bg-white/5 p-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[4px] bg-[#1C4EFF] text-sm font-bold text-white">
                          {row.item.order}
                        </div>
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => setActiveDance(row.item)}
                            className="block text-left text-base font-semibold leading-6 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C4EFF]"
                          >
                            {row.item.title}
                          </button>
                          <p className="mt-1 text-xs font-medium text-white/50">
                            {row.item.teacher ?? "Teacher not listed"}
                            {row.item.songTitle ? ` · ${row.item.songTitle}` : ""}
                          </p>
                          <div className="mt-3 grid gap-1 text-xs leading-5 text-white/62">
                            <p>
                              {row.isFirstTrackedDance ? "Before this dance" : "Since previous tracked dance"}:{" "}
                              <span className="font-semibold text-white/82">
                                {pluralize(row.programItemsBefore, "program item")}
                              </span>
                              {" / "}
                              <span className="font-semibold text-white/82">
                                {pluralize(row.dancesBefore, "dance")}
                              </span>
                            </p>
                            {momHelperEnabled && row.isQuickChange ? (
                              <div className="mt-2 flex items-start gap-2 rounded-[6px] border border-[#f59e0b]/60 bg-[#2b1707] p-2 text-[#fed7aa]">
                                <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                                <p>
                                  Quick change: only {pluralize(row.dancesBefore, "dance")} before this routine.
                                </p>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleDance(row.item.id)}
                          aria-label={`Remove ${row.item.title}`}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-white/60 transition hover:bg-white/10 hover:text-white"
                        >
                          <X aria-hidden="true" className="size-4" />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {mode === "info" ? (
            <div className="grid gap-3">
              <section className="rounded-[8px] border border-white/10 bg-white/5 p-4">
                <div className="flex items-start gap-3">
                  <MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[#1C4EFF]" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Venue</p>
                    <h2 className="mt-1 text-2xl font-bold leading-8 text-white">{program.event.venue.name}</h2>
                    <p className="mt-1 text-sm text-white/60">{program.event.venue.address}</p>
                    <a
                      href={program.event.venue.mapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex min-h-10 items-center justify-center rounded-[6px] bg-white px-4 text-sm font-bold text-[#080808] transition hover:bg-white/90"
                    >
                      Open in Maps
                    </a>
                  </div>
                </div>
              </section>

              <section className="grid gap-3 rounded-[8px] border border-white/10 bg-white/5 p-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Photography</p>
                  <p className="mt-1 text-sm leading-6 text-white/75">{program.event.photographyRule}</p>
                </div>
                <div className="border-t border-white/10 pt-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Phones</p>
                  <p className="mt-1 text-sm leading-6 text-white/75">{program.event.cellPhoneRule}</p>
                </div>
                <div className="border-t border-white/10 pt-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Intermission</p>
                  <p className="mt-1 text-sm leading-6 text-white/75">{program.event.intermissionNote}</p>
                </div>
              </section>

              <section className="rounded-[8px] border border-white/10 bg-white/5 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Recital Help</p>
                <div className="mt-3 grid gap-2">
                  {program.event.helpNotes.map((note) => (
                    <p key={note} className="rounded-[6px] border border-white/10 bg-white/[0.03] p-3 text-sm leading-6 text-white/72">
                      {note}
                    </p>
                  ))}
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </section>

      <nav
        aria-label="Recital sections"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#07080b]/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 backdrop-blur"
      >
        <div className="mx-auto grid max-w-3xl grid-cols-3 gap-1 rounded-[10px] border border-white/10 bg-white/5 p-1 sm:gap-2">
          {modeOptions.map((item) => {
            const isSelected = mode === item.id;
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setMode(item.id);
                  setQuery("");
                }}
                aria-current={isSelected ? "page" : undefined}
                className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-[8px] px-1 text-[11px] font-bold leading-none transition sm:min-h-12 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm ${
                  isSelected ? "bg-[#1C4EFF] text-white" : "text-white/58 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon aria-hidden="true" className="size-5 sm:size-4" />
                <span>{item.label}</span>
                {item.id === "my-dances" && totalTrackedCount > 0 ? (
                  <span className="absolute right-2 top-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-[#1C4EFF]">
                    {totalTrackedCount}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </nav>

      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.35rem)] right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/15 text-white shadow-lg shadow-black/40 backdrop-blur transition hover:bg-white/25 sm:right-[calc(50%-23rem)]"
        aria-label="Back to top"
      >
        <ArrowUp aria-hidden="true" className="size-5" />
      </button>

      {activeDance ? (
        <DanceDetailModal
          dance={activeDance}
          isTracked={selectedIdSet.has(activeDance.id)}
          onClose={() => setActiveDance(null)}
          onToggle={() => toggleDance(activeDance.id)}
        />
      ) : null}
    </>
  );
}

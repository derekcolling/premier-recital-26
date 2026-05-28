"use client";

import Image from "next/image";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, CalendarDays, CalendarRange, Check, Info, ListOrdered, MapPin, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { RecitalShow } from "@/lib/recital";
import type { RecitalScheduleData, RecitalScheduleEvent } from "@/lib/recital-schedule";

type StoredSelections = Record<string, number[]>;
type BrowserMode = "show-order" | "schedule" | "full-rehearsal" | "location";

const TRACKER_STORAGE_KEY = "premier-recital-tracker-v1";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const TEAMUP_SCHEDULE_DATES = new Set(["2026-05-26", "2026-05-27", "2026-05-28", "2026-05-29"]);

const SHOW_META: Record<number, { day: string; time: string; label: string }> = {
  1: { day: "Saturday", time: "Noon", label: "Saturday noon" },
  2: { day: "Saturday, May 30", time: "6:00 PM", label: "Saturday May 30 6pm" },
  3: { day: "Sunday, May 31", time: "Noon", label: "Sunday May 31 noon" },
  4: { day: "Sunday, May 31", time: "6:00 PM", label: "Sunday May 31 6pm" },
};

function getShowMeta(show: RecitalShow) {
  return (
    SHOW_META[show.showNumber] ?? {
      day: `Show ${show.showNumber}`,
      time: show.sourceMeta,
      label: show.sourceMeta,
    }
  );
}

const SHOW_GROUPS = [
  { label: "Saturday", showNumbers: [1, 2] },
  { label: "Sunday", showNumbers: [3, 4] },
];

function storageKey(showNumber: number) {
  return String(showNumber);
}

function normalizeTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/contemporary/g, "contemp")
    .replace(/\bmt\b/g, "musical theater")
    .replace(/tuesday/g, "t")
    .replace(/thursday/g, "th")
    .replace(/wednesday/g, "w")
    .replace(/monday/g, "m")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getRehearsalTitleCore(value: string) {
  const [titleBeforeTeacher] = value.split(/\s*-\s*/);
  return normalizeTitle(titleBeforeTeacher ?? value);
}

const ROUTINE_MATCH_STOP_WORDS = new Set([
  "and",
  "class",
  "costume",
  "bring",
  "show",
  "the",
  "to",
  "with",
]);

const WEEKDAY_TOKENS = new Set(["m", "t", "w", "th"]);
const STYLE_MATCH_TOKENS = new Set([
  "ballet",
  "combo",
  "contemp",
  "dance",
  "dude",
  "dudes",
  "finale",
  "hip",
  "hop",
  "movement",
  "musical",
  "rhinestones",
  "tap",
  "team",
  "tendu",
  "theater",
]);
const LEVEL_MATCH_TOKENS = new Set([
  "aqua",
  "college",
  "diamond",
  "elementary",
  "gold",
  "onyx",
  "opal",
  "pearl",
  "platinum",
  "rhinestones",
  "sapphire",
  "silver",
  "tiny",
  "topaz",
]);

function getMatchTokens(value: string) {
  return normalizeTitle(value)
    .split(" ")
    .filter((token) => token.length > 0 && !ROUTINE_MATCH_STOP_WORDS.has(token));
}

function getCoreMatchTokens(value: string) {
  return getMatchTokens(value).filter((token) => !WEEKDAY_TOKENS.has(token));
}

function getTokenSet(value: string, candidates: Set<string>) {
  return new Set(getMatchTokens(value).filter((token) => candidates.has(token)));
}

function countMatchingTokens(source: string[], candidates: Set<string>) {
  return [...new Set(source)].reduce((total, token) => total + (candidates.has(token) ? 1 : 0), 0);
}

function setsAreEqual(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) return false;

  for (const item of left) {
    if (!right.has(item)) return false;
  }

  return true;
}

function setsIntersect(left: Set<string>, right: Set<string>) {
  for (const item of left) {
    if (right.has(item)) return true;
  }

  return false;
}

function titlesAreKnownAliases(left: string, right: string) {
  const pair = [left, right].sort().join("|");

  return pair === "dance party bow|show 1 finale";
}

function routineTitleMatchesEvent(eventTitle: string, trackedTitle: string) {
  if (eventTitle === trackedTitle) return true;
  if (titlesAreKnownAliases(eventTitle, trackedTitle)) return true;

  const trackedCoreTokens = getCoreMatchTokens(trackedTitle);
  const eventCoreTokens = getCoreMatchTokens(eventTitle);

  if (trackedCoreTokens.length < 2 || eventCoreTokens.length < 2) return false;

  const trackedLevels = getTokenSet(trackedTitle, LEVEL_MATCH_TOKENS);
  const eventLevels = getTokenSet(eventTitle, LEVEL_MATCH_TOKENS);

  if (trackedLevels.size > 0 && eventLevels.size > 0 && !setsAreEqual(trackedLevels, eventLevels)) {
    return false;
  }

  const trackedWeekdays = getTokenSet(trackedTitle, WEEKDAY_TOKENS);
  const eventWeekdays = getTokenSet(eventTitle, WEEKDAY_TOKENS);

  if (trackedWeekdays.size > 0 && eventWeekdays.size > 0 && !setsIntersect(trackedWeekdays, eventWeekdays)) {
    return false;
  }

  const trackedSet = new Set(trackedCoreTokens);
  const eventSet = new Set(eventCoreTokens);
  const trackedStyles = getTokenSet(trackedTitle, STYLE_MATCH_TOKENS);
  const eventStyles = getTokenSet(eventTitle, STYLE_MATCH_TOKENS);

  if (trackedStyles.size > 0 && eventStyles.size > 0 && !setsIntersect(trackedStyles, eventStyles)) {
    return false;
  }

  if (eventTitle.length > 2 && trackedTitle.length > 2) {
    if (eventTitle.includes(trackedTitle) || trackedTitle.includes(eventTitle)) return true;
  }

  const matchingCoreTokenCount = countMatchingTokens(trackedCoreTokens, eventSet);
  const matchedEnoughOfTrackedTitle =
    matchingCoreTokenCount >= Math.min(trackedSet.size, 3) ||
    matchingCoreTokenCount / trackedSet.size >= 0.75;
  const matchedEnoughOfEventTitle =
    matchingCoreTokenCount >= Math.min(eventSet.size, 3) ||
    matchingCoreTokenCount / eventSet.size >= 0.75;

  if (!matchedEnoughOfTrackedTitle && !matchedEnoughOfEventTitle) return false;

  return true;
}

const SUBCALENDAR_LOCATION_LABELS: Record<number, string> = {
  14601454: "Studio 1",
  14601455: "Studio 2",
  14601465: "Studio 3",
  14601466: "Studio 4",
  14601467: "Studio 5",
  14601468: "Studio 6",
  14601469: "Studio 7",
  14601470: "Studio 8",
};

function eventMatchesTrackedRoutine(event: RecitalScheduleEvent, trackedTitles: string[]) {
  const eventTitle = getRehearsalTitleCore(event.title);

  return trackedTitles.some((trackedTitle) => {
    if (trackedTitle.length <= 2) return false;

    return routineTitleMatchesEvent(eventTitle, trackedTitle);
  });
}

function eventMatchesTrackedShow(event: RecitalScheduleEvent, trackedShowNumbers: number[]) {
  const eventTitle = event.title.toLowerCase();

  return trackedShowNumbers.some((showNumber) => {
    if (event.category !== "dress_rehearsal") return false;

    return showNumber <= 2
      ? eventTitle.includes("show 1 & 2")
      : eventTitle.includes("show 3 & 4");
  });
}

function getEventLocationLabel(event: RecitalScheduleEvent) {
  if (event.location) return event.location;
  if (event.title.toLowerCase().includes("b&b")) return "B&B Theaters";

  const studioLabels = event.subcalendarIds
    .map((id) => SUBCALENDAR_LOCATION_LABELS[id])
    .filter(Boolean);

  if (studioLabels.length > 0) return `Premier Dance · ${studioLabels.join(", ")}`;

  if (event.category === "rehearsal_or_class" || event.category === "costume_rehearsal") {
    return "Premier Dance studio";
  }

  return "Location not listed";
}

export function RecitalBrowser({
  shows,
  schedule,
}: {
  shows: RecitalShow[];
  schedule: RecitalScheduleData;
}) {
  const [selectedShow, setSelectedShow] = useState(shows[0]?.showNumber ?? 1);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<BrowserMode>("show-order");
  const [selectedByShow, setSelectedByShow] = useState<StoredSelections>({});
  const [headerHeight, setHeaderHeight] = useState(73);
  const headerRef = useRef<HTMLElement | null>(null);

  const currentShow = shows.find((show) => show.showNumber === selectedShow) ?? shows[0];
  const showKey = currentShow ? storageKey(currentShow.showNumber) : "";
  const normalizedQuery = query.trim().toLowerCase();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(TRACKER_STORAGE_KEY);
        setSelectedByShow(saved ? (JSON.parse(saved) as StoredSelections) : {});
      } catch {
        setSelectedByShow({});
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const headerElement = headerRef.current!;
    if (!headerElement) return;

    function updateHeaderHeight() {
      setHeaderHeight(Math.ceil(headerElement.getBoundingClientRect().height));
    }

    updateHeaderHeight();

    const resizeObserver = new ResizeObserver(updateHeaderHeight);
    resizeObserver.observe(headerElement);
    window.addEventListener("resize", updateHeaderHeight);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateHeaderHeight);
    };
  }, []);


  const selectedOrders = useMemo(
    () => [...(selectedByShow[showKey] ?? [])].sort((a, b) => a - b),
    [selectedByShow, showKey],
  );

  const selectedOrderSet = useMemo(() => new Set(selectedOrders), [selectedOrders]);

  const filteredItems = useMemo(() => {
    if (!currentShow) return [];
    if (!normalizedQuery) return currentShow.items;

    return currentShow.items.filter((item) => {
      const searchable = [
        item.title,
        item.order?.toString() ?? "",
        item.type,
        item.instructorOrOwner ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedQuery);
    });
  }, [currentShow, normalizedQuery]);

  const trackedShowNumbers = useMemo(
    () =>
      shows
        .filter((show) => (selectedByShow[storageKey(show.showNumber)] ?? []).length > 0)
        .map((show) => show.showNumber),
    [selectedByShow, shows],
  );

  const trackedRoutineTitles = useMemo(() => {
    return shows.flatMap((show) => {
      const trackedOrders = new Set(selectedByShow[storageKey(show.showNumber)] ?? []);

      return show.items
        .filter((item) => item.order !== null && trackedOrders.has(item.order))
        .map((item) => normalizeTitle(item.title));
    });
  }, [selectedByShow, shows]);

  const trackedRoutineCount = trackedRoutineTitles.length;

  const filteredScheduleDays = useMemo(() => {
    return schedule.days
      .map((day) => ({
        ...day,
        events: day.events.filter((event) => {
          const searchable = [event.title, event.displayDate, event.time, event.location, event.who, event.notes]
            .join(" ")
            .toLowerCase();
          const matchesSearch = !normalizedQuery || searchable.includes(normalizedQuery);
          const matchesTracked =
            eventMatchesTrackedRoutine(event, trackedRoutineTitles) ||
            eventMatchesTrackedShow(event, trackedShowNumbers);

          return matchesSearch && matchesTracked && !event.isPrivate;
        }),
      }))
      .filter((day) => day.events.length > 0);
  }, [normalizedQuery, schedule.days, trackedRoutineTitles, trackedShowNumbers]);

  const fullRehearsalScheduleDays = useMemo(() => {
    return schedule.days
      .filter((day) => TEAMUP_SCHEDULE_DATES.has(day.date))
      .map((day) => ({
        ...day,
        events: day.events.filter((event) => {
          const searchable = [event.title, event.displayDate, event.time, event.location, event.who, event.notes]
            .join(" ")
            .toLowerCase();
          const matchesSearch = !normalizedQuery || searchable.includes(normalizedQuery);

          return matchesSearch;
        }),
      }))
      .filter((day) => day.events.length > 0);
  }, [normalizedQuery, schedule.days]);

  const trackedEventCount = filteredScheduleDays.reduce((total, day) => total + day.events.length, 0);
  const fullRehearsalEventCount = fullRehearsalScheduleDays.reduce((total, day) => total + day.events.length, 0);
  const modeOptions = [
    { id: "show-order" as const, label: "Show Order", shortLabel: "Show Order", icon: ListOrdered },
    { id: "schedule" as const, label: "Rehearsal", shortLabel: "Rehearsal", icon: CalendarDays },
    { id: "full-rehearsal" as const, label: "TeamUp", shortLabel: "TeamUp", icon: CalendarRange },
    { id: "location" as const, label: "Location", shortLabel: "Location", icon: MapPin },
  ];
  const selectedShowGroup =
    SHOW_GROUPS.find((group) => group.showNumbers.includes(selectedShow)) ?? SHOW_GROUPS[0];
  const selectedDayShows = selectedShowGroup.showNumbers
    .map((showNumber) => shows.find((show) => show.showNumber === showNumber))
    .filter((show): show is RecitalShow => Boolean(show));

  if (!currentShow) return null;

  function toggleRoutine(order: number) {
    setSelectedByShow((previous) => {
      const existing = new Set(previous[showKey] ?? []);

      if (existing.has(order)) {
        existing.delete(order);
      } else {
        existing.add(order);
      }

      const nextSelections = {
        ...previous,
        [showKey]: [...existing].sort((a, b) => a - b),
      };

      try {
        window.localStorage.setItem(TRACKER_STORAGE_KEY, JSON.stringify(nextSelections));
      } catch {
        // Tracking still works for this session if localStorage is unavailable.
      }

      return nextSelections;
    });
  }

  return (
    <>
      <header ref={headerRef} className="sticky top-0 z-50 border-b border-white/10 bg-[#07080b] px-3 py-2 sm:px-4">
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
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-white">May 30–31, 2026</p>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.1em] text-white/55">
                B&amp;B Theaters
              </p>
            </div>
          </Link>

        </div>
      </header>

      <section className="bg-[#07080b] px-3 pb-28 pt-3 sm:px-4 lg:px-8">
        <div className="mx-auto max-w-3xl">

        {mode === "show-order" ? (
          <>
        <div
          className="mx-auto grid max-w-3xl gap-2 rounded-[8px] border border-white/10 bg-white/5 p-2"
          role="tablist"
          aria-label="Select recital show"
        >
          <div className="grid grid-cols-2 gap-1 rounded-[6px] bg-black/20 p-1" aria-label="Select recital day">
            {SHOW_GROUPS.map((group) => {
              const isSelected = group.label === selectedShowGroup.label;
              const firstShowNumber = group.showNumbers[0];

              return (
                <button
                  key={group.label}
                  type="button"
                  onClick={() => {
                    setSelectedShow(firstShowNumber);
                    setQuery("");
                  }}
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
              const meta = getShowMeta(show);

              return (
                <button
                  key={show.showNumber}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => {
                    setSelectedShow(show.showNumber);
                    setQuery("");
                  }}
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
                    <span className="mt-0.5 block text-base font-semibold leading-5">{meta.time}</span>
                  </span>
                  <span className="shrink-0 rounded-full border border-white/15 px-2 py-1 text-[11px] font-medium text-white/75">
                    {show.routineCount} routines
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          <label className="relative block">
            <span className="sr-only">Search dances</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#5a5a5a] dark:text-white/45"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title or number"
              className="min-h-12 rounded-[4px] border-[#d8d8d8] bg-white pl-10 text-base text-[#080808] placeholder:text-[#5a5a5a] focus-visible:border-[#080808] focus-visible:ring-[#080808]/20 dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-white/45 dark:focus-visible:border-white dark:focus-visible:ring-white/20"
            />
          </label>

          <div className="grid gap-2" aria-live="polite">
            {filteredItems.length === 0 ? (
              <div className="border border-[#d8d8d8] p-5 text-sm leading-6 text-[#363636] dark:border-white/10 dark:text-white/70">
                No dances match this search in Show {currentShow.showNumber}.
              </div>
            ) : null}

            {filteredItems.map((item, index) => {
              const routineOrder = typeof item.order === "number" ? item.order : null;
              const isSelected = routineOrder !== null && selectedOrderSet.has(routineOrder);
              const nextTrackedOrder =
                isSelected && routineOrder !== null
                  ? selectedOrders.find((order) => order > routineOrder)
                  : undefined;
              const quickChangeGap =
                nextTrackedOrder !== undefined && routineOrder !== null
                  ? nextTrackedOrder - routineOrder - 1
                  : null;
              const nextTrackedRoutine = currentShow.items.find(
                (routine) => routine.order === nextTrackedOrder,
              );
              const showQuickChangeAlert = quickChangeGap !== null && quickChangeGap < 4;

              return (
                <Fragment key={`${currentShow.showNumber}-${item.order ?? "break"}-${item.title}-${index}`}>
                <article
                  key={`${currentShow.showNumber}-${item.order ?? "break"}-${item.title}-${index}`}
                  role={item.type === "routine" && routineOrder !== null ? "button" : undefined}
                  tabIndex={item.type === "routine" && routineOrder !== null ? 0 : undefined}
                  aria-pressed={item.type === "routine" && routineOrder !== null ? isSelected : undefined}
                  onClick={
                    item.type === "routine" && routineOrder !== null
                      ? () => toggleRoutine(routineOrder)
                      : undefined
                  }
                  onKeyDown={
                    item.type === "routine" && routineOrder !== null
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleRoutine(routineOrder);
                          }
                        }
                      : undefined
                  }
                  className={`group rounded-[6px] border p-3 transition ${
                    item.type === "intermission"
                      ? "border-[#080808] bg-[#080808] text-white"
                      : isSelected
                        ? "cursor-pointer border-[#1C4EFF] bg-[#eff6ff] text-[#080808] dark:border-[#1C4EFF] dark:bg-[#0b1d3d] dark:text-white"
                        : "cursor-pointer border-[#d8d8d8] bg-white text-[#080808] hover:border-[#1C4EFF] hover:bg-[#f7fbff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C4EFF] dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:border-[#1C4EFF] dark:hover:bg-white/10 dark:focus-visible:outline-[#1C4EFF]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] text-sm font-medium ${
                        item.type === "intermission"
                          ? "border border-white/30 text-white"
                          : isSelected
                            ? "border border-[#1C4EFF] bg-[#1C4EFF] text-white"
                            : "border border-[#d8d8d8] text-[#080808] dark:border-white/15 dark:text-white"
                      }`}
                    >
                      {item.order ?? "--"}
                    </div>

                    <h3 className="min-w-0 flex-1 text-base font-semibold leading-6">{item.title}</h3>

                    {item.type === "routine" && routineOrder !== null ? (
                      <span
                        aria-hidden="true"
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
                          isSelected
                            ? "bg-[#1C4EFF] text-white shadow-[0_0_0_1px_rgba(255,255,255,0.2)]"
                            : "border border-[#d8d8d8] text-[#1C4EFF] group-hover:border-[#1C4EFF] group-hover:bg-[#1C4EFF] group-hover:text-white dark:border-white/15 dark:text-white/75 dark:group-hover:border-[#1C4EFF] dark:group-hover:bg-[#1C4EFF]"
                        }`}
                      >
                        {isSelected ? <Check className="size-5" /> : <Plus className="size-5" />}
                      </span>
                    ) : null}

                    {item.type === "intermission" ? (
                      <span className="shrink-0 rounded-[4px] border border-white/30 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.12em]">
                        Break
                      </span>
                    ) : null}
                  </div>
                </article>
                {showQuickChangeAlert ? (
                  <div className="rounded-[6px] border border-[#f59e0b] bg-[#fff7ed] p-3 text-[#7c2d12] dark:border-[#f59e0b]/60 dark:bg-[#2b1707] dark:text-[#fed7aa]">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#c2410c] dark:text-[#fdba74]">
                      Quick change alert
                    </p>
                    <p className="mt-1 text-sm font-semibold leading-5">
                      {quickChangeGap === 0
                        ? "Back-to-back tracked dances."
                        : `${quickChangeGap} ${quickChangeGap === 1 ? "dance" : "dances"} between tracked dances.`}
                    </p>
                    {nextTrackedRoutine ? (
                      <p className="mt-1 text-xs leading-5 text-[#9a3412] dark:text-[#fed7aa]/80">
                        Next tracked: #{nextTrackedRoutine.order} {nextTrackedRoutine.title}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                </Fragment>
              );
            })}
          </div>
        </div>
          </>
        ) : mode === "schedule" ? (
          <div className="mt-5 grid gap-4">
            <div className="rounded-[8px] border border-white/10 bg-white/5 p-3">
              <div className="flex items-start gap-3">
                <CalendarDays aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[#1C4EFF]" />
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-white">Your Rehearsals</h2>
                  <p className="mt-1 text-sm leading-5 text-white/60">
                    Only rehearsals tied to dances you tracked in Show Order, plus the matching dress rehearsal window.
                  </p>
                </div>
              </div>
            </div>

            <label className="relative block">
              <span className="sr-only">Search schedule</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/45"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search schedule"
                className="min-h-12 rounded-[4px] border-white/15 bg-white/5 pl-10 text-base text-white placeholder:text-white/45 focus-visible:border-white focus-visible:ring-white/20"
              />
            </label>

            {trackedEventCount === 0 ? (
              <div className="rounded-[6px] border border-white/10 bg-white/5 p-5 text-sm leading-6 text-white/70">
                {trackedRoutineCount === 0
                  ? "Track dances in Show Order to build your rehearsal list."
                  : "No rehearsal items match your tracked dances and search."}
              </div>
            ) : null}

            <div className="grid gap-4" aria-live="polite">
              {filteredScheduleDays.map((day) => (
                <section key={day.date} className="grid gap-2">
                  <h3
                    className="sticky z-30 -mx-3 border-y border-[#4f74ff] bg-[#1C4EFF] px-3 py-3 text-xs font-bold uppercase tracking-[0.16em] text-white shadow-[0_1px_0_rgba(255,255,255,0.18)] sm:-mx-4 sm:px-4"
                    style={{ top: headerHeight }}
                  >
                    {day.displayDate}
                  </h3>
                  <div className="grid gap-2">
                    {day.events.map((event) => {
                      const matchesTracked =
                        eventMatchesTrackedRoutine(event, trackedRoutineTitles) ||
                        eventMatchesTrackedShow(event, trackedShowNumbers);

                      return (
                        <article
                          key={event.id}
                          className={`rounded-[6px] border p-3 ${
                            matchesTracked
                              ? "border-[#1C4EFF] bg-[#0b1d3d]"
                              : event.isImportant
                                ? "border-white/15 bg-white/8"
                                : "border-white/10 bg-white/5"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-white">{event.time}</p>
                              <h4 className="mt-1 text-base font-semibold leading-6 text-white">{event.title}</h4>
                              <p className="mt-1 text-sm text-white/60">{getEventLocationLabel(event)}</p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              {matchesTracked ? (
                                <span className="rounded-full bg-[#1C4EFF] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white">
                                  Tracked
                                </span>
                              ) : null}
                              {event.title.toLowerCase().includes("bring costume") ? (
                                <span className="rounded-full border border-[#f59e0b]/60 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#fed7aa]">
                                  Costume
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        ) : mode === "full-rehearsal" ? (
          <div className="mt-5 grid gap-4">
            <div className="rounded-[8px] border border-white/10 bg-white/5 p-3">
              <div className="flex items-start gap-3">
                <CalendarRange aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[#1C4EFF]" />
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-white">TeamUp Schedule</h2>
                  <p className="mt-1 text-sm leading-5 text-white/60">
                    Full TeamUp schedule for May 26-29.
                  </p>
                </div>
              </div>
            </div>

            <label className="relative block">
              <span className="sr-only">Search full rehearsal schedule</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/45"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search full schedule"
                className="min-h-12 rounded-[4px] border-white/15 bg-white/5 pl-10 text-base text-white placeholder:text-white/45 focus-visible:border-white focus-visible:ring-white/20"
              />
            </label>

            {fullRehearsalEventCount === 0 ? (
              <div className="rounded-[6px] border border-white/10 bg-white/5 p-5 text-sm leading-6 text-white/70">
                No TeamUp schedule items match this search.
              </div>
            ) : null}

            <div className="grid gap-4" aria-live="polite">
              {fullRehearsalScheduleDays.map((day) => (
                <section key={day.date} className="grid gap-2">
                  <h3
                    className="sticky z-30 -mx-3 border-y border-[#4f74ff] bg-[#1C4EFF] px-3 py-3 text-xs font-bold uppercase tracking-[0.16em] text-white shadow-[0_1px_0_rgba(255,255,255,0.18)] sm:-mx-4 sm:px-4"
                    style={{ top: headerHeight }}
                  >
                    {day.displayDate}
                  </h3>
                  <div className="grid gap-2">
                    {day.events.map((event) => {
                      const matchesTracked =
                        eventMatchesTrackedRoutine(event, trackedRoutineTitles) ||
                        eventMatchesTrackedShow(event, trackedShowNumbers);

                      return (
                        <article
                          key={event.id}
                          className={`rounded-[6px] border p-3 ${
                            matchesTracked
                              ? "border-[#1C4EFF] bg-[#0b1d3d]"
                              : event.isImportant
                                ? "border-white/15 bg-white/8"
                                : "border-white/10 bg-white/5"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-white">{event.time}</p>
                              <h4 className="mt-1 text-base font-semibold leading-6 text-white">{event.title}</h4>
                              <p className="mt-1 text-sm text-white/60">{getEventLocationLabel(event)}</p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              {matchesTracked ? (
                                <span className="rounded-full bg-[#1C4EFF] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white">
                                  Tracked
                                </span>
                              ) : null}
                              {event.title.toLowerCase().includes("bring costume") ? (
                                <span className="rounded-full border border-[#f59e0b]/60 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#fed7aa]">
                                  Costume
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-5 grid gap-4">
            <div className="rounded-[8px] border border-white/10 bg-white/5 p-4">
              <div className="flex items-start gap-3">
                <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[#1C4EFF]" />
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-white">Location Info</h2>
                  <p className="mt-1 text-sm leading-5 text-white/60">
                    Recital weekend and dress rehearsals are listed at B&amp;B Theaters in the studio schedule.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 rounded-[8px] border border-white/10 bg-white/5 p-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Venue</p>
                <h3 className="mt-1 text-2xl font-bold leading-8 text-white">B&amp;B Theaters</h3>
                <p className="mt-1 text-sm text-white/60">May 30–31, 2026</p>
                <p className="mt-1 text-sm font-medium text-white/75">16301 Midland Dr, Shawnee, KS 66217</p>
              </div>

              <a
                href="https://www.google.com/maps/search/?api=1&query=16301%20Midland%20Dr%2C%20Shawnee%2C%20KS%2066217"
                target="_blank"
                rel="noreferrer"
                className="flex min-h-12 items-center justify-center rounded-[6px] bg-white text-sm font-bold text-[#080808] transition hover:bg-white/90"
              >
                Open in Maps
              </a>
            </div>

            <div className="grid gap-2 rounded-[8px] border border-white/10 bg-white/5 p-4">
              <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
                <div>
                  <p className="text-sm font-bold text-white">Dress rehearsal</p>
                  <p className="mt-1 text-sm text-white/60">Thursday/Friday by show group</p>
                </div>
                <span className="shrink-0 rounded-full border border-white/15 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/60">
                  B&amp;B
                </span>
              </div>
              <div className="flex items-start justify-between gap-3 pt-1">
                <div>
                  <p className="text-sm font-bold text-white">Show weekend</p>
                  <p className="mt-1 text-sm text-white/60">Saturday/Sunday shows at noon and 6 PM</p>
                </div>
                <span className="shrink-0 rounded-full border border-white/15 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/60">
                  May 30–31
                </span>
              </div>
            </div>
          </div>
        )}
        </div>
      </section>

      <nav
        aria-label="Recital sections"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#07080b]/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 backdrop-blur"
      >
        <div className="mx-auto grid max-w-3xl grid-cols-4 gap-1 rounded-[10px] border border-white/10 bg-white/5 p-1 sm:gap-2">
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
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-[8px] px-1 text-[11px] font-bold leading-none transition sm:min-h-12 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm ${
                  isSelected ? "bg-[#1C4EFF] text-white" : "text-white/58 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon aria-hidden="true" className="size-5 sm:size-4" />
                <span className="sm:hidden">{item.shortLabel}</span>
                <span className="hidden sm:inline">{item.label}</span>
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
    </>
  );
}

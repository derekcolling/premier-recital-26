import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_PATH = path.join(
  process.cwd(),
  "data",
  "source-links",
  "recital",
  "recital-show-details-2026.json",
);
const OUTPUT_PATH = path.join(process.cwd(), "data", "elev8-program.json");

const EVENT_INFO = {
  title: "ELEV8: In The Details",
  dateRange: "May 30-31, 2026",
  venue: {
    name: "B&B Theaters",
    address: "16301 Midland Dr, Shawnee, KS 66217",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=16301%20Midland%20Dr%2C%20Shawnee%2C%20KS%2066217",
  },
  photographyRule: "Recording is allowed. Flash photography is prohibited.",
  cellPhoneRule: "Please silence cell phones before the show begins.",
  intermissionNote: "Shows include a 15-minute intermission where listed in the program.",
  helpNotes: [
    "Track dances from the Program tab, then use My Dances to see the order and spacing between routines.",
    "Tracked dances are stored on this device only.",
    "Ask a Premier Dance staff member at the venue for recital-day questions.",
  ],
};

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toItemType(routine) {
  if (routine.category === "filler") return "filler";
  if (routine.category === "featured") return "featured";
  if (routine.category === "finale") return "finale";
  return "dance";
}

function routineToProgramItem(routine, position) {
  const type = toItemType(routine);

  return {
    id: routine.id,
    type,
    position,
    order: routine.order,
    title: normalizeText(routine.title),
    songTitle: routine.song_title ? normalizeText(routine.song_title) : null,
    teacher: routine.instructor ? normalizeText(routine.instructor) : null,
    teachers: Array.isArray(routine.instructors) ? routine.instructors.map(normalizeText).filter(Boolean) : [],
    dancers: Array.isArray(routine.dancers) ? routine.dancers.map(normalizeText).filter(Boolean) : [],
    programNote: null,
    stageNote: null,
    trackable: type === "dance",
    sourceLine: routine.source_line,
  };
}

function markerToProgramItem(item, showNumber, position) {
  const title = normalizeText(item.label || item.title || item.type);
  const durationMinutes = item.duration_minutes ?? null;

  return {
    id: `show-${showNumber}-${slugify(title)}-${item.source_line ?? position}`,
    type: item.type === "intermission" ? "intermission" : "marker",
    position,
    order: null,
    title,
    songTitle: null,
    teacher: null,
    teachers: [],
    dancers: [],
    programNote: durationMinutes ? `${durationMinutes}-minute ${title.toLowerCase()}` : null,
    stageNote: null,
    trackable: false,
    sourceLine: item.source_line ?? null,
    durationMinutes,
  };
}

function buildShow(show) {
  const routinesById = new Map(show.routines.map((routine) => [routine.id, routine]));
  let position = 0;
  const items = show.items
    .map((item) => {
      position += 1;

      if (item.type === "routine") {
        const routine = routinesById.get(item.routine_id);
        if (!routine) return null;
        return routineToProgramItem(routine, position);
      }

      return markerToProgramItem(item, show.show_number, position);
    })
    .filter(Boolean);

  return {
    id: `show-${show.show_number}`,
    showNumber: show.show_number,
    label: show.label,
    day: show.day,
    date: show.date,
    startTime: show.start_time,
    title: `Show ${show.show_number}`,
    items,
    itemCount: items.length,
    danceCount: items.filter((item) => item.type === "dance").length,
    trackableCount: items.filter((item) => item.trackable).length,
  };
}

async function main() {
  const source = JSON.parse(await readFile(SOURCE_PATH, "utf8"));
  const program = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      documentId: source.document_id,
      documentTitle: source.document_title,
      documentUrl: source.source_url,
      exportUrl: source.export_url,
      pulledAt: source.pulled_at,
      sourceTextSha256: source.source_text_sha256,
    },
    event: EVENT_INFO,
    shows: source.shows.map(buildShow),
  };

  await writeFile(OUTPUT_PATH, `${JSON.stringify(program, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        outputPath: OUTPUT_PATH,
        showCount: program.shows.length,
        itemCount: program.shows.reduce((total, show) => total + show.itemCount, 0),
        danceCount: program.shows.reduce((total, show) => total + show.danceCount, 0),
        trackableCount: program.shows.reduce((total, show) => total + show.trackableCount, 0),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

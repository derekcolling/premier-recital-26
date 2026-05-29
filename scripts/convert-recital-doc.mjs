import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DOCUMENT_ID = "1qvnxz1AeP8AqHeDMiqoTn5VDaWfVElCJfSP0S2U_hj0";
const DOCUMENT_TITLE = "Copy of Recital Show Order + Notes";
const SOURCE_URL = `https://docs.google.com/document/d/${DOCUMENT_ID}/edit?tab=t.0`;
const EXPORT_URL = `https://docs.google.com/document/d/${DOCUMENT_ID}/export?format=txt`;
const OUTPUT_PATH = path.join(
  process.cwd(),
  "data",
  "source-links",
  "recital",
  "recital-show-details-2026.json",
);

const SHOW_META = {
  1: {
    label: "Saturday Noon Show",
    day: "Saturday",
    date: "2026-05-30",
    start_time: "12:00 PM",
  },
  2: {
    label: "Saturday 6:00 PM Show",
    day: "Saturday",
    date: "2026-05-30",
    start_time: "6:00 PM",
  },
  3: {
    label: "Sunday Noon Show",
    day: "Sunday",
    date: "2026-05-31",
    start_time: "12:00 PM",
  },
  4: {
    label: "Sunday 6:00 PM Show",
    day: "Sunday",
    date: "2026-05-31",
    start_time: "6:00 PM",
  },
};

function stripMarkup(value) {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/\*/g, "")
    .trim();
}

function normalizeSpaces(value) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeKey(value) {
  return normalizeSpaces(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[''"]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isShowHeading(line) {
  return /^show\s*#\s*\d+/i.test(stripMarkup(line));
}

function parseShowHeading(line) {
  const match = stripMarkup(line).match(/^show\s*#\s*(\d+)(?:\s*[—-]\s*(.+))?$/i);
  if (!match) return null;
  const showNumber = Number(match[1]);
  return {
    show_number: showNumber,
    source_label: match[2] ? normalizeSpaces(match[2]) : null,
    ...SHOW_META[showNumber],
  };
}

function isBlockedNarrativeLine(line) {
  return [
    /^are you ready to take your ballet training/i,
    /^join us for an unforgettable ballet intensive/i,
    /^featuring world-class faculty/i,
    /^and for dancers en pointe/i,
    /^meet our guest instructors/i,
    /^miss leydis:/i,
    /^ms\.?\s+emily zachary:/i,
    /^mr\.?\s+kelby brown:/i,
    /^ms\s+marlee bailey/i,
    /^ms\.?\s+emily adair:/i,
    /^whether you're looking/i,
    /^spots are limited/i,
    /^ladies & gentlemen/i,
    /^ladies and gentlemen/i,
    /^the show will begin/i,
    /^please take this opportunity/i,
    /^thank you\b/i,
    /^welcome to elev8/i,
    /^this is elev8\b/i,
    /^a celebration of growth/i,
    /^there are moments in life/i,
    /^through music and moments/i,
    /^every step on this stage/i,
    /^tonight,/i,
    /^please help us/i,
    /^now let's recognize/i,
    /^next, a huge round/i,
    /^and now, let's celebrate/i,
    /^and finally,/i,
    /^these dancers have dedicated/i,
    /^please help us recognize/i,
    /^have a wonderful evening/i,
  ].some((pattern) => pattern.test(line));
}

function isMarkerLine(line) {
  const clean = stripMarkup(line);
  return (
    /^voice\s*over\b/i.test(clean) ||
    /^voiceover\b/i.test(clean) ||
    /^opening script\b/i.test(clean) ||
    /^curtain call\b/i.test(clean) ||
    /^house\b/i.test(clean) ||
    /^stage\b/i.test(clean) ||
    /^5 minute warning/i.test(clean) ||
    /^3\/2\/1 minute warning/i.test(clean) ||
    /^seniors\b/i.test(clean) ||
    /^jillian & liz\b/i.test(clean) ||
    /^ball video\b/i.test(clean) ||
    /^rhinestones video\b/i.test(clean) ||
    /^out of this world production video\b/i.test(clean) ||
    /^video:/i.test(clean) ||
    /^slideshow\b/i.test(clean)
  );
}

function parseMarker(line, sourceLine) {
  const clean = stripMarkup(line);
  if (/^intermission\b/i.test(clean)) {
    const durationMatch = clean.match(/(\d+)\s*min/i);
    return {
      type: "intermission",
      label: "Intermission",
      duration_minutes: durationMatch ? Number(durationMatch[1]) : null,
      source_line: sourceLine,
    };
  }

  if (/^video:/i.test(clean)) {
    return {
      type: "video",
      title: normalizeSpaces(clean.replace(/^video:\s*/i, "")),
      source_line: sourceLine,
    };
  }

  if (/video$/i.test(clean)) {
    return {
      type: "video",
      title: normalizeSpaces(clean.replace(/\s*video$/i, "")),
      source_line: sourceLine,
    };
  }

  if (/^slideshow\b/i.test(clean)) {
    return {
      type: "slideshow",
      title: "Slideshow",
      source_line: sourceLine,
    };
  }

  return null;
}

function looksLikeInstructor(value) {
  const clean = normalizeSpaces(stripMarkup(value));
  if (!clean || clean.length > 80) return false;
  if (!/^[A-Z]/.test(clean)) return false;
  if (/[?!:;]/.test(clean)) return false;
  if (/\b(class|dancer|dancers|exercise|coordination|development|pointe)\b/i.test(clean)) return false;
  if (/\b(the|this|that|tonight|please|thank|show|details)\b/i.test(clean)) return false;
  return /^[A-Za-z.'’&\s]+$/.test(clean);
}

function splitHeadingOnLastSeparator(line) {
  for (let index = line.length - 1; index >= 0; index -= 1) {
    if (!"-–—".includes(line[index])) continue;
    const left = normalizeSpaces(line.slice(0, index));
    const right = normalizeSpaces(line.slice(index + 1));
    if (left && right) return { left, right };
    if (left) return { left, right };
  }

  return null;
}

function extractSongAndTitle(rawTitle) {
  let title = normalizeSpaces(rawTitle)
    .replace(/^["“”]+|["“”]+$/g, "")
    .trim();
  let song_title = null;

  const finaleMatch = title.match(/^finale\s*[:\-]\s*["“]?(.+?)["”]?$/i);
  if (finaleMatch) {
    return {
      title: "Finale",
      song_title: normalizeSpaces(finaleMatch[1]).replace(/^["“”]+|["“”]+$/g, ""),
    };
  }

  const dashSongMatch = title.match(/^(.+?)\s*-\s*(?:\((.+)\)|["“](.+?)["”])$/);
  if (dashSongMatch) {
    title = normalizeSpaces(dashSongMatch[1]).replace(/[-–—]\s*$/, "").trim();
    song_title = normalizeSpaces(dashSongMatch[2] || dashSongMatch[3]);
  }

  const parenMatches = [...title.matchAll(/\(([^()]*)\)/g)];
  if (!song_title && parenMatches.length > 0) {
    const last = parenMatches[parenMatches.length - 1];
    const value = normalizeSpaces(last[1]);
    const isClassQualifier =
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|senior solo)\b/i.test(value);

    if (!isClassQualifier) {
      song_title = value;
      title = normalizeSpaces(`${title.slice(0, last.index)}${title.slice(last.index + last[0].length)}`);
    }
  }

  title = normalizeSpaces(title.replace(/\s*[-–—]\s*$/, ""));
  return { title, song_title };
}

function getCategory(title) {
  if (/finale/i.test(title)) return "finale";
  if (/filler/i.test(title)) return "filler";
  if (/dudes dance|daddy daughter/i.test(title)) return "featured";
  return "dance";
}

function looksLikeDancerNameList(line) {
  const clean = normalizeSpaces(stripMarkup(line));
  if (!clean || clean.length > 1500) return false;
  if (isBlockedNarrativeLine(clean) || isMarkerLine(clean) || isShowHeading(clean)) return false;
  if (/[?!:;]/.test(clean)) return false;
  if (/\b(class|faculty|exercise|coordination|development|programs|competitions|commercials)\b/i.test(clean)) {
    return false;
  }

  if (clean.includes(",")) return true;
  if (clean.includes(" & ")) {
    return /^[A-Z][A-Za-z.'’/-]+(?:\s+[A-Z][A-Za-z.'’/-]+)*(?:\s+&\s+[A-Z][A-Za-z.'’/-]+(?:\s+[A-Z][A-Za-z.'’/-]+)*)$/.test(
      clean,
    );
  }

  const words = clean.split(/\s+/);
  return words.length >= 2 && words.length <= 4 && /^[A-Z][A-Za-z.'’/-]+(?:\s+[A-Z][A-Za-z.'’/-]+){1,3}$/.test(clean);
}

function looksLikeStandaloneRoutineHeading(line, nextLine) {
  const clean = normalizeSpaces(stripMarkup(line));
  if (!clean || clean.length > 120) return false;
  if (isBlockedNarrativeLine(clean) || isMarkerLine(clean) || isShowHeading(clean)) return false;
  if (/[?!:.]$/.test(clean)) return false;
  if (!looksLikeDancerNameList(nextLine || "")) return false;
  return /[A-Za-z]/.test(clean);
}

function parseRoutineHeading(lines, index) {
  const sourceLine = lines[index].source_line;
  const line = normalizeSpaces(stripMarkup(lines[index].text));
  if (!line || isBlockedNarrativeLine(line) || isMarkerLine(line) || isShowHeading(line)) return null;

  const split = splitHeadingOnLastSeparator(line);
  if (split) {
    let instructor = split.right;
    let consumedLines = 0;

    if (!instructor) {
      const next = nextNonBlank(lines, index + 1);
      if (next && looksLikeInstructor(next.text)) {
        instructor = normalizeSpaces(stripMarkup(next.text));
        consumedLines = next.index - index;
      }
    }

    if (looksLikeInstructor(instructor)) {
      const { title, song_title } = extractSongAndTitle(split.left);
      return {
        heading: {
          raw_heading: line,
          title,
          song_title,
          instructor,
          category: getCategory(title),
          source_line: sourceLine,
        },
        consumedLines,
      };
    }
  }

  const next = nextNonBlank(lines, index + 1);
  if (looksLikeStandaloneRoutineHeading(line, next?.text)) {
    const { title, song_title } = extractSongAndTitle(line);
    return {
      heading: {
        raw_heading: line,
        title,
        song_title,
        instructor: null,
        category: getCategory(title),
        source_line: sourceLine,
      },
      consumedLines: 0,
    };
  }

  return null;
}

function nextNonBlank(lines, startIndex) {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (stripMarkup(lines[index].text)) return { index, text: lines[index].text };
  }
  return null;
}

function splitDancers(dancerLines) {
  const parts = dancerLines
    .join(", ")
    .split(",")
    .map((name) => normalizeSpaces(stripMarkup(name)).replace(/\.$/, ""))
    .filter(Boolean);

  return parts.flatMap((part) => {
    if (!part.includes(" & ")) return [part];
    const split = part.split(/\s+&\s+/).map((name) => normalizeSpaces(name));
    return split.every((name) => /^[A-Z][A-Za-z.'’/-]+(?:\s+[A-Z][A-Za-z.'’/-]+)*$/.test(name)) ? split : [part];
  });
}

function collectDancers(lines, startIndex) {
  const dancerLines = [];
  let index = startIndex;

  while (index < lines.length) {
    const clean = normalizeSpaces(stripMarkup(lines[index].text));
    if (!clean) break;
    if (isShowHeading(clean) || parseMarker(clean, lines[index].source_line)) break;
    if (parseRoutineHeading(lines, index)) break;
    if (!looksLikeDancerNameList(clean)) break;
    dancerLines.push(clean);
    index += 1;
  }

  return {
    dancers: splitDancers(dancerLines),
    nextIndex: index,
  };
}

function makeRoutineId(showNumber, order, title) {
  const slug = normalizeKey(title).replace(/\s+/g, "-");
  return `show-${showNumber}-${String(order).padStart(2, "0")}-${slug}`;
}

function parseText(sourceText) {
  const lines = sourceText.replace(/^\uFEFF/, "").split(/\r?\n/).map((text, index) => ({
    text,
    source_line: index + 1,
  }));

  const shows = [];
  let currentShow = null;

  for (let index = 0; index < lines.length; index += 1) {
    const clean = normalizeSpaces(stripMarkup(lines[index].text));
    const showHeading = parseShowHeading(clean);

    if (showHeading) {
      currentShow = {
        ...showHeading,
        items: [],
        routines: [],
      };
      shows.push(currentShow);
      continue;
    }

    if (!currentShow || !clean) continue;

    const marker = parseMarker(clean, lines[index].source_line);
    if (marker && marker.type === "intermission") {
      currentShow.items.push(marker);
      continue;
    }

    const parsed = parseRoutineHeading(lines, index);
    if (!parsed) continue;

    index += parsed.consumedLines;
    const order = currentShow.routines.length + 1;
    const { dancers, nextIndex } = collectDancers(lines, index + 1);
    const routine = {
      ...parsed.heading,
      show_number: currentShow.show_number,
      order,
      id: makeRoutineId(currentShow.show_number, order, parsed.heading.title),
      instructor: parsed.heading.instructor,
      instructors: parsed.heading.instructor
        ? parsed.heading.instructor.split(/\s*&\s*/).map((name) => normalizeSpaces(name))
        : [],
      dancers,
      dancer_count: dancers.length,
      match_key: normalizeKey(parsed.heading.title),
    };

    currentShow.routines.push(routine);
    currentShow.items.push({
      type: "routine",
      routine_id: routine.id,
      order: routine.order,
      title: routine.title,
      source_line: routine.source_line,
    });

    index = Math.max(index, nextIndex - 1);
  }

  return shows.map((show) => ({
    ...show,
    routine_count: show.routines.length,
    item_count: show.items.length,
  }));
}

async function main() {
  const response = await fetch(EXPORT_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch Google Doc export: ${response.status} ${response.statusText}`);
  }

  const sourceText = await response.text();
  const shows = parseText(sourceText);
  const dancers = [...new Set(shows.flatMap((show) => show.routines.flatMap((routine) => routine.dancers)))].sort(
    (a, b) => a.localeCompare(b),
  );

  const output = {
    source: "google_doc_recital_show_order_notes",
    source_url: SOURCE_URL,
    export_url: EXPORT_URL,
    document_id: DOCUMENT_ID,
    document_title: DOCUMENT_TITLE,
    pulled_at: new Date().toISOString(),
    source_text_sha256: createHash("sha256").update(sourceText).digest("hex"),
    schema_version: 2,
    notes: [
      "Routine order is derived from the Google Doc sequence.",
      "Production scripts, voiceovers, lighting cues, slideshow copy, and ballet intensive promo copy are excluded from routines.",
      "Song titles are extracted from final parentheticals or quoted title fragments when they are not class-day qualifiers.",
    ],
    stats: {
      show_count: shows.length,
      routine_count: shows.reduce((total, show) => total + show.routine_count, 0),
      dancer_name_count: dancers.length,
      routines_with_dancers: shows.reduce(
        (total, show) => total + show.routines.filter((routine) => routine.dancer_count > 0).length,
        0,
      ),
      routines_without_dancers: shows.reduce(
        (total, show) => total + show.routines.filter((routine) => routine.dancer_count === 0).length,
        0,
      ),
    },
    shows,
    dancers,
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        outputPath: OUTPUT_PATH,
        stats: output.stats,
        perShow: shows.map((show) => ({
          show_number: show.show_number,
          label: show.label,
          routine_count: show.routine_count,
          item_count: show.item_count,
        })),
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

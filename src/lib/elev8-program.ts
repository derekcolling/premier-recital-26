import { readFile } from "node:fs/promises";
import path from "node:path";

export type ProgramItemType = "dance" | "filler" | "featured" | "finale" | "intermission" | "marker";

export type Elev8ProgramItem = {
  id: string;
  type: ProgramItemType;
  position: number;
  order: number | null;
  title: string;
  songTitle: string | null;
  teacher: string | null;
  teachers: string[];
  dancers: string[];
  programNote: string | null;
  stageNote: string | null;
  trackable: boolean;
  sourceLine: number | null;
  durationMinutes?: number | null;
};

export type Elev8ProgramShow = {
  id: string;
  showNumber: number;
  label: string;
  day: string;
  date: string;
  startTime: string;
  title: string;
  items: Elev8ProgramItem[];
  itemCount: number;
  danceCount: number;
  trackableCount: number;
};

export type Elev8ProgramData = {
  schemaVersion: number;
  generatedAt: string;
  source: {
    documentId: string;
    documentTitle: string;
    documentUrl: string;
    exportUrl: string;
    pulledAt: string;
    sourceTextSha256: string;
  };
  event: {
    title: string;
    dateRange: string;
    venue: {
      name: string;
      address: string;
      mapsUrl: string;
    };
    photographyRule: string;
    cellPhoneRule: string;
    intermissionNote: string;
    helpNotes: string[];
  };
  shows: Elev8ProgramShow[];
};

export type Elev8ProgramWarning = {
  code:
    | "missing_teacher"
    | "empty_dancers"
    | "duplicate_id"
    | "duplicate_order"
    | "trackable_non_dance";
  message: string;
  showNumber?: number;
  itemId?: string;
};

const PROGRAM_PATH = path.join(process.cwd(), "data", "elev8-program.json");
let lastWarningSignature = "";

export function validateElev8ProgramData(program: Elev8ProgramData): Elev8ProgramWarning[] {
  const warnings: Elev8ProgramWarning[] = [];
  const seenIds = new Map<string, string>();

  for (const show of program.shows) {
    const orderOwners = new Map<number, string>();

    for (const item of show.items) {
      const itemLabel = `Show ${show.showNumber} item ${item.id} (${item.title})`;
      const previousIdOwner = seenIds.get(item.id);

      if (previousIdOwner) {
        warnings.push({
          code: "duplicate_id",
          message: `[elev8-program] Duplicate item id "${item.id}" found in ${previousIdOwner} and Show ${show.showNumber}.`,
          showNumber: show.showNumber,
          itemId: item.id,
        });
      } else {
        seenIds.set(item.id, `Show ${show.showNumber}`);
      }

      if (typeof item.order === "number") {
        const previousOrderOwner = orderOwners.get(item.order);

        if (previousOrderOwner) {
          warnings.push({
            code: "duplicate_order",
            message: `[elev8-program] Duplicate order ${item.order} in Show ${show.showNumber}: ${previousOrderOwner} and ${item.id}.`,
            showNumber: show.showNumber,
            itemId: item.id,
          });
        } else {
          orderOwners.set(item.order, item.id);
        }
      }

      if (item.type === "dance" && !item.teacher) {
        warnings.push({
          code: "missing_teacher",
          message: `[elev8-program] Missing teacher for ${itemLabel}.`,
          showNumber: show.showNumber,
          itemId: item.id,
        });
      }

      if (item.type === "dance" && item.dancers.length === 0) {
        warnings.push({
          code: "empty_dancers",
          message: `[elev8-program] Empty dancer roster for ${itemLabel}.`,
          showNumber: show.showNumber,
          itemId: item.id,
        });
      }

      if (item.trackable && item.type !== "dance") {
        warnings.push({
          code: "trackable_non_dance",
          message: `[elev8-program] Non-dance item is marked trackable: ${itemLabel}.`,
          showNumber: show.showNumber,
          itemId: item.id,
        });
      }
    }
  }

  return warnings;
}

export function logElev8ProgramWarnings(warnings: Elev8ProgramWarning[]) {
  if (warnings.length === 0) return;

  const signature = warnings.map((warning) => warning.message).join("\n");
  if (signature === lastWarningSignature) return;

  lastWarningSignature = signature;
  console.warn(warnings.map((warning) => warning.message).join("\n"));
}

export async function getElev8ProgramData(): Promise<Elev8ProgramData> {
  const jsonText = await readFile(PROGRAM_PATH, "utf8");
  const program = JSON.parse(jsonText) as Elev8ProgramData;
  logElev8ProgramWarnings(validateElev8ProgramData(program));
  return program;
}

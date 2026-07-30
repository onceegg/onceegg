import fs from "node:fs";
import path from "node:path";

const noteKinds = [
  "note",
  "idea",
  "product",
  "experiment",
  "artwork",
] as const;

export type NoteKind = (typeof noteKinds)[number];

export type NoteSummary = {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  lang: string;
  kind: NoteKind;
};

export type Note = NoteSummary & {
  body: string;
};

const notesDirectory = path.join(process.cwd(), "content", "notes");

function isNoteKind(value: string): value is NoteKind {
  return noteKinds.some((kind) => kind === value);
}

function readFrontmatter(fileName: string, source: string): Note {
  const match = source.match(
    /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/,
  );

  if (!match) {
    throw new Error(`${fileName} is missing valid frontmatter.`);
  }

  const values = new Map<string, string>();

  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");

    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    const value = rawValue.replace(/^(['"])(.*)\1$/, "$2");

    values.set(key, value);
  }

  const slug = fileName.replace(/\.md$/, "");
  const title = values.get("title");
  const date = values.get("date");
  const kind = values.get("kind")?.toLowerCase() ?? "note";
  const body = match[2].trim();

  if (!title || !date) {
    throw new Error(`${fileName} needs both a title and a date.`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`${fileName} must use a YYYY-MM-DD date.`);
  }

  if (!isNoteKind(kind)) {
    throw new Error(
      `${fileName} has an unsupported kind. Use note, idea, product, experiment, or artwork.`,
    );
  }

  const excerpt =
    values.get("excerpt") ??
    body
      .split(/\r?\n\r?\n/, 1)[0]
      .replace(/^#{1,3}\s+/, "")
      .replace(/^>\s?/gm, "")
      .trim();

  return {
    slug,
    title,
    date,
    excerpt,
    lang: values.get("lang") ?? "en",
    kind,
    body,
  };
}

export function getAllNotes(): Note[] {
  if (!fs.existsSync(notesDirectory)) {
    return [];
  }

  return fs
    .readdirSync(notesDirectory)
    .filter((fileName) => fileName.endsWith(".md"))
    .map((fileName) =>
      readFrontmatter(
        fileName,
        fs.readFileSync(path.join(notesDirectory, fileName), "utf8"),
      ),
    )
    .sort((first, second) => second.date.localeCompare(first.date));
}

export function getNote(slug: string): Note | undefined {
  return getAllNotes().find((note) => note.slug === slug);
}

export function formatNoteDate(date: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

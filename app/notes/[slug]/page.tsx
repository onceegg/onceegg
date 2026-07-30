import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { JournalWordmark } from "@/components/journal-wordmark";
import { NoteContent } from "@/components/note-content";
import { formatNoteDate, getAllNotes, getNote } from "@/lib/notes";

type NotePageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllNotes().map((note) => ({ slug: note.slug }));
}

export async function generateMetadata({
  params,
}: NotePageProps): Promise<Metadata> {
  const { slug } = await params;
  const note = getNote(slug);

  if (!note) {
    return {};
  }

  return {
    title: `${note.title || formatNoteDate(note.date)} — OnceEgg`,
    description: note.excerpt || "A note from OnceEgg.",
  };
}

export default async function NotePage({ params }: NotePageProps) {
  const { slug } = await params;
  const note = getNote(slug);

  if (!note) {
    notFound();
  }

  return (
    <main className="journalPage notePage">
      <header className="notePageHeader">
        <JournalWordmark />
        <Link
          aria-label="Back to all notes"
          className="backLink"
          href="/notes"
        >
          ← Back
        </Link>
      </header>

      <article className="noteArticle" lang={note.lang}>
        <header
          className={`noteArticleHeader${note.title ? "" : " isUntitled"}`}
        >
          <time dateTime={note.date}>{formatNoteDate(note.date)}</time>
          {note.title && <h1>{note.title}</h1>}
        </header>
        {note.body && <NoteContent body={note.body} />}
      </article>

      <footer className="notePageFooter">
        <Link href="/notes">Return to all notes</Link>
      </footer>
    </main>
  );
}

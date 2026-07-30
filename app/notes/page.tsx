import type { Metadata } from "next";

import { JournalWordmark } from "@/components/journal-wordmark";
import { NoteSlip } from "@/components/note-slip";
import { getAllNotes } from "@/lib/notes";

export const metadata: Metadata = {
  title: "Notes — OnceEgg",
  description: "Public notes from OnceEgg, written as they happen.",
};

export default function NotesPage() {
  const notes = getAllNotes();

  return (
    <main className="journalPage">
      <header className="journalHeader">
        <JournalWordmark />
        <div className="journalIntroduction">
          <h1>Notes</h1>
          <p>Written as they happen.</p>
        </div>
      </header>

      <section className="notesArchive" aria-label="All notes">
        {notes.length > 0 ? (
          <div className="notesArchiveGrid">
            {notes.map((note, index) => (
              <NoteSlip key={note.slug} note={note} position={index} />
            ))}
          </div>
        ) : (
          <p className="emptyNotes">The first note is still hatching.</p>
        )}
      </section>

      <footer className="journalFooter">Started in 2026.</footer>
    </main>
  );
}

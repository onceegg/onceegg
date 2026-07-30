import Link from "next/link";

import {
  formatNoteDate,
  type NoteKind,
  type NoteSummary,
} from "@/lib/notes";

type NoteSlipProps = {
  note: NoteSummary;
  position: number;
};

const noteKindLabels: Record<NoteKind, string> = {
  note: "Note",
  idea: "Idea",
  product: "Product",
  experiment: "Experiment",
  artwork: "Artwork",
};

export function NoteSlip({ note, position }: NoteSlipProps) {
  const isPlainNote = note.kind === "note" && !note.title;

  return (
    <article
      className="noteSlip"
      data-note-kind={note.kind}
      data-note-position={position % 4}
    >
      <Link className="noteSlipLink" href={`/notes/${note.slug}`}>
        <div className={`noteSlipMeta${isPlainNote ? " isPlainNote" : ""}`}>
          {!isPlainNote && (
            <span className="noteSlipKind">{noteKindLabels[note.kind]}</span>
          )}
          <time dateTime={note.date}>{formatNoteDate(note.date)}</time>
        </div>
        {note.title && (
          <h3 className="noteSlipTitle" lang={note.lang}>
            {note.title}
          </h3>
        )}
        {note.excerpt && (
          <p className="noteSlipExcerpt" lang={note.lang}>
            {note.excerpt}
          </p>
        )}
      </Link>
    </article>
  );
}

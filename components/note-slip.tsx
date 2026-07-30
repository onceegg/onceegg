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
  return (
    <article
      className="noteSlip"
      data-note-kind={note.kind}
      data-note-position={position % 4}
    >
      <Link className="noteSlipLink" href={`/notes/${note.slug}`}>
        <div className="noteSlipMeta">
          <span className="noteSlipKind">{noteKindLabels[note.kind]}</span>
          <time dateTime={note.date}>{formatNoteDate(note.date)}</time>
        </div>
        <h3 className="noteSlipTitle" lang={note.lang}>
          {note.title}
        </h3>
        {note.excerpt && (
          <p className="noteSlipExcerpt" lang={note.lang}>
            {note.excerpt}
          </p>
        )}
      </Link>
    </article>
  );
}

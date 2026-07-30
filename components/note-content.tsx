import type { ReactNode } from "react";

type NoteContentProps = {
  body: string;
};

type NoteBlock =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string }
  | { type: "list"; items: string[] }
  | { type: "rule" };

function parseBlocks(body: string): NoteBlock[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: NoteBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trimEnd();

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.trim() === "---") {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{2,3})\s+(.+)$/);

    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length as 2 | 3,
        text: heading[2],
      });
      index += 1;
      continue;
    }

    if (line.startsWith(">")) {
      const quote: string[] = [];

      while (index < lines.length && lines[index].trimStart().startsWith(">")) {
        quote.push(lines[index].trimStart().replace(/^>\s?/, ""));
        index += 1;
      }

      blocks.push({ type: "quote", text: quote.join("\n") });
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];

      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, ""));
        index += 1;
      }

      blocks.push({ type: "list", items });
      continue;
    }

    const paragraph = [line];
    index += 1;

    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{2,3})\s+/.test(lines[index]) &&
      !lines[index].trimStart().startsWith(">") &&
      !/^\s*[-*]\s+/.test(lines[index]) &&
      lines[index].trim() !== "---"
    ) {
      paragraph.push(lines[index].trimEnd());
      index += 1;
    }

    blocks.push({ type: "paragraph", text: paragraph.join("\n") });
  }

  return blocks;
}

function renderBlock(block: NoteBlock, index: number): ReactNode {
  if (block.type === "heading") {
    const Heading = block.level === 2 ? "h2" : "h3";
    return <Heading key={index}>{block.text}</Heading>;
  }

  if (block.type === "quote") {
    return <blockquote key={index}>{block.text}</blockquote>;
  }

  if (block.type === "list") {
    return (
      <ul key={index}>
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }

  if (block.type === "rule") {
    return <hr key={index} />;
  }

  return <p key={index}>{block.text}</p>;
}

export function NoteContent({ body }: NoteContentProps) {
  return <div className="noteBody">{parseBlocks(body).map(renderBlock)}</div>;
}

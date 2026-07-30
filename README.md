# OnceEgg

Building things worth keeping.

---

Started on July 23, 2026.

OnceEgg is a place for ideas, products, experiments and artworks.

Some will become real.

Some will remain sketches.

Both matter.

## Local development

Use Node.js 20.9 or newer, then install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

Run the local quality checks with:

```bash
npm run lint
npm run build
```

## Writing a public note

Create a Markdown file in `content/notes`. Use the date and a short slug for the
filename:

```text
content/notes/2026-07-30-my-note.md
```

Start the file with:

```markdown
---
title: My note
date: 2026-07-30
excerpt: A short line shown on the note slip.
lang: en
---

Write the note here.
```

Use `lang: zh` for a Chinese entry. Notes are public once the repository is
deployed. The note body supports paragraphs, `##` and `###` headings,
blockquotes, unordered lists, and horizontal rules.

## Deploying to Vercel

Import this repository into Vercel and keep the automatically detected Next.js settings. No custom build command or configuration is required. A custom domain can be connected later after the site has been reviewed.

# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary author is the owner of OnceEgg, writing personal notes and diary
entries. Public visitors can read the entries as they are published.

## Product Purpose

OnceEgg is a public notebook for recording daily observations, unfinished ideas,
experiments, products, and artworks as they develop. Success means writing can
begin simply and the site can grow without first becoming a polished portfolio.

## Positioning

OnceEgg publishes the process while it is still hatching. Notes do not need to
become finished projects to deserve a place.

## Operating Context

Entries are written as files in the repository, reviewed locally, and published
with the website. The public site is for reading; authoring does not require an
in-browser editor. Jot is a separate private scratchpad at `/jot`: its notes are
stored only in the visitor's browser and are never published with the site.

## Capabilities and Constraints

- Entries are public by default once included in the deployed repository.
- Notes use a lightweight file-based format.
- The site remains deployable to Vercel without a database, authentication, or a
  custom build configuration.
- The existing interactive homepage remains part of the experience.
- Jot has no account or cross-device sync; it persists notes with versioned
  `localStorage` on the current browser and device.

## Brand Commitments

- The visible name is exactly “OnceEgg.”
- The voice is quiet, direct, unfinished, and free of marketing pressure.
- “Still hatching.” describes the current state.
- OnceEgg holds ideas, products, experiments, and artworks.

## Evidence on Hand

- Existing homepage implementation in `app/`.
- Browser-local Jot implementation in `app/jot/`.
- Existing design principles in `DESIGN.md`.
- No personal diary archive or visual assets have been supplied yet.

## Product Principles

1. Publishing should be simple enough that writing remains the main activity.
2. Unfinished thoughts are valid content.
3. Reading should feel calm and unhurried.
4. The structure should make room for future kinds of work without demanding
   them now.

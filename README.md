# Özgü Invest — Listing and Visual Production App

A Windows desktop application for a real estate office. It keeps the office's property listings
in one place and produces the marketing images they post on social media, so nobody has to open
a design tool for every new property.

> **Status: in development.** The application has not been delivered yet.

## What it does

**Listings** — property records (photos, price, rooms, area, features) are stored in a local
database on the office computer. No server and no monthly fee.

**Listing visuals** — a listing is turned into a ready-to-post image from a template. There are
12 listing templates for different shapes: square, portrait, landscape, 3:4 and story formats,
each as a hero version and a collage / grid version.

**Occasion posts** — 17 templates for the Turkish holidays an office posts about every year:
23 Nisan, 19 Mayıs, 30 Ağustos, 29 Ekim, 10 Kasım, Çanakkale, 1 Mayıs, Kadınlar Günü, Anneler
Günü, Babalar Günü, Öğretmenler Günü, Çocuk Hakları, Sevgililer Günü, Yılbaşı, Kandil, Ramazan
Bayramı and Kurban Bayramı. The office fills in its logo and phone number and the post is ready.

**Studio** — the template is filled with the listing data and rendered to an image inside the
app, then previewed before it is saved.

## Structure

```
resources/app/src/
├── main/        Electron main process: window, database, file manager,
│                image generation
├── renderer/    the UI: listing form, listing panel, template panel,
│                occasion panel, studio, preview and settings modals
└── templates/   listings/  12 listing layouts
                 occasions/ 17 holiday layouts
                 shared/    common template CSS
```

Templates are plain HTML and CSS files. Adding a new design means adding one HTML file — no
JavaScript changes.

About 13,000 lines.

## Built with

Electron · JavaScript · HTML and CSS templates · html2canvas for rendering · SQLite (sql.js)
for the local database

## Note

This was built for one office's way of working, not as a general product.

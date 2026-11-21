# Darts Bot

Mobile-first darts scoring, bot opponents, training and performance tracking.

## Current build

- Initial responsive website shell and dark/gold visual system
- Dashboard and primary navigation
- Pre-match opponent selection: Standard Bot or My AI Opponent
- Standard bot level bands and starting checkout percentages
- Match setup for 301/501 and best-of formats
- Initial scoring engine and automated tests

## Local development

```bash
npm install
npm run dev
```

## Tests

```bash
npm test
```

## Cloudflare Pages

- Framework preset: Vite
- Build command: `npm run build`
- Build output directory: `dist`

The current UI includes a match setup/preview. Live match turns, persistent storage, and the production bot behaviour are still in development.


This starter is packaged with root-level source files to make uploading from a phone easier.


## Static deployment build

This project uses plain HTML, CSS and JavaScript. It does not require Vite, React, Rollup or any third-party build dependencies.

Cloudflare Pages settings:
- Framework preset: None
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: blank

The `build.mjs` script copies the static site files into `dist` using Node.js built-in filesystem functions.


## Cloudflare static deployment
Framework preset: None
Build command: `npm run build`
Build output directory: `dist`
Root directory: blank

The stylesheet is linked from `index.html` and the site uses native browser ES modules. The build script uses Node built-ins only; no Vite/Rollup dependency is required.

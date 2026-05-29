# Premier Recital

Isolated ELEV8 recital program app for Premier Dance.

## Routes

- `/` redirects to `/recital`
- `/recital` contains the family-facing program and dance tracker

## Data sources

- `data/elev8-program.json` is the app source of truth
- `data/source-links/recital/recital-show-details-2026.json` is the parsed Google Doc source snapshot
- `data/source-links/recital/lovable-recital-2026.json` is retained historical source data

## Data refresh

```bash
npm run data:recital-doc
```

## Dev

```bash
npm run dev
```

## Build

```bash
npm run build
```

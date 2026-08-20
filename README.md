# Changing-World Campus Agent

An interactive UTMIST workshop demonstration that turns frontier research gaps into a staged experiment. The agent observes a campus walk, writes spatial memories, plans from recalled evidence, encounters a contradictory observation, and chooses an active-perception action before revealing six potential investigator projects.

## Run locally

Requires Node.js 22.13 or later.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Use the on-screen controls, the right-arrow key to advance, or `R` to reset.

## Validate

```bash
npm test
```

The experience is self-contained and uses scripted observations, so it remains reliable for a live workshop without cameras, model credentials, or network access.

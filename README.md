# C.O.R.T.A.N.A — GitHub Pages Display Deck

Live at **https://thomasg42.github.io/jarvis/**.

This static deployment preserves the full Halo green/gold interface and boots directly
into **GALAXY**. The **CORE / GALAXY** toggle, Vault drawer, SYS panel, Priority Ops,
daytime rail, voice controls, and model/effort switchboard remain visible and usable.

Because GitHub Pages cannot run `server.js`, this build ships a sanitized, read-only
Galaxy snapshot containing only public-safe `wiki/builds/` and `wiki/learning/` notes.
Display-deck captures stay in that browser. Full models, tools, the complete private
vault, and permanent memory remain available only from the local core at
`http://localhost:3000`.

Source of truth: `/Users/tg2.0/Documents/FGA-Brain/jarvis-voice-ui/`.

## Deploy

1. Run `node build-static-graph.js` from the source directory while the local core is up.
2. Copy `index.html`, `galaxy.css`, `galaxy.js`, `chat.html`, and `graph-data.js` here.
3. Commit and push `main`.

Pre-Cortana backups remain as `*.bak-preCortana` in the source directory.

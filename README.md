# Zamunda BG — Stremio Addon

Stremio addon that searches the [zamunda.rip](https://zamunda.rip) archive (Zamunda + ArenaBG + Zelka, 450K+ torrents) for movies and series.

## Features

- **P2P mode** (free) — direct torrent streaming, no account needed
- **Real-Debrid mode** (premium) — instant playback, zero buffering, only shows cached torrents
- **BG Audio filter** — find Bulgarian audio dubs and dual audio releases
- **Quality filter** — 4K, 1080p, 720p, SD
- **Config page** in Bulgarian and English

## Install

Visit the config page, choose your settings, and click "Install in Stremio":

**https://your-deployment-url.onrender.com**

## Self-host

```bash
git clone https://github.com/tzpopov-cc/zamunda-stremio.git
cd zamunda-stremio
npm install
node server.js
```

Open `http://localhost:7000/` to configure and install.

## Environment

- `PORT` — server port (default: 7000)

## How it works

1. Stremio sends an IMDB ID when you open a movie/series
2. Addon fetches the title from Cinemeta, searches zamunda.rip API
3. **P2P mode**: returns torrent info hashes — Stremio streams P2P
4. **RD mode**: checks Real-Debrid cache, resolves cached torrents to HTTP streams — instant playback

## License

MIT

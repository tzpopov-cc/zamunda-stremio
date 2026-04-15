# Zamunda BG — Stremio Addon

Stremio addon that searches the [zamunda.rip](https://zamunda.rip) archive (Zamunda + ArenaBG + Zelka, 450K+ torrents) for movies and series.

Stremio addon, който търси в [zamunda.rip](https://zamunda.rip) архива (Zamunda + ArenaBG + Zelka, 450K+ торенти) за филми и сериали.

## Features / Функции

- **P2P mode** (free) — direct torrent streaming, no account needed
- **Real-Debrid mode** (premium) — instant playback, zero buffering, only shows cached torrents
- **BG Audio filter** — find Bulgarian audio dubs and dual audio releases
- **Quality filter** — 4K, 1080p, 720p, SD
- **Config page** in Bulgarian and English

---

- **P2P режим** (безплатно) — директен torrent streaming, не изисква акаунт
- **Real-Debrid режим** (премиум) — моментално пускане без буфериране, показва само кеширани торенти
- **БГ Аудио филтър** — намира български дублаж и dual audio версии
- **Филтър за качество** — 4K, 1080p, 720p, SD
- **Конфигурация** на български и английски

## Install / Инсталиране

Visit the config page, choose your settings, and click "Install in Stremio":

Отвори страницата за конфигурация, избери настройки и натисни "Инсталирай в Stremio":

**https://zamunda-stremio-qd0j.onrender.com**

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

## How it works / Как работи

1. Stremio sends an IMDB ID when you open a movie/series
2. Addon fetches the title from Cinemeta, searches zamunda.rip API
3. **P2P mode**: returns torrent info hashes — Stremio streams P2P
4. **RD mode**: checks Real-Debrid cache, resolves cached torrents to HTTP streams — instant playback

---

1. Stremio изпраща IMDB ID когато отвориш филм/сериал
2. Addon-ът взима заглавието от Cinemeta и търси в zamunda.rip API
3. **P2P режим**: връща info hash-ове — Stremio стриймва директно P2P
4. **RD режим**: проверява кеша на Real-Debrid, resolve-ва кеширани торенти до HTTP stream — моментално пускане

## License

MIT

# Zamunda BG — Stremio Addon

Stremio addon that searches the [zamunda.rip](https://zamunda.rip) archive (Zamunda + ArenaBG + Zelka, 450K+ torrents) for movies and series.

Stremio addon, който търси в [zamunda.rip](https://zamunda.rip) архива (Zamunda + ArenaBG + Zelka, 450K+ торенти) за филми и сериали.

## Install / Инсталиране

**https://zamunda-stremio.tzkppv.com**

Visit the config page, choose your settings, and click "Install in Stremio".

Отвори страницата за конфигурация, избери настройки и натисни "Инсталирай в Stremio".

## Features / Функции

- **P2P mode** (free) — direct torrent streaming, no account needed
- **Real-Debrid mode** (premium) — instant playback, zero buffering
- **TorBox mode** (premium) — instant playback, fast cache check (~2-3 sec)
- **BG Audio filter** — find Bulgarian audio dubs and dual audio releases
- **Quality filter** — 4K, 1080p, 720p, SD
- **Size limit** — cap file size per movie/series
- **Config page** in Bulgarian and English

---

- **P2P режим** (безплатно) — директен torrent streaming, не изисква акаунт
- **Real-Debrid режим** (премиум) — моментално пускане без буфериране
- **TorBox режим** (премиум) — моментално пускане, бърза проверка на кеш (~2-3 сек)
- **БГ Аудио филтър** — намира български дублаж и dual audio версии
- **Филтър за качество** — 4K, 1080p, 720p, SD
- **Лимит на размер** — максимален размер на файл
- **Конфигурация** на български и английски

## How it works / Как работи

1. Stremio sends an IMDB ID when you open a movie/series
2. Addon fetches the title from Cinemeta, searches zamunda.rip API
3. **P2P mode**: returns torrent info hashes — Stremio streams P2P
4. **RD/TorBox mode**: checks debrid cache, resolves cached torrents to HTTP streams — instant playback

---

1. Stremio изпраща IMDB ID когато отвориш филм/сериал
2. Addon-ът взима заглавието от Cinemeta и търси в zamunda.rip API
3. **P2P режим**: връща info hash-ове — Stremio стриймва директно P2P
4. **RD/TorBox режим**: проверява кеша на дебрид услугата, resolve-ва кеширани торенти до HTTP stream — моментално пускане

## Self-host

```bash
git clone https://github.com/tzpopov-cc/zamunda-stremio.git
cd zamunda-stremio
cp server-full.js server.js
npm install
node server.js
```

Open `http://localhost:7000/` to configure and install.

Environment variables:
- `PORT` — server port (default: 7000)
- `UPSTASH_REDIS_REST_URL` — Upstash Redis URL for persistent stats/logs (optional)
- `UPSTASH_REDIS_REST_TOKEN` — Upstash Redis token (optional)

## Support / Подкрепа

Zamunda BG runs on a dedicated paid server, maintained by one developer in their free time. If you find it useful — support the project from the install page.

Zamunda BG работи на собствен платен сървър и се поддържа от един разработчик в свободното му време. Ако ти харесва — подкрепи проекта от страницата за инсталиране.

## Disclaimer / Отговорност

This project is a search tool only. We do not host or distribute any content. Users are solely responsible for compliance with applicable laws.

Този проект е софтуерен инструмент за търсене. Не хостваме и не разпространяваме съдържание. Потребителите сами носят отговорност за спазването на приложимото законодателство.

## License

MIT

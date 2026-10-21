# Zamunda BG — Stremio Addon

Stremio addon that finds movies and series in the [zamunda.life](https://zamunda.life) archive — 448K torrents from
Zamunda, ArenaBG and Zelka.

Добавка за Stremio, която намира филми и сериали в архива [zamunda.life](https://zamunda.life) — 448 хиляди торента от
Zamunda, ArenaBG и Zelka.

> The archive gets no new torrents (its three source sites are gone), so titles released from 2026 on are missing —
> the addon says so instead of showing an empty list.
>
> Архивът не получава нови торенти (трите сайта, от които идва, вече ги няма), затова заглавията от 2026 г. насам
> липсват — добавката казва това, вместо да показва празен списък.

## Install / Инсталиране

**https://zamunda-stremio.tzkppv.com**

Open the page, choose your settings and press "Install in Stremio".

Отвори страницата, избери настройки и натисни „Инсталирай в Stremio“.

## Features / Функции

- **P2P** (free) — plays straight from the torrent, no account needed
- **Real-Debrid** and **TorBox** (premium) — cached releases start at once, without buffering; P2P can be listed
  under them as a backup
- **BG audio only**, **quality** (4K, 1080p, 720p, SD), **maximum size**, sorting by quality or size
- In a season pack the player gets the episode's own file (when the pack's file list is known), and the next
  episode plays from the same pack
- A row that says why when there is nothing to play (not in the archive, no such season, over your size limit…)
- Config page in Bulgarian and English

---

- **P2P** (безплатно) — пуска направо от торента, без профил
- **Real-Debrid** и **TorBox** (премиум) — кешираните торенти тръгват веднага, без буфериране; под тях може да има и
  P2P връзки като резерва
- **Само БГ аудио**, **качество** (4K, 1080p, 720p, SD), **максимален размер**, подреждане по качество или размер
- В пакет със сезон плейърът получава файла на самия епизод (когато списъкът с файловете е известен), а
  следващият епизод тръгва от същия пакет
- Ред, който казва защо, когато няма какво да се пусне (няма го в архива, няма такъв сезон, над ограничението ти…)
- Страница за настройки на български и английски

## How it works / Как работи

1. Stremio sends the IMDb id of the movie or episode you opened
2. The addon gets its name and year from Cinemeta and searches the archive
3. **P2P**: it returns the torrents (and the file of the episode in a pack) — Stremio plays them itself
4. **Real-Debrid / TorBox**: it checks which torrents your service already has and returns direct links to them

---

1. Stremio изпраща IMDb номера на филма или епизода, който си отворил
2. Добавката взима името и годината му от Cinemeta и търси в архива
3. **P2P**: връща торентите (и файла на епизода в пакета) — Stremio ги пуска сам
4. **Real-Debrid / TorBox**: проверява кои торенти услугата ти вече има и връща преки връзки към тях

## Self-host

```bash
git clone https://github.com/tzpopov-cc/zamunda-stremio.git
cd zamunda-stremio
npm install
cp config-page-v2.html config.html      # the server reads the page under this name
DATA_DIR=./data PORT=7001 node server-full.js
```

Open `http://localhost:7001/` to configure and install. (`server.js` in the repo is an old redirect stub — run
`server-full.js`.)

zamunda.life answers home connections but challenges most datacenter addresses, so a server usually reaches it
through a small proxy on an allowed host — `home-proxy/` is one.

Environment variables:
- `PORT` — server port (default 7000)
- `DATA_DIR` — where the stats, the search index and the magnet catalogue are kept (default `/app/data`)
- `ZAMUNDA_PROVIDERS` — comma-separated base URLs of the archive proxy, tried in order
- `PROXY_API_KEY` — the `X-Api-Key` the proxy expects. Set it only in the server's `.env`, never in the repo.
- `DASHBOARD_KEY` — key for `/dashboard` and the logs. Unset = locked. Set it only in the server's `.env`.
- `PUBLIC_URL` — the addon's public address (the notice rows link their short video to it)

## Support / Подкрепа

Zamunda BG runs on a dedicated paid server, maintained by one developer in their free time. If you find it useful — support the project from the install page.

Zamunda BG работи на собствен платен сървър и се поддържа от един разработчик в свободното му време. Ако ти харесва — подкрепи проекта от страницата за инсталиране.

## Disclaimer / Отговорност

This project is a search tool only. We do not host or distribute any content. Users are solely responsible for compliance with applicable laws.

Този проект е софтуерен инструмент за търсене. Не хостваме и не разпространяваме съдържание. Потребителите сами носят отговорност за спазването на приложимото законодателство.

## License

MIT

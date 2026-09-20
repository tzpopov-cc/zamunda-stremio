# Zamunda BG — Runbook

What to do when the addon is down. Written 2026-09-20, after the `.rip` → `.life` migration.

## The chain

```
Stremio client
  └─> https://zamunda-stremio.tzkppv.com        Hetzner 178.104.89.141, Docker + Caddy
        ├─ data/torrent-index.jsonl             local index — answers without the network
        ├─> http://10.8.0.1:7011               WireGuard tunnel (encrypted) — PRIMARY
        └─> http://zproxy.tzkppv.com:7011      public path, IP-pinned — AUTOMATIC FALLBACK
              (both reach the same proxy on Oracle Amsterdam, 150.230.21.90)
              └─> https://zamunda.life/api/torrents
```

**Every link can fail independently.** Work down the list below; each step tells you which link is broken.

`api-proxy.tzkppv.com` (the old Cloudflare Worker) is **no longer in the path** — see "Why Oracle".

## Is it actually down?

```bash
# 1. addon alive, and what it thinks of itself
curl -s https://zamunda-stremio.tzkppv.com/health
# {"ok":true,"version":"2.3.0","index":{"queries":N,"rows":M},"providers":1}

# 2. the end-to-end test — The Matrix
curl -s "https://zamunda-stremio.tzkppv.com/lang=bg/stream/movie/tt0133093.json" | head -c 300
```

- Several streams with titles → **working, stop here.**
- Exactly one stream named `⚠️ Zamunda BG` → upstream unreachable *and* nothing indexed for that title. Continue.
- Connection refused / 502 → the container is down. Jump to "Addon container".

## Diagnose down the chain

```bash
# A. can Hetzner reach the Oracle proxy? (tunnel first, then the public fallback)
ssh root@178.104.89.141 'wg show wg0 | grep -E "latest handshake|transfer"'
ssh root@178.104.89.141 'curl -sS -o /dev/null -w "wg:     %{http_code}\n" --max-time 12 http://10.8.0.1:7011/health'
ssh root@178.104.89.141 'curl -sS -o /dev/null -w "public: %{http_code}\n" --max-time 15 http://zproxy.tzkppv.com:7011/health'
#   wg 200            -> everything normal
#   wg 000/public 200 -> tunnel is down, the addon is silently using the fallback. Fix the tunnel.
#   both 000          -> proxy itself is down. Go to "Egress proxy".
#   200   -> proxy fine, problem is the addon. Go to "Addon container".
#   000   -> blocked or proxy down. Go to "Egress proxy".

# B. can the proxy reach zamunda.life? (unauthenticated, safe)
curl -s http://zproxy.tzkppv.com:7011/probe   # only from an allowed source IP
#   {"usable":true,...}   -> .life is fine
#   {"usable":false,"status":403,...} -> .life is challenging this host. Go to "Oracle IP changed".

# C. is .life up at all? (from your laptop, which is never blocked)
curl -sS -o /dev/null -w "%{http_code}\n" -H "User-Agent: Mozilla/5.0" \
  "https://zamunda.life/api/torrents?q=matrix&limit=3"
#   200 -> .life fine, the problem is ours
#   5xx -> .life itself is down; nothing to fix, the index covers indexed titles
```

## Recovery

### Egress proxy (Oracle)

```bash
ssh -i ~/Downloads/ssh-key-2026-09-20.key opc@150.230.21.90
sudo systemctl status zamunda-proxy
sudo journalctl -u zamunda-proxy -n 50 --no-pager
sudo systemctl restart zamunda-proxy
```

Layout: app `/opt/zamunda-proxy` (root-owned) · env `/etc/zamunda-proxy.env` (root:zproxy 0640) ·
unit `/etc/systemd/system/zamunda-proxy.service` · runs as **`zproxy`** (system account, no shell, no
home, no sudo) · port 7011. A pre-hardening copy of the unit is at `/root/zamunda-proxy.service.bak`.

The unit is sandboxed (`ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`, `NoNewPrivileges`, empty
`CapabilityBoundingSet`, `SystemCallFilter=@system-service`, …). If you add a feature that needs to
write to disk, it will fail until you add a `ReadWritePaths=` line — that is the sandbox doing its job,
not a bug. **Never add `MemoryDenyWriteExecute`** — it breaks the V8 JIT and Node will not start.

### Addon container (Hetzner)

```bash
ssh root@178.104.89.141
cd /opt/personal/sites/zamunda-stremio
docker compose ps
docker compose logs --tail=50
docker compose up -d --build     # rebuild; a restart is NOT enough after a file change
```

### Oracle IP changed

The addon points at **`zproxy.tzkppv.com`**, not at a bare IP, so an IP change is a **one-record DNS
edit** and needs no deploy, no restart and no code change:

> Cloudflare → tzkppv.com → DNS → Records → `zproxy` → Edit → new IPv4 → Save.

⚠️ **Keep it "DNS only" (grey cloud).** Proxied would break it twice over: Cloudflare does not proxy
port 7011 at all, and it would replace the source IP arriving at Oracle, which the NSG rule pins to
the Hetzner box.

**Why a DNS name and not a reserved IP:** the public IP is EPHEMERAL and *cannot* be made reserved on
this tenancy. Symptom if it ever changes: step A returns `000` and the Oracle console shows a
different public IP.

Converting to a reserved IP was attempted on 2026-09-20 and does not work here:
- Once an ephemeral IP is attached, the VNIC's Edit dialog offers only *No public IP* / *Ephemeral* —
  the *Reserved* option disappears. Oracle does not convert in place.
- The `⋮ → Reserve IPv4 address` menu item is a **trap**: it reserves the *private* IP (10.0.0.12), a
  different feature entirely. Read the dialog title before confirming.
- Assigning a secondary private IP with a reserved public IP fails with
  `API Error — Authorization failed or requested resource not found`, on a free tenancy.

So treat "the IP changed" as a known failure mode with a one-line fix, below. **Do not stop the
instance** unless you are ready to re-point the addon afterwards.

Only if you ever move off DNS, or want to point at a different host directly:

```bash
ssh root@178.104.89.141 \
  "cd /opt/personal/sites/zamunda-stremio && sed -i 's#^ZAMUNDA_PROVIDERS=.*#ZAMUNDA_PROVIDERS=http://<NEW_HOST>:7011#' .env && docker compose up -d --force-recreate"
```

An `env_file` change needs `--force-recreate`; a plain restart keeps the old environment.

Also update the NSG ingress rule if the **Hetzner** IP ever changes (it is pinned to `178.104.89.141/32`).

### Moving to a different proxy host entirely

`ZAMUNDA_PROVIDERS` is a comma-separated list tried in order. Adding a host is an env change and a
restart — never a code edit under pressure:

```
ZAMUNDA_PROVIDERS=http://newhost:7011,http://150.230.21.90:7011
```

To find a host that works at all, deploy `home-proxy/` there and read `/probe`. Known results:
**Oracle Cloud (Amsterdam) 200** · Render (Frankfurt) 403 · Hetzner 403 · Cloudflare Workers 403.

### WireGuard tunnel

Hetzner `10.8.0.2` <-> Oracle `10.8.0.1`, Oracle listening on UDP 51820, endpoint set by DNS name so
an IP change does not break it. Keys in `/etc/wireguard/` on each box; **private keys never left their
host** and the public keys are in each other's `wg0.conf`.

```bash
ssh root@178.104.89.141 'systemctl restart wg-quick@wg0; sleep 3; wg show wg0'
ssh -i ~/Downloads/ssh-key-2026-09-20.key opc@150.230.21.90 'sudo systemctl restart wg-quick@wg0; sudo wg show wg0'
```

`latest handshake` should be under ~2 minutes old. `transfer: 0 B received` with a non-zero sent count
means packets are leaving Hetzner and nothing is coming back — almost always the Oracle NSG missing its
**UDP 51820** ingress rule from `178.104.89.141/32` (firewalld needs the same rule, separately).

**The tunnel is not a single point of failure.** `ZAMUNDA_PROVIDERS` lists the tunnel first and the
public path second, so if WireGuard drops the addon falls back automatically on the next search. That
is why the public TCP 7011 rule is deliberately kept — it is the break-glass path, not an oversight.

### Seeder counts (v2.4.0)

`.life` returns no swarm data, so counts come from a UDP tracker scrape (BEP 15) against
`tracker.opentrackr.org:1337` — the single tracker embedded in the magnets. One connect + one scrape,
whole list in one packet (70 hashes max), 3s timeout, cached 10 minutes, shown as `👥 N` on P2P rows only.

**Failure is silent by design.** If the tracker is slow, rate-limiting or down, rows simply carry no
count — it must never cost a user their stream list. So "the seeders disappeared" is a tracker problem,
not an addon bug. Counts reflect only peers that announced to *that* tracker; DHT-only peers are invisible,
so a low number is a floor, not a ceiling.

## Security posture (Oracle box)

- **Traffic is encrypted.** The addon talks to the proxy over WireGuard; the plaintext public path
  remains only as an automatic fallback.
- **Nothing is open to the internet.** Both TCP 7011 and UDP 51820 are allowed only from
  `178.104.89.141/32`, enforced twice over: the cloud NSG, and `firewalld`.
- Requests still need the `X-Api-Key` header; the proxy refuses to start without a key set, rather than
  running open.
- Service runs as `zproxy` — system account, no shell, no home, not in any sudo group.
- SSH: `passwordauthentication no`, `kbdinteractiveauthentication no`, keys only.
- Automatic **security** updates via `dnf-automatic.timer` (`upgrade_type = security`, `apply_updates = yes`).
- Only ports 22 and 7011 listen at all.

**Closed 2026-09-20:** the hop used to be plain HTTP with the API key in cleartext. It now runs over
WireGuard. The fallback path is still plaintext, but it is only used when the tunnel is down, and it
remains pinned to one source IP and key-protected.

## Deploying a new version

Full procedure is in `CLAUDE.md` (local, gitignored). The parts that bite:

1. **Filenames change on deploy.** `server-full.js` → `server.js`, `config-page-v2.html` → `config.html`.
2. **Ship `package.json` AND `package-lock.json`** whenever a dependency changed. The image runs
   `npm ci --production`, which hard-fails on a lock that disagrees with the manifest.
3. **Rebuild, don't restart** — the Dockerfile `COPY`s the files into the image.
4. **Version lives in 6 strings** (4 in `server-full.js`, 2 in `config-page-v2.html`). A mismatch between
   `/health` and the page badge means a half-done bump.
5. Back up first: `cp -p server.js server.js.bak-<ver>-predeploy` (same for `config.html` and `.env`).
6. Verify `/health` matches what you shipped, and that `/stats` counters are **not** zeroed.

## Hard-won gotchas

- **SELinux is Enforcing on Oracle Linux 9.** systemd reads `EnvironmentFile` as root *before*
  dropping to the service user, and it cannot read `/home`. Symptom: `Failed to load environment
  files: Permission denied` and a crash loop. Keep the env file in `/etc` and the app in `/opt`.
- **Oracle has TWO firewalls.** The OS (`firewalld`) *and* the cloud NSG / security list. Opening one
  and not the other gives a silent timeout with no error anywhere.
- **Oracle Linux 9 ships Node 16**, which has no global `fetch()`. The proxy needs 18+:
  `sudo dnf -y module reset nodejs && sudo dnf -y module enable nodejs:20 && sudo dnf -y install nodejs`
- **`.life` blocks by IP reputation, not headers.** Bare curl, a browser UA and a full browser header
  set all get the same `cf-mitigated: challenge` 403 from a flagged host. Don't debug headers.
- **`.life` returns HTTP 500 for a query containing `:` `?` `,` `.` `!` or `%`** (verified 2026-09-20).
  Cinemeta supplies titles with exactly those characters, so every colon or full-stop title —
  "Daredevil: Born Again", "Mr. Robot", "Star Wars: The Mandalorian and Grogu" — failed with the
  outage notice while the archive had the episodes. `sanitizeQuery()` now spaces out anything outside
  letters, digits and the punctuation that tested safe (`& ' ( ) + # / -`). **Symptom to recognise:
  `[DOWN] … source unavailable` for some titles while others work fine in the same minute.** A real
  outage takes everything down at once; a per-title pattern means the query, not the source.
- **An episode range in its own brackets — `(01-24)`, `[01-24]` — needs its own pattern.** Every other
  range pattern requires the range preceded by `_ . -` or a space, or followed directly by `[` or `(`;
  the enclosing brackets defeat both, so a 24-episode batch matched nothing. Symptom:
  `[MISS] … N torrents but 0 episode matches` with a `[Batch]` release in the sample.
- **A 200 is not data.** During the August outage, `zelka.org` and `arenabg.com` returned HTTP 200
  serving a seizure page. Read the body.
- **Cache-bust before declaring a source alive.** `?q=Dune` served from Cloudflare's edge cache looked
  healthy while the origin was dead; `?q=Dune&cb=<random>` showed the truth.

## Why this shape

- **Why `.life`** — `zamunda.rip` has been CF 521 since 2026-08-25; `zelka.org` and `arenabg.com` serve
  a seizure page. `.life` is the only surviving index, and it serves a **frozen archive** of those dead
  sites. No new releases are arriving, which is why a local copy is worth so much.
- **Why not the Cloudflare Worker** — it worked for months against `.rip`, which had no bot protection.
  `.life` challenges datacenter ASNs, and Cloudflare's own egress is flagged. No header or code change
  in the Worker can fix that.
- **Why Oracle** — its ASN is not flagged. It was the first non-residential host to return 200.
- **Why the local index** — it makes any single upstream non-fatal. Every result set the addon has ever
  seen is kept in `data/torrent-index.jsonl` (bind-mounted, survives rebuilds), served directly when
  under 1h old and fallen back to at any age up to 90 days when every provider fails.

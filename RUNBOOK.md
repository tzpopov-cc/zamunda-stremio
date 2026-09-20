# Zamunda BG — Runbook

What to do when the addon is down. Written 2026-09-20, after the `.rip` → `.life` migration.

## The chain

```
Stremio client
  └─> https://zamunda-stremio.tzkppv.com        Hetzner 178.104.89.141, Docker + Caddy
        ├─ data/torrent-index.jsonl             local index — answers without the network
        └─> http://150.230.21.90:7011           Oracle Amsterdam, systemd (the egress proxy)
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
# A. can Hetzner reach the Oracle proxy?
ssh root@178.104.89.141 'curl -sS -o /dev/null -w "%{http_code}\n" --max-time 15 http://150.230.21.90:7011/health'
#   200   -> proxy fine, problem is the addon. Go to "Addon container".
#   000   -> blocked or proxy down. Go to "Egress proxy".

# B. can the proxy reach zamunda.life? (unauthenticated, safe)
curl -s http://150.230.21.90:7011/probe     # only from an allowed source IP
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

**The public IP is EPHEMERAL and cannot be made reserved on this tenancy.** Stop/start the instance
and it changes, and the addon silently breaks for everyone. Symptom: step A returns `000` and the
Oracle console shows a different public IP.

Converting to a reserved IP was attempted on 2026-09-20 and does not work here:
- Once an ephemeral IP is attached, the VNIC's Edit dialog offers only *No public IP* / *Ephemeral* —
  the *Reserved* option disappears. Oracle does not convert in place.
- The `⋮ → Reserve IPv4 address` menu item is a **trap**: it reserves the *private* IP (10.0.0.12), a
  different feature entirely. Read the dialog title before confirming.
- Assigning a secondary private IP with a reserved public IP fails with
  `API Error — Authorization failed or requested resource not found`, on a free tenancy.

So treat "the IP changed" as a known failure mode with a one-line fix, below. **Do not stop the
instance** unless you are ready to re-point the addon afterwards.

```bash
# read the new IP from the console, then:
ssh root@178.104.89.141 \
  "cd /opt/personal/sites/zamunda-stremio && sed -i 's#^ZAMUNDA_PROVIDERS=.*#ZAMUNDA_PROVIDERS=http://<NEW_IP>:7011#' .env && docker compose up -d"
```

Also update the NSG ingress rule if the **Hetzner** IP ever changes (it is pinned to `178.104.89.141/32`).

### Moving to a different proxy host entirely

`ZAMUNDA_PROVIDERS` is a comma-separated list tried in order. Adding a host is an env change and a
restart — never a code edit under pressure:

```
ZAMUNDA_PROVIDERS=http://newhost:7011,http://150.230.21.90:7011
```

To find a host that works at all, deploy `home-proxy/` there and read `/probe`. Known results:
**Oracle Cloud (Amsterdam) 200** · Render (Frankfurt) 403 · Hetzner 403 · Cloudflare Workers 403.

## Security posture (Oracle box)

- **Port 7011 is not open to the internet.** Two independent layers each allow only
  `178.104.89.141/32` (the Hetzner box): the cloud NSG ingress rule, and `firewalld`.
- Requests still need the `X-Api-Key` header; the proxy refuses to start without a key set, rather than
  running open.
- Service runs as `zproxy` — system account, no shell, no home, not in any sudo group.
- SSH: `passwordauthentication no`, `kbdinteractiveauthentication no`, keys only.
- Automatic **security** updates via `dnf-automatic.timer` (`upgrade_type = security`, `apply_updates = yes`).
- Only ports 22 and 7011 listen at all.

**Known gap:** the Hetzner → Oracle hop is plain HTTP over the public internet, so the API key travels
in cleartext. Acceptable given the key only authorises torrent *searches* and the path is pinned to one
source IP — but the clean fix is a DNS name on the Oracle box plus Caddy for automatic HTTPS (restrict
443 to the Hetzner IP in the NSG). That needs a DNS record, so it is a deliberate to-do, not an oversight.

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

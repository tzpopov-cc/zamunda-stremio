# Egress proxy + probe

`zamunda.life` serves a Cloudflare managed challenge (`cf-mitigated: challenge`) to datacenter IPs,
site-wide, keyed on IP reputation rather than headers. The Hetzner box and Cloudflare Workers are both
flagged; a residential line gets a clean 200. So the addon needs its upstream call to leave from a host
whose ASN is not flagged.

This is a drop-in for the `api-proxy.tzkppv.com` Worker — same `X-Api-Key` contract, same JSON out — so
switching is one URL in `server-full.js` (or just set `ZAMUNDA_PROVIDERS`).

## Testing a candidate host

Deploy this directory, then:

    curl -s https://<host>/probe

    {"usable":true,  "status":200, "rows":3, ...}   -> this host works, use it
    {"usable":false, "status":403, "rows":null,...} -> challenged here, try another

`/probe` needs no key on purpose: answering "can this host reach the upstream at all" is the whole
point of deploying it. It returns a status, never any data.

On a plain VPS you can skip the deploy entirely:

    curl -sS -o /dev/null -w "%{http_code}\n" --max-time 20 \
      -H 'User-Agent: Mozilla/5.0' "https://zamunda.life/api/torrents?q=matrix&limit=3"

## Running it for real

    PROXY_API_KEY=<same key the addon sends> node server.js

| env | default | meaning |
|---|---|---|
| `PROXY_API_KEY` | — | **required**; refuses to start unset rather than run open |
| `UPSTREAM` | `https://zamunda.life/api/torrents` | upstream endpoint |
| `PORT` | `7011` | listen port |
| `HOST` | `127.0.0.1` | **set `0.0.0.0` on any PaaS**, or the platform cannot route to it |
| `TIMEOUT_MS` | `20000` | upstream timeout |

Binds loopback by default, so a home box is not exposed by accident — expose it deliberately via
Cloudflare Tunnel or Tailscale. On Render/fly/Railway set `HOST=0.0.0.0` so the platform can route to it.
Wire it up with `ZAMUNDA_PROVIDERS=https://<host>` on the addon; no code change needed.

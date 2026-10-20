// =========================================================================
// Cloudflare Worker: feste Adresse wissenswerkstatt.<konto>.workers.dev für die
// Wissenswerkstatt (statt sichtbarer Weiterleitung über bildungstag.github.io/w).
//
// Jede Anfrage wird an den aktuellen Quick-Tunnel durchgereicht. Dessen Adresse
// steht in /target.js, das tunnel_manager.py bei jedem Tunnelwechsel in dieses
// Repo committet -> Cloudflare (Workers Builds) deployt automatisch neu (~1 Min.)
// und der Worker liest den neuen Wert aus seinen statischen Assets.
//
// GitHub Pages ignoriert worker.js/wrangler.jsonc; dort greift weiter
// index.html/404.html. Konfiguration: wrangler.jsonc, .assetsignore.
// =========================================================================

const TUNNEL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

// Kopfzeilen, die Cloudflare für die Weiterleitung selbst neu setzt.
const DROP_HEADERS = [
  "host", "cf-connecting-ip", "cf-ipcountry", "cf-ray", "cf-visitor",
  "x-forwarded-for", "x-forwarded-proto", "x-real-ip",
];

async function readTarget(request, env) {
  const res = await env.ASSETS.fetch(new URL("/target.js", request.url));
  if (!res.ok) return null;
  const m = (await res.text()).match(TUNNEL_RE);
  return m && m[0] !== "https://api.trycloudflare.com" ? m[0] : null;
}

function offline(request) {
  const wantsHtml = (request.headers.get("accept") || "").includes("text/html");
  if (!wantsHtml) {
    return new Response(
      JSON.stringify({ detail: "Die Wissenswerkstatt ist gerade nicht erreichbar. Bitte gleich erneut versuchen." }),
      { status: 503, headers: { "content-type": "application/json; charset=utf-8", "retry-after": "15" } },
    );
  }
  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="robots" content="noindex"/>
<meta http-equiv="refresh" content="15"/>
<title>Wissenswerkstatt</title>
<style>
  body { font-family: system-ui, sans-serif; display: flex; flex-direction: column;
         align-items: center; justify-content: center; min-height: 100vh; margin: 0;
         background: linear-gradient(135deg, #047857 0%, #059669 100%);
         color: #fff; text-align: center; padding: 20px; box-sizing: border-box; }
  h1 { font-size: 24pt; margin: 0 0 12px; }
  p { font-size: 13pt; opacity: .9; max-width: 480px; margin: 0 0 8px; }
</style></head><body>
<h1>🔬 Wissenswerkstatt</h1>
<p>Die Wissenswerkstatt ist gerade nicht erreichbar.</p>
<p>Die Seite versucht es in 15 Sekunden automatisch erneut.</p>
</body></html>`;
  return new Response(html, {
    status: 503,
    headers: { "content-type": "text/html; charset=utf-8", "retry-after": "15", "cache-control": "no-store" },
  });
}

async function handle(request, env) {
  const target = await readTarget(request, env);
  if (!target) return offline(request);

  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  for (const h of DROP_HEADERS) headers.delete(h);

  let res;
  try {
    res = await fetch(target + url.pathname + url.search, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      duplex: "half", // nötig zum Durchreichen eines Body-Streams
      redirect: "manual",
    });
  } catch {
    return offline(request); // Tunnel-Hostname existiert nicht (mehr)
  }

  // 530 = Tunnel getrennt (Cloudflare 1033), 502 = App hinter dem Tunnel antwortet nicht.
  if (res.status === 530 || res.status === 502) return offline(request);

  // Weiterleitungen der App auf die feste Adresse umschreiben.
  const loc = res.headers.get("location");
  if (loc && loc.startsWith(target)) {
    const out = new Response(res.body, res);
    out.headers.set("location", url.origin + loc.slice(target.length));
    return out;
  }
  return res;
}

export default { fetch: handle };

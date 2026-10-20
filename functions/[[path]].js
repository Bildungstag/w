// Cloudflare Pages: feste Adresse wissenswerkstatt.pages.dev. Gleiche Logik wie
// der Worker (worker.js) – jede Anfrage geht an den aktuellen Tunnel aus target.js.
// Pages baut bei jedem Push auf main neu, also auch nach jedem Tunnelwechsel.
import worker from "../worker.js";

export const onRequest = ({ request, env }) => worker.fetch(request, env);

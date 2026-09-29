/* ---------- Instellingen ---------- */
// 'gemini-flash-latest' is een vaste naam die altijd naar de werkende
// Flash-versie wijst. Concrete versienamen (gemini-2.0-flash) worden
// door Google na enige tijd verwijderd en geven dan een 404.
const MODEL = "gemini-flash-latest";
const GEMINI = m => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;
const MODEL_MAX = 100;
const CACHE_DAGEN = 180;
const LIMIET_PER_UUR = 12;

/* ---------- Hulp ---------- */
const corsKoppen = (request, env) => {
  const afkomst = request.headers.get("Origin") || "";
  const toegestaan = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const mag = toegestaan.length === 0 || toegestaan.includes(afkomst);
  const h = { "Content-Type": "application/json; charset=utf-8", Vary: "Origin" };
  if (mag && afkomst) {
    h["Access-Control-Allow-Origin"] = afkomst;
    h["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
};

const stuur = (body, status, headers) => new Response(JSON.stringify(body), { status, headers });

/* ---------- Snelheidsbegrenzing ---------- */
const klok = new Map();
function teSnel(ip) {
  const nu = Date.now();
  const raam = klok.get(ip) || [];
  const vers = raam.filter(t => nu - t < 3600000);
  if (vers.length >= LIMIET_PER_UUR) { klok.set(ip, vers); return true; }
  vers.push(nu);
  klok.set(ip, vers);
  if (klok.size > 5000) klok.clear();
  return false;
}

/* ---------- Prompt ---------- */
const magSoftware = a => a.apparaat === "tablet" && a.systeem === "Android";

function maakPrompt(a) {
  const toegestaan = magSoftware(a);
  const vraag = toegestaan
    ? "Zoek op het internet: welke software-updates kan dit apparaat nog krijgen? Wat is de nieuwste versie die de fabrikant nog vrijgeeft, en is er een nieuwere versie beschikbaar die niet meer officieel ondersteund wordt maar nog wel werkt op dit toestel?"
    : "Zoek op het internet wat dit apparaat is, wanneer het is uitgebracht en waarom het tegenwoordig traag is.";
  return `Een klant heeft een ${a.apparaat} met het besturingssysteem ${a.systeem}. Het typenummer is "${a.model}". Het apparaat is de laatste tijd traag.

${vraag}

${toegestaan
  ? "Voor dit apparaat mogen wij adviseren om nieuwere software te installeren. Kies dus \u201Csoftware\u201D als dat zinvol is, en \u201Cnieuw\u201D als het apparaat ook met nieuwe software te traag blijft."
  : "Voor dit apparaat adviseren wij GEEN software-update. Kies dus \u201Cnieuw\u201D wanneer het apparaat te oud is, en \u201Conbekend\u201D wanneer je het niet betrouwbaar kunt vaststellen. Kies nooit \u201Csoftware\u201D."}

Antwoord met JSON met deze velden:
- "naam": wat dit apparaat precies is, in gewone taal.
- "laatsteSoftware": de laatste versie die het nog krijgt, of "onbekend".
- "jaar": het jaar van uitbrengen, of "onbekend".
- "advies": "software", "nieuw" of "onbekend".
- "samenvatting": MAXIMAAL 2 korte zinnen, samen maximaal 30 woorden, in eenvoudig Nederlands.

De samenvatting wordt voorgelezen aan de telefoon. Schrijf dus complete, alledaagse zinnen. Geen vakwoorden, geen typenummers, geen leestekens zoals een streepje of puntkomma, geen opsommingen. Begin elke zin met een hoofdletter.`;
}

/* ---------- Gemini ---------- */
async function vraagGemini(env, a) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  try {
    const r = await fetch(GEMINI(MODEL), {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: maakPrompt(a) }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 600 }
      })
    });
    if (!r.ok) return null;
    const data = await r.json();
    const ruw = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
    const match = ruw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const reinigen = (v, max) => String(v == null ? "" : v).replace(/["\[\]{}]/g, "").trim().slice(0, max);
const isZin = v => /[.!?]$/.test(v);

/* ---------- Verzoek ---------- */
export default {
  async fetch(request, env) {
    const koppen = corsKoppen(request, env);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: koppen });
    if (request.method !== "POST") return stuur({ fout: "methode niet toegestaan" }, 405, koppen);

    const ip = request.headers.get("cf-connecting-ip") || "onbekend";
    if (teSnel(ip)) return stuur({ fout: "te veel aanvragen, probeer het later opnieuw" }, 429, koppen);

    let a = {};
    try { a = (await request.json())?.apparaat || {}; } catch { return stuur({ fout: "ongeldig verzoek" }, 400, koppen); }

    const model = String(a.model || "").trim().slice(0, MODEL_MAX);
    if (model.length < 3) return stuur({ fout: "modelnaam ontbreekt" }, 400, koppen);

    const sleutel = "v1:" + (a.apparaat || "") + ":" + (a.systeem || "") + ":" + model.toLowerCase().replace(/[^a-z0-9]+/g, "");

    if (env.CACHE) {
      const opgeslagen = await env.CACHE.get(sleutel, "json");
      if (opgeslagen) return stuur({ ...opgeslagen, uitCache: true }, 200, koppen);
    }

    const ruw = await vraagGemini(env, { apparaat: a.apparaat, systeem: a.systeem, model });

    let advies = "onbekend";
    if (ruw) advies = ["software", "nieuw", "onbekend"].includes(ruw.advies) ? ruw.advies : "onbekend";
    if (!magSoftware(a) && advies === "software") advies = "nieuw";

    let samenvatting = reinigen(ruw?.samenvatting, 220);
    if (!samenvatting) {
      samenvatting = advies === "software"
        ? "Er is een nieuwere versie van het systeem beschikbaar voor dit apparaat. Dat kan het merkbaar sneller maken."
        : advies === "nieuw"
        ? "Dit apparaat is te oud geworden om nog goed te werken. Een nieuw apparaat is de beste keuze."
        : "Wij kunnen dit apparaat niet betrouwbaar beoordelen. Leg uw situatie even aan ons telefonisch voor.";
    } else if (!isZin(samenvatting)) {
      samenvatting += ".";
    }

    const uitkomst = {
      naam: reinigen(ruw?.naam, 120) || model,
      laatsteSoftware: reinigen(ruw?.laatsteSoftware, 60) || "onbekend",
      jaar: reinigen(ruw?.jaar, 10) || "onbekend",
      advies,
      samenvatting,
      model
    };

    if (env.CACHE && ruw) await env.CACHE.put(sleutel, uitkomst, { expirationTtl: 86400 * CACHE_DAGEN });

    return stuur(uitkomst, 200, koppen);
  }
};

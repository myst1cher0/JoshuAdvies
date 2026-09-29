# De test laten zoeken

De website staat op GitHub Pages. Die kan alleen bestanden tonen, niet zelf op internet
zoeken. Daarom staat er een klein stukje code tussen: de **Worker**.

```
bezoeker  ->  quiz/index.html  ->  Worker  ->  Google (zoeken) + AI  ->  Worker  ->  bezoeker
                  (op GitHub)     (gratis)     (gratis)
```

De Worker doet drie dingen:

1. Houdt de geheime API-sleutel verborgen.
2. Zoekt het apparaat op en laat een korte Nederlandse samenvatting schrijven.
3. Bewaart het antwoord, zodat hetzelfde apparaat niet twee keer opgezocht hoeft te worden.

## Kosten

Nul. U betaalt niets en kunt niets verschuldigd raken.

- Google: 500 zoekopdrachten per dag gratis. Haalt u die, dan krijgt u een foutmelding,
  geen factuur. Er staat geen betaalkaart op, dus betalen is niet eens mogelijk.
- Cloudflare: 100.000 bezoeken per dag gratis.

500 per dag is ruim voldoende. Dat zijn ongeveer 20 tests per uur.

Elke test gebruikt één zoekopdracht, ook als een klant hetzelfde apparaat laat controleren
als iemand eerder. Bij 500 per dag zult u die grens voorlopig niet raken. Mocht er ooit
veel meer verkeer komen, dan staat in `wrangler.toml` klaar hoe u dat in dertig seconden
aanzet.

---

## Aan de slag

U hebt Node.js nodig. Download de versie met **LTS** van <https://nodejs.org>.

### 1. Een gratis Google-sleutel ophalen

1. Ga naar <https://aistudio.google.com/apikey> en log in met een Google-account.
2. Klik op **Create API key**. Kies een bestaand project of maak een nieuw project aan.
3. Kopieer de sleutel. Deze begint met `AIza`.

**Let op:** vul hier geen betaalkaart in. Het gratis niveau is geheel zonder kosten.

### 2. Een gratis Cloudflare-account maken

1. Maak een account op <https://dash.cloudflare.com>.
2. Kies bij het plan het vrije plan. U hoeft geen domein toe te voegen.

### 3. De Worker klaarmaken

Open een terminal in de map `worker` en voer uit:

```bash
npm install
npx wrangler login
```

`wrangler login` opent uw browser en vraagt om toestemming. Daarna bent u ingelogd.

Zet daarna in `wrangler.toml` uw eigen domein neer, zodat alleen uw site het endpoint
mag gebruiken:

```toml
ALLOWED_ORIGINS = "https://uwgebruikersnaam.github.io,https://joshuadvies.nl"
```

Weet u uw domein nog niet of staat de site op `*.github.io`, zet dan voorlopig alleen uw
eigen `*.github.io`-adres neer.

### 4. De sleutel veilig opslaan en publiceren

```bash
npx wrangler secret put GEMINI_KEY
```

Plak de `AIza...`-sleutel uit stap 1 en druk op Enter.

De sleutel wordt opgeslagen bij Cloudflare en staat **nergands in uw projectmap**. Daarom
kunt u dit gewoon op GitHub zetten. Commit de sleutel nooit: bij lokaal testen met
`npm run dev` bewaart Wrangler hem in een bestand `.dev.vars`, en dat bestand staat op de
verdwenen- lijst in `.gitignore`.

Daarna publiceren:

```bash
npm run deploy
```

U krijgt een adres te zien, bijvoorbeeld:

```
https://joshuadvies-api.uwnaam.workers.dev
```

Dat adres is uw endpoint.

### 5. Het adres in de test zetten

Open `quiz/index.html` en zet op regel 61 uw eigen adres neer:

```js
ZOEK_ENDPOINT: "https://joshuadvies-api.uwnaam.workers.dev",
```

Verandert er iets aan de test, dan moet u die map opnieuw naar GitHub Pages uploaden.

---

## Uitproberen

Zet in de map `worker` in de terminal `npm run dev` en open het adres dat verschijnt.
Of test gewoon op de echte site: vul "Samsung Galaxy Tab A7" in.

Verwachte uitkomst voor deze tablet:

> **Lees dit voor aan ons**
> Er is een nieuwere versie van het systeem beschikbaar voor dit apparaat. Dat kan het
> merkbaar sneller maken.

Onderaan staan de feiten: hoe het apparaat heet, wanneer het uitgebracht is, welke
software het nog krijgt, en ons advies. Die regels zijn vooral voor uzelf, voor het
gesprek aan de telefoon.

## Als er iets misgaat

| Wat u ziet | Wat het betekent |
|---|---|
| "Wij kijken dit voor u na" | Zoeken lukte niet. Geen probleem, de klant belt gewoon. |
| 429 in de console | Meer dan 12 tests per uur vanaf één adres. Even later werkt het weer. |
| "methode niet toegestaan" | De sleutel is niet toegevoegd. Herhaal stap 4. |
| "modelnaam ontbreekt" | Vreemd; controleer stap 5. |

## De dagelijkse limiet

Google staat 500 zoekopdrachten per dag gratis toe. Haalt u die, dan werkt de test die
dag niet meer voor nieuwe apparaten. Al opgeslagen antwoorden blijven wel werken.

Voor een drukke site is 500 per dag ruim genoeg. Ligt u er echt boven, dan is er nog
een gratis laag: de Worker kan apparaten die u vaak voorkomen uit een lijstje halen in
plaats van opzoeken. Vraag ernaar als het ooit nodig is.

## Wat de AI wel en niet mag zeggen

De regel "alleen Android-tablets krijgen een software-advies" staat **in de code van de
Worker**, niet in de opdracht aan de AI. Zelfs als de AI probeert voor een iPad te
antwoorden dat er een update mogelijk is, wordt dat overschreven.

Dat voorkomt dat u een klant iets vertelt dat niet kan, zoals Windows op een oude
laptop. De AI zoekt de feiten, u neemt de beslissing.

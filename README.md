# Uppsetning (Windows) — skref fyrir skref

Þetta forrit er REST webhook server sem tekur á móti webhooks frá SportFengur og birtir gögn á API endapunktum.

## 1) Stillingar
- Afrita `.env.example` → `.env`
- Fylla inn:
  - `EIDFAXI_USERNAME`
  - `EIDFAXI_PASSWORD`
  - `EVENT_ID` (leyfilegt `eventId`, t.d. `70617`)
  - `PORT` (sjálfgefið 3000)
  - (valfrjálst) `WEBHOOK_SECRET_REQUIRED=true` + `SPORTFENGUR_WEBHOOK_SECRET`

## 2) Keyra forritið
```bat
npm install
npm start
```

## 3) Heilsutékka
```text
http://localhost:3000/health
```

## 4) Swagger skjölun
```text
http://localhost:3000/docs
```

## 5) vMix API
- `GET /event/{eventId}/current` skilar leaderboard fyrir virka keppni ef eventId passar.
- `GET /event/{eventId}/{competitionType}` skilar leaderboard fyrir tiltekna keppni:
  - `competitionType`: `forkeppni`, `a-urslit`, `b-urslit`
  - `sort`: `start` (sjálfgefið) eða `rank`
- `GET /event/{eventId}/{competitionType}/csv` skilar sama leaderboard sem CSV:
  - `sort`: `start` (sjálfgefið) eða `rank`
- `GET /event/{eventId}/{competitionType}/results` skilar gangtegundum (adal + undirliðir) eins og áður:
  - `sort`: `rank` (sjálfgefið) eða `start`
- `GET /event/{eventId}/leaderboards.zip` skilar ZIP með mörgum CSV skrám:
  - `current-{eventId}.csv`
  - `{competitionType}-{eventId}-start.csv`
  - `{competitionType}-{eventId}-rank.csv`
- Dæmi:
  - `/event/70617/a-urslit`
  - `/event/70617/b-urslit?sort=rank`
  - `/event/70617/a-urslit/csv`
  - `/event/70617/a-urslit/csv?sort=rank`
  - `/event/70617/a-urslit/results`
  - `/event/70617/a-urslit/results?sort=start`
  - `/event/70617/leaderboards.zip`

## 6) Handvirk einkunnaköll (valfrjálst)
Skripturnar eru í `release\`:
```text
release\call_einkunn_forkeppni.bat
release\call_einkunn_a_urslit.bat
release\call_einkunn_b_urslit.bat
```
Athugið: Ef slóðin breytist, uppfærið URL inni í scriptinu (t.d. `https://api.your-domain.com/...`).

## Athugasemdir
- Loggar fara á stdout (keyrið í terminal eða setjið upp Scheduled Task sem skrifar logga í skrá).
- E1–E5 koma úr `einkunnir_domara` og E6 úr `keppandi_medaleinkunn`.
- Ef `EVENT_ID` er stillt, þá eru aðeins webhook events með þessu `eventId` unnin.

## Gangtegundir (mapping)
Eftirfarandi gangtegundir eru studdar og skrifast í viðeigandi dálka:
- `Tölt frjáls hraði` → `TFH` (E1_TFH … E5_TFH)
- `Hægt tölt` → `HT` (E1_HT … E5_HT)
- `Tölt með slakan taum` → `TST` (E1_TST … E5_TST)
- `Brokk` → `BR` (E1_BR … E5_BR)
- `Fet` → `FE` (E1_FE … E5_FE)
- `Stökk` → `ST` (E1_ST … E5_ST)
- `Greitt` → `GR` (E1_GR … E5_GR)

## Webhook slóðir
```text
https://api.your-domain.com/event_raslisti_birtur
https://api.your-domain.com/event_naesti_sprettur
https://api.your-domain.com/event_keppendalisti_breyta
https://api.your-domain.com/event_keppnisgreinar
https://api.your-domain.com/event_einkunn_saeti
```

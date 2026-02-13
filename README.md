# Uppsetning (Windows) — skref fyrir skref

Þetta forrit tekur á móti webhooks frá SportFengur, sækir nýjustu gögn og uppfærir CSV skrár á staðnum.

## 1) Stillingar
- Afrita `.env.example` → `.env`
- Fylla inn:
  - `EIDFAXI_USERNAME`
  - `EIDFAXI_PASSWORD`
  - `EXCEL_OUTPUT_PATH` (grunn slóð fyrir CSV, t.d. `./data/raslistar_live.csv`)
  - `PORT` (sjálfgefið 3000)
  - (valfrjálst) `WEBHOOK_SECRET_REQUIRED=true` + `SPORTFENGUR_WEBHOOK_SECRET`

## 2) Keyra forritið
### A) Með .exe (ráðlagt)
```bat
dist\sportfengur-webhooks.exe
```

### B) Með Node (ef þú ert með Node)
```bat
npm install
npm start
```

## 3) Ngrok (stöðug slóð, engin port forwarding)
Ngrok Hobbyist plan er nóg fyrir stöðuga slóð (ngrok-branded domain).

1) Setja upp ngrok og innskrá:
```bat
ngrok.exe config add-authtoken YOUR_AUTHTOKEN
```

2) Búa til ngrok-branded domain í dashboard (t.d. `yourname.ngrok.app`)

3) Ræsa tunnel með slóð:
```bat
ngrok.exe http --url=yourname.ngrok.app 3000
```

4) (Valfrjálst) Keyra ngrok sem Windows þjónustu eða í Startup.

## 4) Heilsutékka
```text
http://localhost:3000/health
```

## 5) Swagger skjölun
```text
http://localhost:3000/docs
```

## 6) wMix /current JSON
- `POST /current` setur inn nýjustu JSON gögn
- `GET /current` skilar síðustu JSON gögnunum

## 7) Auto-start (valfrjálst)
Búið til shortcut á `dist\sportfengur-webhooks.exe` og setjið í:
```text
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
```

## 8) Handvirk einkunnaköll (valfrjálst)
Skripturnar eru í `release\`:
```text
release\call_einkunn_forkeppni.bat
release\call_einkunn_a_urslit.bat
release\call_einkunn_b_urslit.bat
```
Athugið: Ef slóðin breytist, uppfærið URL inni í scriptinu (t.d. `http://eidfaxi.ngrok.app/...`).

## Athugasemdir
- Engin port forwarding þarf ef ngrok er notað.
- Loggar fara á stdout (keyrið í terminal eða setjið upp Scheduled Task sem skrifar logga í skrá).
- CSV skrif eru raðað og skrifuð atomískt til að minnka hættu á skemmdum.
- Hver "sheet" er skrifuð sem sér CSV skrá með suffix, t.d. `raslistar_live__Forkeppni.csv`.
- E1–E5 koma úr `einkunnir_domara` og E6 úr `keppandi_medaleinkunn`.

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
https://eidfaxi.ngrok.app/event_raslisti_birtur
https://eidfaxi.ngrok.app/event_naesti_sprettur
https://eidfaxi.ngrok.app/event_keppendalisti_breyta
https://eidfaxi.ngrok.app/event_keppnisgreinar
https://eidfaxi.ngrok.app/event_einkunn_saeti
```

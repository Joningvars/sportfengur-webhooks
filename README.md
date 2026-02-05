# Uppsetning (Windows)

Þetta forrit tekur á móti webhooks frá SportFengur, sækir nýjustu gögn og uppfærir `raslistar.xlsx` á staðnum.

## 1) Stillingar
- Afrita `.env.example` → `.env`
- Fylla inn:
  - `EIDFAXI_USERNAME`
  - `EIDFAXI_PASSWORD`
  - `EXCEL_PATH` (template/input, t.d. `./data/raslistar.xlsx`)
  - `EXCEL_OUTPUT_PATH` (live/output, t.d. `./data/raslistar_live.xlsx`)
  - `PORT` (sjálfgefið 3000)
  - (valfrjálst) `WEBHOOK_SECRET_REQUIRED=true` + `SPORTFENGUR_WEBHOOK_SECRET`

## 2) Keyra forritið
### A) Með Node
```bat
npm install
npm start
```

### B) Með .exe
```bat
npm install
npm run build:win
```
Keyrið síðan:
```bat
dist\sportfengur-webhooks.exe
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

## Athugasemdir
- Engin port forwarding þarf ef ngrok er notað.
- Loggar fara á stdout (keyrið í terminal eða setjið upp Scheduled Task sem skrifar logga í skrá).
- XLSX skrif eru raðað og skrifuð atomískt til að minnka hættu á skemmdum.
- `raslistar` er fyllt við `event_raslisti_birtur`, E1–E5 koma úr `einkunnir_domara` og E6 úr `keppandi_medaleinkunn`.

## Webhook slóðir
```text
https://eidfaxi.ngrok.app/event_raslisti_birtur
https://eidfaxi.ngrok.app/event_naesti_sprettur
https://eidfaxi.ngrok.app/event_keppendalisti_breyta
https://eidfaxi.ngrok.app/event_keppnisgreinar
https://eidfaxi.ngrok.app/event_einkunn_saeti
```

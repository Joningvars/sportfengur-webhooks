# Uppsetning (Windows)

Þetta forrit tekur á móti webhooks frá SportFengur, sækir nýjustu gögn og uppfærir `raslistar.xlsx` á staðnum.

## 1) Stillingar
- Afrita `.env.example` → `.env`
- Fylla inn:
  - `EIDFAXI_USERNAME`
  - `EIDFAXI_PASSWORD`
  - `EXCEL_PATH` (sjálfgefið `./raslistar.xlsx`)
  - `PORT` (sjálfgefið 3000)

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

2) Stöðug slóð (ngrok-branded domain):
```bat
ngrok.exe http --domain=yourname.ngrok.app 3000
```

3) (Valfrjálst) Keyra ngrok sem Windows þjónustu eða í Startup.

## 4) Heilsutékka
```text
http://localhost:3000/health
```

## 5) Auto-start (valfrjálst)
Búið til shortcut á `dist\sportfengur-webhooks.exe` og setjið í:
```text
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
```

## Athugasemdir
- Engin port forwarding þarf ef ngrok er notað.
- Loggar fara á stdout (keyrið í terminal eða setjið upp Scheduled Task sem skrifar logga í skrá).
- XLSX skrif eru raðað og skrifuð atomískt til að minnka hættu á skemmdum.

# Uppsetning (Windows)

Þetta forrit tekur á móti webhooks frá SportFengur, sækir nýjustu gögn og uppfærir `raslistar.xlsx` á staðnum.

## 1) Stillingar
- Afrita `.env.example` → `.env`
- Fylla inn:
  - `EIDFAXI_USERNAME`
  - `EIDFAXI_PASSWORD`
  - `EXCEL_PATH` (sjálfgefið `./raslistar.xlsx`)
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

## 3) Cloudflare Tunnel (stöðug slóð, engin port forwarding)
Setjið upp **cloudflared** á vélina og tengið við ykkar lén í Cloudflare.

1) Innskráning:
```bat
cloudflared.exe tunnel login
```

2) Búa til tunnel:
```bat
cloudflared.exe tunnel create sportfengur-webhooks
```

3) DNS leið (stöðug slóð):
```bat
cloudflared.exe tunnel route dns sportfengur-webhooks webhooks.yourdomain.com
```

4) Búa til `C:\cloudflared\config.yml`:
```yaml
tunnel: sportfengur-webhooks
credentials-file: C:\Users\YOUR_USER\.cloudflared\YOUR_TUNNEL_ID.json

ingress:
  - hostname: webhooks.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

5) Ræsa tunnel:
```bat
cloudflared.exe tunnel run sportfengur-webhooks
```

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
- Engin port forwarding þarf ef Cloudflare Tunnel er notað.
- Loggar fara á stdout (keyrið í terminal eða setjið upp Scheduled Task sem skrifar logga í skrá).
- XLSX skrif eru raðað og skrifuð atomískt til að minnka hættu á skemmdum.

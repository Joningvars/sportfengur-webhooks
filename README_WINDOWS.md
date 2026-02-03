# Windows Deployment (Local Machine)

This app runs as a local webhook receiver, fetches updated SportFengur data, and writes to `raslistar.xlsx` in-place.

## 1) Configure
- Copy `.env.example` to `.env`
- Fill in:
  - `EIDFAXI_USERNAME`
  - `EIDFAXI_PASSWORD`
  - Optional: `SPORTFENGUR_WEBHOOK_SECRET` + `WEBHOOK_SECRET_REQUIRED=true`

## 2) Build Windows exe
```bat
npm install
npm run build:win
```
The exe will be created at `dist\sportfengur-webhooks.exe`.

## 3) Run
Open Command Prompt in the project folder and run:
```bat
dist\sportfengur-webhooks.exe
```

The XLSX file is updated in place at the path in `EXCEL_PATH` (default `./raslistar.xlsx`).

## 4) Firewall / Port
Allow inbound TCP on the `PORT` value (default 3000) so SportFengur can post webhooks.

## 5) Auto-start (optional)
Create a shortcut to `dist\sportfengur-webhooks.exe` and place it in:
```
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
```

## 6) Health check
Visit:
```
http://localhost:3000/
```

## Notes
- The app logs to stdout (run it from a terminal or create a scheduled task that captures logs).
- XLSX writes are queued to avoid corruption under rapid webhook bursts.

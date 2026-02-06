@echo off
set EVENT_ID=70617
set CLASS_ID=4
set COMPETITION_ID=1

if "%WEBHOOK_SECRET%"=="" (
  for /f "usebackq tokens=1,* delims==" %%A in (`findstr /b "SPORTFENGUR_WEBHOOK_SECRET=" .env 2^>NUL`) do (
    set WEBHOOK_SECRET=%%B
  )
)

if "%WEBHOOK_SECRET%"=="" set WEBHOOK_SECRET=YOUR_SECRET

curl -X POST http://eidfaxi.ngrok.app/event_einkunn_saeti ^
  -H "Content-Type: application/json" ^
  -H "x-webhook-secret: %WEBHOOK_SECRET%" ^
  -d "{\"eventId\":%EVENT_ID%,\"classId\":%CLASS_ID%,\"competitionId\":%COMPETITION_ID%}"

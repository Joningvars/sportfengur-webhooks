@echo off
REM -----------------------------
REM Competition 1
REM -----------------------------
set EVENT_ID=70617
set CLASS_ID=103060
set COMPETITION_ID=2
set PUBLISHED=1

REM Secret path
set ENV_FILE=C:\Users\gudjo\Downloads\sportfengur-webhooks-main\sportfengur-webhooks-main\release\.env

REM Load secret
for /f "tokens=1,* delims==" %%A in ('findstr /b "SPORTFENGUR_WEBHOOK_SECRET=" "%ENV_FILE%" 2^>nul') do (
    set WEBHOOK_SECRET=%%B
)

if "%WEBHOOK_SECRET%"=="" (
    echo ERROR: WEBHOOK_SECRET not found in %ENV_FILE%
    pause
    exit /b 1
)

echo Sending event_einkunn_saeti for competitionId=%COMPETITION_ID%, published=%PUBLISHED%...

REM Curl all on one line, verbose, with published
curl -v -X POST https://eidfaxi.ngrok.app/event_einkunn_saeti ^
  -H "Content-Type: application/json" ^
  -H "x-webhook-secret: %WEBHOOK_SECRET%" ^
  -d "{\"eventId\":%EVENT_ID%,\"classId\":%CLASS_ID%,\"competitionId\":%COMPETITION_ID%,\"published\":%PUBLISHED%}"

echo Done
pause

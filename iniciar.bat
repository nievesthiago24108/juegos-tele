@echo off
rem Juegos en la tele: arranca el servidor y abre la tele en pantalla completa (modo kiosco).
rem Uso: doble clic. Para salir del kiosco: Alt+F4. Para apagar los juegos, cerrar la ventana
rem "Juegos en la tele - servidor".
rem
rem Si la tele es una pantalla extendida (a la derecha de la notebook), poner donde empieza,
rem por ejemplo set POSICION=1920,0 para una notebook de 1920 de ancho. Vacio = pantalla principal.
set POSICION=
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto sin_node

if exist node_modules goto instalado
echo Instalando dependencias (solo la primera vez)...
call npm install --omit=dev
if errorlevel 1 goto sin_internet
:instalado

for /f "delims=" %%p in ('node -p "require('./server.js').loadConfig().puerto"') do set PUERTO=%%p
set URL=http://localhost:%PUERTO%

rem el servidor se vuelve a levantar solo si se cae
start "Juegos en la tele - servidor" /min cmd /c "for /l %%i in () do (node server.js & echo El servidor se detuvo; se reinicia en 2 segundos... & ping -n 3 127.0.0.1 >nul)"

rem esperar a que el servidor responda (max. 20 s)
set /a INTENTOS=0
:esperar
node -e "require('http').get('%URL%/api/config',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))" >nul 2>nul
if not errorlevel 1 goto listo
set /a INTENTOS+=1
if %INTENTOS% GEQ 20 goto no_responde
ping -n 2 127.0.0.1 >nul
goto esperar
:listo

set NAVEGADOR=
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set NAVEGADOR=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not defined NAVEGADOR if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set NAVEGADOR=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if not defined NAVEGADOR if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set NAVEGADOR=%LocalAppData%\Google\Chrome\Application\chrome.exe
if not defined NAVEGADOR if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set NAVEGADOR=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
if not defined NAVEGADOR if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set NAVEGADOR=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe
if not defined NAVEGADOR goto sin_navegador

set EXTRA=
if defined POSICION set EXTRA=--window-position=%POSICION%

rem Perfil propio: el kiosco funciona aunque el navegador ya este abierto y suena sin tocar la pantalla.
start "" "%NAVEGADOR%" --kiosk --autoplay-policy=no-user-gesture-required --noerrdialogs --disable-infobars --no-first-run --disable-session-crashed-bubble --disable-features=Translate %EXTRA% --user-data-dir="%LocalAppData%\juegos-tele-kiosco" %URL%
exit /b 0

:sin_navegador
echo No encontre Chrome ni Edge. Abri %URL% a mano y toca F para pantalla completa.
start "" %URL%
pause
exit /b 0

:no_responde
echo El servidor no respondio en %URL%. Mira la ventana "Juegos en la tele - servidor".
pause
exit /b 1

:sin_node
echo Falta Node.js 20 o superior. Bajalo de https://nodejs.org (version LTS) y volve a intentar.
pause
exit /b 1

:sin_internet
echo No se pudieron instalar las dependencias. Hace falta internet la primera vez
echo (o copiar la carpeta node_modules desde otra compu).
pause
exit /b 1

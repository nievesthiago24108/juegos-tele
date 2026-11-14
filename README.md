# Juegos en la tele

Juegos para mostrar en un **televisor puesto en vertical** (el juego mide 1080 de ancho por 1920 de alto), conectado por HDMI a una notebook. La tele **no es táctil**: los jugadores usan **su celular como control**, escaneando un código QR. Todo funciona **sin internet**, en una red local armada con la zona wifi de un celular.

| Juego | Modos |
|---|---|
| **Memoria de colores** (tipo Simón dice) | Solo (mouse o teclado) · Eliminación (2 a 6 celus) · Cooperativo (2 a 4 celus) |
| **Penales** | Solo (mouse contra el arquero de la compu) · 1 contra 1 (2 celus) · Torneo (2 a 6 celus) |
| **Tocá rápido** (juego de ejemplo) | Solo (mouse o barra espaciadora) · Con celulares (1 a 6) |

Todos los juegos tienen un **modo solo** que se juega en la tele con el mouse y el teclado, sin celulares: es el plan B si falla el wifi. Los puntajes se guardan en un ranking que se ve en la tele y en `/ranking`.

Para programar un juego nuevo, ver [JUEGOS.md](JUEGOS.md).

---

## 1. Instalación

Hace falta **Node.js 20 o superior** (en Windows, bajar la versión LTS de <https://nodejs.org>).

La primera vez hay que instalar las dependencias, y para eso sí hace falta internet:

```bash
npm install --omit=dev
```

Si la notebook de la escuela no tiene internet, se puede copiar la carpeta completa, con `node_modules/` incluida, desde otra compu que tenga el mismo sistema operativo.

### Pasarlo a otra compu desde GitHub

```bash
git clone https://github.com/nievesthiago24108/juegos-tele.git
cd juegos-tele
npm install --omit=dev
```

En Windows se puede bajar el ZIP desde la página del repositorio (*Code → Download ZIP*), descomprimirlo y hacer doble clic en `iniciar.bat`: la primera vez instala las dependencias solo. El repositorio no trae puntajes: el ranking de cada compu arranca vacío.

## 2. Cómo arrancar

- **Windows:** doble clic en `iniciar.bat`.
- **Linux:** `./iniciar.sh`.

Los dos scripts arrancan el servidor, que se vuelve a levantar solo si se cae, y abren la tele en el navegador en **modo kiosco** (pantalla completa, sin barras). Para salir del kiosco: **Alt+F4**.

También se puede arrancar a mano:

```bash
npm start
```

| Dirección | Para qué |
|---|---|
| `http://localhost:3000/` | La tele, en la notebook. |
| `http://IP-DE-LA-NOTEBOOK:3000/j` | Los celulares. Es la que está en el QR, que se arma solo con la IP de la notebook. |
| `http://localhost:3000/ranking` | Tablas de Hoy, Semana y Siempre de cada juego. |

Al arrancar, la consola muestra la IP y el QR. Si la notebook tiene varias redes y el QR sale con la IP equivocada, se puede forzar la correcta: `IP_TELE=192.168.43.10 npm start`.

> El Bowling Tótem también usa el puerto 3000. Si van a correr los dos a la vez en la misma compu, cambien `"puerto"` en `config.json`.

### Teclas en la tele

| Tecla | Qué hace |
|---|---|
| ↑ ↓ | Elegir juego. |
| ← → | Elegir modo. |
| Enter | Jugar (en resultados: jugar otra vez). |
| Esc | Volver al menú. Durante una partida hay que tocarla dos veces. |
| F | Pantalla completa. |
| O | Girar la imagen: 0° → 90° → -90°. |
| 1 a 6, flechas, Enter | Memoria, en modo solo. |
| Clic y arrastrar | Penales, en modo solo. |

También se puede elegir todo con el mouse: un clic en el modo lo elige y un segundo clic empieza la partida. El **primer celular que entra es el anfitrión**: puede elegir juego y modo desde el celu, y al final de cada partida elegir «Jugar otra vez» o «Volver al menú».

El cursor del mouse se esconde solo si no se mueve durante 3 segundos.

## 3. La tele en vertical

### Girar la pantalla desde el sistema (recomendado)

**Windows 10 y 11:** clic derecho en el escritorio → *Configuración de pantalla* → elegir la pantalla de la tele (la 2) → *Orientación de la pantalla* → **Vertical**. Si el juego queda cabeza abajo, elegir **Vertical (volteado)**. Cuál de las dos sirve depende de para qué lado está apoyada la tele.

**Linux:**

- Con escritorio gráfico: *Configuración del sistema → Pantallas* → elegir la tele → *Rotación / Orientación* → izquierda o derecha.
- Con X11, por terminal (el nombre de la salida sale de `xrandr`, por ejemplo `HDMI-1` o `HDMI-A-1`):
  ```bash
  xrandr --output HDMI-1 --rotate left      # o --rotate right si queda al revés
  ```
- Con KDE en Wayland:
  ```bash
  kscreen-doctor output.HDMI-A-1.rotation.left
  ```

### Plan B: que gire el juego

Si no se puede girar la pantalla desde el sistema, por ejemplo por falta de permisos en la compu de la escuela, el juego puede girar la imagen solo: en `config.json`, poner `"rotarPantalla": 90` (o `-90` si queda al revés). Los clics del mouse siguen cayendo en el lugar correcto. Durante el uso, la tecla **O** alterna entre 0°, 90° y -90°.

### Margen de seguridad

Muchas teles recortan un poco los bordes de la imagen. Por eso el juego deja un margen negro del 4% alrededor, configurable con `"margenSeguridad"` (de 0 a 10) en `config.json`. Si la tele tiene la opción *Ajustar a pantalla*, *Just Scan* o *Pixel a pixel*, conviene activarla y bajar el margen.

## 4. La tele como pantalla extendida

Así la notebook queda libre para el que maneja, y la tele muestra solo el juego.

- **Windows:** **Win + P** → *Extender*. En *Configuración de pantalla*, ubicar la tele a la derecha de la notebook y girarla (punto 3).
- **Linux:** *Configuración → Pantallas* → modo *Unir pantallas* o *Extender*. Por terminal: `xrandr --output HDMI-1 --auto --right-of eDP-1 --rotate left`.

Para que el kiosco se abra en la tele y no en la notebook hay dos opciones:

1. Marcar la tele como **pantalla principal** (en Windows: *Convertir esta pantalla en la principal*).
2. Editar la variable `POSICION` al principio de `iniciar.bat` o de `iniciar.sh`, poniendo dónde empieza la tele. Por ejemplo, `1920,0` si la notebook mide 1920 de ancho y la tele está a la derecha.

También se puede abrir a mano y arrastrar la ventana a la tele: con Chrome o Edge, ir a `http://localhost:3000` y tocar **F** para pantalla completa.

### Modo kiosco del navegador

Los scripts abren Chrome, Edge, Chromium o Brave con estas opciones:

- `--kiosk`: pantalla completa sin barras.
- `--autoplay-policy=no-user-gesture-required`: que suene sin hacer clic primero.
- Un perfil propio, para que funcione aunque el navegador ya esté abierto.

Para hacerlo a mano en Windows:

```bat
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --autoplay-policy=no-user-gesture-required http://localhost:3000
```

### «Modo juego» de la tele

En el menú de imagen de la tele, activar **Modo juego**, también llamado *Game mode* o *Baja latencia*. Saca los procesamientos de imagen que agregan retraso, y se nota mucho en Memoria. Si la tele tiene una entrada HDMI marcada como «PC» o «Juego», usar esa.

## 5. La red: zona wifi de un celular, sin internet

No hace falta internet: alcanza con que la notebook y los celulares de los jugadores estén en la **misma red wifi**.

1. En un celular cualquiera, que puede ser el del profe, activar la **zona wifi** (*Hotspot* o *Punto de acceso*). Se pueden apagar los datos móviles: la red funciona igual, sin internet.
2. Conectar la notebook a esa red.
3. Arrancar el juego. El QR de la tele ya tiene la IP correcta (suele ser `192.168.x.x` o `10.x.x.x`).
4. Los jugadores se conectan a la misma red y escanean el QR con la cámara.
5. Como la red no tiene internet, el celu puede avisar «Esta red no tiene acceso a internet». Hay que tocar **«Mantener conexión»** (o «Usar esta red de todos modos»); si no, el celu se desconecta solo. La tele y el celu muestran este aviso.

Una zona wifi de celular suele aguantar entre 8 y 10 dispositivos. Para una partida de 6, alcanza.

## 6. Cambiar el logo, los colores y los juegos

Todo está en `config.json`. Si algo está mal escrito, se usa el valor por defecto y la consola avisa.

| Campo | Qué es |
|---|---|
| `nombreEscuela`, `nombreCorto` | Aparecen en la tele, en los carteles de la cancha de Penales y en el celu. |
| `colores.principal`, `secundario`, `acento`, `fondo` | Colores de la escuela, como `"#6272B4"`. Se usan en la tele, en las camisetas de Penales y en los carteles. |
| `logo` | Ruta del logo, por defecto `public/logo.png`. Si el archivo no existe, se escribe el nombre corto. Conviene un PNG cuadrado con fondo transparente, de unos 512x512. |
| `puerto` | Por defecto, 3000. |
| `rotarPantalla` | 0, 90 o -90 (ver punto 3). |
| `margenSeguridad` | Porcentaje de borde negro (por defecto, 4). |
| `maxJugadores` | Celulares en la sala, de 2 a 6. |
| `memoria.colores` | Los 6 colores de Memoria. Cada uno lleva `color`, `simbolo` (● ▲ ■ ★ ◆ ✚ u otra letra), `palabra` (lo que se lee en la ronda «trampa») y `etiqueta` (texto opcional en el botón, por ejemplo un lugar de la escuela: `"Taller"`, `"Biblioteca"`). |
| `penales.dificultad` | `"facil"`, `"normal"` o `"dificil"`, para el arquero automático. |

Después de cambiar `config.json` hay que reiniciar el servidor. Para cambiar el logo, alcanza con reemplazar `public/logo.png` y recargar la tele.

## 7. Ranking y puntajes

- Se guardan **todos** los puntajes en `data/puntajes.jsonl`, un renglón por puntaje, con nombre, juego, modo y fecha. Solo se agrega al final, nunca se borra. Una vez por día se hace una copia en `data/backups/`.
- Tablas:
  - Memoria: mejor nivel individual y mejor nivel en equipo, con todos los nombres.
  - Penales: más goles seguidos (solo), ganadores de torneo y efectividad como arquero (mínimo 5 tiros recibidos).
  - Tocá rápido: más toques en 10 segundos.
- En modo solo, al terminar se escribe el nombre con un teclado en pantalla, usando el mouse o el teclado físico. Con celulares se usa el nombre de cada uno.
- Los nombres pasan por un filtro de malas palabras: `data/palabras-prohibidas.txt`, una por renglón, que se puede editar en cualquier momento.
- Para empezar un ranking de cero, por ejemplo para otra jornada, cerrar el servidor y renombrar `data/puntajes.jsonl`.

## 8. Si los celulares no se conectan

1. **¿Están en la misma red?** El celu tiene que estar en la misma zona wifi que la notebook, y no en los datos móviles ni en el wifi de la escuela.
2. **«Mantener conexión».** Si el celu avisó que la red no tiene internet y no se tocó «Mantener conexión», se va a otra red sola.
3. **Firewall de Windows.** La primera vez que se arranca, Windows pregunta si deja que Node.js use la red: marcar **Redes privadas** y aceptar. Si se dijo que no, hay dos caminos:
   - *Seguridad de Windows → Firewall → Permitir una aplicación* → tildar Node.js en Privada.
   - En una consola como administrador:
     ```bat
     netsh advfirewall firewall add rule name="Juegos en la tele" dir=in action=allow protocol=TCP localport=3000
     ```
   Además, la red de la zona wifi tiene que estar como **Privada**: *Configuración → Red e Internet → Wi-Fi → (la red) → Tipo de perfil de red: Privada*.
4. **El QR tiene una IP vieja.** Si la notebook cambió de red, reiniciar el servidor: el QR se vuelve a armar con la IP nueva.
5. **Probar desde la notebook.** Abrir `http://IP-DE-LA-NOTEBOOK:3000/j`. Si ahí no carga, el problema es el firewall o la IP.
6. **Algunas zonas wifi aíslan a los dispositivos entre sí.** Pasa en algunos celulares, en opciones como «Aislamiento de clientes» o «Ocultar dispositivos». Probar con la zona wifi de otro celu.
7. **VPN.** Una VPN activa en la notebook o en el celu puede bloquear la red local.
8. **Si nada funciona:** jugar en **modo solo**, con mouse y teclado.

Si un celu se cierra, se bloquea o pierde la señal, vuelve solo a su lugar al abrir otra vez la página: guarda un código en el navegador. Con el botón «Salir» libera su lugar.

## 9. Pruebas

```bash
npm test                    # tests de lógica, servidor y ranking (node:test)
npm run sim                 # simulación de 1000 tiros de penales (calibración del arquero)
npm run capturas:base       # Playwright: plataforma, celus, pantalla girada
npm run capturas:memoria    # Playwright: Memoria (solo, eliminación, cooperativo)
npm run capturas:penales    # Playwright: Penales (solo, 1 contra 1, torneo)
npm run prueba:final        # Playwright: todo, reinicio del servidor, red y consola
```

Las pruebas usan una carpeta de datos temporal y nunca tocan `data/`. Las capturas quedan en `capturas/`.

## 10. Estructura

```
server.js            servidor: páginas, sala de jugadores, reenvío de mensajes, puntajes
leaderboard.js       ranking en data/puntajes.jsonl + filtro de nombres
config.json          escuela, colores, logo, puerto, rotación, juegos
public/tele/         la tele: escala, rotación, menú, resultados, teclado en pantalla
public/j/            el celular: sala y controles (botones, zonas, deslizar, espera)
public/ranking/      tablas del ranking
public/shared/       tipografías, sonidos (WebAudio), trazo, formas, ayudas de dibujo
public/juegos/<id>/  cada juego (ver JUEGOS.md)
test/                tests (node:test), simulación y pruebas de Playwright
```

---

Hecho por 5ºI Informática.

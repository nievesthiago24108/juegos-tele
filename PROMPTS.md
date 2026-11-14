# Prompts — Penales y Memoria de colores

Pantalla: televisor de 1920x1080 colocado en vertical (el juego mide 1080 de ancho x 1920 de alto), conectado por HDMI a la notebook, NO táctil. Sin internet: red local con la zona wifi de un celular.

Pegá los prompts en Claude Code de a uno, en orden, y probá cada etapa antes de seguir.

---

## Prompt 1 — Base de la plataforma

```
Quiero hacer juegos para mostrar en un televisor de 1920x1080 colocado en vertical (de
pie), en mi escuela. El juego mide 1080 de ancho x 1920 de alto. La tele está conectada
por HDMI a mi notebook y NO es táctil. Los jugadores usan su celular como control,
escaneando un código QR.

Reglas obligatorias:
- Todo tiene que funcionar SIN INTERNET, en una red local (la zona wifi de un celular).
  No uses CDN, Google Fonts ni ningún recurso externo: todo se sirve desde la notebook.
- Textos de la interfaz en español rioplatense.
- Lienzo fijo de 1080x1920 vertical. Se escala para entrar en la ventana manteniendo la
  proporción, con bordes negros si sobra espacio, y con un margen de seguridad del 4%
  por si la tele recorta los bordes. No hagas versión horizontal.
- Cada juego tiene un "modo solo" que se juega con el mouse (clic y arrastrar) y con el
  teclado, sin celulares, como plan B por si falla el wifi.

Si en esta carpeta ya existe un proyecto (por ejemplo un bowling), reutilizá lo que sirva
sin romperlo. Si está vacía, creá todo desde cero.

Hacé la base, todavía sin juegos reales:
1. Servidor con Node.js, Express y Socket.io. Al arrancar, mostrar en la consola la IP
   local de la notebook y generar un QR (librería qrcode) que apunte a http://IP:3000/j.
2. Pantalla principal en "/": menú para elegir juego y modo (se maneja con el mouse, con
   las flechas y Enter del teclado o desde el celular del anfitrión), con el QR grande y
   la lista de jugadores conectados. Mostrar en pantalla qué teclas se usan.
3. Página del celular en "/j": el jugador escribe su nombre (2 a 14 caracteres, con
   filtro de malas palabras) y queda en la sala. El primero que entra es el anfitrión.
   Si se cae la conexión, reconecta solo y recupera su lugar (token en localStorage).
   Mostrar el aviso: "Si tu celu dice que esta red no tiene internet, tocá «Mantener
   conexión»".
4. Una interfaz común para los juegos: cada juego es una carpeta en public/juegos/<id>/
   con las funciones iniciar(contexto, jugadores, modo), recibirInput(jugadorId, datos),
   puntero(x, y, tipo), tecla(codigo), actualizar(dt), dibujar(ctx), controlCelular(jugadorId),
   terminado() y resultados(). Las coordenadas del mouse llegan ya convertidas al lienzo
   de 1080x1920.
5. Tipos de control que puede pedir cada juego al celular: "botones" (botones de colores),
   "zonas" (grilla de N botones), "deslizar" (trazo con dirección, fuerza y curva) y
   "espera" (mensaje mientras no le toca).
6. Leaderboard: guardar TODOS los puntajes con nombre, juego, modo y fecha en
   data/puntajes.jsonl (un renglón por puntaje, se agrega al final y no se borra).
   Página /ranking con tablas de Hoy, Semana y Siempre por juego. Al terminar una partida
   en modo solo, pedir el nombre con un teclado en pantalla que se maneja con el mouse o
   escribiendo con el teclado físico.
7. config.json con: nombre de la escuela, colores de la escuela, ruta del logo
   (public/logo.png; si no existe, escribir el nombre), puerto y "rotarPantalla" (0, 90 o
   -90). Si rotarPantalla vale 90 o -90, el juego gira la imagen con CSS para verse
   vertical aunque la notebook mande la señal en horizontal (plan B si no se puede girar
   la pantalla desde el sistema); los clics del mouse tienen que seguir cayendo en el
   lugar correcto. La tecla O alterna la rotación.
8. Ocultar el cursor del mouse cuando no se mueve por 3 segundos. Tecla F: pantalla
   completa.
9. Un juego de ejemplo mínimo, "Tocá rápido" (hacer clic o tocar en el celu lo más rápido
   posible durante 10 segundos), para probar que todo funciona en modo solo y con
   celulares.

Probalo con Playwright en 1080x1920 (y una vez con rotarPantalla en 90), con y sin
celulares emulados, y pasame capturas. Explicá la interfaz de juegos en JUEGOS.md y en
README.md cómo instalar, arrancar, girar la pantalla en Windows (Configuración de
pantalla → Orientación) y en Linux (configuración de pantalla o xrandr), y usar la tele
como pantalla extendida.
```

## Prompt 2 — Memoria de colores (tipo Simón dice)

```
Usando la plataforma de JUEGOS.md, creá el juego "Memoria de colores" en
public/juegos/memoria/. Lienzo de 1080x1920 vertical.

Cómo se juega: 4 botones grandes de colores en grilla 2x2 en el centro de la pantalla,
cada uno con un símbolo (● ▲ ■ ★) y una nota musical distinta (sintetizada con WebAudio,
sin archivos de audio). El juego muestra una secuencia encendiendo los botones y hay que
repetirla. En cada nivel la secuencia suma un color. Hay 3 segundos por color para
responder; si se acaba el tiempo, cuenta como error. Arriba: nivel y récord. Abajo:
jugadores y su estado.

Modos:
- Solo (1 jugador, sin celular): se juega con clic del mouse en los botones o con las
  teclas 1, 2, 3, 4 (y las flechas). Mostrar el número de tecla en cada botón. El juego
  termina al primer error.
- Eliminación (2 a 6, con celulares): todos ven la secuencia en la tele (el celular NO la
  muestra) y la repiten en su celu con el control "botones". Quien se equivoca queda
  afuera y el último que queda gana. En la tele se ve el estado de cada uno:
  respondiendo, ✓ listo, ✗ afuera.
- Cooperativo (2 a 4, con celulares): los colores se reparten entre los celulares y el
  grupo repite la secuencia tocando cada uno cuando le toca su color. 3 vidas en total.
  El orden se valida en el servidor con la marca de tiempo de cada toque.

Dificultad que va subiendo:
- Nivel 5: más rápido (de 600 a 450 ms por color).
- Nivel 8: los botones cambian de lugar después de mostrar la secuencia.
- Nivel 10: 6 colores en vez de 4 (grilla 2x3; en modo solo, teclas 1 a 6).
- Nivel 13: más rápido (320 ms).
- Cada 6 niveles, una ronda especial anunciada con un cartel 2 segundos antes: "al revés"
  (repetir de atrás para adelante) o "trampa" (aparece la palabra ROJO escrita en azul y
  hay que tocar el color de la letra).

Puntaje: nivel alcanzado × 100 + bonus por responder rápido. Leaderboard: mejor nivel
individual y mejor nivel de equipo (con los nombres de todos).

Presentación: brillo y onda expansiva al encender un botón, cartel animado de "¡Nivel 7!",
festejo de récord. Colores e íconos configurables en config.json (por ejemplo, lugares de
la escuela).

Separá la lógica (secuencias, niveles, validación, puntaje) del dibujo y escribí tests
con node:test. Probalo con Playwright en 1080x1920: modo Solo jugando 3 niveles con el
teclado, y Eliminación con 3 celulares emulados (uno acierta siempre, otro falla en el
nivel 3 y otro se desconecta). Pasame capturas.
```

## Prompt 3 — Penales

```
Usando la plataforma de JUEGOS.md, creá el juego "Penales" en public/juegos/penales/.
Lienzo de 1080x1920 vertical.

Cómo se ve: arco con red y arquero en la parte de arriba, pelota en el punto penal en la
parte de abajo, en perspectiva simple, dibujado a mano en canvas (sin imágenes externas).
Marcador arriba de todo.

Tiro (trazo desde la pelota hacia el arco: con el dedo en el celu, o con clic y arrastrar
del mouse en modo solo):
- Dirección del trazo = hacia qué lado va.
- Largo del trazo hacia arriba = altura.
- Velocidad del trazo = fuerza (demasiada fuerza hace que el tiro suba).
- Curva del trazo = comba.
- Si sale del arco: "¡AFUERA!". Si pega justo en el borde: "¡PALO!" con rebote.

Atajada: el arco se divide en 6 zonas (3 columnas × 2 alturas). Si el arquero está en la
zona del tiro, ataja, salvo un tiro muy fuerte y muy pegado al palo (golazo imposible).

Modos:
- Solo (1 jugador, sin celular): patea con clic y arrastrar del mouse contra un arquero
  automático, que elige una zona al azar con algo de tendencia hacia donde más patea el
  jugador (dificultad en config.json). Se juega hasta errar 3; cuenta los goles seguidos.
- 1 contra 1 (2 jugadores con celular): el pateador usa el control "deslizar" y el
  arquero el control "zonas" (grilla 3×2). Durante los 3 segundos de carrera del
  pateador, el arquero elige en secreto; si no elige, queda en el centro. 5 penales cada
  uno alternando roles y muerte súbita si empatan. Marcador con ✓ y ✗.
- Torneo (2 a 6 con celular): cada uno patea 5 penales contra el arquero automático por
  turnos. Gana quien mete más; desempate por precisión.
- Si el pateador no tira en 15 segundos, sale un tiro débil al centro.

Leaderboard: más goles seguidos (Solo), ganadores de torneo y efectividad como arquero
(mínimo 5 tiros recibidos).

Presentación: red que se mueve con el gol, carteles con el logo y el nombre de la escuela,
camisetas con los colores de config.json, hinchada animada simple, arquero que se tira con
animación, pelota que gira y se achica al alejarse, cámara lenta en tiros pegados al palo,
textos grandes "¡GOOOL!", "¡ATAJÓ!", "¡AFUERA!", "¡PALO!" y pantalla que tiembla en el
gol. Sonidos sintetizados con WebAudio: patada, red, hinchada, silbato.

Separá la lógica (convertir el trazo en tiro y decidir gol, atajada, afuera o palo) del
dibujo y escribí tests con node:test. Hacé una simulación en Node con 1000 tiros al azar
y 1000 tiros buenos, y ajustá para que un tiro bueno sea gol entre 60% y 75% de las veces
en dificultad normal; mostrame la tabla. Probalo con Playwright en 1080x1920: Solo con el
mouse, 1 contra 1 con 2 celulares y Torneo con 4. Pasame capturas de la tele, del celu
del pateador y del celu del arquero.
```

## Prompt 4 — Prueba final

```
Hacé una prueba completa de todo el proyecto en 1080x1920:
1. Con Playwright: elegir cada juego desde el menú, jugar cada modo hasta el final, que
   un celular se desconecte y vuelva, y comprobar que los puntajes quedan en el
   leaderboard y siguen ahí después de reiniciar el servidor. Repetí una partida con
   rotarPantalla en 90.
2. Comprobá que nada pide recursos de internet (revisá las peticiones de red de todas
   las páginas) y que los modos solo funcionan sin ningún celular conectado, con mouse y
   con teclado.
3. Revisá la consola de todas las páginas y arreglá cualquier error.
4. Completá README.md con: instalación, cómo arrancar, cómo girar la pantalla de la
   notebook para la tele vertical (Windows y Linux), cómo usar la tele como pantalla
   extendida y el navegador en modo kiosco, el "modo juego" de la tele, cómo armar la red
   con la zona wifi de un celular sin internet, cómo cambiar el logo y los colores, y qué
   hacer si los celulares no se conectan (misma red, «Mantener conexión», firewall de
   Windows).
5. Agregá iniciar.bat (Windows) e iniciar.sh (Linux) que arranquen el servidor y abran el
   navegador en pantalla completa.
```

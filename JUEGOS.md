# Cómo se hace un juego para la plataforma

La tele corre los juegos. El servidor solo maneja la sala, reenvía mensajes y guarda los puntajes. Cada juego es una carpeta adentro de `public/juegos/<id>/` y aparece solo en el menú, sin tocar nada más.

```
public/juegos/<id>/
  juego.json     ← nombre, modos y tablas del ranking (lo lee el servidor)
  juego.js       ← el juego (corre en la tele)
  logica.js      ← (recomendado) reglas sin dibujo, para poder testearlas con node:test
  servidor.js    ← (opcional) lógica que tiene que correr en el servidor
```

## 1. `juego.json`

```jsonc
{
  "id": "memoria",                       // igual al nombre de la carpeta
  "nombre": "Memoria de colores",
  "descripcion": "Repetí la secuencia de colores.",
  "orden": 10,                           // posición en el menú (menor = más arriba)
  "archivos": ["logica.js", "juego.js"], // se cargan en este orden
  "modos": [
    { "id": "solo", "nombre": "Solo", "celulares": false },
    { "id": "eliminacion", "nombre": "Eliminación", "celulares": true, "min": 2, "max": 6 }
  ],
  "rankings": [
    { "id": "individual", "titulo": "Mejor nivel individual", "unidad": "puntos", "formato": "nivel" }
  ],
  "servidor": "servidor.js"              // opcional
}
```

- Un modo con `"celulares": false` es un **modo solo**: se juega en la tele con mouse y teclado, sin celulares. Todos los juegos tienen que tener uno, por si falla el wifi.
- `min` y `max` son la cantidad de celulares. Si hay menos de `min`, el menú muestra «faltan N». Si hay más de `max`, juegan los primeros y los demás esperan.
- `formato` es opcional y cambia cómo se muestra el puntaje en el ranking:
  - `"nivel"`: muestra «Nivel N», con N = puntaje / 100.
  - `"porcentaje"`: muestra «N%».
  - Si no se pone, muestra «N unidad».

## 2. `juego.js`: registrar el juego

```js
Plataforma.registrar('mi-juego', () => ({
  iniciar(contexto, jugadores, modo) {},
  recibirInput(jugadorId, datos, ts) {},
  puntero(x, y, tipo) {},
  tecla(codigo) {},
  actualizar(dt) {},
  dibujar(ctx) {},
  controlCelular(jugadorId) { return { tipo: 'espera', mensaje: 'Mirá la tele' }; },
  terminado() { return false; },
  resultados() { return { titulo: '', filas: [], registros: [] }; },
}));
```

La función que se pasa a `registrar` se llama en **cada partida nueva**, así que el estado guardado en sus variables arranca siempre de cero.

| Función | Cuándo se llama | Qué recibe o devuelve |
|---|---|---|
| `iniciar(contexto, jugadores, modo)` | Al empezar | `jugadores`: `[{ id, nombre, color }]` (vacío en modo solo). `modo`: id del modo. |
| `recibirInput(jugadorId, datos, ts)` | Cuando un celu toca algo | `datos` depende del control (ver abajo). `ts`: hora del toque en ms (hora del servidor). |
| `puntero(x, y, tipo)` | Mouse en la tele | `x, y` ya convertidas al lienzo de 1080x1920, aunque la pantalla esté girada. `tipo`: `'abajo'`, `'mover'` o `'arriba'`. |
| `tecla(codigo)` | Teclado de la tele | `KeyboardEvent.code`: `'Digit1'`, `'ArrowUp'`, `'Space'`… Esc, F y O los usa la plataforma. |
| `actualizar(dt)` | En cada cuadro | `dt` en segundos (máximo 0,1). |
| `dibujar(ctx)` | En cada cuadro | Contexto 2D del lienzo de 1080x1920. Hay que dibujar todo, fondo incluido. |
| `controlCelular(jugadorId)` | 5 veces por segundo y cuando el juego llama `contexto.actualizarControles()` | Qué mostrar en ese celu. Solo se manda si cambió. |
| `terminado()` | En cada cuadro | `true` cuando terminó la partida. |
| `resultados()` | Una vez, al terminar | Ver punto 5. |

Funciones opcionales:

- `conexion(jugadorId, conectado)`: un celu se desconectó o volvió.
- `mensajeServidor(datos)`: mensaje de la parte de servidor del juego.
- `festejarRecord(guardado)`: se llama si la partida hizo un récord.
- `salir()`: se llama si se sale al menú en medio de la partida.

### `contexto`

| Campo | Qué es |
|---|---|
| `ancho`, `alto` | 1080 y 1920. |
| `config` | `config.json` ya validado: `nombreEscuela`, `colores`, y la sección del juego, por ejemplo `config.memoria`. |
| `juego`, `modo` | Los manifiestos de `juego.json`. |
| `solo` | `true` si es el modo sin celulares. |
| `sonido` | Sonidos sintetizados (`/shared/sonido.js`): `tono(f, dur)`, `ruido(dur, {filtro})`, `bien()`, `error()`, `festejo()`, `silbato()`, `patada()`, `red()`, `hinchada()`… |
| `formas` | `formas.dibujar(ctx, '★', x, y, r, color)` dibuja ● ▲ ■ ★ ◆ ✚ sin depender de la fuente. |
| `trazo` | `trazo.analizar(puntos)` devuelve la dirección, la fuerza y la curva de un trazo. |
| `logo` | Imagen del logo, o `null` si no hay `public/logo.png`. |
| `sacudir()` | Hace temblar la pantalla (por CSS, sin costo de dibujo). |
| `cartel(texto, ms)` | Aviso chico abajo. |
| `actualizarControles()` | Manda ya los controles a los celus, sin esperar la próxima revisión. |
| `servidor(datos)` | Manda un mensaje a `servidor.js`. |
| `record(categoria)` | Promesa con el récord histórico `{ nombre, puntaje }` o `null`. |
| `ahora()`, `horaServidor()` | Tiempo de la tele (ms) y hora del reloj (para comparar con `ts`). |

En `/shared/dibujo.js` (`window.Dibujo`) hay ayudas con el estilo de la escuela: `PAL` (paleta), `texto()`, `rect()`, `encabezado()` y `capa()`, que es una capa en caché para lo que no cambia.

## 3. Controles del celular

`controlCelular(jugadorId)` devuelve uno de estos objetos. Todos aceptan `titulo` y `mensaje`, y conviene ponerles un `id`: cuando cambia el `id`, el celu se reinicia, por ejemplo para un tiro nuevo.

| `tipo` | Ejemplo | Qué manda el celu (`datos`) |
|---|---|---|
| `"botones"` | `{ tipo: 'botones', columnas: 2, botones: [{ id: 0, color: '#E5484D', simbolo: '●', texto: 'Rojo' }] }` | `{ boton: id, t }` |
| `"zonas"` | `{ tipo: 'zonas', columnas: 3, filas: 2, etiquetas: ['↖','↑','↗','↙','↓','↘'], arco: true, elegida: null }` | `{ zona: índice, t }` (0 = arriba a la izquierda) |
| `"deslizar"` | `{ tipo: 'deslizar', id: 'tiro-3' }` | `{ trazo: [{ x, y, t }], t }`, con x e y en «altos de pantalla» y t en ms desde el inicio |
| `"espera"` | `{ tipo: 'espera', titulo: 'Turno de Ana', grande: 'Mirá la tele' }` | — |

`bloqueado: true` muestra el control apagado. `t` es la hora del toque, ya corregida a la hora del servidor: el celu sincroniza el reloj al conectarse.

## 4. Parte de servidor (opcional)

Sirve para reglas que no pueden depender de la tele, por ejemplo validar el orden de toques de varios celus.

```js
module.exports = function crear(api) {      // api: { aTele(datos), ahora(), log() }
  return {
    deTele(datos, jugadores) {},              // lo que manda contexto.servidor(datos)
    alInput(jugadorId, datos, ts) { return false; }, // true = lo atendí yo y no se reenvía a la tele
    reiniciar() {},                           // al volver al menú
    cerrar() {},
  };
};
```

## 5. `resultados()`

```js
{
  titulo: '¡Ganó Ana!',
  subtitulo: 'Nivel 9',
  filas: [{ nombre: 'Ana', valor: 'Nivel 9', detalle: '930 puntos', color: '#3FB6E0', destacado: true }],
  registros: [
    { categoria: 'individual', puntaje: 930, jugadorIds: ['id-de-ana'], detalle: { nivel: 9 } }
  ],
  celular: { 'id-de-ana': { titulo: '¡Ganaste!', mensaje: 'Nivel 9' } }
}
```

- **Con celulares**, cada registro lleva `jugadorIds`. El nombre lo pone el servidor, así nadie puede inventar un jugador. Si son varios, es un puntaje de equipo y se guardan todos los nombres.
- **En modo solo**, los registros van sin nombre: la plataforma muestra un teclado en pantalla para escribirlo, con el mouse o con el teclado físico, y después lo guarda. En las filas, `esJugadorSolo: true` hace que se muestre el nombre escrito.
- Todo se guarda en `data/puntajes.jsonl`, un renglón por puntaje, y se ve en `/ranking`.

## 6. Reglas de la casa

- Nada de internet: ni CDN, ni fuentes de Google, ni imágenes de afuera. Todo se dibuja en el canvas o se sirve desde la notebook.
- Textos en español rioplatense.
- Rendimiento: nada de `shadowBlur`, y lo que no cambia va a `Dibujo.capa()`. La tele puede estar en una notebook sin placa de video.
- Separar la lógica (`logica.js`, que funciona en Node) del dibujo, y testearla con `node:test` en `test/`.

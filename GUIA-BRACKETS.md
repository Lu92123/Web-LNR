# Pantalla de llaves y posiciones (segunda TV)

Página pensada para la TV de competidores y jueces:

- `brackets.html` → la pantalla (carrusel automático).
- `brackets-data.js` → **el único archivo que se edita durante el evento**.
- `brackets.js` → lógica del carrusel (no hace falta tocarlo).
- Estilos: sección "PANTALLA DE LLAVES Y POSICIONES" al final de `styles.css`.

## Cómo abrirla

- Local: `brackets.html`.
- Publicada: `https://lu92123.github.io/Web-LNR/brackets.html`.
- En la TV: abrir a pantalla completa (tecla **F**) y dejar que rote sola.

## Carrusel

Rota automáticamente entre las 5 pantallas:

1. Mini Sumo (llaves).
2. Sumo (llaves).
3. Fútbol de Robots (grupos + semifinales).
4. Sigue Líneas (tabla de tiempos y puntos).
5. Liga Nacional Oficial (tabla general).

Tiempo por pantalla: `rotacionSegundos` en `brackets-data.js` (por defecto 18 s).

Opciones por URL (útiles para probar):

- `brackets.html?seg=25` → fuerza 25 segundos por pantalla.
- `brackets.html?slide=3` → arranca en la tercera pantalla (Fútbol).
- `brackets.html?tema=claro` → versión clara (por defecto es oscura).

Controles de teclado: **← →** cambian de pantalla, **ESPACIO** pausa/reanuda,
**F** entra o sale de pantalla completa. También se puede hacer clic en los
puntos del pie.

## Actualizar los datos

Abrir `brackets-data.js`, editar y guardar. Después recargar la página en la TV
con **F5** (o `Ctrl + F5`).

### 1. Datos generales

```js
const bracketsEvento = {
    rotacionSegundos: 18,          // segundos por pantalla
    actualizadoEn: "27/10/2026 · 21:30",   // texto del pie
    categorias: [ ... ]
};
```

### 2. Llaves (Mini Sumo, Sumo, etc.)

Cada categoría tiene `tipo: "llaves"` y una lista de rondas:

```js
{
    titulo: "MINI SUMO",
    fase: "FASE DE LLAVES",
    acento: "#00ffff",          // color neón de la pantalla
    tipo: "llaves",
    nota: "Eliminación directa · combates al mejor de 5",
    rondas: [
        {
            nombre: "CUARTOS DE FINAL",
            partidos: [
                {
                    equipoA: "Titanio",
                    equipoB: "Escorpión",
                    puntosA: 3,
                    puntosB: 1,
                    estado: "finalizado"   // finalizado | en_curso | pendiente
                }
            ]
        }
    ],
    campeon: { equipo: "Golem", detalle: "Mini Sumo · 2026" }
}
```

- El ganador se marca solo comparando los puntos.
- Si hace falta forzarlo: agregar `ganador: "A"` o `ganador: "B"` al partido.
- Equipo todavía desconocido: `equipoA: null`, `equipoB: null` y
  `estado: "pendiente"` → se muestra **Por definir**.
- `estado: "en_curso"` muestra la etiqueta **EN VIVO** en el partido.
- Si todavía no hay campeón: `campeon: { equipo: null }`.

### 3. Fútbol (grupos + cruces)

`tipo: "grupos"` muestra las tablas de grupos y, si se cargan, los cruces
debajo:

```js
{
    tipo: "grupos",
    columnas: [
        { clave: "pos", titulo: "POS" },
        { clave: "equipo", titulo: "EQUIPO", alineacion: "izq" },
        { clave: "pj", titulo: "PJ" },
        { clave: "dg", titulo: "DIF" },
        { clave: "pts", titulo: "PTS", destacar: true }
    ],
    grupos: [
        { nombre: "GRUPO A", equipos: [ { equipo: "RoboGol", pj: 3, dg: "+7", pts: 9 } ] }
    ],
    cruces: {
        titulo: "SEMIFINALES",
        partidos: [ { equipoA: "RoboGol", equipoB: "Cyber United", estado: "pendiente" } ]
    }
}
```

La posición se calcula por el orden de las filas (el primero es 1°). Para
resaltar una columna, usar `destacar: true`.

### 4. Tablas (Sigue Líneas y Liga Nacional)

`tipo: "tabla"`:

```js
{
    tipo: "tabla",
    columnas: [
        { clave: "pos", titulo: "POS" },
        { clave: "robot", titulo: "ROBOT", alineacion: "izq" },
        { clave: "equipo", titulo: "EQUIPO", alineacion: "izq" },
        { clave: "tiempo", titulo: "MEJOR TIEMPO", destacar: true },
        { clave: "puntos", titulo: "PUNTOS", destacar: true }
    ],
    filas: [
        { robot: "Bólido", equipo: "Rayo Verde", tiempo: "12.48 s", puntos: 100 }
    ]
}
```

Cada clave de `columnas` tiene que existir en las filas. Las tres primeras
filas se resaltan automáticamente.

### Agregar o quitar pantallas

Agregar o borrar objetos dentro de `categorias`. El carrusel y los puntos del
pie se arman solos con esa lista. También se puede cambiar el orden.

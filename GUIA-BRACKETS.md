# Pantalla de llaves y posiciones (segunda TV)

Página pensada para la TV de competidores y jueces:

- `brackets.html` → la pantalla (carrusel automático).
- `admin.html` → **el lugar para editar** durante el evento (sin tocar código).
- `brackets-data.js` → datos de ejemplo y respaldo si Supabase no está configurado.
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

Tiempo por pantalla: se cambia desde `admin.html` (campo **Segundos por pantalla**,
entre 5 y 300). Sin panel, el valor queda en `rotacionSegundos` de
`brackets-data.js` (por defecto 18 s).

Opciones por URL (útiles para probar):

- `brackets.html?seg=25` → fuerza 25 segundos por pantalla.
- `brackets.html?slide=3` → arranca en la tercera pantalla (Fútbol).
- `brackets.html?tema=claro` → versión clara (por defecto es oscura).

Controles de teclado: **← →** cambian de pantalla, **ESPACIO** pausa/reanuda,
**F** entra o sale de pantalla completa. También se puede hacer clic en los
puntos del pie.

## Editar desde el panel de administración

Esta es la forma normal de actualizarla durante el evento:

1. Abrí `admin.html` e iniciá sesión con la cuenta de administrador.
2. Bajá hasta la tarjeta **Llaves y posiciones (2.ª TV)**.
3. Elegí la pantalla en **Pantalla**: Mini Sumo, Sumo, Fútbol, Sigue Líneas o
   Liga Nacional.
4. Editá los campos y tocá **Guardar en la 2.ª TV**.
5. La TV cambia sola, **sin recargar** y sin volver a subir la web.

Qué se puede editar:

- **Todas las pantallas:** título, nombre corto, fase, color neón y nota al pie.
- **Llaves (Mini Sumo y Sumo):** nombre de cada ronda, equipos, puntos, estado
  (`Finalizado`, `En vivo`, `Pendiente`), ganador manual y equipo campeón.
  Se pueden agregar y quitar rondas y partidos.
- **Fútbol:** nombre de cada grupo, filas de la tabla y título de los cruces;
  se pueden agregar y quitar grupos, equipos y cruces.
- **Tablas (Sigue Líneas y Liga Nacional):** filas completas; se pueden agregar
  y quitar.
- **Segundos por pantalla:** cuánto queda cada pantalla antes de rotar.

Detalles útiles:

- El pie de `brackets.html` muestra la **fecha y hora real** del último guardado
  en Supabase, no un texto escrito a mano.
- **Recargar** vuelve a traer lo último guardado en la nube y descarta lo que
  estabas editando (pide confirmación si hay cambios sin guardar).
- Si otro dispositivo guardó mientras editabas, el panel avisa antes de pisar
  esos cambios.
- Si se corta internet, la TV sigue mostrando la última copia guardada y se
  actualiza sola cuando vuelve la conexión.
- Solo la cuenta de administrador puede guardar. Los invitados y las TVs solo
  leen: nunca ven el panel.

> La primera vez, si la nube está vacía, el panel carga los datos de ejemplo de
> `brackets-data.js`. Al tocar **Guardar** se publican en la 2.ª TV.

Las cinco pantallas son fijas desde el panel: edita su contenido, no crea
pantallas nuevas. Para cambiar la lista, ver
[Agregar o quitar pantallas (avanzado)](#agregar-o-quitar-pantallas-avanzado).

## Respaldo local (sin Supabase)

Si todavía no configuraste Supabase, la pantalla usa `brackets-data.js` como
siempre. Abrí ese archivo, editá y guardá; después recargá la TV con **F5**
(o `Ctrl + F5`). Cuando hay datos guardados en la nube, esos tienen prioridad
sobre el archivo local.

### 1. Datos generales

```js
const bracketsEvento = {
    rotacionSegundos: 18,          // segundos por pantalla (si no hay nube)
    actualizadoEn: "27/10/2026 · 21:30",   // texto del pie solo sin Supabase
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

### Agregar o quitar pantallas (avanzado)

La lista de pantallas viaja dentro del documento guardado en la nube. Si ya
guardaste desde el panel, editar `brackets-data.js` no alcanza: la nube tiene
prioridad.

1. Agregá, quitá o reordená los objetos dentro de `categorias` en
   `brackets-data.js` y publicá la web.
2. En Supabase → **SQL Editor**, borrá el documento guardado:

   ```sql
   delete from public.llaves;
   ```

3. Abrí `admin.html`, verificá que aparezcan las pantallas nuevas y tocá
   **Guardar en la 2.ª TV** para volver a publicarlas.

El carrusel y los puntos del pie se arman solos con esa lista.

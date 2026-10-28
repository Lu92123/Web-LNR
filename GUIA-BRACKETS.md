# Llaves, fútbol y tiempos (segunda TV)

Pantalla para la TV de competidores y jueces del **torneo local de la Nave
Cultural**. Sigue los formatos oficiales de la Liga Nacional de Robótica (LNR),
pero **no** usa el ranking nacional ni el sistema de puntos anuales: acá solo
importa el torneo de la sede.

Archivos:

| Archivo | Función |
| --- | --- |
| `brackets.html` | La pantalla (carrusel automático). |
| `brackets.js` | Dibuja cada pantalla y maneja el carrusel. No hace falta tocarlo. |
| `brackets-logica.js` | Cálculos compartidos: ganadores, tablas, cruces, tiempos y podios. |
| `brackets-data.js` | Equipos y resultados de respaldo si Supabase no está configurado. |
| `admin.html` / `admin.js` | Panel para cargar equipos y resultados. |
| `supabase/llaves.sql` | Tabla de la nube (hay que ejecutarla una vez). |

## Cómo abrirla

- Local: `brackets.html`.
- Publicada: `https://lu92123.github.io/Web-LNR/brackets.html`.
- En la TV: abrir a pantalla completa (tecla **F**) y dejarla rotando sola.

## Las cinco pantallas

1. **Mini Sumo** — eliminación directa.
2. **Sumo** — eliminación directa.
3. **Fútbol de Robots** — grupos, semifinales, final y tercer puesto.
4. **Sigue Líneas** — tabla de tiempos (tres pasadas, mejor tiempo).
5. **Resumen del torneo** — podios y medallero de todas las categorías.

El resumen y los podios **se calculan solos** con los resultados de las otras
pantallas: no se editan a mano.

## Formatos oficiales (LNR)

### Mini Sumo y Sumo

- Combate al **mejor de 3 asaltos**, 3 minutos por asalto.
- Gana quien llega primero a **2 Yuhkoh**. Por eso los puntos van de 0 a 2.
- Cuadro de eliminación directa: cuartos → semifinales → final.
- El perdedor de cada semifinal juega el **tercer puesto**.
- El ganador de cada combate **pasa solo** a la ronda siguiente.

### Fútbol de Robots

- Dos tiempos de 3 minutos.
- Fase de grupos: clasifican **1.º y 2.º** de cada grupo.
- Cruces automáticos: **1.º A vs 2.º B** y **1.º B vs 2.º A**.
- En eliminación directa, si hay empate se define **por penales**.
- La final y el tercer puesto se completan solos con los ganadores y perdedores
  de las semifinales.

### Sigue Líneas

- Tres pasadas por robot. Vale el **mejor tiempo**.
- Los tiempos se guardan en milisegundos y la TV los muestra como `12.480 s`.
- La tabla se ordena sola y el podio sale de los tres mejores tiempos.

## Cargar resultados desde el panel

1. Abrí `admin.html` e iniciá sesión con la cuenta de administrador.
2. Bajá hasta la tarjeta **Llaves y posiciones (2.ª TV)**.
3. **Equipos inscriptos** es la lista maestra. Cargá una vez cada robot con su
   institución y su categoría. Los cruces y los tiempos se eligen de ahí: no se
   escriben nombres a mano.
4. Elegí la pantalla en el desplegable y cargá los resultados.
5. Tocá **Guardar en la 2.ª TV**. La TV cambia sola, sin recargar.

### Lo que se edita en cada pantalla

- **Mini Sumo / Sumo:** los equipos de cada combate se eligen con desplegables.
  Cargá los Yuhkoh (0, 1 o 2) y el estado (`Pendiente`, `En vivo`, `Finalizado`).
  Debajo de cada combate, el panel muestra el cruce que se completa solo:
  *“Se completa solo: Titanio vs Furia.”*
- **Fútbol:** elegí los tres equipos de cada grupo y cargá goles y estado de
  cada partido. La tabla de posiciones se actualiza mientras escribís y marca
  en celeste a los clasificados. En las eliminatorias solo se cargan goles,
  penales (si empatan) y estado.
- **Sigue Líneas:** elegí el robot y cargá segundos y milésimas de cada pasada.
  El panel muestra el mejor tiempo al instante. Si una pasada no se corrió, se
  deja vacía.
- **Resumen:** no se edita. Muestra el podio calculado de cada categoría.

### Detalles útiles

- **Cambiar el nombre de un equipo** lo actualiza en todas las pantallas, cruces
  y tablas: los partidos guardan el `id` del equipo, no el nombre.
- **Quitar un equipo** pide confirmación y lo borra también de los cruces y de
  la tabla de tiempos.
- **Agregar o quitar rondas, combates, grupos, partidos y filas de tiempos**
  con los botones `+ Ronda`, `+ Combate`, `+ Grupo`, `+ Partido`, `+ Robot`.
- **Segundos por pantalla** controla la rotación del carrusel (5 a 300).
- **Recargar** trae lo último de la nube y descarta los cambios sin guardar.
- Si otro dispositivo guardó mientras editabas, el panel avisa antes de pisar
  esos cambios.
- El pie de `brackets.html` muestra la **fecha y hora real** del último guardado.
- Solo la cuenta administrador puede guardar. Los invitados y las TVs solo leen.

> La primera vez, si la nube está vacía, el panel carga el torneo de ejemplo de
> `brackets-data.js`. Al tocar **Guardar** se publica en la 2.ª TV.

## Carrusel y opciones por URL

Tiempo por pantalla: se cambia desde el panel (5 a 300 segundos). Sin panel,
queda el valor de `rotacionSegundos` en `brackets-data.js` (18 s por defecto).

- `brackets.html?seg=25` → fuerza 25 segundos por pantalla.
- `brackets.html?slide=3` → arranca en la tercera pantalla (Fútbol).
- `brackets.html?tema=claro` → versión clara (por defecto es oscura).

Controles de teclado: **← →** cambian de pantalla, **ESPACIO** pausa o reanuda,
**F** entra o sale de pantalla completa. También se puede hacer clic en los
puntos del pie.

## El documento de datos (versión 2)

Todo el estado viaja en un solo documento JSON. Es el mismo formato en la nube,
en el respaldo local y en la caché del navegador.

```js
const bracketsEvento = {
    version: 2,
    rotacionSegundos: 18,
    actualizadoEn: "27/10/2026 · 21:30",   // solo se usa sin Supabase
    sede: "Nave Cultural · Mendoza",

    equipos: [
        { id: "ms-titanio", nombre: "Titanio", institucion: "E.E.S.T. N° 4", categoria: "mini-sumo" }
    ],

    categorias: [ /* una entrada por pantalla */ ]
};
```

Categorías válidas de equipo: `mini-sumo`, `sumo`, `futbol`, `sigue-lineas`.

Tipos de pantalla (`tipo`): `llaves`, `futbol`, `tiempos`, `resumen`.

### Llaves

```js
{
    id: "mini-sumo",
    tipo: "llaves",
    titulo: "MINI SUMO",
    fase: "CUARTOS · SEMIFINALES · FINAL",
    acento: "#00ffff",
    equipos: "mini-sumo",          // categoría de la lista maestra
    unidad: "Yuhkoh",
    nota: "Eliminación directa · mejor de 3 asaltos",
    rondas: [
        {
            nombre: "CUARTOS DE FINAL",
            partidos: [
                { equipoA: "ms-titanio", equipoB: "ms-escorpion", puntosA: 2, puntosB: 0, estado: "finalizado" }
            ]
        }
    ],
    tercerPuesto: { equipoA: null, equipoB: null, puntosA: null, puntosB: null, estado: "pendiente" }
}
```

- `estado`: `pendiente` | `en_curso` | `finalizado`.
- Un combate finalizado con puntos distintos define al ganador solo.
- Si hace falta forzarlo, se puede guardar `ganador: "A"` o `"B"`.
- Los equipos de las rondas siguientes pueden quedar en `null`: se completan
  con los ganadores de la ronda anterior.
- `tercerPuesto` se completa con los perdedores de las semifinales.

### Fútbol

```js
{
    id: "futbol",
    tipo: "futbol",
    equipos: "futbol",
    grupos: [
        {
            nombre: "GRUPO A",
            equipos: ["fu-robogol", "fu-fieras", "fu-condores"],
            partidos: [
                { equipoA: "fu-robogol", equipoB: "fu-fieras", golesA: 4, golesB: 1, estado: "finalizado" }
            ]
        }
    ],
    playoffs: {
        semifinales: [
            { equipoA: null, equipoB: null, golesA: null, golesB: null, penalesA: null, penalesB: null, estado: "pendiente" }
        ],
        final: { /* mismo formato */ },
        tercerPuesto: { /* mismo formato */ }
    }
}
```

La tabla de cada grupo se calcula con los partidos **finalizados**: 3 puntos por
victoria, 1 por empate; desempata diferencia de gol, goles a favor y nombre.
Los clasificados aparecen recién cuando el grupo está completo.

### Tiempos

```js
{
    id: "sigue-lineas",
    tipo: "tiempos",
    equipos: "sigue-lineas",
    entradas: [
        { equipo: "sl-bolido", tiempos: [12480, 12510, 12390] }
    ]
}
```

Los tiempos van en **milisegundos**. `null` es una pasada no corrida. La tabla
se ordena por el menor tiempo válido.

### Resumen

```js
{ id: "resumen", tipo: "resumen", titulo: "RESUMEN DEL TORNEO", acento: "#ff3366" }
```

No tiene datos propios: recorre las demás pantallas y arma los podios.

## Respaldo local (sin Supabase)

Si todavía no configuraste Supabase, la pantalla usa `brackets-data.js`. Abrí
ese archivo, editá y guardá; después recargá la TV con **F5** (o `Ctrl + F5`).
Cuando hay datos guardados en la nube, esos tienen prioridad sobre el archivo
local.

## Cómo empezar de cero en la nube

Si cambiaste la estructura del documento o querés descartar lo guardado:

1. En Supabase → **SQL Editor**:

   ```sql
   delete from public.llaves;
   ```

2. Abrí `admin.html`, verificá que cargue el torneo de ejemplo y tocá
   **Guardar en la 2.ª TV**.

La caché vieja del navegador se descarta sola: la versión 2 usa una clave de
caché distinta (`webliga-llaves-cache-v2`).

## Problemas frecuentes

- **“La tabla de llaves todavía no existe”**: falta ejecutar
  `supabase/llaves.sql` (ver [`GUIA-SUPABASE.md`](GUIA-SUPABASE.md)).
- **“La cuenta no tiene permisos”**: el correo del SQL no coincide con el
  usuario que inició sesión.
- **La TV no cambia**: esperá 30 segundos (respaldo automático) o recargala una
  vez. Verificá que tenga internet.
- **Aparece un equipo como “(otra categoría)”**: se cambió la categoría de un
  equipo que ya estaba en un cruce. Corregí el cruce o volvé a asignarlo.

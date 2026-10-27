# Guía de Supabase · Horarios compartidos WebLiga

Esta guía explica cómo conectar el tablero a Supabase para que los cambios de
horario que hace el administrador se vean **al instante** en la TV y en todos los
celulares, sin volver a subir la web.

Tiempo estimado de puesta en marcha: **20 a 30 minutos**, una sola vez.

---

## Cómo funciona

```
                 login + guardar cambios
  admin.html  ───────────────────────────►  Supabase
  (solo vos)                                  │
                                              │  Realtime (instantáneo)
                                              │  + consulta cada 30 s (respaldo)
                                              ▼
                              index.html  (TV y celulares)
                                   ▲
                                   │
                          QR impreso / en pantalla
```

- `index.html` es la página pública: **solo lectura**, sin botones de edición.
- `admin.html` es la página de administración: pide correo y contraseña.
- En Supabase se guardan **solo los cambios** (hora de inicio, hora de fin y si
  el evento terminó). Los horarios base siguen en `datos.js`.
- Si un evento no tiene cambios guardados, se usa el horario original.
- Cada dispositivo guarda una copia local: si se corta internet, sigue mostrando
  el último estado conocido y se reconecta solo.

> **Importante:** la página sigue siendo estática y se publica en GitHub Pages.
> No hay que contratar hosting ni servidor propio.

---

## Paso 1 · Crear el proyecto en Supabase

1. Entrá a <https://supabase.com> y creá una cuenta gratuita (podés usar GitHub).
2. En el panel, elegí **New project**.
3. Completá:
   - **Name:** `webliga` (o el nombre que quieras).
   - **Database Password:** una contraseña larga. Guardala en un lugar seguro
     (no se usa en la web, pero la vas a necesitar para administrar la base).
   - **Region:** la más cercana a Argentina (por ejemplo, `South America (São Paulo)`).
   - **Plan:** Free.
4. Esperá 1 o 2 minutos a que el proyecto termine de crearse.

> El plan gratuito **pausa el proyecto después de varios días sin actividad**.
> Antes del evento entrá al panel y, si dice *Paused*, tocá **Restore project**.
> La guía incluye esta verificación en la lista del día del evento.

---

## Paso 2 · Crear la tabla y la seguridad

1. En el panel de Supabase, abrí **SQL Editor** (barra lateral izquierda).
2. Tocá **New query**.
3. Abrí el archivo `supabase/schema.sql` de este proyecto y copiá **todo** su
   contenido en el editor.
4. Buscá las **4 apariciones de `ADMIN_EMAIL`** dentro de las políticas y
   reemplazá **solo ese texto** por el correo con el que vas a iniciar sesión.
   - No toques las comillas ni el `lower(...)` que ya están escritos.
   - Ejemplo: la política debe quedar `lower('luis@escuela.edu')`.
   - El mismo correo va en las 4 políticas (insertar, actualizar y borrar).
   - No hace falta que el usuario exista todavía: lo creás en el paso 3.
5. Tocá **Run** (o `Ctrl + Enter`). Tiene que terminar sin errores.
6. Verificá en **Table Editor** que aparezca la tabla `horarios`, vacía.

Qué hace ese SQL:

- Crea la tabla `public.horarios` con validaciones de formato de hora.
- Activa **Row Level Security (RLS)**: todos pueden leer, solo el correo
  administrador puede escribir.
- Agrega un trigger que actualiza la fecha de modificación automáticamente.
- Suma la tabla a **Realtime** para que los cambios se avisen al instante.

> Si más adelante cambiás el correo del administrador, volvé a ejecutar el mismo
> SQL con el correo nuevo. Las políticas se recrean sin borrar los datos.

---

## Paso 3 · Crear el usuario administrador

1. En Supabase, abrí **Authentication → Users**.
2. Tocá **Add user → Create new user**.
3. Completá:
   - **Email:** el mismo correo que pusiste en las políticas del paso 2.
   - **Password:** una contraseña segura (mínimo 6 caracteres).
   - **Auto Confirm User:** activado. Esto evita tener que confirmar por correo.
4. Tocá **Create user**.

**Recomendado:** desactivá el registro público para que nadie más pueda crearse
una cuenta.

1. Andá a **Authentication → Providers → Email**.
2. Desactivá **Allow new users to sign up** (o *Enable sign-ups*).
3. Guardá los cambios.

Con eso, la única cuenta que puede iniciar sesión es la que creaste desde el
panel. Los invitados nunca ven el login.

> Si te olvidás la contraseña, podés cambiarla desde **Authentication → Users →
> menú del usuario → Reset password** o crear otro usuario administrador y
> actualizar el correo en el SQL.

---

## Paso 4 · Conectar la web con el proyecto

1. En Supabase, abrí **Project Settings → API** (o **API Keys**).
2. Copiá estos dos datos:
   - **Project URL**: algo como `https://abcdefghijkl.supabase.co`
   - **anon public key**: una clave larga que empieza con `eyJ...` o, en los
     proyectos nuevos, con `sb_publishable_...`.
3. Abrí el archivo `supabase-config.js` y completá:

```js
window.WEBLIGA_CONFIG = {
    supabaseUrl: 'https://abcdefghijkl.supabase.co',
    supabaseAnonKey: 'eyJhbGciOi...',   // o sb_publishable_...

    urlPublica: 'https://lu92123.github.io/Web-LNR/'
};
```

4. Guardá el archivo.

> **La clave `anon` es pública** y se puede ver en el navegador: no es una
> contraseña. La seguridad la dan las políticas RLS del paso 2.
>
> **Nunca** pongas la clave `service_role` en la web. Esa clave saltea toda la
> seguridad y solo debe usarse desde el panel de Supabase.

### Sobre `urlPublica`

Es la dirección que se codifica en el QR. Tiene que ser la página pública del
tablero (`index.html`). Si usás otro dominio o repositorio, cambiala y volvé a
generar el QR. Un QR ya impreso no se puede modificar: hay que imprimir uno nuevo.

---

## Paso 5 · Publicar en GitHub Pages

1. Guardá los cambios y subilos al repositorio:

```bash
git add .
git commit -m "Horarios compartidos con Supabase"
git push
```

2. Esperá entre 30 y 60 segundos a que GitHub Pages publique la versión nueva.
3. Abrí:
   - Tablero público: `https://lu92123.github.io/Web-LNR/`
   - Administración: `https://lu92123.github.io/Web-LNR/admin.html`
   - QR: `https://lu92123.github.io/Web-LNR/qr.html`

Si ves la versión anterior, recargá con `Ctrl + F5` (o borrá la caché del
navegador). En el celular, cerrá y volvé a abrir la pestaña.

> La primera vez que cargue el tablero, en la esquina del plano tiene que
> aparecer **EN VIVO** en verde. Si no aparece, revisá el paso 4 y la consola del
> navegador (`F12 → Console`).

---

## Paso 6 · Probar el circuito completo

1. Abrí `admin.html` en la computadora principal.
2. Iniciá sesión con el correo y la contraseña del paso 3.
3. Cambiá el horario de un evento y tocá **Guardar**.
4. Abrí el tablero en otro dispositivo (o en otra pestaña) y verificá que el
   cambio aparezca **sin recargar**.
5. Marcá un evento como **Finalizado** y confirmá que se vea el cartel.
6. Tocá **Restablecer** en esa fila para volver al horario original.

Si algo falla, mirá la sección [Solución de problemas](#solución-de-problemas).

---

## Paso 7 · Mostrar e imprimir el QR

El QR apunta siempre a la dirección de `urlPublica`.

- Desde `admin.html`, la tarjeta **QR para los participantes** muestra una vista
  previa. Podés:
  - **Abrir pantalla completa**: `qr.html`, ideal para proyectar o mostrar en la TV.
  - **Descargar SVG**: se puede imprimir en gran tamaño sin perder calidad.
  - **Imprimir**: abre `qr.html?print=1` y lanza el diálogo de impresión.
- También podés abrir `qr.html` directamente y tocar **Imprimir**.
- El QR se genera en el propio navegador: no depende de ningún servicio externo.

**Sugerencia:** imprimí dos copias (mesa de inscripción y entrada) y probá
escanearlas con un celular antes del evento.

---

## Lista de verificación para el día del evento

- [ ] Entrar a Supabase y confirmar que el proyecto **no esté pausado**.
- [ ] Abrir `admin.html` en la computadora principal e iniciar sesión.
- [ ] Confirmar que el indicador diga **EN VIVO**.
- [ ] Hacer un cambio de prueba y verlo en la TV y en un celular.
- [ ] Restablecer el cambio de prueba.
- [ ] Desactivar la suspensión de la computadora principal y dejarla enchufada.
- [ ] Verificar que la TV y los celulares tengan datos móviles o Wi-Fi.
- [ ] Escanear el QR impreso y confirmar que abre el tablero.
- [ ] Descargar una copia de respaldo (JSON) desde `admin.html`.

Durante el evento:

- Los cambios se publican al instante. Si un dispositivo no se actualiza,
  esperá 30 segundos (respaldo automático) o recargá una vez.
- Si se corta internet, el tablero sigue mostrando la última copia y el badge
  cambia a **SIN CONEXIÓN**. Al volver la señal se reconecta solo.
- Si cambiás un horario desde otro dispositivo, el panel de administración avisa
  que hay cambios nuevos antes de pisar lo que estabas editando.

---

## Solución de problemas

### El tablero no muestra EN VIVO

- Revisá que `supabase-config.js` tenga la URL y la clave correctas.
- Confirmá que el archivo se haya publicado (abrilo directo en GitHub Pages).
- Mirá la consola: si dice *Falta configurar Supabase*, la configuración está vacía.
- Si dice *Failed to fetch*: no hay internet, el proyecto está pausado o la URL
  está mal escrita.
- Si dice *relation "public.horarios" does not exist*: no se ejecutó el SQL del
  paso 2 o se ejecutó en otro proyecto.

### No puedo iniciar sesión

- **Correo o contraseña incorrectos:** revisá mayúsculas y espacios. Si hace
  falta, cambiá la contraseña desde Supabase.
- **Falta confirmar el correo:** el usuario se creó sin *Auto Confirm User*.
  Editalo desde **Authentication → Users** o creá otro usuario confirmado.
- **Failed to fetch:** sin conexión o proyecto pausado.
- **Falta completar supabase-config.js:** el archivo sigue con los valores vacíos
  o no se publicó la versión nueva.

### Guardar muestra "La cuenta no tiene permisos de administrador"

El correo con el que iniciaste sesión no coincide con el de las políticas.

1. Abrí **Authentication → Users** y mirá el correo exacto.
2. Ejecutá de nuevo `supabase/schema.sql` reemplazando `ADMIN_EMAIL` por ese
   correo.
3. Recargá `admin.html` e intentá otra vez (no hace falta cerrar sesión).

### El cambio se guarda pero la TV no se actualiza

- Esperá hasta 30 segundos: hay una consulta de respaldo además de Realtime.
- Verificá que la TV tenga internet y que el badge no diga **SIN CONEXIÓN**.
- Si el badge dice **EN VIVO** pero el dato no cambia, recargá la TV una vez.
- En redes muy restrictivas, Realtime puede estar bloqueado; el respaldo de 30
  segundos igual mantiene todo sincronizado.

### El proyecto está pausado

- Entrá a <https://supabase.com/dashboard>, abrí el proyecto y tocá
  **Restore project**.
- Esperá unos minutos y recargá el tablero.

### El QR abre una dirección vieja

- Editá `urlPublica` en `supabase-config.js`, publicá de nuevo y generá otro QR.
- Los QR ya impresos no se actualizan solos.

### El campo de hora muestra AM/PM

Es el formato del navegador. Los datos se guardan igual en formato de 24 horas
(`HH:MM`) y el tablero los muestra en 24 horas.

### "new row violates check constraint"

La hora de inicio debe ser anterior a la hora de fin. Corregí los valores y
volvé a guardar.

### La página de administración queda en blanco

- Abrí la consola (`F12`) y mirá el primer error.
- Confirmá que existan `lib/supabase.js`, `supabase-config.js` y `horarios-sync.js`
  en el servidor.
- Verificá que `supabase-config.js` no tenga errores de comillas o comas.

---

## Seguridad y privacidad

- **Lectura pública:** cualquiera con el enlace puede ver los horarios. Es lo
  esperado: el QR es para los participantes.
- **Escritura protegida:** solo el correo administrador puede insertar,
  actualizar o borrar filas. Lo garantiza RLS en la base, no solo la interfaz.
- **La clave `anon` es pública.** No pasa nada si alguien la ve; no puede escribir.
- **Nunca publiques la clave `service_role`.**
- **Desactivá el registro público** (paso 3) para que nadie cree cuentas.
- **No compartas `admin.html`** ni la contraseña. El QR debe apuntar siempre a
  `index.html`.
- Los datos que se guardan son únicamente horarios y el correo de quien hizo el
  cambio. No se guardan datos de los participantes.

---

## Límites del plan gratuito

Para este evento son más que suficientes:

- Base de datos: 500 MB (acá se guardan unas pocas filas).
- Transferencia: 5 GB por mes.
- Realtime: hasta 200 conexiones simultáneas.
- Usuarios: hasta 50.000 usuarios activos por mes (solo usás uno).

El único punto a tener en cuenta es la **pausa por inactividad**. Se evita
entrando al panel unos días antes del evento.

---

## Archivos que participan

| Archivo | Función |
| --- | --- |
| `index.html` | Tablero público (TV y celulares). |
| `script.js` | Render, reloj, mapa y sincronización del tablero. |
| `horarios-sync.js` | Cliente de Supabase: lectura, Realtime, polling, caché y escritura. |
| `supabase-config.js` | URL, clave pública y dirección del QR. |
| `admin.html` / `admin.js` / `admin.css` | Panel de administración con login. |
| `qr.html` / `qr.js` / `qr-comun.js` | Pantalla e impresión del QR. |
| `supabase/schema.sql` | Tabla, RLS, trigger y Realtime. |
| `lib/supabase.js` | SDK de Supabase (versión fija, sin CDN). |
| `lib/qrcode-generator.js` | Generador de QR local. |
| `datos.js` | Horarios base y helpers de hora. |

---

## Cómo volver atrás

Si algún día querés dejar de usar Supabase:

1. Borrá las líneas de `<script>` de Supabase en `index.html` y `admin.html`.
2. El tablero seguirá funcionando con los horarios de `datos.js`.
3. Los cambios guardados quedan en Supabase; podés exportarlos desde el panel o
   descargar el JSON de respaldo desde `admin.html`.

Para borrar todos los cambios y volver a los horarios base:

```sql
delete from public.horarios;
```

O usá el botón **Restablecer todo** del panel de administración (hace lo mismo
desde la web).

/**
 * Lógica principal del tablero WebLiga
 * Maneja reloj, comparación de horarios, estados simultáneos y renderizado dinámico
 */

// Último evento activo (referencia interna)
let ultimoEventoActivoId = null;

// Modo debug para modificar la hora (5 clics sobre el reloj)
let debugHoraActiva = false;
let debugHoraValor = null;
let debugClicks = 0;

// Modificaciones de horarios.
// Se cargan desde Supabase (o desde la última copia guardada) y se comparten
// entre todos los dispositivos. Las ediciones se hacen en admin.html.
// { [eventoId]: { horaInicio?: string, horaFin?: string, finalizado?: boolean } }
let eventosModificados = {};

// Firma del último conjunto de cambios aplicado. Evita volver a dibujar el
// cronograma cuando el polling trae exactamente los mismos datos.
let ultimaFirmaOverrides = null;

// Aviso para notificaciones importantes. Se escribe desde el panel admin,
// se guarda en Supabase y aparece en todos los dispositivos.
let ultimaFirmaAviso = null;

// Inicializar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function () {
    inicializarTema();

    // Mostrar de entrada la última copia conocida (si existe) para que la TV
    // no parpadee con los horarios por defecto mientras conecta.
    if (window.HorariosSync && HorariosSync.estaConfigurado()) {
        const cache = HorariosSync.leerCache();
        if (cache && cache.overrides) {
            eventosModificados = cache.overrides;
        }
    }

    // Idem para el aviso: mostrar el último conocido sin esperar la red.
    if (window.HorariosSync && typeof HorariosSync.leerCacheAviso === 'function') {
        const cacheAviso = HorariosSync.leerCacheAviso();
        if (cacheAviso) {
            aplicarAviso(cacheAviso.activo && cacheAviso.texto ? cacheAviso : null);
        }
    }

    // Renderizar cronograma inicial
    renderizarCronograma();

    // Inicializar interacciones
    inicializarDebugReloj();
    inicializarThemeToggle();
    inicializarZoomMapa();
    inicializarSincronizacion();

    // Reloj en vivo
    actualizarReloj();
    setInterval(actualizarReloj, 1000);

    // Estado de eventos (cada 15 segundos alcanza para cambios por minuto)
    actualizarEstadoEventos();
    setInterval(actualizarEstadoEventos, 15000);
});

/* ------------------------------------------------------------------ */
/* Tema claro / oscuro                                                */
/* ------------------------------------------------------------------ */

function inicializarTema() {
    const temaGuardado = localStorage.getItem('webliga-theme');
    document.documentElement.setAttribute(
        'data-theme',
        temaGuardado === 'dark' ? 'dark' : 'light'
    );
}

function inicializarThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;

    const actualizarBoton = () => {
        const tema = document.documentElement.getAttribute('data-theme') || 'light';
        themeToggle.textContent = tema === 'dark' ? '☀️ Modo Claro' : '🌙 Modo Oscuro';
    };

    actualizarBoton();

    themeToggle.addEventListener('click', function () {
        const tema = document.documentElement.getAttribute('data-theme') || 'light';
        const nuevoTema = tema === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', nuevoTema);
        localStorage.setItem('webliga-theme', nuevoTema);
        actualizarBoton();
    });
}

/* ------------------------------------------------------------------ */
/* Reloj y modo debug                                                 */
/* ------------------------------------------------------------------ */

function inicializarDebugReloj() {
    const liveClock = document.getElementById('liveClockDebug');
    const timeInput = document.getElementById('timeDebugInput');

    if (liveClock) {
        liveClock.addEventListener('click', function (e) {
            if (e.target === timeInput) return;

            debugClicks++;
            if (debugClicks >= 5) {
                debugClicks = 0;
                if (timeInput) {
                    timeInput.classList.add('active');
                    timeInput.focus();
                    if (debugHoraValor) {
                        timeInput.value = debugHoraValor;
                    } else {
                        const ahora = obtenerHoraActualString();
                        timeInput.value = ahora;
                    }
                }
            }
        });
    }

    if (timeInput) {
        timeInput.addEventListener('change', function () {
            if (!this.value) return;
            debugHoraActiva = true;
            debugHoraValor = this.value;
            actualizarReloj();
            actualizarEstadoEventos();
        });
    }
}

function obtenerHoraActualStringDebug() {
    if (debugHoraActiva && debugHoraValor) {
        return debugHoraValor;
    }
    return obtenerHoraActualString();
}

function actualizarReloj() {
    const clockElement = document.getElementById('digitalClock');
    if (!clockElement) return;

    if (debugHoraActiva && debugHoraValor) {
        const [horas, minutos] = debugHoraValor.split(':');
        const segundos = String(new Date().getSeconds()).padStart(2, '0');
        clockElement.textContent = `${horas}:${minutos}:${segundos}`;
    } else {
        clockElement.textContent = obtenerHoraConSegundos();
    }
}

/* ------------------------------------------------------------------ */
/* Eventos: datos efectivos y estados                                 */
/* ------------------------------------------------------------------ */

/**
 * Devuelve el evento con las modificaciones manuales aplicadas (si las hay).
 * No altera el objeto original del array.
 */
function obtenerEventoModificado(evento) {
    const mod = eventosModificados[evento.id];
    return {
        ...evento,
        horaInicio: (mod && mod.horaInicio) || evento.horaInicio,
        horaFin: (mod && mod.horaFin) || evento.horaFin,
        finalizado: !!(mod && mod.finalizado)
    };
}

/**
 * Estado de un evento respecto de una hora dada.
 * @returns {'activo'|'finalizado'|'proximo'}
 */
function obtenerEstadoEvento(eventoOriginal, ahoraMinutos) {
    const ev = obtenerEventoModificado(eventoOriginal);
    const inicio = horaAMinutos(ev.horaInicio);
    const fin = horaAMinutos(ev.horaFin);

    if (ev.finalizado) return 'finalizado';
    if (ahoraMinutos >= fin) return 'finalizado';
    if (ahoraMinutos >= inicio) return 'activo';
    return 'proximo';
}

/**
 * Devuelve true si la hora actual cae dentro de la franja programada del evento
 * (sin importar si se marcó como finalizado antes de tiempo).
 */
function estaEnVentanaHoraria(meta, ahoraMinutos) {
    return (
        ahoraMinutos >= horaAMinutos(meta.horaInicio) &&
        ahoraMinutos < horaAMinutos(meta.horaFin)
    );
}

/* ------------------------------------------------------------------ */
/* Cronograma                                                         */
/* ------------------------------------------------------------------ */

function renderizarCronograma() {
    const scheduleList = document.getElementById('scheduleList');
    if (!scheduleList) return;

    scheduleList.innerHTML = '';

    // Ordenar por hora de inicio efectiva (incluye cambios manuales).
    // Ante horarios iguales se mantiene el orden original del día.
    const eventosOrdenados = eventos
        .map((evento, indice) => ({
            evento,
            meta: obtenerEventoModificado(evento),
            indice
        }))
        .sort((a, b) => {
            const diferencia = horaAMinutos(a.meta.horaInicio) - horaAMinutos(b.meta.horaInicio);
            return diferencia !== 0 ? diferencia : a.indice - b.indice;
        });

    eventosOrdenados.forEach(({ evento, meta }) => {

        const item = document.createElement('div');
        item.className = 'schedule-item';
        item.dataset.eventoId = evento.id;

        item.innerHTML = `
            <div class="schedule-time">
                ${meta.horaInicio}<br>
                <small class="schedule-time-end">${meta.horaFin}</small>
            </div>
            <div class="schedule-content">
                <div class="schedule-title">${escapeHtml(evento.titulo)}</div>
                <div class="schedule-zone">${escapeHtml(evento.zona)}</div>
            </div>
            <div class="schedule-status"></div>
        `;

        scheduleList.appendChild(item);
    });
}

function refrescarVista() {
    renderizarCronograma();
    actualizarEstadoEventos();
}

/* ------------------------------------------------------------------ */
/* Sincronización con Supabase                                        */
/* ------------------------------------------------------------------ */

function inicializarSincronizacion() {
    if (!window.HorariosSync) return;

    const badge = document.getElementById('syncStatus');

    if (!HorariosSync.estaConfigurado()) {
        if (badge) badge.hidden = true;
        return;
    }

    if (badge) {
        badge.hidden = false;
        badge.dataset.estado = 'sincronizando';
    }

    HorariosSync.iniciar({
        alCambiar: function (overrides) {
            const firma = firmaOverrides(overrides);
            eventosModificados = overrides || {};

            if (firma === ultimaFirmaOverrides) return;

            ultimaFirmaOverrides = firma;
            refrescarVista();
        },
        alAviso: function (aviso) {
            aplicarAviso(aviso);
        },
        alEstado: function (estado) {
            actualizarIndicadorSync(estado);
        }
    });
}

/**
 * Muestra u oculta el aviso para notificaciones importantes.
 * El aviso se edita desde admin.html y llega por Supabase (Realtime + caché).
 */
function aplicarAviso(aviso) {
    const banner = document.getElementById('avisoBanner');
    if (!banner) return;

    const texto = banner.querySelector('.aviso-texto');
    const firma = aviso && aviso.texto ? String(aviso.texto) : '';

    if (firma === ultimaFirmaAviso) return;
    ultimaFirmaAviso = firma;

    if (!aviso) {
        banner.hidden = true;
        banner.title = '';
        return;
    }

    if (texto) texto.textContent = aviso.texto;

    let marca = 'Aviso para todos los participantes';
    if (aviso.actualizadoEn) {
        try {
            marca += ' · actualizado ' + new Date(aviso.actualizadoEn).toLocaleString('es-AR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            // Fecha inválida: solo el texto genérico
        }
    }

    banner.hidden = false;
    banner.title = marca;
}

function firmaOverrides(overrides) {
    return Object.keys(overrides || {})
        .sort()
        .map(function (id) {
            const dato = overrides[id] || {};
            return id + ':' + dato.horaInicio + '|' + dato.horaFin + '|' + (dato.finalizado ? '1' : '0');
        })
        .join(';');
}

function actualizarIndicadorSync(estado) {
    const badge = document.getElementById('syncStatus');
    if (!badge) return;

    const label = badge.querySelector('.sync-label');

    if (estado === 'sin-configurar') {
        badge.hidden = true;
        return;
    }

    badge.hidden = false;
    badge.dataset.estado = estado;

    const formatearHora = function (fecha) {
        if (!fecha) return '';
        try {
            return new Date(fecha).toLocaleTimeString('es-AR', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return '';
        }
    };

    if (estado === 'conectado') {
        const hora = formatearHora(HorariosSync.obtenerUltimaSync());
        if (label) label.textContent = 'EN VIVO';
        badge.title = 'Horarios sincronizados' + (hora ? ' · última actualización ' + hora : '');
        return;
    }

    if (estado === 'sin-conexion') {
        const cache = HorariosSync.leerCache();
        const hora = cache ? formatearHora(cache.guardadoEn) : '';
        if (label) label.textContent = 'SIN CONEXIÓN';
        badge.title = 'Sin conexión. Mostrando la última copia guardada' +
            (hora ? ' (' + hora + ')' : '') +
            '. Se reintenta automáticamente.';
        return;
    }

    if (label) label.textContent = 'SINCRONIZANDO';
    badge.title = 'Conectando con el servidor de horarios…';
}

/* ------------------------------------------------------------------ */
/* Mapa SVG                                                           */
/* ------------------------------------------------------------------ */

/**
 * Zoom del mapa.
 *
 * El zoom se hace cambiando el viewBox del SVG en vez de escalarlo con CSS:
 * así el navegador vuelve a dibujar el plano (vectorial) en cada nivel de
 * zoom y se mantiene nítido a cualquier escala. Escalar con transform
 * rasteriza el plano primero y después lo estira, por eso se veía borroso.
 *
 * Mouse (punteros finos):
 * - Al entrar se aplica un zoom pequeño (15%) centrado en el cursor.
 * - La rueda regula el nivel entre 1x y 3x.
 * - Al mover el mouse la zona apuntada queda debajo del cursor.
 * - Al salir vuelve al tamaño original.
 *
 * Touch (celulares y tablets):
 * - Dos dedos: pellizcar para ampliar (1x–3x) y mover el punto medio para
 *   desplazar el plano al mismo tiempo.
 * - Un dedo con zoom activo: arrastrar para recorrer el plano.
 * - Sin zoom, el deslizamiento vertical sigue scrolleando la página.
 * - El botón "Ver todo" restablece la vista completa.
 *
 * Funciona igual en modo claro y oscuro.
 */
function inicializarZoomMapa() {
    const contenedor = document.querySelector('.map-container');
    const svg = contenedor && contenedor.querySelector('svg');
    if (!contenedor || !svg) return;

    const botonReset = contenedor.querySelector('.map-zoom-reset');

    const ZOOM_HOVER = 1.15; // pequeño zoom inicial
    const ZOOM_MIN = 1;
    const ZOOM_MAX = 3;

    // Vista base: la que define el atributo viewBox del SVG en el HTML
    const base = svg.viewBox.baseVal;
    const VISTA_BASE = {
        x: base.x,
        y: base.y,
        ancho: base.width,
        alto: base.height
    };

    // Vista actual (la porción del plano visible)
    let vista = { x: VISTA_BASE.x, y: VISTA_BASE.y, ancho: VISTA_BASE.ancho, alto: VISTA_BASE.alto };

    // Seguimiento del mouse
    let ultimoMouse = null;
    let framePendiente = null;
    let ultimoToque = -10000;

    // Estado de los gestos táctiles
    let toques = [];
    let modoTouch = null; // 'pan' | 'pinch' | null
    let pinch = null;
    let arrastre = null;

    const zoomActual = () => VISTA_BASE.ancho / vista.ancho;

    const rectangulo = () => contenedor.getBoundingClientRect();

    // Cuántos píxeles de pantalla ocupa cada unidad del viewBox.
    // El SVG se ajusta con "meet": cabe completo y sobra margen si las
    // proporciones del contenedor no coinciden con las del plano.
    const ajuste = (v, rect) => Math.min(rect.width / v.ancho, rect.height / v.alto);

    // Convierte un punto de pantalla a coordenadas del viewBox dado
    const aCoordenada = (clientX, clientY, v, rect) => {
        const factor = ajuste(v, rect);
        const margenX = (rect.width - v.ancho * factor) / 2;
        const margenY = (rect.height - v.alto * factor) / 2;
        return {
            x: v.x + (clientX - rect.left - margenX) / factor,
            y: v.y + (clientY - rect.top - margenY) / factor
        };
    };

    // Aplica el recorte al SVG: el navegador vuelve a dibujar el vector, nítido
    const pintar = () => {
        vista.x = Math.min(Math.max(vista.x, VISTA_BASE.x), VISTA_BASE.x + VISTA_BASE.ancho - vista.ancho);
        vista.y = Math.min(Math.max(vista.y, VISTA_BASE.y), VISTA_BASE.y + VISTA_BASE.alto - vista.alto);
        svg.setAttribute('viewBox', [
            vista.x.toFixed(2),
            vista.y.toFixed(2),
            vista.ancho.toFixed(2),
            vista.alto.toFixed(2)
        ].join(' '));
        contenedor.classList.toggle('zoomed', zoomActual() > 1.001);
    };

    // Cambia el zoom manteniendo fijo el punto ancla (coordenada del plano)
    const fijarZoom = (nuevoZoom, ancla) => {
        const z0 = zoomActual();
        const z1 = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nuevoZoom));

        vista.ancho = VISTA_BASE.ancho / z1;
        vista.alto = VISTA_BASE.alto / z1;

        if (ancla) {
            const factor = z0 / z1;
            vista.x = ancla.x - (ancla.x - vista.x) * factor;
            vista.y = ancla.y - (ancla.y - vista.y) * factor;
        }

        if (z1 <= ZOOM_MIN) {
            vista.x = VISTA_BASE.x;
            vista.y = VISTA_BASE.y;
        }

        pintar();
        return z1;
    };

    const reiniciar = () => {
        vista = { x: VISTA_BASE.x, y: VISTA_BASE.y, ancho: VISTA_BASE.ancho, alto: VISTA_BASE.alto };
        modoTouch = null;
        pinch = null;
        arrastre = null;
        pintar();
    };

    /* ---------------- Mouse / rueda ---------------- */

    // Mueve la vista para que la zona que se vea sin zoom quede bajo el cursor
    // (el contenido corre al contrario del mouse, como si "tomara" el plano).
    // Siempre comparando contra la vista base, igual que el zoom anterior.
    const seguirCursor = (clientX, clientY) => {
        const rect = rectangulo();
        const destino = aCoordenada(clientX, clientY, VISTA_BASE, rect);
        const factor = ajuste(vista, rect);
        const margenX = (rect.width - vista.ancho * factor) / 2;
        const margenY = (rect.height - vista.alto * factor) / 2;

        vista.x = destino.x - (clientX - rect.left - margenX) / factor;
        vista.y = destino.y - (clientY - rect.top - margenY) / factor;
        pintar();
    };

    contenedor.addEventListener('mouseenter', function (e) {
        if (performance.now() - ultimoToque < 800) return;
        if (zoomActual() > 1) return;

        fijarZoom(ZOOM_HOVER, aCoordenada(e.clientX, e.clientY, vista, rectangulo()));
    });

    contenedor.addEventListener('mousemove', function (e) {
        if (performance.now() - ultimoToque < 800) return;

        ultimoMouse = { x: e.clientX, y: e.clientY };

        if (framePendiente !== null) return;

        framePendiente = requestAnimationFrame(function () {
            framePendiente = null;

            if (zoomActual() <= 1 || !ultimoMouse) return;

            seguirCursor(ultimoMouse.x, ultimoMouse.y);
        });
    });

    contenedor.addEventListener('mouseleave', function () {
        if (performance.now() - ultimoToque < 800) return;

        if (framePendiente !== null) {
            cancelAnimationFrame(framePendiente);
            framePendiente = null;
        }

        ultimoMouse = null;

        if (zoomActual() > 1) reiniciar();
    });

    contenedor.addEventListener('wheel', function (e) {
        e.preventDefault();

        // Normalizar el delta para que la rueda responda igual en todos los navegadores
        const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        const factor = Math.exp(-delta * 0.0015);

        fijarZoom(zoomActual() * factor, aCoordenada(e.clientX, e.clientY, vista, rectangulo()));
    }, { passive: false });

    /* ---------------- Touch ---------------- */

    const leerToques = (lista) => Array.from(lista).map(t => ({
        id: t.identifier,
        x: t.clientX,
        y: t.clientY
    }));

    const guardarArrastre = (x, y) => ({
        x: x,
        y: y,
        vista: { x: vista.x, y: vista.y, ancho: vista.ancho, alto: vista.alto },
        factor: ajuste(vista, rectangulo())
    });

    const iniciarPinch = () => {
        if (toques.length < 2) return;

        const [a, b] = toques;
        const medioX = (a.x + b.x) / 2;
        const medioY = (a.y + b.y) / 2;
        const vistaInicial = { x: vista.x, y: vista.y, ancho: vista.ancho, alto: vista.alto };

        pinch = {
            distancia: Math.hypot(b.x - a.x, b.y - a.y) || 1,
            medioX: medioX,
            medioY: medioY,
            punto: aCoordenada(medioX, medioY, vistaInicial, rectangulo()),
            vista: vistaInicial
        };
        modoTouch = 'pinch';
        arrastre = null;
    };

    // Los toques sobre el botón "Ver todo" no deben iniciar gestos del mapa
    const esBotonReset = (e) => botonReset && e.target instanceof Element && botonReset.contains(e.target);

    contenedor.addEventListener('touchstart', function (e) {
        ultimoToque = performance.now();
        toques = leerToques(e.touches);

        if (esBotonReset(e)) {
            modoTouch = null;
            pinch = null;
            arrastre = null;
            return;
        }

        if (toques.length >= 2) {
            // El pellizco siempre lo maneja el mapa, nunca la página
            e.preventDefault();
            iniciarPinch();
            return;
        }

        if (toques.length === 1) {
            if (zoomActual() > 1) {
                // Con zoom activo, un dedo arrastra el plano
                e.preventDefault();
                modoTouch = 'pan';
                arrastre = guardarArrastre(toques[0].x, toques[0].y);
            } else {
                // Sin zoom, el gesto queda libre para scrollear la página
                modoTouch = null;
                arrastre = null;
            }
        }
    }, { passive: false });

    contenedor.addEventListener('touchmove', function (e) {
        ultimoToque = performance.now();

        if (e.touches.length >= 2 && pinch) {
            e.preventDefault();

            const [a, b] = Array.from(e.touches);
            const medioX = (a.clientX + b.clientX) / 2;
            const medioY = (a.clientY + b.clientY) / 2;
            const distancia = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);

            const z0 = VISTA_BASE.ancho / pinch.vista.ancho;
            const objetivo = z0 * (distancia / pinch.distancia);
            const z1 = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, objetivo));

            vista.ancho = VISTA_BASE.ancho / z1;
            vista.alto = VISTA_BASE.alto / z1;

            // Mantiene el punto de partida bajo el punto medio actual:
            // pellizcar amplía y mover los dedos desplaza al mismo tiempo
            const factor = z0 / z1;
            vista.x = pinch.punto.x - (pinch.punto.x - pinch.vista.x) * factor;
            vista.y = pinch.punto.y - (pinch.punto.y - pinch.vista.y) * factor;

            // El plano sigue el movimiento del punto medio de los dedos
            const factorPantalla = ajuste(vista, rectangulo());
            vista.x -= (medioX - pinch.medioX) / factorPantalla;
            vista.y -= (medioY - pinch.medioY) / factorPantalla;

            if (z1 <= ZOOM_MIN) {
                vista.x = VISTA_BASE.x;
                vista.y = VISTA_BASE.y;
            }

            pintar();
            return;
        }

        if (modoTouch === 'pan' && arrastre && e.touches.length === 1 && zoomActual() > 1) {
            e.preventDefault();

            const t = e.touches[0];
            vista.x = arrastre.vista.x - (t.clientX - arrastre.x) / arrastre.factor;
            vista.y = arrastre.vista.y - (t.clientY - arrastre.y) / arrastre.factor;
            pintar();
        }
    }, { passive: false });

    contenedor.addEventListener('touchend', function (e) {
        ultimoToque = performance.now();
        toques = leerToques(e.touches);

        // Si queda un dedo apoyado, continúa como arrastre
        if (toques.length === 1 && zoomActual() > 1) {
            pinch = null;
            modoTouch = 'pan';
            arrastre = guardarArrastre(toques[0].x, toques[0].y);
            return;
        }

        if (toques.length === 0) {
            pinch = null;
            modoTouch = null;
            arrastre = null;
        }
    });

    contenedor.addEventListener('touchcancel', function () {
        pinch = null;
        modoTouch = null;
        arrastre = null;
    });

    // iOS Safari: evita el zoom nativo de la página sobre el mapa
    contenedor.addEventListener('gesturestart', function (e) {
        e.preventDefault();
    }, { passive: false });

    if (botonReset) {
        botonReset.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            reiniciar();
        });
    }

    // Si cambia el tamaño de la ventana, vuelve a limitar la vista
    window.addEventListener('resize', function () {
        if (zoomActual() > 1) pintar();
    });
}

function limpiarZonasActivas() {
    document.querySelectorAll('.map-container .zona-activa').forEach(zona => {
        zona.classList.remove('zona-activa');
    });
}

/**
 * Ilumina una o varias zonas del SVG.
 * @param {string|string[]} zonaId
 */
function iluminarZonaActiva(zonaId) {
    if (!zonaId) return;

    const ids = Array.isArray(zonaId) ? zonaId : [zonaId];
    ids.forEach(id => {
        if (!id) return;
        const zona = document.getElementById(id);
        if (zona) zona.classList.add('zona-activa');
    });
}

/* ------------------------------------------------------------------ */
/* Estado general y panel "AHORA MISMO"                               */
/* ------------------------------------------------------------------ */

function actualizarEstadoEventos() {
    const ahoraMinutos = horaAMinutos(obtenerHoraActualStringDebug());
    const currentActivityDiv = document.getElementById('currentActivity');

    limpiarZonasActivas();

    // Calcular el estado de todos los eventos
    const estados = eventos.map(evento => {
        const meta = obtenerEventoModificado(evento);
        return {
            evento,
            meta,
            estado: obtenerEstadoEvento(evento, ahoraMinutos),
            enVentana: estaEnVentanaHoraria(meta, ahoraMinutos)
        };
    });

    // Eventos cuya franja horaria incluye la hora actual.
    // Incluye los marcados como finalizados para poder mostrarlos como "FINALIZÓ".
    const enVentana = estados.filter(info => info.enVentana);
    const activos = enVentana.filter(info => info.estado === 'activo');
    const finalizadosEnVentana = enVentana.filter(info => info.estado === 'finalizado');

    // Eventos que terminaron hace poco (aunque su franja ya haya cerrado).
    // Sirven para que el panel aclare, por ejemplo, que Fútbol terminó
    // mientras otra categoría sigue en vivo.
    const MINUTOS_RECIENTES = 30;
    const finalizadosRecientes = estados.filter(info => {
        if (info.estado !== 'finalizado' || info.enVentana) return false;
        const diferencia = ahoraMinutos - horaAMinutos(info.meta.horaFin);
        return diferencia >= 0 && diferencia <= MINUTOS_RECIENTES;
    });

    // Próximo evento: el más cercano que todavía no empezó y no está finalizado
    const proximo = estados
        .filter(info => info.estado === 'proximo' && !info.meta.finalizado)
        .sort((a, b) => horaAMinutos(a.meta.horaInicio) - horaAMinutos(b.meta.horaInicio))[0] || null;

    // --- Actualizar filas del cronograma ---
    document.querySelectorAll('.schedule-item').forEach(item => {
        const id = Number(item.dataset.eventoId);
        const info = estados.find(x => x.evento.id === id);
        if (!info) return;

        const status = item.querySelector('.schedule-status');
        item.classList.remove('activo', 'past', 'upcoming');
        if (status) status.innerHTML = '';

        if (info.estado === 'activo') {
            item.classList.add('activo');
            if (status) status.innerHTML = '<span class="live-badge">EN VIVO</span>';
        } else if (info.estado === 'finalizado') {
            if (info.meta.finalizado) {
                item.classList.add('done');
                if (status) status.innerHTML = '<span class="done-badge">FINALIZADO</span>';
            } else {
                item.classList.add('past');
            }
        } else {
            item.classList.add('upcoming');
        }
    });

    // --- Iluminar en el mapa todas las zonas activas ---
    activos.forEach(info => iluminarZonaActiva(info.evento.zonaId));

    // --- Panel superior ---
    if (currentActivityDiv) {
        renderizarPanelAhora({ activos, enVentana, finalizadosEnVentana, finalizadosRecientes, proximo });
    }
}

/**
 * Dibuja el panel superior combinando los eventos simultáneos.
 */
function renderizarPanelAhora({ activos, enVentana, finalizadosEnVentana, finalizadosRecientes, proximo }) {
    const cont = document.getElementById('currentActivity');
    const dot = document.querySelector('.now-dot');
    const label = document.querySelector('.now-text');
    if (!cont) return;

    const setIndicador = (texto, color) => {
        if (dot) {
            dot.style.background = color;
            dot.style.boxShadow = 'none';
        }
        if (label) {
            label.textContent = texto;
            label.style.color = color;
        }
    };

    // Caso 1: hay al menos un evento en vivo.
    // Se muestran los de la franja actual (en vivo y finalizados) más los
    // que terminaron hace instantes, y el próximo evento a la derecha.
    if (activos.length > 0) {
        const ordenados = [...enVentana, ...finalizadosRecientes].sort((a, b) => {
            // Los eventos en vivo van primero; después, los que ya finalizaron.
            const vivos = (a.estado === 'activo' ? 0 : 1) - (b.estado === 'activo' ? 0 : 1);
            if (vivos !== 0) return vivos;
            return horaAMinutos(a.meta.horaInicio) - horaAMinutos(b.meta.horaInicio);
        });

        const chips = ordenados.map(info => {
            const vivo = info.estado === 'activo';
            return `
                <div class="now-chip ${vivo ? 'now-chip-live' : 'now-chip-done'}">
                    <span class="now-chip-state">${vivo ? 'EN VIVO' : 'FINALIZÓ'}</span>
                    <span class="now-chip-title">${escapeHtml(info.evento.titulo)}</span>
                    <span class="now-chip-time">${info.meta.horaInicio} – ${info.meta.horaFin}</span>
                </div>
            `;
        }).join('');

        const nextHtml = proximo ? `
            <div class="now-next-box">
                <span class="now-next-label">PRÓXIMO</span>
                <span class="now-next-title">${escapeHtml(proximo.evento.titulo)}</span>
                <span class="now-next-time">${proximo.meta.horaInicio} hs</span>
            </div>
        ` : '';

        cont.innerHTML = `
            <div class="now-chips ${ordenados.length === 1 ? 'single' : ''}">${chips}</div>
            ${nextHtml}
        `;

        setIndicador('EN VIVO', 'var(--neon-cyan)');
        ultimoEventoActivoId = activos[0].evento.id;
        return;
    }

    // Caso 2: no hay eventos en vivo, pero queda uno por venir.
    if (proximo) {
        const finalizadosPanel = [...finalizadosEnVentana, ...finalizadosRecientes];
        const finLine = finalizadosPanel.length
            ? `<div class="now-finished-line">Finalizó: ${finalizadosPanel
                  .map(info => escapeHtml(info.evento.titulo))
                  .join(' · ')}</div>`
            : '';

        cont.innerHTML = `
            <div class="now-next-main">
                <span class="now-next-flag">PRÓXIMA ACTIVIDAD</span>
                <h2 class="current-activity-title">${escapeHtml(proximo.evento.titulo)}</h2>
                <span class="current-activity-zone">${escapeHtml(proximo.evento.zona)}</span>
                <span class="current-activity-time">${proximo.meta.horaInicio} – ${proximo.meta.horaFin}</span>
                ${finLine}
            </div>
        `;

        setIndicador('PRÓXIMO', 'var(--neon-orange)');
        ultimoEventoActivoId = null;
        return;
    }

    // Caso 3: ya no queda nada programado.
    cont.innerHTML = `
        <div class="now-next-main">
            <h2 class="current-activity-title" style="color: var(--text-secondary);">Sin actividades programadas</h2>
            <span class="current-activity-zone" style="color: var(--text-secondary);">¡Gracias por participar!</span>
        </div>
    `;

    setIndicador('FINALIZADO', 'var(--text-secondary)');
    ultimoEventoActivoId = null;
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                         */
/* ------------------------------------------------------------------ */

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

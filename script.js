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

// Modificaciones manuales de los eventos.
// Son temporales: viven solo en memoria y se pierden al recargar la página.
// { [eventoId]: { horaInicio?: string, horaFin?: string, finalizado?: boolean } }
let eventosModificados = {};

// Inicializar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function () {
    inicializarTema();

    // Renderizar cronograma inicial
    renderizarCronograma();

    // Inicializar interacciones
    inicializarDebugReloj();
    inicializarThemeToggle();
    inicializarZoomMapa();

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
        item.style.cursor = 'pointer';
        item.title = 'Doble clic para modificar horario o marcar finalizado';

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
            <button type="button" class="schedule-edit" title="Editar horario" aria-label="Editar horario de ${escapeHtml(evento.titulo)}">✎</button>
        `;

        item.querySelector('.schedule-edit').addEventListener('click', function (e) {
            e.stopPropagation();
            modificarEvento(evento.id);
        });

        item.addEventListener('dblclick', function (e) {
            e.stopPropagation();
            modificarEvento(evento.id);
        });

        scheduleList.appendChild(item);
    });
}

/**
 * Abre el editor rápido de un evento (temporal, hasta recargar).
 */
function modificarEvento(eventoId) {
    const evento = eventos.find(e => e.id === eventoId);
    if (!evento) return;

    const meta = obtenerEventoModificado(evento);
    const marcaFinalizado = meta.finalizado ? '\n(Actualmente marcado como FINALIZADO)' : '';

    const mensaje = [
        `Evento: ${evento.titulo}${marcaFinalizado}`,
        `Horario actual: ${meta.horaInicio} - ${meta.horaFin}`,
        '',
        '1. Cambiar hora de inicio',
        '2. Cambiar hora de fin',
        '3. Marcar como FINALIZADO ahora',
        '4. Restaurar horario original',
        '5. Cancelar',
        '',
        'Ingresá el número de opción:'
    ].join('\n');

    const opcion = prompt(mensaje);

    if (opcion === '1') {
        const nueva = prompt('Nueva hora de inicio (HH:MM):', meta.horaInicio);
        if (!nueva) return;
        if (!/^\d{1,2}:\d{2}$/.test(nueva)) {
            alert('Formato inválido. Usá HH:MM (ejemplo: 12:30).');
            return;
        }
        if (horaAMinutos(nueva) >= horaAMinutos(meta.horaFin)) {
            alert('La hora de inicio debe ser anterior a la hora de fin.');
            return;
        }
        eventosModificados[eventoId] = {
            ...(eventosModificados[eventoId] || {}),
            horaInicio: nueva
        };
        refrescarVista();
    } else if (opcion === '2') {
        const nueva = prompt('Nueva hora de fin (HH:MM):', meta.horaFin);
        if (!nueva) return;
        if (!/^\d{1,2}:\d{2}$/.test(nueva)) {
            alert('Formato inválido. Usá HH:MM (ejemplo: 16:30).');
            return;
        }
        if (horaAMinutos(nueva) <= horaAMinutos(meta.horaInicio)) {
            alert('La hora de fin debe ser posterior a la hora de inicio.');
            return;
        }
        eventosModificados[eventoId] = {
            ...(eventosModificados[eventoId] || {}),
            horaFin: nueva
        };
        refrescarVista();
    } else if (opcion === '3') {
        eventosModificados[eventoId] = {
            ...(eventosModificados[eventoId] || {}),
            finalizado: true
        };
        refrescarVista();
    } else if (opcion === '4') {
        delete eventosModificados[eventoId];
        refrescarVista();
    }
}

function refrescarVista() {
    renderizarCronograma();
    actualizarEstadoEventos();
}

/* ------------------------------------------------------------------ */
/* Mapa SVG                                                           */
/* ------------------------------------------------------------------ */

/**
 * Zoom del mapa al pasar el mouse.
 * - Al entrar al mapa se aplica un zoom pequeño (15%).
 * - La rueda del mouse regula el zoom entre 1x y 3x.
 * - Mientras hay zoom, mover el mouse desplaza el mapa: la zona que se
 *   apunta queda siempre debajo del cursor, así se puede recorrer todo el plano.
 * - Al salir del mapa vuelve al tamaño original.
 * Funciona igual en modo claro y oscuro.
 */
function inicializarZoomMapa() {
    const contenedor = document.querySelector('.map-container');
    const svg = contenedor && contenedor.querySelector('svg');
    if (!contenedor || !svg) return;

    const ESCALA_HOVER = 1.15; // pequeño zoom inicial
    const ESCALA_MIN = 1;
    const ESCALA_MAX = 3;

    let escala = 1;
    let framePendiente = null;
    let ultimoX = null;
    let ultimoY = null;

    // Coloca el centro de zoom en la posición del cursor dentro del mapa
    const fijarOrigen = (clientX, clientY) => {
        const rect = contenedor.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const x = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
        const y = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100));

        svg.style.transformOrigin = `${x}% ${y}%`;
    };

    const aplicarZoom = (nuevaEscala, clientX, clientY) => {
        escala = Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, nuevaEscala));

        if (typeof clientX === 'number' && typeof clientY === 'number') {
            fijarOrigen(clientX, clientY);
        }

        svg.style.transform = `scale(${escala})`;
    };

    // Mientras el mapa está ampliado, seguir al cursor para poder recorrerlo
    const programarSeguimiento = (clientX, clientY) => {
        ultimoX = clientX;
        ultimoY = clientY;

        if (framePendiente !== null) return;

        framePendiente = requestAnimationFrame(function () {
            framePendiente = null;

            if (escala > 1 && ultimoX !== null && ultimoY !== null) {
                fijarOrigen(ultimoX, ultimoY);
            }
        });
    };

    contenedor.addEventListener('mouseenter', function (e) {
        aplicarZoom(Math.max(escala, ESCALA_HOVER), e.clientX, e.clientY);
    });

    contenedor.addEventListener('mousemove', function (e) {
        if (escala <= 1) return;
        programarSeguimiento(e.clientX, e.clientY);
    });

    contenedor.addEventListener('mouseleave', function () {
        if (framePendiente !== null) {
            cancelAnimationFrame(framePendiente);
            framePendiente = null;
        }

        escala = 1;
        ultimoX = null;
        ultimoY = null;
        svg.style.transformOrigin = '50% 50%';
        svg.style.transform = 'scale(1)';
    });

    contenedor.addEventListener('wheel', function (e) {
        e.preventDefault();

        // Normalizar el delta para que la rueda responda igual en todos los navegadores
        const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        const factor = Math.exp(-delta * 0.0015);

        aplicarZoom(escala * factor, e.clientX, e.clientY);
    }, { passive: false });
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

/**
 * Administración de horarios - WebLiga
 *
 * - Login con email/contraseña (Supabase Auth).
 * - Edición de horarios y estado finalizado.
 * - Publicación inmediata en el tablero mediante Supabase.
 * - QR y respaldo de los cambios.
 */
(function () {
    'use strict';

    let overrides = {};
    let firmaServidor = null;
    let sesion = null;
    let sincronizacionActiva = false;
    let hayCambiosSinGuardar = false;
    let mostrandoPanel = false;
    let toastTimer = null;

    document.addEventListener('DOMContentLoaded', iniciar);

    async function iniciar() {
        inicializarThemeToggle();
        configurarEventos();

        if (!window.HorariosSync || !window.QRWebLiga) {
            mostrarErrorConfiguracion('No se cargaron los scripts necesarios.');
            return;
        }

        configurarQR();

        if (!HorariosSync.estaConfigurado()) {
            document.getElementById('setupNotice').hidden = false;
            document.getElementById('loginCard').hidden = true;
            return;
        }

        document.getElementById('loginCard').hidden = false;

        const problemaConfig = HorariosSync.problemaDeConfiguracion();
        if (problemaConfig) {
            mostrarErrorConfiguracion(problemaConfig, 'La configuración de Supabase no coincide.');
            return;
        }

        try {
            sesion = await HorariosSync.obtenerSesion();
        } catch (error) {
            sesion = null;
        }

        if (sesion) {
            await mostrarPanel();
        }

        HorariosSync.alCambiarSesion(function (nuevaSesion, evento) {
            if (evento === 'SIGNED_OUT') {
                cerrarPanelPorSesion();
                return;
            }

            if (nuevaSesion && (evento === 'SIGNED_IN' || evento === 'INITIAL_SESSION')) {
                sesion = nuevaSesion;
                if (!mostrandoPanel && document.getElementById('adminPanel').hidden) {
                    mostrarPanel();
                }
            }
        });
    }

    /* ------------------------------------------------------------------ */
    /* Tema                                                               */
    /* ------------------------------------------------------------------ */

    function inicializarThemeToggle() {
        const boton = document.getElementById('themeToggle');
        if (!boton) return;

        const actualizarTexto = function () {
            const tema = document.documentElement.getAttribute('data-theme') || 'light';
            boton.textContent = tema === 'dark' ? '☀️ Modo Claro' : '🌙 Modo Oscuro';
        };

        actualizarTexto();

        boton.addEventListener('click', function () {
            const tema = document.documentElement.getAttribute('data-theme') || 'light';
            const nuevo = tema === 'light' ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', nuevo);
            localStorage.setItem('webliga-theme', nuevo);
            actualizarTexto();
        });
    }

    /* ------------------------------------------------------------------ */
    /* Interfaz general                                                   */
    /* ------------------------------------------------------------------ */

    function configurarEventos() {
        const loginForm = document.getElementById('loginForm');
        const logoutBtn = document.getElementById('logoutBtn');
        const refreshBtn = document.getElementById('refreshBtn');
        const resetAllBtn = document.getElementById('resetAllBtn');
        const discardBtn = document.getElementById('discardBtn');
        const backupBtn = document.getElementById('backupBtn');
        const downloadQrBtn = document.getElementById('downloadQrBtn');
        const adminRows = document.getElementById('adminRows');
        const avisoBtn = document.getElementById('avisoBtn');

        loginForm.addEventListener('submit', iniciarSesion);
        logoutBtn.addEventListener('click', cerrarSesion);
        refreshBtn.addEventListener('click', refrescarDesdeServidor);
        resetAllBtn.addEventListener('click', restablecerTodo);
        discardBtn.addEventListener('click', descartarCambios);
        backupBtn.addEventListener('click', descargarRespaldo);
        downloadQrBtn.addEventListener('click', descargarQR);
        avisoBtn.addEventListener('click', guardarAvisoClick);

        adminRows.addEventListener('input', marcarCambios);
        adminRows.addEventListener('change', marcarCambios);
        adminRows.addEventListener('click', manejarAccionFila);
    }

    function mostrarErrorConfiguracion(mensaje, titulo) {
        const aviso = document.getElementById('setupNotice');
        document.getElementById('loginCard').hidden = true;
        document.getElementById('adminPanel').hidden = true;
        aviso.hidden = false;

        if (titulo) {
            const strong = aviso.querySelector('strong');
            if (strong) strong.textContent = titulo;
        }

        if (mensaje) {
            const p = document.createElement('p');
            p.textContent = mensaje;
            aviso.appendChild(p);
        }
    }

    /* ------------------------------------------------------------------ */
    /* Sesión                                                            */
    /* ------------------------------------------------------------------ */

    async function iniciarSesion(evento) {
        evento.preventDefault();

        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        const error = document.getElementById('loginError');
        const boton = document.getElementById('loginBtn');

        error.hidden = true;

        if (!email || !password) {
            error.textContent = 'Completá el correo y la contraseña.';
            error.hidden = false;
            return;
        }

        boton.disabled = true;
        boton.textContent = 'Ingresando…';

        try {
            sesion = await HorariosSync.iniciarSesion(email, password);
            document.getElementById('loginPassword').value = '';
            await mostrarPanel();
        } catch (fallo) {
            error.textContent = traducirErrorLogin(fallo);
            error.hidden = false;
        } finally {
            boton.disabled = false;
            boton.textContent = 'Ingresar';
        }
    }

    async function cerrarSesion() {
        try {
            await HorariosSync.cerrarSesion();
        } catch (error) {
            console.error('No se pudo cerrar sesión:', error);
        }

        cerrarPanelPorSesion();
    }

    function cerrarPanelPorSesion() {
        HorariosSync.detener();
        sincronizacionActiva = false;
        mostrandoPanel = false;
        sesion = null;
        overrides = {};
        firmaServidor = null;
        hayCambiosSinGuardar = false;

        document.getElementById('adminPanel').hidden = true;
        document.getElementById('loginCard').hidden = false;
        document.getElementById('logoutBtn').hidden = true;
        document.getElementById('adminRows').innerHTML = '';
        document.getElementById('pendingBanner').hidden = true;

        const error = document.getElementById('loginError');
        error.hidden = true;
    }

    async function mostrarPanel() {
        if (mostrandoPanel) return;
        mostrandoPanel = true;

        document.getElementById('setupNotice').hidden = true;
        document.getElementById('loginCard').hidden = true;
        document.getElementById('adminPanel').hidden = false;
        document.getElementById('logoutBtn').hidden = false;
        document.getElementById('adminEmail').textContent = sesion.user.email || '—';

        try {
            if (!sincronizacionActiva) {
                sincronizacionActiva = true;

                await HorariosSync.iniciar({
                    alCambiar: recibirOverrides,
                    alEstado: mostrarEstadoSync
                });
            } else {
                await HorariosSync.descargarOverrides(false);
            }
        } catch (error) {
            mostrarToast('No se pudieron cargar los horarios. ' + (error.message || ''), true);
        } finally {
            mostrandoPanel = false;
        }

        cargarAvisoPanel();
    }

    /* ------------------------------------------------------------------ */
    /* Aviso para el tablero                                              */
    /* ------------------------------------------------------------------ */

    async function cargarAvisoPanel() {
        const texto = document.getElementById('avisoTexto');
        const activo = document.getElementById('avisoActivo');
        const info = document.getElementById('avisoInfo');
        const error = document.getElementById('avisoError');

        if (!texto) return;
        error.hidden = true;

        let aviso = null;

        try {
            aviso = await HorariosSync.obtenerAviso();
        } catch (fallo) {
            console.warn('No se pudo leer el aviso:', fallo);
        }

        if (!aviso) {
            const cache = HorariosSync.leerCacheAviso ? HorariosSync.leerCacheAviso() : null;
            aviso = cache;
        }

        if (aviso) {
            texto.value = aviso.texto || '';
            activo.checked = !!aviso.activo;

            const marca = formatearFecha(aviso.actualizadoEn);
            info.textContent = marca
                ? 'Último cambio de la nube: ' + marca + (aviso.actualizadoPor ? ' · por ' + aviso.actualizadoPor : '.')
                : 'Aviso guardado en la nube.';
            return;
        }

        texto.value = '';
        activo.checked = false;

        if (/does not exist|schema cache|relation/i.test(HorariosSync.problemaAviso() || '')) {
            info.textContent = 'La tabla de avisos todavía no existe: ejecutá supabase/avisos.sql en el SQL Editor de Supabase.';
        } else {
            info.textContent = 'Todavía no hay aviso guardado.';
        }
    }

    async function guardarAvisoClick() {
        const texto = document.getElementById('avisoTexto');
        const activo = document.getElementById('avisoActivo');
        const error = document.getElementById('avisoError');
        const boton = document.getElementById('avisoBtn');

        error.hidden = true;

        const cambios = {
            texto: texto.value,
            activo: activo.checked
        };

        if (cambios.activo && !cambios.texto.trim()) {
            error.textContent = 'Escribí el texto del aviso o desmarcá "Mostrar".';
            error.hidden = false;
            return;
        }

        boton.disabled = true;
        boton.textContent = 'Guardando…';

        try {
            await HorariosSync.guardarAviso(cambios, sesion.user.email);
            mostrarToast(
                cambios.activo ? 'Aviso publicado en el tablero.' : 'Aviso guardado y apagado.',
                false
            );
            await cargarAvisoPanel();
        } catch (fallo) {
            error.textContent = traducirErrorGuardado(fallo);
            error.hidden = false;
        } finally {
            boton.disabled = false;
            boton.textContent = 'Guardar aviso';
        }
    }

    function traducirErrorLogin(error) {
        const mensaje = String(error && error.message ? error.message : error);
        const problema = typeof HorariosSync.problemaDeConfiguracion === 'function'
            ? HorariosSync.problemaDeConfiguracion()
            : '';

        if (/invalid login credentials/i.test(mensaje)) {
            return 'Correo o contraseña incorrectos.';
        }
        if (/email not confirmed/i.test(mensaje)) {
            return 'Falta confirmar el correo. Confirmalo desde Supabase o pedile al administrador que lo haga.';
        }
        if (/email logins? (are|is) disabled|email_provider_disabled/i.test(mensaje)) {
            return 'El inicio de sesión con correo está desactivado en Supabase. Activalo en Authentication → Providers → Email y volvé a intentar.';
        }
        if (/signups? (are|is) disabled|signup_disabled/i.test(mensaje)) {
            return 'El registro de cuentas está desactivado en Supabase. Creá el usuario administrador desde Authentication → Users.';
        }
        if (/failed to fetch|network|load failed/i.test(mensaje)) {
            if (problema) return problema;
            return 'No hay conexión con el servidor. Revisá los datos móviles o la Wi-Fi.';
        }
        if (/missing supabase/i.test(mensaje)) {
            return 'Falta completar supabase-config.js.';
        }

        return 'No se pudo iniciar sesión: ' + mensaje;
    }

    /* ------------------------------------------------------------------ */
    /* Sincronización                                                    */
    /* ------------------------------------------------------------------ */

    function firma(objeto) {
        return Object.keys(objeto || {})
            .sort()
            .map(function (id) {
                const dato = objeto[id] || {};
                return id + ':' + dato.horaInicio + '|' + dato.horaFin + '|' + (dato.finalizado ? '1' : '0');
            })
            .join(';');
    }

    function recibirOverrides(nuevos) {
        const firmaNueva = firma(nuevos);
        const cambioReal = firmaServidor !== null && firmaNueva !== firmaServidor;

        overrides = nuevos || {};

        if (firmaServidor === null) {
            firmaServidor = firmaNueva;
            renderizarFilas();
            return;
        }

        if (!cambioReal) {
            firmaServidor = firmaNueva;
            actualizarResumen();
            return;
        }

        firmaServidor = firmaNueva;

        if (hayCambiosSinGuardar) {
            document.getElementById('pendingBanner').hidden = false;
            actualizarResumen();
            return;
        }

        document.getElementById('pendingBanner').hidden = true;
        renderizarFilas();
    }

    function mostrarEstadoSync(estado) {
        const badge = document.getElementById('adminSyncStatus');
        const etiqueta = badge ? badge.querySelector('.sync-label') : null;
        const pie = document.getElementById('lastSyncLabel');

        if (!badge) return;
        badge.dataset.estado = estado;

        const formatear = function (fecha) {
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
            if (etiqueta) etiqueta.textContent = 'EN VIVO';
            const hora = formatear(HorariosSync.obtenerUltimaSync());
            if (pie) pie.textContent = 'Última sincronización: ' + (hora || '—');
            return;
        }

        if (estado === 'sin-conexion') {
            if (etiqueta) etiqueta.textContent = 'SIN CONEXIÓN';
            const cache = HorariosSync.leerCache();
            const hora = cache ? formatear(cache.guardadoEn) : '';
            if (pie) {
                pie.textContent = 'Sin conexión' + (hora ? ' · última copia ' + hora : '');
            }
            return;
        }

        if (etiqueta) etiqueta.textContent = 'SINCRONIZANDO';
        if (pie) pie.textContent = 'Conectando con el servidor…';
    }

    async function refrescarDesdeServidor() {
        const boton = document.getElementById('refreshBtn');
        boton.disabled = true;

        try {
            const datos = await HorariosSync.descargarOverrides(false);
            if (datos === null) {
                mostrarToast('No se pudo actualizar. Revisá la conexión.', true);
            } else {
                mostrarToast('Datos actualizados.');
            }
        } finally {
            boton.disabled = false;
        }
    }

    /* ------------------------------------------------------------------ */
    /* Filas de horarios                                                 */
    /* ------------------------------------------------------------------ */

    function renderizarFilas() {
        const contenedor = document.getElementById('adminRows');
        contenedor.innerHTML = '';

        eventos.forEach(function (evento) {
            const mod = overrides[String(evento.id)];
            const inicio = (mod && mod.horaInicio) || evento.horaInicio;
            const fin = (mod && mod.horaFin) || evento.horaFin;
            const finalizado = !!(mod && mod.finalizado);

            const fila = document.createElement('article');
            fila.className = 'admin-row';
            fila.dataset.eventoId = String(evento.id);

            let textoTag = 'Predeterminado';
            let claseTag = 'admin-tag';

            if (finalizado) {
                textoTag = 'Finalizado';
                claseTag += ' finalizado';
            } else if (mod) {
                textoTag = 'Modificado';
                claseTag += ' modificado';
            }

            const detalleActualizacion = mod && mod.actualizadoEn
                ? ' · modificado ' + formatearFecha(mod.actualizadoEn)
                : '';

            fila.innerHTML = `
                <div class="admin-row-info">
                    <h3>${escapeHtml(evento.titulo)}</h3>
                    <p>${escapeHtml(evento.zona)} · base ${evento.horaInicio}–${evento.horaFin}${escapeHtml(detalleActualizacion)}</p>
                    <span class="${claseTag}">${textoTag}</span>
                </div>
                <div class="admin-row-fields">
                    <label>Inicio
                        <input type="time" data-campo="inicio" value="${inicio}" aria-label="Hora de inicio de ${escapeHtml(evento.titulo)}">
                    </label>
                    <label>Fin
                        <input type="time" data-campo="fin" value="${fin}" aria-label="Hora de fin de ${escapeHtml(evento.titulo)}">
                    </label>
                    <label class="admin-check">
                        <input type="checkbox" data-campo="finalizado" ${finalizado ? 'checked' : ''}>
                        Finalizado
                    </label>
                </div>
                <div class="admin-row-actions">
                    <button type="button" class="admin-button primary" data-accion="guardar">Guardar</button>
                    <button type="button" class="admin-button ghost" data-accion="restablecer">Restablecer</button>
                </div>
            `;

            contenedor.appendChild(fila);
        });

        hayCambiosSinGuardar = false;
        document.getElementById('pendingBanner').hidden = true;
        actualizarResumen();
    }

    function marcarCambios(evento) {
        const fila = evento.target.closest('.admin-row');
        if (!fila) return;

        fila.classList.add('dirty');
        hayCambiosSinGuardar = true;
    }

    function manejarAccionFila(evento) {
        const boton = evento.target.closest('button[data-accion]');
        if (!boton) return;

        const fila = boton.closest('.admin-row');
        if (!fila) return;

        if (boton.dataset.accion === 'guardar') {
            guardarFila(fila, boton);
        } else if (boton.dataset.accion === 'restablecer') {
            restablecerFila(fila, boton);
        }
    }

    async function guardarFila(fila, boton) {
        const evento = buscarEvento(fila.dataset.eventoId);
        if (!evento) return;

        const inicio = fila.querySelector('[data-campo="inicio"]').value;
        const fin = fila.querySelector('[data-campo="fin"]').value;
        const finalizado = fila.querySelector('[data-campo="finalizado"]').checked;

        if (!horaValida(inicio) || !horaValida(fin)) {
            mostrarToast('Usá un horario válido en formato HH:MM.', true);
            return;
        }

        if (horaAMinutos(inicio) >= horaAMinutos(fin)) {
            mostrarToast('La hora de inicio debe ser anterior a la hora de fin.', true);
            return;
        }

        const igualAlOriginal =
            inicio === evento.horaInicio &&
            fin === evento.horaFin &&
            !finalizado;

        const textoOriginal = boton.textContent;
        boton.disabled = true;
        boton.textContent = 'Guardando…';
        fila.classList.remove('dirty');
        actualizarBanderaCambios();

        try {
            if (igualAlOriginal) {
                await HorariosSync.restablecerHorario(evento.id);
            } else {
                await HorariosSync.guardarHorario(
                    evento.id,
                    { horaInicio: inicio, horaFin: fin, finalizado: finalizado },
                    sesion && sesion.user ? sesion.user.email : null
                );
            }

            actualizarTagFila(fila, evento, inicio, fin, finalizado, !igualAlOriginal);
            mostrarToast(igualAlOriginal
                ? 'Restaurado al horario original.'
                : 'Guardado. El tablero ya muestra el cambio.');
        } catch (error) {
            console.error('No se pudo guardar:', error);
            fila.classList.add('dirty');
            hayCambiosSinGuardar = true;
            mostrarToast(traducirErrorGuardado(error), true);
        } finally {
            boton.disabled = false;
            boton.textContent = textoOriginal;

            if (!hayCambiosSinGuardar) {
                document.getElementById('pendingBanner').hidden = true;
            }
        }
    }

    async function restablecerFila(fila, boton) {
        const evento = buscarEvento(fila.dataset.eventoId);
        if (!evento) return;

        const confirmar = confirm('¿Restablecer "' + evento.titulo + '" al horario original?');
        if (!confirmar) return;

        boton.disabled = true;
        boton.textContent = 'Restaurando…';
        fila.classList.remove('dirty');
        actualizarBanderaCambios();

        try {
            if (overrides[String(evento.id)]) {
                await HorariosSync.restablecerHorario(evento.id);
            }

            fila.querySelector('[data-campo="inicio"]').value = evento.horaInicio;
            fila.querySelector('[data-campo="fin"]').value = evento.horaFin;
            fila.querySelector('[data-campo="finalizado"]').checked = false;
            actualizarTagFila(fila, evento, evento.horaInicio, evento.horaFin, false, false);
            mostrarToast('Horario restablecido.');
        } catch (error) {
            console.error('No se pudo restablecer:', error);
            mostrarToast(traducirErrorGuardado(error), true);
        } finally {
            boton.disabled = false;
            boton.textContent = 'Restablecer';
        }
    }

    async function restablecerTodo() {
        const confirmar = confirm(
            '¿Restablecer TODOS los horarios a los valores originales? ' +
            'Esta acción se aplica a todos los dispositivos.'
        );
        if (!confirmar) return;

        const boton = document.getElementById('resetAllBtn');
        boton.disabled = true;

        try {
            await HorariosSync.restablecerTodo(eventos.map(function (evento) {
                return evento.id;
            }));

            hayCambiosSinGuardar = false;
            renderizarFilas();
            mostrarToast('Todos los horarios volvieron a los valores originales.');
        } catch (error) {
            console.error('No se pudo restablecer todo:', error);
            mostrarToast(traducirErrorGuardado(error), true);
        } finally {
            boton.disabled = false;
        }
    }

    function descartarCambios() {
        hayCambiosSinGuardar = false;
        renderizarFilas();
        mostrarToast('Se descartaron los cambios sin guardar.');
    }

    function actualizarBanderaCambios() {
        hayCambiosSinGuardar = !!document.querySelector('#adminRows .admin-row.dirty');
    }

    function actualizarTagFila(fila, evento, inicio, fin, finalizado, hayOverride) {
        const tag = fila.querySelector('.admin-tag');
        if (!tag) return;

        tag.className = 'admin-tag';

        if (finalizado) {
            tag.textContent = 'Finalizado';
            tag.classList.add('finalizado');
        } else if (hayOverride) {
            tag.textContent = 'Modificado';
            tag.classList.add('modificado');
        } else {
            tag.textContent = 'Predeterminado';
        }

        const info = fila.querySelector('.admin-row-info p');
        if (info) {
            info.textContent = evento.zona + ' · base ' + evento.horaInicio + '–' + evento.horaFin;
        }
    }

    function buscarEvento(id) {
        return eventos.find(function (evento) {
            return String(evento.id) === String(id);
        });
    }

    function actualizarResumen() {
        const info = document.getElementById('backupInfo');
        if (!info) return;

        const lista = Object.keys(overrides);
        const cantidad = lista.length;

        let ultima = null;
        lista.forEach(function (id) {
            const dato = overrides[id];
            if (!dato || !dato.actualizadoEn) return;
            const fecha = new Date(dato.actualizadoEn);
            if (!isNaN(fecha.getTime()) && (!ultima || fecha > ultima.fecha)) {
                ultima = { fecha: fecha, por: dato.actualizadoPor };
            }
        });

        let texto = cantidad === 0
            ? 'No hay cambios guardados: se están usando los horarios originales.'
            : cantidad + (cantidad === 1 ? ' cambio guardado' : ' cambios guardados');

        if (ultima) {
            texto += ' · último cambio ' + formatearFecha(ultima.fecha);
            if (ultima.por) texto += ' por ' + ultima.por;
        }

        info.textContent = texto;
    }

    /* ------------------------------------------------------------------ */
    /* QR y respaldo                                                     */
    /* ------------------------------------------------------------------ */

    function configurarQR() {
        const url = HorariosSync.urlPublica();
        const texto = document.getElementById('qrUrl');
        const contenedor = document.getElementById('qrPreview');

        if (texto) texto.textContent = url;

        if (contenedor && window.QRWebLiga) {
            window.QRWebLiga.dibujar(contenedor, url, {
                cellSize: 6,
                margin: 4,
                alt: 'Código QR para abrir el tablero de WebLiga'
            });
        }
    }

    function descargarQR() {
        const svg = document.querySelector('#qrPreview svg');
        if (!svg) {
            mostrarToast('No se pudo generar el QR.', true);
            return;
        }

        window.QRWebLiga.descargarSvg(svg, 'qr-webliga.svg');
    }

    function descargarRespaldo() {
        const datos = {
            generadoEn: new Date().toISOString(),
            urlPublica: HorariosSync.urlPublica(),
            overrides: overrides
        };

        const blob = new Blob([JSON.stringify(datos, null, 2)], {
            type: 'application/json;charset=utf-8'
        });
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement('a');
        const fecha = new Date().toISOString().slice(0, 10);

        enlace.href = url;
        enlace.download = 'webliga-horarios-' + fecha + '.json';
        document.body.appendChild(enlace);
        enlace.click();
        enlace.remove();

        setTimeout(function () {
            URL.revokeObjectURL(url);
        }, 1000);

        mostrarToast('Respaldo descargado.');
    }

    /* ------------------------------------------------------------------ */
    /* Utilidades                                                        */
    /* ------------------------------------------------------------------ */

    function horaValida(valor) {
        return /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(valor || '');
    }

    function formatearFecha(fecha) {
        try {
            const valor = fecha instanceof Date ? fecha : new Date(fecha);
            if (isNaN(valor.getTime())) return '';
            return valor.toLocaleString('es-AR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return '';
        }
    }

    function traducirErrorGuardado(error) {
        const mensaje = String(error && error.message ? error.message : error);

        if (/row-level security|permission denied|not authorized/i.test(mensaje)) {
            return 'La cuenta no tiene permisos de administrador. Revisá el correo configurado en las políticas de Supabase.';
        }
        if (/failed to fetch|network/i.test(mensaje)) {
            return 'No hay conexión. El cambio no se guardó; probá de nuevo cuando vuelva la señal.';
        }
        if (/violates check constraint/i.test(mensaje)) {
            return 'El horario no es válido: la inicio debe ser anterior a la de fin.';
        }

        return 'No se pudo guardar: ' + mensaje;
    }

    function mostrarToast(mensaje, esError) {
        const toast = document.getElementById('toast');
        if (!toast) return;

        toast.textContent = mensaje;
        toast.classList.toggle('toast-error', !!esError);
        toast.hidden = false;

        if (toastTimer !== null) clearTimeout(toastTimer);

        toastTimer = setTimeout(function () {
            toast.hidden = true;
        }, 4000);
    }

    function escapeHtml(texto) {
        const div = document.createElement('div');
        div.textContent = texto == null ? '' : String(texto);
        return div.innerHTML;
    }
})();

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

    /* Editor de llaves de la segunda TV */
    let llavesTrabajo = null;
    let llavesFirmaAplicada = null;
    let llavesActualizadoEn = null;
    let llavesActualizadoPor = null;
    let llavesIndiceSeleccionado = 0;
    let llavesCambios = false;
    let llavesRemotoPendiente = null;
    let llavesSincronizacionActiva = false;
    let llavesErrorTabla = '';

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
        const llavesEditor = document.getElementById('llavesEditor');
        const llavesCategoria = document.getElementById('llavesCategoria');
        const llavesRotacion = document.getElementById('llavesRotacion');
        const llavesGuardar = document.getElementById('llavesGuardar');
        const llavesRecargar = document.getElementById('llavesRecargar');

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

        if (llavesCategoria) llavesCategoria.addEventListener('change', cambiarCategoriaLlaves);
        if (llavesRotacion) {
            llavesRotacion.addEventListener('input', marcarRotacionLlaves);
            llavesRotacion.addEventListener('change', marcarRotacionLlaves);
        }
        if (llavesGuardar) llavesGuardar.addEventListener('click', guardarLlavesClick);
        if (llavesRecargar) llavesRecargar.addEventListener('click', recargarLlavesClick);
        if (llavesEditor) {
            llavesEditor.addEventListener('input', manejarEntradaLlaves);
            llavesEditor.addEventListener('change', manejarEntradaLlaves);
            llavesEditor.addEventListener('click', manejarClickLlaves);
        }

        configurarMensajesRapidos();
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
        if (typeof HorariosSync.detenerLlaves === 'function') HorariosSync.detenerLlaves();
        sincronizacionActiva = false;
        mostrandoPanel = false;
        sesion = null;
        overrides = {};
        firmaServidor = null;
        hayCambiosSinGuardar = false;

        llavesSincronizacionActiva = false;
        llavesTrabajo = null;
        llavesFirmaAplicada = null;
        llavesActualizadoEn = null;
        llavesActualizadoPor = null;
        llavesCambios = false;
        llavesRemotoPendiente = null;
        llavesErrorTabla = '';

        document.getElementById('adminPanel').hidden = true;
        document.getElementById('loginCard').hidden = false;
        document.getElementById('logoutBtn').hidden = true;
        document.getElementById('adminRows').innerHTML = '';
        document.getElementById('pendingBanner').hidden = true;

        const llavesEditor = document.getElementById('llavesEditor');
        const llavesCategoria = document.getElementById('llavesCategoria');
        const llavesInfo = document.getElementById('llavesInfo');
        const llavesError = document.getElementById('llavesError');
        if (llavesEditor) llavesEditor.innerHTML = '';
        if (llavesCategoria) llavesCategoria.innerHTML = '';
        if (llavesInfo) llavesInfo.textContent = '';
        if (llavesError) llavesError.hidden = true;

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
        cargarLlavesPanel();
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

    /* ------------------------------------------------------------------ */
    /* Mensajes rápidos para el aviso                                     */
    /* ------------------------------------------------------------------ */

    function configurarMensajesRapidos() {
        document.querySelectorAll('.admin-chip[data-plantilla]').forEach(function (chip) {
            chip.addEventListener('click', function () {
                usarPlantilla(chip.dataset.plantilla);
            });
        });

        document.getElementById('avisoActividadPick').addEventListener('change', function () {
            if (!this.value) return;
            reemplazarMarcador('[ACTIVIDAD]', this.value);
            this.value = '';
        });

        document.getElementById('avisoLugarPick').addEventListener('change', function () {
            if (!this.value) return;
            reemplazarMarcador('[LUGAR]', this.value);
            this.value = '';
        });

        document.getElementById('avisoHoraBtn').addEventListener('click', function () {
            reemplazarMarcador('[HORA]', horaActual());
        });

        document.getElementById('avisoLimpiarBtn').addEventListener('click', function () {
            const area = document.getElementById('avisoTexto');
            area.value = '';
            document.getElementById('avisoError').hidden = true;
            area.focus();
        });

        poblarCompletadores();
    }

    function poblarCompletadores() {
        const actividadPick = document.getElementById('avisoActividadPick');
        const lugarPick = document.getElementById('avisoLugarPick');

        const titulos = [];
        const zonas = [];

        if (typeof eventos !== 'undefined' && Array.isArray(eventos)) {
            eventos.forEach(function (evento) {
                if (!evento) return;

                if (evento.titulo && titulos.indexOf(evento.titulo) === -1) {
                    titulos.push(evento.titulo);
                }

                if (evento.zona && zonas.indexOf(evento.zona) === -1) {
                    zonas.push(evento.zona);
                }
            });
        }

        titulos.sort().forEach(function (titulo) {
            const opcion = document.createElement('option');
            opcion.value = titulo;
            opcion.textContent = titulo;
            actividadPick.appendChild(opcion);
        });

        zonas.sort().forEach(function (zona) {
            const opcion = document.createElement('option');
            opcion.value = zona;
            opcion.textContent = zona;
            lugarPick.appendChild(opcion);
        });
    }

    function usarPlantilla(texto) {
        const area = document.getElementById('avisoTexto');

        if (area.value.trim()) {
            if (!window.confirm('¿Reemplazar el texto actual por el mensaje rápido?')) return;
        }

        area.value = texto;
        document.getElementById('avisoError').hidden = true;
        area.focus();
    }

    function reemplazarMarcador(marcador, valor) {
        const area = document.getElementById('avisoTexto');

        if (area.value.indexOf(marcador) === -1) {
            mostrarToast('El texto no contiene ' + marcador + ' para completar.', true);
            return;
        }

        area.value = area.value.replace(marcador, valor);
    }

    function horaActual() {
        const ahora = new Date();
        const dosDigitos = function (valor) { return String(valor).padStart(2, '0'); };
        return dosDigitos(ahora.getHours()) + ':' + dosDigitos(ahora.getMinutes());
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

    /* ------------------------------------------------------------------ */
    /* Llaves y posiciones de la segunda TV                               */
    /* ------------------------------------------------------------------ */

    async function cargarLlavesPanel() {
        const info = document.getElementById('llavesInfo');

        if (!window.HorariosSync || typeof HorariosSync.iniciarLlaves !== 'function') {
            if (info) info.textContent = 'No se cargó el módulo de llaves. Actualizá la página.';
            return;
        }

        if (!HorariosSync.estaConfigurado()) {
            usarDatosEstaticos();
            if (info) info.textContent = 'Supabase no está configurado: se muestran los datos locales.';
            return;
        }

        try {
            if (!llavesSincronizacionActiva) {
                llavesSincronizacionActiva = true;
                await HorariosSync.iniciarLlaves({ alCambiar: recibirLlavesNube });
            } else {
                await HorariosSync.descargarLlaves(false);
            }
        } catch (error) {
            console.warn('No se pudieron iniciar las llaves:', error);
        }

        if (!llavesTrabajo) {
            const cache = typeof HorariosSync.leerCacheLlaves === 'function'
                ? HorariosSync.leerCacheLlaves()
                : null;

            if (cache && documentoConCategorias(cache.datos)) {
                aplicarRegistroLlaves(cache, 'cache');
            } else {
                usarDatosEstaticos();
            }
        }

        const problema = typeof HorariosSync.problemaLlaves === 'function'
            ? HorariosSync.problemaLlaves()
            : '';

        if (problema) llavesErrorTabla = mensajeProblemaLlaves(problema);

        actualizarInfoLlaves();
    }

    function recibirLlavesNube(registro) {
        const datos = registro && registro.datos;

        if (!documentoConCategorias(datos)) {
            if (!llavesTrabajo) usarDatosEstaticos();
            actualizarInfoLlaves();
            return;
        }

        const firmaNueva = firmaLlaves(datos);

        if (firmaNueva === llavesFirmaAplicada) {
            llavesActualizadoEn = registro.actualizadoEn || llavesActualizadoEn;
            llavesActualizadoPor = registro.actualizadoPor || llavesActualizadoPor;
            actualizarInfoLlaves();
            return;
        }

        if (llavesCambios) {
            llavesRemotoPendiente = registro;
            actualizarInfoLlaves();
            return;
        }

        aplicarRegistroLlaves(registro, 'nube');
    }

    function usarDatosEstaticos() {
        llavesTrabajo = normalizarDocumento(documentoEstatico());
        llavesFirmaAplicada = null;
        llavesCambios = false;
        llavesRemotoPendiente = null;
        llavesIndiceSeleccionado = 0;
        renderizarLlaves();
        actualizarInfoLlaves();
    }

    function aplicarRegistroLlaves(registro, origen) {
        if (!registro || !documentoConCategorias(registro.datos)) return;

        const anterior = categoriaLlavesActual();
        const idAnterior = anterior ? (anterior.id || anterior.titulo) : null;

        llavesTrabajo = normalizarDocumento(registro.datos);
        llavesFirmaAplicada = firmaLlaves(registro.datos);
        llavesActualizadoEn = registro.actualizadoEn || null;
        llavesActualizadoPor = registro.actualizadoPor || null;
        llavesCambios = false;
        llavesRemotoPendiente = null;
        llavesErrorTabla = '';
        llavesIndiceSeleccionado = 0;

        if (idAnterior) {
            const encontrado = llavesTrabajo.categorias.findIndex(function (categoria) {
                return (categoria.id || categoria.titulo) === idAnterior;
            });

            if (encontrado >= 0) llavesIndiceSeleccionado = encontrado;
        }

        if (llavesIndiceSeleccionado >= llavesTrabajo.categorias.length) {
            llavesIndiceSeleccionado = 0;
        }

        renderizarLlaves();
        actualizarInfoLlaves();
    }

    function renderizarLlaves() {
        const select = document.getElementById('llavesCategoria');
        const rotacion = document.getElementById('llavesRotacion');

        if (!select || !rotacion) return;

        select.innerHTML = '';

        if (!llavesTrabajo) {
            renderizarEditorLlaves();
            return;
        }

        llavesTrabajo.categorias.forEach(function (categoria, indice) {
            const opcion = document.createElement('option');
            opcion.value = String(indice);
            opcion.textContent = (categoria.titulo || 'Pantalla ' + (indice + 1)) +
                (categoria.fase ? ' · ' + categoria.fase : '');
            select.appendChild(opcion);
        });

        const maximo = Math.max(0, llavesTrabajo.categorias.length - 1);
        if (llavesIndiceSeleccionado > maximo) llavesIndiceSeleccionado = maximo;

        select.value = String(llavesIndiceSeleccionado);
        rotacion.value = String(rotacionNormalizada(llavesTrabajo.rotacionSegundos));

        renderizarEditorLlaves();
        actualizarInfoLlaves();
    }

    function renderizarEditorLlaves() {
        const editor = document.getElementById('llavesEditor');
        if (!editor) return;

        editor.innerHTML = '';

        const categoria = categoriaLlavesActual();

        if (!categoria) {
            editor.appendChild(crear('p', 'admin-muted', 'No hay pantallas cargadas.'));
            return;
        }

        editor.appendChild(crearFichaLlaves(categoria));

        if (categoria.tipo === 'llaves') {
            editor.appendChild(crearEditorRondasLlaves(categoria));
            editor.appendChild(crearEditorCampeonLlaves(categoria));
        } else if (categoria.tipo === 'grupos') {
            editor.appendChild(crearEditorGruposLlaves(categoria));
            editor.appendChild(crearEditorCrucesLlaves(categoria));
        } else {
            editor.appendChild(crearEditorTablaLlaves(categoria));
        }
    }

    function crearFichaLlaves(categoria) {
        const ficha = crear('div', 'admin-llaves-ficha');
        const grid = crear('div', 'admin-llaves-grid');

        grid.appendChild(crearCampoLlaves('Título', crearInputLlaves(
            categoria.titulo, { ambito: 'comun', campo: 'titulo' }
        )));

        grid.appendChild(crearCampoLlaves('Nombre corto', crearInputLlaves(
            categoria.corto, { ambito: 'comun', campo: 'corto' }
        )));

        grid.appendChild(crearCampoLlaves('Fase', crearInputLlaves(
            categoria.fase, { ambito: 'comun', campo: 'fase' }
        )));

        grid.appendChild(crearCampoLlaves('Color', crearInputLlaves(
            colorValido(categoria.acento) ? categoria.acento : '#00ffff',
            { ambito: 'comun', campo: 'acento' },
            { tipo: 'color' }
        )));

        grid.appendChild(crearCampoLlaves('Nota al pie', crearInputLlaves(
            categoria.nota, { ambito: 'comun', campo: 'nota' },
            { placeholder: 'Ej.: Eliminación directa · combates al mejor de 5' }
        ), 'ancho'));

        ficha.appendChild(grid);
        ficha.appendChild(crear('span', 'admin-tag admin-llaves-tipo', 'Tipo: ' + etiquetaTipoLlaves(categoria.tipo)));

        return ficha;
    }

    function crearEditorRondasLlaves(categoria) {
        const bloque = crearBloqueLlaves('Rondas y partidos', '+ Ronda', 'add-ronda');
        const rondas = Array.isArray(categoria.rondas) ? categoria.rondas : [];

        if (!rondas.length) {
            bloque.appendChild(crear('p', 'admin-muted', 'No hay rondas cargadas.'));
        }

        rondas.forEach(function (ronda, indiceRonda) {
            const caja = crear('div', 'admin-llaves-ronda');
            const cabecera = crear('div', 'admin-llaves-ronda-head');

            cabecera.appendChild(crearInputLlaves(
                ronda.nombre || '',
                { ambito: 'ronda', ronda: String(indiceRonda), campo: 'nombre' },
                { placeholder: 'Nombre de la ronda', clase: 'admin-llaves-ronda-nombre' }
            ));

            cabecera.appendChild(crearBotonLlaves(
                'Quitar ronda', 'ghost admin-llaves-quitar', 'del-ronda', { ronda: String(indiceRonda) }
            ));

            caja.appendChild(cabecera);

            const lista = crear('div', 'admin-llaves-partidos');
            const partidos = Array.isArray(ronda.partidos) ? ronda.partidos : [];

            if (!partidos.length) {
                lista.appendChild(crear('p', 'admin-muted', 'Sin partidos en esta ronda.'));
            }

            partidos.forEach(function (partido, indicePartido) {
                lista.appendChild(crearEditorPartidoLlaves(
                    partido,
                    { ambito: 'partido', ronda: String(indiceRonda), partido: String(indicePartido) },
                    'del-partido'
                ));
            });

            lista.appendChild(crearBotonLlaves(
                '+ Partido', 'ghost', 'add-partido', { ronda: String(indiceRonda) }
            ));

            caja.appendChild(lista);
            bloque.appendChild(caja);
        });

        return bloque;
    }

    function crearEditorCampeonLlaves(categoria) {
        const bloque = crearBloqueLlaves('Campeón', null);
        const campeon = categoria.campeon || {};
        const grid = crear('div', 'admin-llaves-grid');

        grid.appendChild(crearCampoLlaves('Equipo campeón', crearInputLlaves(
            campeon.equipo, { ambito: 'campeon', campo: 'equipo' }, { placeholder: 'Por definir' }
        )));

        grid.appendChild(crearCampoLlaves('Detalle', crearInputLlaves(
            campeon.detalle, { ambito: 'campeon', campo: 'detalle' }, { placeholder: 'Ej.: Mini Sumo · 2026' }
        )));

        bloque.appendChild(grid);
        return bloque;
    }

    function crearEditorPartidoLlaves(partido, datosBase, accionQuitar) {
        const datos = partido || {};
        const caja = crear('div', 'admin-llaves-partido');
        const grid = crear('div', 'admin-llaves-partido-campos');

        grid.appendChild(crearCampoLlaves('Equipo A', crearInputLlaves(
            datos.equipoA, Object.assign({}, datosBase, { campo: 'equipoA' }), { placeholder: 'Por definir' }
        )));

        grid.appendChild(crearCampoLlaves('Puntos A', crearInputLlaves(
            datos.puntosA, Object.assign({}, datosBase, { campo: 'puntosA' }),
            { tipo: 'number', min: '0', step: '1' }
        )));

        grid.appendChild(crearCampoLlaves('Equipo B', crearInputLlaves(
            datos.equipoB, Object.assign({}, datosBase, { campo: 'equipoB' }), { placeholder: 'Por definir' }
        )));

        grid.appendChild(crearCampoLlaves('Puntos B', crearInputLlaves(
            datos.puntosB, Object.assign({}, datosBase, { campo: 'puntosB' }),
            { tipo: 'number', min: '0', step: '1' }
        )));

        grid.appendChild(crearCampoLlaves('Estado', crearSelectLlaves(
            datos.estado || 'pendiente',
            [['finalizado', 'Finalizado'], ['en_curso', 'En vivo'], ['pendiente', 'Pendiente']],
            Object.assign({}, datosBase, { campo: 'estado' })
        )));

        grid.appendChild(crearCampoLlaves('Ganador', crearSelectLlaves(
            datos.ganador || '',
            [['', 'Automático (puntos)'], ['A', 'Equipo A'], ['B', 'Equipo B']],
            Object.assign({}, datosBase, { campo: 'ganador' })
        )));

        caja.appendChild(grid);
        caja.appendChild(crearBotonLlaves('Quitar', 'ghost admin-llaves-quitar', accionQuitar, datosBase));

        return caja;
    }

    function crearEditorGruposLlaves(categoria) {
        const bloque = crearBloqueLlaves('Grupos', '+ Grupo', 'add-grupo');
        const grupos = Array.isArray(categoria.grupos) ? categoria.grupos : [];

        if (!grupos.length) {
            bloque.appendChild(crear('p', 'admin-muted', 'No hay grupos cargados.'));
        }

        grupos.forEach(function (grupo, indiceGrupo) {
            const caja = crear('div', 'admin-llaves-grupo');
            const cabecera = crear('div', 'admin-llaves-ronda-head');

            cabecera.appendChild(crearInputLlaves(
                grupo.nombre || '',
                { ambito: 'grupo', grupo: String(indiceGrupo), campo: 'nombre' },
                { placeholder: 'Nombre del grupo' }
            ));

            cabecera.appendChild(crearBotonLlaves(
                'Quitar grupo', 'ghost admin-llaves-quitar', 'del-grupo', { grupo: String(indiceGrupo) }
            ));

            caja.appendChild(cabecera);
            caja.appendChild(crearTablaEditableLlaves(
                categoria.columnas,
                Array.isArray(grupo.equipos) ? grupo.equipos : [],
                { ambito: 'grupo-fila', grupo: String(indiceGrupo) },
                'add-grupo-fila',
                'del-grupo-fila',
                '+ Equipo'
            ));

            bloque.appendChild(caja);
        });

        return bloque;
    }

    function crearEditorCrucesLlaves(categoria) {
        const cruces = categoria.cruces || { titulo: 'CRUCES', partidos: [] };
        const bloque = crearBloqueLlaves('Cruces eliminatorios', '+ Cruce', 'add-cruce');

        bloque.appendChild(crearCampoLlaves('Título de los cruces', crearInputLlaves(
            cruces.titulo, { ambito: 'cruces', campo: 'titulo' },
            { placeholder: 'Ej.: SEMIFINALES' }
        ), 'ancho'));

        const lista = crear('div', 'admin-llaves-partidos');
        const partidos = Array.isArray(cruces.partidos) ? cruces.partidos : [];

        if (!partidos.length) {
            lista.appendChild(crear('p', 'admin-muted', 'No hay cruces cargados.'));
        }

        partidos.forEach(function (partido, indiceCruce) {
            lista.appendChild(crearEditorPartidoLlaves(
                partido,
                { ambito: 'cruce', cruce: String(indiceCruce) },
                'del-cruce'
            ));
        });

        bloque.appendChild(lista);
        return bloque;
    }

    function crearEditorTablaLlaves(categoria) {
        const bloque = crearBloqueLlaves('Filas de la tabla', null);

        bloque.appendChild(crearTablaEditableLlaves(
            categoria.columnas,
            Array.isArray(categoria.filas) ? categoria.filas : [],
            { ambito: 'tabla' },
            'add-fila-tabla',
            'del-fila-tabla',
            '+ Fila'
        ));

        return bloque;
    }

    function crearTablaEditableLlaves(columnas, filas, contexto, accionAgregar, accionQuitar, textoAgregar) {
        const contenedor = crear('div', 'admin-llaves-tabla-contenedor');
        const listaColumnas = (Array.isArray(columnas) ? columnas : []).filter(function (columna) {
            return columna && columna.clave && columna.clave !== 'pos';
        });

        if (!listaColumnas.length) {
            listaColumnas.push({ clave: 'equipo', titulo: 'EQUIPO' });
        }

        const wrap = crear('div', 'admin-llaves-tabla-wrap');
        const tabla = document.createElement('table');
        tabla.className = 'admin-llaves-tabla';

        const thead = document.createElement('thead');
        const filaHead = document.createElement('tr');
        filaHead.appendChild(crear('th', '', '#'));
        listaColumnas.forEach(function (columna) {
            filaHead.appendChild(crear('th', '', columna.titulo || columna.clave));
        });
        filaHead.appendChild(crear('th', '', ''));
        thead.appendChild(filaHead);
        tabla.appendChild(thead);

        const tbody = document.createElement('tbody');
        const listaFilas = Array.isArray(filas) ? filas : [];

        if (!listaFilas.length) {
            const filaVacia = document.createElement('tr');
            const celda = document.createElement('td');
            celda.colSpan = listaColumnas.length + 2;
            celda.className = 'admin-llaves-tabla-vacia';
            celda.textContent = 'Sin filas cargadas.';
            filaVacia.appendChild(celda);
            tbody.appendChild(filaVacia);
        }

        listaFilas.forEach(function (fila, indiceFila) {
            const tr = document.createElement('tr');
            tr.appendChild(crear('td', 'admin-llaves-tabla-num', String(indiceFila + 1)));

            listaColumnas.forEach(function (columna) {
                const td = document.createElement('td');
                const valor = fila ? fila[columna.clave] : '';

                td.appendChild(crearInputLlaves(
                    valor,
                    Object.assign({}, contexto, { fila: String(indiceFila), campo: columna.clave }),
                    { clase: 'admin-llaves-celda' }
                ));

                tr.appendChild(td);
            });

            const tdAccion = document.createElement('td');
            tdAccion.className = 'admin-llaves-tabla-accion';
            tdAccion.appendChild(crearBotonLlaves(
                '×',
                'ghost admin-llaves-quitar',
                accionQuitar,
                Object.assign({}, contexto, { fila: String(indiceFila) })
            ));

            tr.appendChild(tdAccion);
            tbody.appendChild(tr);
        });

        tabla.appendChild(tbody);
        wrap.appendChild(tabla);
        contenedor.appendChild(wrap);
        contenedor.appendChild(crearBotonLlaves(textoAgregar, 'ghost', accionAgregar, contexto));

        return contenedor;
    }

    function manejarEntradaLlaves(evento) {
        const control = evento.target;
        if (!control || !control.dataset || !control.dataset.ambito) return;

        const categoria = categoriaLlavesActual();
        if (!categoria) return;

        const campo = control.dataset.campo;
        if (!campo) return;

        const datos = control.dataset;
        const valor = control.value;

        if (datos.ambito === 'comun') {
            categoria[campo] = valor;
        } else if (datos.ambito === 'ronda') {
            const ronda = (categoria.rondas || [])[Number(datos.ronda)];
            if (ronda) ronda[campo] = valor;
        } else if (datos.ambito === 'partido') {
            const ronda = (categoria.rondas || [])[Number(datos.ronda)];
            const partido = ronda && Array.isArray(ronda.partidos)
                ? ronda.partidos[Number(datos.partido)]
                : null;
            if (partido) cambiarCampoPartidoLlaves(partido, campo, valor);
        } else if (datos.ambito === 'cruce') {
            const partido = categoria.cruces && Array.isArray(categoria.cruces.partidos)
                ? categoria.cruces.partidos[Number(datos.cruce)]
                : null;
            if (partido) cambiarCampoPartidoLlaves(partido, campo, valor);
        } else if (datos.ambito === 'cruces') {
            if (campo === 'titulo' && categoria.cruces) categoria.cruces.titulo = valor;
        } else if (datos.ambito === 'campeon') {
            if (!categoria.campeon || typeof categoria.campeon !== 'object') categoria.campeon = {};
            categoria.campeon[campo] = valor;
        } else if (datos.ambito === 'grupo') {
            const grupo = (categoria.grupos || [])[Number(datos.grupo)];
            if (grupo) grupo[campo] = valor;
        } else if (datos.ambito === 'grupo-fila') {
            const grupo = (categoria.grupos || [])[Number(datos.grupo)];
            const fila = grupo && Array.isArray(grupo.equipos)
                ? grupo.equipos[Number(datos.fila)]
                : null;
            if (fila) fila[campo] = convertirValorTablaLlaves(campo, valor, fila[campo]);
        } else if (datos.ambito === 'tabla') {
            const fila = Array.isArray(categoria.filas) ? categoria.filas[Number(datos.fila)] : null;
            if (fila) fila[campo] = convertirValorTablaLlaves(campo, valor, fila[campo]);
        }

        marcarLlavesCambios();
    }

    function manejarClickLlaves(evento) {
        const boton = evento.target.closest('button[data-accion]');
        if (!boton) return;

        const categoria = categoriaLlavesActual();
        if (!categoria) return;

        const datos = boton.dataset;
        const accion = datos.accion;
        let cambio = false;

        if (accion === 'add-ronda') {
            categoria.rondas = categoria.rondas || [];
            categoria.rondas.push({
                nombre: 'RONDA ' + (categoria.rondas.length + 1),
                partidos: [partidoVacioLlaves()]
            });
            cambio = true;
        } else if (accion === 'del-ronda') {
            const ronda = (categoria.rondas || [])[Number(datos.ronda)];
            if (ronda && confirm('¿Quitar la ronda "' + (ronda.nombre || '') + '" y todos sus partidos?')) {
                categoria.rondas.splice(Number(datos.ronda), 1);
                cambio = true;
            }
        } else if (accion === 'add-partido') {
            const ronda = (categoria.rondas || [])[Number(datos.ronda)];
            if (ronda) {
                ronda.partidos = ronda.partidos || [];
                ronda.partidos.push(partidoVacioLlaves());
                cambio = true;
            }
        } else if (accion === 'del-partido') {
            const ronda = (categoria.rondas || [])[Number(datos.ronda)];
            if (ronda && Array.isArray(ronda.partidos)) {
                ronda.partidos.splice(Number(datos.partido), 1);
                cambio = true;
            }
        } else if (accion === 'add-grupo') {
            categoria.grupos = categoria.grupos || [];
            categoria.grupos.push({
                nombre: 'GRUPO ' + letraGrupoLlaves(categoria.grupos.length),
                equipos: [filaVaciaLlaves(categoria.columnas)]
            });
            cambio = true;
        } else if (accion === 'del-grupo') {
            const grupo = (categoria.grupos || [])[Number(datos.grupo)];
            if (grupo && confirm('¿Quitar "' + (grupo.nombre || 'el grupo') + '"?')) {
                categoria.grupos.splice(Number(datos.grupo), 1);
                cambio = true;
            }
        } else if (accion === 'add-grupo-fila') {
            const grupo = (categoria.grupos || [])[Number(datos.grupo)];
            if (grupo) {
                grupo.equipos = grupo.equipos || [];
                grupo.equipos.push(filaVaciaLlaves(categoria.columnas));
                cambio = true;
            }
        } else if (accion === 'del-grupo-fila') {
            const grupo = (categoria.grupos || [])[Number(datos.grupo)];
            if (grupo && Array.isArray(grupo.equipos)) {
                grupo.equipos.splice(Number(datos.fila), 1);
                cambio = true;
            }
        } else if (accion === 'add-cruce') {
            if (!categoria.cruces || typeof categoria.cruces !== 'object') {
                categoria.cruces = { titulo: 'CRUCES', partidos: [] };
            }

            categoria.cruces.partidos = Array.isArray(categoria.cruces.partidos)
                ? categoria.cruces.partidos
                : [];
            categoria.cruces.partidos.push(partidoVacioLlaves());
            cambio = true;
        } else if (accion === 'del-cruce') {
            if (categoria.cruces && Array.isArray(categoria.cruces.partidos)) {
                categoria.cruces.partidos.splice(Number(datos.cruce), 1);
                cambio = true;
            }
        } else if (accion === 'add-fila-tabla') {
            categoria.filas = categoria.filas || [];
            categoria.filas.push(filaVaciaLlaves(categoria.columnas));
            cambio = true;
        } else if (accion === 'del-fila-tabla') {
            if (Array.isArray(categoria.filas)) {
                categoria.filas.splice(Number(datos.fila), 1);
                cambio = true;
            }
        }

        if (cambio) {
            marcarLlavesCambios();
            renderizarEditorLlaves();
        }
    }

    function cambiarCategoriaLlaves() {
        const select = document.getElementById('llavesCategoria');
        if (!select) return;

        const indice = parseInt(select.value, 10);
        if (Number.isFinite(indice)) llavesIndiceSeleccionado = indice;

        renderizarEditorLlaves();
    }

    function marcarRotacionLlaves() {
        if (!llavesTrabajo) return;

        const input = document.getElementById('llavesRotacion');
        const segundos = Number(input.value);

        if (Number.isFinite(segundos)) {
            llavesTrabajo.rotacionSegundos = segundos;
        }

        marcarLlavesCambios();
    }

    async function guardarLlavesClick() {
        const error = document.getElementById('llavesError');
        const boton = document.getElementById('llavesGuardar');

        if (!llavesTrabajo) return;
        if (error) error.hidden = true;

        const inputRotacion = document.getElementById('llavesRotacion');
        const segundos = rotacionNormalizada(inputRotacion ? inputRotacion.value : llavesTrabajo.rotacionSegundos);
        llavesTrabajo.rotacionSegundos = segundos;
        if (inputRotacion) inputRotacion.value = String(segundos);

        if (!documentoConCategorias(llavesTrabajo)) {
            mostrarErrorLlaves('Agregá al menos una pantalla antes de guardar.');
            return;
        }

        const datos = clonar(llavesTrabajo);
        delete datos.actualizadoEn;

        const textoBoton = boton ? boton.textContent : '';
        if (boton) {
            boton.disabled = true;
            boton.textContent = 'Guardando…';
        }

        llavesCambios = false;

        try {
            await HorariosSync.guardarLlaves(
                datos,
                sesion && sesion.user ? sesion.user.email : null
            );

            mostrarToast('Llaves publicadas en la 2.ª TV.');
        } catch (fallo) {
            console.error('No se pudieron guardar las llaves:', fallo);
            llavesCambios = true;
            mostrarErrorLlaves(traducirErrorGuardado(fallo));
        } finally {
            if (boton) {
                boton.disabled = false;
                boton.textContent = textoBoton || 'Guardar en la 2.ª TV';
            }

            actualizarInfoLlaves();
        }
    }

    async function recargarLlavesClick() {
        if (llavesCambios && !confirm('¿Descartar los cambios sin guardar y recargar desde la nube?')) {
            return;
        }

        const boton = document.getElementById('llavesRecargar');
        const error = document.getElementById('llavesError');

        if (error) error.hidden = true;
        if (boton) {
            boton.disabled = true;
            boton.textContent = 'Recargando…';
        }

        llavesCambios = false;
        llavesRemotoPendiente = null;
        llavesErrorTabla = '';

        try {
            const registro = await HorariosSync.obtenerLlaves();

            if (registro && documentoConCategorias(registro.datos)) {
                aplicarRegistroLlaves(registro, 'nube');
            } else {
                const cache = typeof HorariosSync.leerCacheLlaves === 'function'
                    ? HorariosSync.leerCacheLlaves()
                    : null;

                if (cache && documentoConCategorias(cache.datos)) {
                    aplicarRegistroLlaves(cache, 'cache');
                } else {
                    usarDatosEstaticos();
                }

                const problema = typeof HorariosSync.problemaLlaves === 'function'
                    ? HorariosSync.problemaLlaves()
                    : '';

                if (problema) llavesErrorTabla = mensajeProblemaLlaves(problema);
            }

            actualizarInfoLlaves();
            mostrarToast(registro ? 'Datos recargados desde la nube.' : 'Se recargó la última copia disponible.');
        } catch (fallo) {
            mostrarToast('No se pudo recargar: ' + (fallo.message || fallo), true);
        } finally {
            if (boton) {
                boton.disabled = false;
                boton.textContent = 'Recargar';
            }
        }
    }

    function marcarLlavesCambios() {
        llavesCambios = true;
        actualizarInfoLlaves();
    }

    function mostrarErrorLlaves(mensaje) {
        const error = document.getElementById('llavesError');
        if (!error) return;

        error.textContent = mensaje;
        error.hidden = false;
    }

    function actualizarInfoLlaves() {
        const info = document.getElementById('llavesInfo');
        if (!info) return;

        const partes = [];

        if (llavesErrorTabla) {
            partes.push(llavesErrorTabla);
        } else if (llavesActualizadoEn) {
            const marca = formatearFecha(llavesActualizadoEn);
            partes.push('Último cambio en la 2.ª TV: ' + (marca || llavesActualizadoEn) +
                (llavesActualizadoPor ? ' · por ' + llavesActualizadoPor : '') + '.');
        } else if (llavesTrabajo && !llavesFirmaAplicada) {
            partes.push('Se muestran los datos de ejemplo. Guardá una vez para publicarlos en la 2.ª TV.');
        } else if (llavesTrabajo) {
            partes.push('Todavía no hay datos guardados en la nube.');
        } else {
            partes.push('Cargando llaves…');
        }

        if (llavesCambios) partes.push('Hay cambios sin guardar.');
        if (llavesRemotoPendiente) {
            partes.push('Hay cambios nuevos desde otro dispositivo: guardá los tuyos o usá Recargar.');
        }

        info.textContent = partes.join(' ');
        info.classList.toggle('admin-llaves-info-error', !!llavesErrorTabla || !!llavesRemotoPendiente);
        info.classList.toggle('admin-llaves-info-alerta', !!llavesCambios);

        const card = document.getElementById('llavesCard');
        if (card) card.classList.toggle('admin-llaves-dirty', !!llavesCambios);
    }

    /* ---------- Utilidades del editor de llaves ---------- */

    function categoriaLlavesActual() {
        if (!llavesTrabajo || !Array.isArray(llavesTrabajo.categorias)) return null;
        return llavesTrabajo.categorias[llavesIndiceSeleccionado] || null;
    }

    function documentoConCategorias(datos) {
        return !!(datos && Array.isArray(datos.categorias) && datos.categorias.length);
    }

    function firmaLlaves(datos) {
        return JSON.stringify(datos || {});
    }

    function clonar(valor) {
        return JSON.parse(JSON.stringify(valor === undefined ? null : valor));
    }

    function documentoEstatico() {
        if (typeof bracketsEvento === 'undefined' || !bracketsEvento) {
            return { rotacionSegundos: 18, categorias: [] };
        }

        const copia = clonar(bracketsEvento);
        delete copia.actualizadoEn;
        return copia;
    }

    function normalizarDocumento(original) {
        const doc = clonar(original || {});
        doc.rotacionSegundos = rotacionNormalizada(doc.rotacionSegundos);

        const lista = Array.isArray(doc.categorias) ? doc.categorias : [];

        doc.categorias = lista.filter(function (categoria) {
            return categoria && typeof categoria === 'object';
        }).map(function (categoria, indice) {
            if (!categoria.id) categoria.id = 'pantalla-' + (indice + 1);
            if (!categoria.titulo) categoria.titulo = 'PANTALLA ' + (indice + 1);
            if (!categoria.tipo) categoria.tipo = 'tabla';
            if (!colorValido(categoria.acento)) categoria.acento = '#00ffff';

            if (categoria.tipo === 'llaves') {
                const rondas = Array.isArray(categoria.rondas) ? categoria.rondas : [];

                categoria.rondas = rondas.map(function (ronda, indiceRonda) {
                    const datos = ronda && typeof ronda === 'object' ? ronda : {};
                    datos.nombre = datos.nombre || 'RONDA ' + (indiceRonda + 1);
                    datos.partidos = Array.isArray(datos.partidos) ? datos.partidos : [];
                    return datos;
                });

                categoria.campeon = categoria.campeon && typeof categoria.campeon === 'object'
                    ? categoria.campeon
                    : { equipo: null, detalle: '' };
            } else if (categoria.tipo === 'grupos') {
                categoria.columnas = columnasDeCategoria(categoria, 'grupos');

                const grupos = Array.isArray(categoria.grupos) ? categoria.grupos : [];
                categoria.grupos = grupos.map(function (grupo, indiceGrupo) {
                    const datos = grupo && typeof grupo === 'object' ? grupo : {};
                    datos.nombre = datos.nombre || 'GRUPO ' + letraGrupoLlaves(indiceGrupo);
                    datos.equipos = Array.isArray(datos.equipos) ? datos.equipos : [];
                    return datos;
                });

                if (!categoria.cruces || typeof categoria.cruces !== 'object') {
                    categoria.cruces = { titulo: 'CRUCES', partidos: [] };
                }

                categoria.cruces.titulo = categoria.cruces.titulo || 'CRUCES';
                categoria.cruces.partidos = Array.isArray(categoria.cruces.partidos)
                    ? categoria.cruces.partidos
                    : [];
            } else {
                categoria.columnas = columnasDeCategoria(categoria, 'tabla');
                categoria.filas = Array.isArray(categoria.filas) ? categoria.filas : [];
            }

            return categoria;
        });

        return doc;
    }

    function columnasDeCategoria(categoria, tipo) {
        if (Array.isArray(categoria.columnas) && categoria.columnas.length) {
            return categoria.columnas;
        }

        const estaticas = (typeof bracketsEvento !== 'undefined' && bracketsEvento &&
            Array.isArray(bracketsEvento.categorias)) ? bracketsEvento.categorias : [];

        const encontrada = estaticas.find(function (posible) {
            return posible && ((categoria.id && posible.id === categoria.id) ||
                (categoria.titulo && posible.titulo === categoria.titulo));
        });

        if (encontrada && Array.isArray(encontrada.columnas) && encontrada.columnas.length) {
            return clonar(encontrada.columnas);
        }

        if (tipo === 'grupos') {
            return [
                { clave: 'pos', titulo: 'POS' },
                { clave: 'equipo', titulo: 'EQUIPO', alineacion: 'izq' },
                { clave: 'pj', titulo: 'PJ' },
                { clave: 'dg', titulo: 'DIF' },
                { clave: 'pts', titulo: 'PTS', destacar: true }
            ];
        }

        return [
            { clave: 'pos', titulo: 'POS' },
            { clave: 'equipo', titulo: 'EQUIPO', alineacion: 'izq' },
            { clave: 'puntos', titulo: 'PUNTOS', destacar: true }
        ];
    }

    function rotacionNormalizada(valor) {
        const numero = Number(valor);
        if (!Number.isFinite(numero)) return 18;
        return Math.min(300, Math.max(5, Math.round(numero)));
    }

    function colorValido(color) {
        return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(color || ''));
    }

    function etiquetaTipoLlaves(tipo) {
        if (tipo === 'llaves') return 'Llaves / eliminación directa';
        if (tipo === 'grupos') return 'Grupos + cruces';
        return 'Tabla de posiciones';
    }

    function mensajeProblemaLlaves(problema) {
        const texto = String(problema || '');

        if (/does not exist|schema cache|relation .*llaves/i.test(texto)) {
            return 'La tabla de llaves todavía no existe. Ejecutá supabase/llaves.sql en el SQL Editor de Supabase.';
        }

        if (/row-level security|permission denied/i.test(texto)) {
            return 'La cuenta no tiene permisos para las llaves. Revisá el correo de las políticas en supabase/llaves.sql.';
        }

        return 'No se pudo leer la nube: ' + texto + ' Se muestra la última copia disponible.';
    }

    function cambiarCampoPartidoLlaves(partido, campo, valor) {
        if (campo === 'puntosA' || campo === 'puntosB') {
            if (String(valor).trim() === '') {
                partido[campo] = null;
            } else {
                const numero = Number(valor);
                partido[campo] = Number.isFinite(numero) ? numero : null;
            }
            return;
        }

        if (campo === 'ganador') {
            if (valor === 'A' || valor === 'B') {
                partido.ganador = valor;
            } else {
                delete partido.ganador;
            }
            return;
        }

        partido[campo] = valor;
    }

    function convertirValorTablaLlaves(campo, valor, anterior) {
        if (typeof anterior === 'number') {
            if (String(valor).trim() === '') return '';
            const numero = Number(String(valor).replace(',', '.'));
            return Number.isFinite(numero) ? numero : valor;
        }

        return valor;
    }

    function partidoVacioLlaves() {
        return {
            equipoA: null,
            equipoB: null,
            puntosA: null,
            puntosB: null,
            estado: 'pendiente'
        };
    }

    function filaVaciaLlaves(columnas) {
        const fila = {};

        (Array.isArray(columnas) ? columnas : []).forEach(function (columna) {
            if (columna && columna.clave && columna.clave !== 'pos') {
                fila[columna.clave] = '';
            }
        });

        return fila;
    }

    function letraGrupoLlaves(indice) {
        const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        return letras[indice] || String(indice + 1);
    }

    function crear(etiqueta, clase, texto) {
        const elemento = document.createElement(etiqueta);
        if (clase) elemento.className = clase;
        if (texto !== undefined && texto !== null) elemento.textContent = texto;
        return elemento;
    }

    function crearCampoLlaves(texto, control, clase) {
        const label = crear('label', 'admin-llaves-campo' + (clase ? ' ' + clase : ''));
        label.appendChild(crear('span', '', texto));
        label.appendChild(control);
        return label;
    }

    function crearInputLlaves(valor, dataset, opciones) {
        opciones = opciones || {};

        const input = document.createElement('input');
        input.type = opciones.tipo || 'text';
        input.value = valor === null || valor === undefined ? '' : String(valor);

        if (opciones.placeholder) input.placeholder = opciones.placeholder;
        if (opciones.min !== undefined) input.min = opciones.min;
        if (opciones.max !== undefined) input.max = opciones.max;
        if (opciones.step !== undefined) input.step = opciones.step;
        if (opciones.clase) input.className = opciones.clase;

        asignarDatasetLlaves(input, dataset);
        return input;
    }

    function crearSelectLlaves(valor, opciones, dataset) {
        const select = document.createElement('select');

        (opciones || []).forEach(function (par) {
            const opcion = document.createElement('option');
            opcion.value = par[0];
            opcion.textContent = par[1];
            select.appendChild(opcion);
        });

        select.value = valor === null || valor === undefined ? '' : String(valor);
        asignarDatasetLlaves(select, dataset);
        return select;
    }

    function asignarDatasetLlaves(elemento, dataset) {
        Object.keys(dataset || {}).forEach(function (clave) {
            elemento.dataset[clave] = String(dataset[clave]);
        });
    }

    function crearBotonLlaves(texto, clase, accion, dataset) {
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'admin-button ' + clase;
        boton.textContent = texto;

        boton.dataset.accion = accion;
        asignarDatasetLlaves(boton, dataset);

        return boton;
    }

    function crearBloqueLlaves(titulo, textoBoton, accion) {
        const bloque = crear('div', 'admin-llaves-bloque');
        const cabecera = crear('div', 'admin-llaves-bloque-head');

        cabecera.appendChild(crear('h3', '', titulo));

        if (textoBoton && accion) {
            cabecera.appendChild(crearBotonLlaves(textoBoton, 'ghost', accion));
        }

        bloque.appendChild(cabecera);
        return bloque;
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

        if (/does not exist|schema cache/i.test(mensaje) && /llaves/i.test(mensaje)) {
            return 'La tabla de llaves todavía no existe. Ejecutá supabase/llaves.sql en el SQL Editor de Supabase y volvé a intentar.';
        }
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

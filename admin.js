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

    const Logica = window.BracketsLogica;

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

    const CATEGORIAS_EQUIPO = [
        { clave: 'mini-sumo', etiqueta: 'Mini Sumo' },
        { clave: 'sumo', etiqueta: 'Sumo' },
        { clave: 'futbol', etiqueta: 'Fútbol de Robots' },
        { clave: 'sigue-lineas', etiqueta: 'Sigue Líneas' }
    ];

    const ESTADOS_PARTIDO = [
        ['pendiente', 'Pendiente'],
        ['en_curso', 'En vivo'],
        ['finalizado', 'Finalizado']
    ];

    async function cargarLlavesPanel() {
        const info = document.getElementById('llavesInfo');

        if (!window.HorariosSync || typeof HorariosSync.iniciarLlaves !== 'function') {
            if (info) info.textContent = 'No se cargó el módulo de llaves. Actualizá la página.';
            return;
        }

        if (!Logica) {
            if (info) info.textContent = 'No se cargó brackets-logica.js. Actualizá la página.';
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
        llavesActualizadoEn = null;
        llavesActualizadoPor = null;
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

        editor.appendChild(crearEditorEquipos());

        if (!categoria) {
            editor.appendChild(crear('p', 'admin-muted', 'No hay pantallas cargadas.'));
            return;
        }

        editor.appendChild(crearFichaLlaves(categoria));

        if (categoria.tipo === 'llaves') {
            editor.appendChild(crearEditorLlaves(categoria));
            editor.appendChild(crearEditorTercerPuesto(categoria));
        } else if (categoria.tipo === 'futbol') {
            editor.appendChild(crearEditorGruposFutbol(categoria));
            editor.appendChild(crearEditorPlayoffsFutbol(categoria));
        } else if (categoria.tipo === 'tiempos') {
            editor.appendChild(crearEditorTiempos(categoria));
        } else {
            editor.appendChild(crearEditorResumen(categoria));
        }
    }

    /* ---------- Lista maestra de equipos ---------- */

    function crearEditorEquipos() {
        const equipos = llavesTrabajo && Array.isArray(llavesTrabajo.equipos)
            ? llavesTrabajo.equipos
            : [];

        const bloque = crearBloqueLlaves('Equipos inscriptos (' + equipos.length + ')');
        agregarAccionBloque(bloque, '+ Equipo', 'add-equipo');

        bloque.appendChild(crear('p', 'admin-llaves-hint',
            'Esta es la lista maestra. Los cruces y los tiempos se eligen desde acá, ' +
            'así que no hace falta escribir nombres a mano. Si cambiás un nombre, ' +
            'se actualiza en todas las pantallas.'));

        const wrap = crear('div', 'admin-llaves-tabla-wrap');
        const tabla = document.createElement('table');
        tabla.className = 'admin-llaves-tabla admin-equipos-tabla';

        const thead = document.createElement('thead');
        const filaHead = document.createElement('tr');

        ['EQUIPO / ROBOT', 'INSTITUCIÓN', 'CATEGORÍA', ''].forEach(function (titulo) {
            filaHead.appendChild(crear('th', '', titulo));
        });

        thead.appendChild(filaHead);
        tabla.appendChild(thead);

        const tbody = document.createElement('tbody');

        if (!equipos.length) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 4;
            td.className = 'admin-llaves-tabla-vacia';
            td.textContent = 'Todavía no hay equipos. Usá "+ Equipo" para agregar el primero.';
            tr.appendChild(td);
            tbody.appendChild(tr);
        }

        equipos.forEach(function (equipo) {
            const tr = document.createElement('tr');

            tr.appendChild(celdaInputEquipo(equipo, 'nombre', 'Nombre del robot o equipo'));
            tr.appendChild(celdaInputEquipo(equipo, 'institucion', 'Institución'));

            const tdCategoria = document.createElement('td');
            tdCategoria.appendChild(crearSelectCategoriaEquipo(equipo));
            tr.appendChild(tdCategoria);

            const tdAccion = document.createElement('td');
            tdAccion.className = 'admin-llaves-tabla-accion';
            tdAccion.appendChild(crearBotonLlaves(
                '×',
                'ghost admin-llaves-quitar',
                'del-equipo',
                { equipo: equipo.id }
            ));
            tr.appendChild(tdAccion);

            tbody.appendChild(tr);
        });

        tabla.appendChild(tbody);
        wrap.appendChild(tabla);
        bloque.appendChild(wrap);

        const conteo = CATEGORIAS_EQUIPO.map(function (categoria) {
            const cantidad = equipos.filter(function (equipo) {
                return equipo.categoria === categoria.clave;
            }).length;
            return cantidad + ' ' + categoria.etiqueta;
        }).join(' · ');

        bloque.appendChild(crear('p', 'admin-llaves-conteo', conteo));

        return bloque;
    }

    function celdaInputEquipo(equipo, campo, placeholder) {
        const td = document.createElement('td');
        td.appendChild(crearInputLlaves(
            equipo[campo] || '',
            { ambito: 'equipo', equipo: equipo.id, campo: campo },
            { clase: 'admin-llaves-celda', placeholder: placeholder }
        ));
        return td;
    }

    function crearSelectCategoriaEquipo(equipo) {
        const select = document.createElement('select');
        select.className = 'admin-llaves-celda';

        CATEGORIAS_EQUIPO.forEach(function (categoria) {
            const opcion = document.createElement('option');
            opcion.value = categoria.clave;
            opcion.textContent = categoria.etiqueta;
            select.appendChild(opcion);
        });

        select.value = claveCategoriaValida(equipo.categoria);
        asignarDatasetLlaves(select, {
            ambito: 'equipo',
            equipo: equipo.id,
            campo: 'categoria'
        });

        return select;
    }

    /* ---------- Ficha de la pantalla ---------- */

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
            { placeholder: 'Ej.: Eliminación directa · mejor de 3 asaltos' }
        ), 'ancho'));

        ficha.appendChild(grid);

        const etiquetas = crear('div', 'admin-llaves-etiquetas');
        etiquetas.appendChild(crear('span', 'admin-tag admin-llaves-tipo',
            'Pantalla: ' + etiquetaTipoLlaves(categoria.tipo)));

        if (categoria.equipos) {
            etiquetas.appendChild(crear('span', 'admin-tag',
                'Equipos: ' + etiquetaCategoriaEquipo(categoria.equipos)));
        }

        ficha.appendChild(etiquetas);
        return ficha;
    }

    /* ---------- Mini Sumo / Sumo ---------- */

    function crearEditorLlaves(categoria) {
        const bloque = crearBloqueLlaves('Rondas y combates');
        agregarAccionBloque(bloque, 'Actualizar vista', 'refrescar-editor');
        agregarAccionBloque(bloque, '+ Ronda', 'add-ronda');

        const rondas = Array.isArray(categoria.rondas) ? categoria.rondas : [];
        const resuelto = Logica.resolverLlaves(categoria);

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
                'Quitar ronda',
                'ghost admin-llaves-quitar',
                'del-ronda',
                { ronda: String(indiceRonda) }
            ));

            caja.appendChild(cabecera);

            const lista = crear('div', 'admin-llaves-partidos');
            const partidos = Array.isArray(ronda.partidos) ? ronda.partidos : [];

            if (!partidos.length) {
                lista.appendChild(crear('p', 'admin-muted', 'Sin combates en esta ronda.'));
            }

            partidos.forEach(function (partido, indicePartido) {
                const vista = resuelto.rondas[indiceRonda]
                    ? resuelto.rondas[indiceRonda].partidos[indicePartido]
                    : null;

                lista.appendChild(crearEditorCombate(
                    partido,
                    {
                        ambito: 'partido',
                        ronda: String(indiceRonda),
                        partido: String(indicePartido)
                    },
                    categoria,
                    'del-partido',
                    vista
                ));
            });

            lista.appendChild(crearBotonLlaves(
                '+ Combate',
                'ghost',
                'add-partido',
                { ronda: String(indiceRonda) }
            ));

            caja.appendChild(lista);
            bloque.appendChild(caja);
        });

        bloque.appendChild(crear('p', 'admin-llaves-hint',
            'Cargá los Yuhkoh de cada combate. El ganador pasa solo a la ronda ' +
            'siguiente y el podio se calcula automáticamente.'));

        return bloque;
    }

    function crearEditorTercerPuesto(categoria) {
        const bloque = crearBloqueLlaves('Tercer puesto y podio');
        agregarAccionBloque(bloque, 'Actualizar vista', 'refrescar-editor');

        const resuelto = Logica.resolverLlaves(categoria);

        bloque.appendChild(crearEditorCombate(
            categoria.tercerPuesto,
            { ambito: 'tercero', tipo: 'tercero' },
            categoria,
            null,
            resuelto.tercero
        ));

        bloque.appendChild(crear('p', 'admin-llaves-hint admin-llaves-podio-hint', textoPodio(categoria)));

        return bloque;
    }

    function crearEditorCombate(partido, contexto, categoria, accionQuitar, vista) {
        const datos = partido || {};
        const caja = crear('div', 'admin-llaves-partido');
        const grid = crear('div', 'admin-llaves-partido-campos');

        grid.appendChild(crearCampoLlaves('Equipo A', crearSelectEquipos(
            categoria.equipos,
            datos.equipoA,
            Object.assign({}, contexto, { campo: 'equipoA' })
        ), 'ancho-equipo'));

        grid.appendChild(crearCampoLlaves('Yuhkoh A', crearSelectNumero(
            datos.puntosA,
            [0, 1, 2],
            Object.assign({}, contexto, { campo: 'puntosA' })
        )));

        grid.appendChild(crearCampoLlaves('Equipo B', crearSelectEquipos(
            categoria.equipos,
            datos.equipoB,
            Object.assign({}, contexto, { campo: 'equipoB' })
        ), 'ancho-equipo'));

        grid.appendChild(crearCampoLlaves('Yuhkoh B', crearSelectNumero(
            datos.puntosB,
            [0, 1, 2],
            Object.assign({}, contexto, { campo: 'puntosB' })
        )));

        grid.appendChild(crearCampoLlaves('Estado', crearSelectLlaves(
            datos.estado || 'pendiente',
            ESTADOS_PARTIDO,
            Object.assign({}, contexto, { campo: 'estado' })
        )));

        caja.appendChild(grid);

        const autoavance = textoAutoavance(datos, vista, contexto);
        if (autoavance) {
            const hint = crear('p', 'admin-llaves-autoavance', autoavance);

            if (contexto && contexto.ambito === 'tercero') {
                hint.dataset.autoavance = 'tercero';
            } else if (contexto && contexto.ronda !== undefined) {
                hint.dataset.autoavance = 'ronda';
                hint.dataset.ronda = String(contexto.ronda);
                hint.dataset.partido = String(contexto.partido);
            }

            caja.appendChild(hint);
        }

        if (accionQuitar) {
            caja.appendChild(crearBotonLlaves('Quitar', 'ghost admin-llaves-quitar', accionQuitar, contexto));
        }

        return caja;
    }

    /**
     * Explica qué equipos entran solos a un combate (ganadores de la ronda
     * anterior o perdedores de las semifinales). Así el panel muestra el
     * mismo cruce que la TV sin que el admin tenga que cargarlo.
     */
    function textoAutoavance(datos, vista, contexto) {
        if (!vista) return '';

        const autoA = !datos.equipoA && vista.equipoA;
        const autoB = !datos.equipoB && vista.equipoB;

        if (autoA || autoB) {
            const a = nombreEquipoPodio(vista.equipoA, 'Por definir');
            const b = nombreEquipoPodio(vista.equipoB, 'Por definir');
            return 'Se completa solo: ' + a + ' vs ' + b + '.';
        }

        if (datos.equipoA || datos.equipoB) return '';

        if (contexto && contexto.tipo === 'tercero') {
            return 'Se completa solo con los perdedores de las semifinales.';
        }

        if (contexto && Number(contexto.ronda) > 0) {
            return 'Se completa solo con los ganadores de la ronda anterior.';
        }

        return '';
    }

    /**
     * Vuelve a calcular los avisos de autoavance sin rehacer todo el editor,
     * para que el cruce se actualice mientras se cargan los Yuhkoh.
     */
    function refrescarAutoavance() {
        const categoria = categoriaLlavesActual();

        if (!categoria || categoria.tipo !== 'llaves') return;

        const resuelto = Logica.resolverLlaves(categoria);
        const avisos = document.querySelectorAll('#llavesEditor .admin-llaves-autoavance');

        Array.prototype.forEach.call(avisos, function (aviso) {
            const tipo = aviso.dataset.autoavance;
            let vista = null;
            let datos = {};
            let contexto = null;

            if (tipo === 'tercero') {
                vista = resuelto.tercero;
                datos = categoria.tercerPuesto || {};
                contexto = { tipo: 'tercero' };
            } else if (tipo === 'ronda') {
                const indiceRonda = Number(aviso.dataset.ronda);
                const indicePartido = Number(aviso.dataset.partido);
                const ronda = resuelto.rondas[indiceRonda];
                const original = (categoria.rondas || [])[indiceRonda];

                vista = ronda ? ronda.partidos[indicePartido] : null;
                datos = original && original.partidos ? original.partidos[indicePartido] : {};
                contexto = { ronda: indiceRonda };
            }

            if (!vista) return;

            const texto = textoAutoavance(datos || {}, vista, contexto);
            aviso.textContent = texto;
            aviso.hidden = !texto;
        });

        const podio = document.querySelector('#llavesEditor .admin-llaves-podio-hint');
        if (podio) podio.textContent = textoPodio(categoria);
    }

    /** Refresca lo que se calcula solo, sin rehacer todo el editor. */
    function refrescarVistaEditor() {
        const categoria = categoriaLlavesActual();
        if (!categoria) return;

        if (categoria.tipo === 'llaves') {
            refrescarAutoavance();
        } else if (categoria.tipo === 'futbol') {
            refrescarVistaFutbol();
        } else if (categoria.tipo === 'tiempos') {
            refrescarMejoresTiempos();
        }
    }

    function refrescarVistaFutbol() {
        const categoria = categoriaLlavesActual();
        if (!categoria || categoria.tipo !== 'futbol') return;

        const resuelto = Logica.resolverFutbol(categoria);

        Array.prototype.forEach.call(
            document.querySelectorAll('#llavesEditor .admin-llaves-tabla-grupo'),
            function (contenedor) {
                const indice = Number(contenedor.dataset.grupo);
                contenedor.textContent = '';
                contenedor.appendChild(crearTablaStandings(categoria, indice));
            }
        );

        Array.prototype.forEach.call(
            document.querySelectorAll('#llavesEditor .admin-llaves-playoff-equipos'),
            function (span) {
                const clave = span.dataset.clave;
                const partido = partidoResueltoFutbol(resuelto, clave) || {};
                const pistas = pistasPlayoff(clave);

                span.textContent = nombreEquipoPodio(partido.equipoA, pistas[0]) +
                    '  vs  ' + nombreEquipoPodio(partido.equipoB, pistas[1]);
            }
        );

        const podio = document.querySelector('#llavesEditor .admin-llaves-podio-hint');
        if (podio) podio.textContent = textoPodio(categoria);
    }

    function refrescarMejoresTiempos() {
        const categoria = categoriaLlavesActual();
        if (!categoria || categoria.tipo !== 'tiempos') return;

        Array.prototype.forEach.call(
            document.querySelectorAll('#llavesEditor .admin-llaves-partido--tiempo'),
            function (caja, indice) {
                const entrada = (categoria.entradas || [])[indice];
                const chip = caja.querySelector('.admin-llaves-mejor');

                if (!entrada || !chip) return;

                chip.textContent = 'Mejor: ' + Logica.formatearTiempo(mejorTiempoEntrada(entrada));
            }
        );
    }

    function partidoResueltoFutbol(resuelto, clave) {
        if (clave === 'final') return resuelto.final;
        if (clave === 'tercero') return resuelto.tercerPuesto;

        const indice = Number(String(clave).replace('semifinal-', ''));
        return Number.isFinite(indice) ? resuelto.semifinales[indice] : null;
    }

    function pistasPlayoff(clave) {
        if (clave === 'final') return ['Ganador SF1', 'Ganador SF2'];
        if (clave === 'tercero') return ['Perdedor SF1', 'Perdedor SF2'];
        if (clave === 'semifinal-1') return ['1.º Grupo B', '2.º Grupo A'];
        return ['1.º Grupo A', '2.º Grupo B'];
    }

    /* ---------- Fútbol de robots ---------- */

    function crearEditorGruposFutbol(categoria) {
        const bloque = crearBloqueLlaves('Fase de grupos');
        agregarAccionBloque(bloque, 'Actualizar tablas', 'refrescar-editor');
        agregarAccionBloque(bloque, '+ Grupo', 'add-grupo');

        const grupos = Array.isArray(categoria.grupos) ? categoria.grupos : [];

        if (!grupos.length) {
            bloque.appendChild(crear('p', 'admin-muted', 'No hay grupos cargados.'));
        }

        grupos.forEach(function (grupo, indiceGrupo) {
            bloque.appendChild(crearEditorGrupoFutbol(categoria, grupo, indiceGrupo));
        });

        bloque.appendChild(crear('p', 'admin-llaves-hint',
            'Cada equipo juega al menos dos partidos. Clasifican 1.º y 2.º de ' +
            'cada grupo. La tabla se calcula con los resultados finalizados.'));

        return bloque;
    }

    function crearEditorGrupoFutbol(categoria, grupo, indiceGrupo) {
        const caja = crear('div', 'admin-llaves-grupo');
        const cabecera = crear('div', 'admin-llaves-ronda-head');

        cabecera.appendChild(crearInputLlaves(
            grupo.nombre || '',
            { ambito: 'grupo', grupo: String(indiceGrupo), campo: 'nombre' },
            { placeholder: 'Nombre del grupo', clase: 'admin-llaves-ronda-nombre' }
        ));

        cabecera.appendChild(crearBotonLlaves(
            'Quitar grupo',
            'ghost admin-llaves-quitar',
            'del-grupo',
            { grupo: String(indiceGrupo) }
        ));

        caja.appendChild(cabecera);

        const slots = crear('div', 'admin-llaves-partido admin-llaves-partido--slots');
        const camposSlots = crear('div', 'admin-llaves-partido-campos');

        const equipos = Array.isArray(grupo.equipos) ? grupo.equipos : [];

        for (let posicion = 0; posicion < 3; posicion += 1) {
            camposSlots.appendChild(crearCampoLlaves(
                'Equipo ' + (posicion + 1),
                crearSelectEquipos('futbol', equipos[posicion], {
                    ambito: 'grupo-equipo',
                    grupo: String(indiceGrupo),
                    slot: String(posicion)
                }),
                'ancho-equipo'
            ));
        }

        slots.appendChild(camposSlots);
        caja.appendChild(slots);

        const lista = crear('div', 'admin-llaves-partidos');
        const partidos = Array.isArray(grupo.partidos) ? grupo.partidos : [];

        if (!partidos.length) {
            lista.appendChild(crear('p', 'admin-muted', 'Sin partidos en este grupo.'));
        }

        partidos.forEach(function (partido, indicePartido) {
            lista.appendChild(crearEditorPartidoFutbol(
                partido,
                {
                    ambito: 'grupo-partido',
                    grupo: String(indiceGrupo),
                    partido: String(indicePartido)
                },
                'del-grupo-partido'
            ));
        });

        lista.appendChild(crearBotonLlaves(
            '+ Partido',
            'ghost',
            'add-grupo-partido',
            { grupo: String(indiceGrupo) }
        ));

        caja.appendChild(lista);

        const tabla = crear('div', 'admin-llaves-tabla-grupo');
        tabla.dataset.grupo = String(indiceGrupo);
        tabla.appendChild(crearTablaStandings(categoria, indiceGrupo));
        caja.appendChild(tabla);

        return caja;
    }

    /** Tabla de posiciones del grupo, calculada igual que en la TV. */
    function crearTablaStandings(categoria, indiceGrupo) {
        const grupo = (categoria.grupos || [])[indiceGrupo] || {};
        const filas = Logica.tablaGrupo(grupo);

        const tabla = document.createElement('table');
        tabla.className = 'admin-llaves-standings';

        const thead = document.createElement('thead');
        const filaHead = document.createElement('tr');

        ['POS', 'EQUIPO', 'PJ', 'DG', 'PTS'].forEach(function (titulo) {
            filaHead.appendChild(crear('th', '', titulo));
        });

        thead.appendChild(filaHead);
        tabla.appendChild(thead);

        const tbody = document.createElement('tbody');

        if (!filas.length) {
            const tr = document.createElement('tr');
            const td = crear('td', 'admin-llaves-tabla-vacia', 'Sin equipos en el grupo');
            td.colSpan = 5;
            tr.appendChild(td);
            tbody.appendChild(tr);
        }

        filas.forEach(function (fila, indice) {
            const tr = document.createElement('tr');
            if (indice < 2) tr.className = 'clasifica';

            tr.appendChild(crear('td', 'pos', String(indice + 1)));
            tr.appendChild(crear('td', 'equipo', nombreEquipoPodio(fila.equipo, 'Por definir')));
            tr.appendChild(crear('td', '', String(fila.pj)));
            tr.appendChild(crear('td', '', (fila.dg > 0 ? '+' : '') + fila.dg));
            tr.appendChild(crear('td', 'pts', String(fila.pts)));

            tbody.appendChild(tr);
        });

        tabla.appendChild(tbody);
        return tabla;
    }

    function crearEditorPartidoFutbol(partido, contexto, accionQuitar) {
        const datos = partido || {};
        const caja = crear('div', 'admin-llaves-partido');
        const grid = crear('div', 'admin-llaves-partido-campos');

        grid.appendChild(crearCampoLlaves('Equipo A', crearSelectEquipos(
            'futbol', datos.equipoA,
            Object.assign({}, contexto, { campo: 'equipoA' })
        ), 'ancho-equipo'));

        grid.appendChild(crearCampoLlaves('Goles A', crearInputNumero(
            datos.golesA,
            Object.assign({}, contexto, { campo: 'golesA' })
        )));

        grid.appendChild(crearCampoLlaves('Equipo B', crearSelectEquipos(
            'futbol', datos.equipoB,
            Object.assign({}, contexto, { campo: 'equipoB' })
        ), 'ancho-equipo'));

        grid.appendChild(crearCampoLlaves('Goles B', crearInputNumero(
            datos.golesB,
            Object.assign({}, contexto, { campo: 'golesB' })
        )));

        grid.appendChild(crearCampoLlaves('Estado', crearSelectLlaves(
            datos.estado || 'pendiente',
            ESTADOS_PARTIDO,
            Object.assign({}, contexto, { campo: 'estado' })
        )));

        caja.appendChild(grid);

        if (accionQuitar) {
            caja.appendChild(crearBotonLlaves('Quitar', 'ghost admin-llaves-quitar', accionQuitar, contexto));
        }

        return caja;
    }

    function crearEditorPlayoffsFutbol(categoria) {
        const bloque = crearBloqueLlaves('Eliminatorias');
        agregarAccionBloque(bloque, 'Actualizar cruces', 'refrescar-editor');

        bloque.appendChild(crear('p', 'admin-llaves-hint',
            'Los cruces se arman solos con la tabla: 1.º A vs 2.º B y 1.º B vs 2.º A. ' +
            'Si hay empate, cargá los penales. La final y el tercer puesto también ' +
            'se completan automáticamente.'));

        const resuelto = Logica.resolverFutbol(categoria);

        const filas = [
            {
                etiqueta: 'Semifinal 1',
                clave: 'semifinal-0',
                partido: resuelto.semifinales[0],
                pistas: ['1.º Grupo A', '2.º Grupo B']
            },
            {
                etiqueta: 'Semifinal 2',
                clave: 'semifinal-1',
                partido: resuelto.semifinales[1],
                pistas: ['1.º Grupo B', '2.º Grupo A']
            },
            {
                etiqueta: 'Final',
                clave: 'final',
                partido: resuelto.final,
                pistas: ['Ganador SF1', 'Ganador SF2']
            },
            {
                etiqueta: 'Tercer puesto',
                clave: 'tercero',
                partido: resuelto.tercerPuesto,
                pistas: ['Perdedor SF1', 'Perdedor SF2']
            }
        ];

        filas.forEach(function (fila) {
            bloque.appendChild(crearEditorPlayoff(fila));
        });

        const podio = Logica.podioCategoria(categoria);
        bloque.appendChild(crear('p', 'admin-llaves-hint admin-llaves-podio-hint',
            'Podio actual · 1.º: ' + nombreEquipoPodio(podio.campeon) +
            ' · 2.º: ' + nombreEquipoPodio(podio.subcampeon) +
            ' · 3.º: ' + nombreEquipoPodio(podio.tercero)));

        return bloque;
    }

    function crearEditorPlayoff(fila) {
        const partido = fila.partido || {};
        const caja = crear('div', 'admin-llaves-partido admin-llaves-partido--playoff');

        const cabecera = crear('div', 'admin-llaves-playoff-head');
        cabecera.appendChild(crear('span', 'admin-llaves-playoff-nombre', fila.etiqueta));

        const equipos = crear('span', 'admin-llaves-playoff-equipos',
            nombreEquipoPodio(partido.equipoA, fila.pistas[0]) + '  vs  ' +
            nombreEquipoPodio(partido.equipoB, fila.pistas[1]));
        equipos.dataset.clave = fila.clave;
        cabecera.appendChild(equipos);

        caja.appendChild(cabecera);

        const grid = crear('div', 'admin-llaves-partido-campos');

        grid.appendChild(crearCampoLlaves('Goles A', crearInputNumero(
            partido.golesA,
            { ambito: 'playoff', clave: fila.clave, campo: 'golesA' }
        )));

        grid.appendChild(crearCampoLlaves('Penales A', crearInputNumero(
            partido.penalesA,
            { ambito: 'playoff', clave: fila.clave, campo: 'penalesA' },
            { placeholder: 'Si empatan' }
        )));

        grid.appendChild(crearCampoLlaves('Goles B', crearInputNumero(
            partido.golesB,
            { ambito: 'playoff', clave: fila.clave, campo: 'golesB' }
        )));

        grid.appendChild(crearCampoLlaves('Penales B', crearInputNumero(
            partido.penalesB,
            { ambito: 'playoff', clave: fila.clave, campo: 'penalesB' },
            { placeholder: 'Si empatan' }
        )));

        grid.appendChild(crearCampoLlaves('Estado', crearSelectLlaves(
            partido.estado || 'pendiente',
            ESTADOS_PARTIDO,
            { ambito: 'playoff', clave: fila.clave, campo: 'estado' }
        )));

        caja.appendChild(grid);
        return caja;
    }

    /* ---------- Sigue Líneas ---------- */

    function crearEditorTiempos(categoria) {
        const bloque = crearBloqueLlaves('Tiempos de pista');
        agregarAccionBloque(bloque, '+ Robot', 'add-tiempo');

        bloque.appendChild(crear('p', 'admin-llaves-hint',
            'Cargá tres pasadas por robot en segundos y milésimas. La TV muestra ' +
            'el formato 12.480 s y ordena sola por el mejor tiempo. Si una pasada ' +
            'no se corrió, dejala vacía.'));

        const entradas = Array.isArray(categoria.entradas) ? categoria.entradas : [];

        if (!entradas.length) {
            bloque.appendChild(crear('p', 'admin-muted', 'No hay robots cargados.'));
        }

        const lista = crear('div', 'admin-llaves-partidos');

        entradas.forEach(function (entrada, indice) {
            const caja = crear('div', 'admin-llaves-partido admin-llaves-partido--tiempo');
            const grid = crear('div', 'admin-llaves-partido-campos admin-llaves-tiempo-grid');

            grid.appendChild(crearCampoLlaves('Robot', crearSelectEquipos(
                'sigue-lineas',
                entrada.equipo,
                { ambito: 'tiempo', fila: String(indice), campo: 'equipo' }
            ), 'ancho-equipo'));

            for (let intento = 0; intento < 3; intento += 1) {
                grid.appendChild(crearCampoLlaves(
                    'Pasada ' + (intento + 1),
                    crearCamposTiempo(entrada.tiempos ? entrada.tiempos[intento] : null, indice, intento)
                ));
            }

            caja.appendChild(grid);

            const mejor = mejorTiempoEntrada(entrada);
            caja.appendChild(crear('span', 'admin-llaves-mejor',
                'Mejor: ' + Logica.formatearTiempo(mejor)));

            caja.appendChild(crearBotonLlaves(
                'Quitar',
                'ghost admin-llaves-quitar',
                'del-tiempo',
                { fila: String(indice) }
            ));

            lista.appendChild(caja);
        });

        bloque.appendChild(lista);
        return bloque;
    }

    function crearCamposTiempo(milisegundos, fila, intento) {
        const grupo = crear('div', 'admin-tiempo-campos');
        const partes = Logica.partirTiempo(milisegundos);

        const segundos = document.createElement('input');
        segundos.type = 'number';
        segundos.min = '0';
        segundos.max = '999';
        segundos.step = '1';
        segundos.placeholder = 'seg';
        segundos.className = 'admin-tiempo-seg';
        segundos.value = partes.segundos === '' ? '' : String(partes.segundos);

        const milesimas = document.createElement('input');
        milesimas.type = 'text';
        milesimas.inputMode = 'numeric';
        milesimas.maxLength = 3;
        milesimas.placeholder = '000';
        milesimas.className = 'admin-tiempo-ms';
        milesimas.value = partes.milesimas === '' ? '' : String(partes.milesimas).padStart(3, '0');

        const dataset = {
            ambito: 'tiempo-tiempo',
            fila: String(fila),
            intento: String(intento)
        };

        asignarDatasetLlaves(segundos, Object.assign({}, dataset, { campo: 'segundos' }));
        asignarDatasetLlaves(milesimas, Object.assign({}, dataset, { campo: 'milesimas' }));

        const etiquetaSeg = crear('span', 'admin-tiempo-unidad', 's');
        const etiquetaMs = crear('span', 'admin-tiempo-unidad', 'ms');

        grupo.appendChild(segundos);
        grupo.appendChild(etiquetaSeg);
        grupo.appendChild(milesimas);
        grupo.appendChild(etiquetaMs);

        return grupo;
    }

    /* ---------- Resumen ---------- */

    function crearEditorResumen(categoria) {
        const bloque = crearBloqueLlaves('Podios del torneo');
        agregarAccionBloque(bloque, 'Actualizar vista', 'refrescar-editor');

        bloque.appendChild(crear('p', 'admin-llaves-hint',
            'Esta pantalla no se edita: muestra el campeón, el subcampeón y el ' +
            'tercer puesto de cada categoría. Se actualiza con los resultados ' +
            'que cargues en las otras pantallas.'));

        const categorias = llavesTrabajo && Array.isArray(llavesTrabajo.categorias)
            ? llavesTrabajo.categorias
            : [];

        categorias.forEach(function (otra) {
            if (!otra || !otra.tipo || otra.tipo === 'resumen') return;

            const podio = Logica.podioCategoria(otra);
            const fila = crear('div', 'admin-llaves-podio-linea');
            fila.appendChild(crear('strong', '', otra.titulo || 'Categoría'));
            fila.appendChild(crear('span', '',
                '1.º ' + nombreEquipoPodio(podio.campeon) +
                ' · 2.º ' + nombreEquipoPodio(podio.subcampeon) +
                ' · 3.º ' + nombreEquipoPodio(podio.tercero)));
            bloque.appendChild(fila);
        });

        return bloque;
    }

    /* ---------- Entrada de datos ---------- */

    function manejarEntradaLlaves(evento) {
        const control = evento.target;
        if (!control || !control.dataset || !control.dataset.ambito) return;

        const ambito = control.dataset.ambito;
        const datos = control.dataset;
        const valor = control.value;

        if (ambito === 'equipo') {
            if (!llavesTrabajo || !Array.isArray(llavesTrabajo.equipos)) return;

            const equipo = llavesTrabajo.equipos.find(function (item) {
                return item.id === datos.equipo;
            });

            if (!equipo) return;

            if (datos.campo === 'categoria') {
                equipo.categoria = claveCategoriaValida(valor);
            } else {
                equipo[datos.campo] = valor;
            }

            marcarLlavesCambios();
            refrescarVistaEditor();

            if (datos.campo === 'categoria' && evento.type === 'change') {
                renderizarEditorLlaves();
            }

            return;
        }

        const categoria = categoriaLlavesActual();
        if (!categoria) return;

        if (ambito === 'comun') {
            categoria[datos.campo] = valor;
        } else if (ambito === 'ronda') {
            const ronda = (categoria.rondas || [])[Number(datos.ronda)];
            if (ronda) ronda[datos.campo] = valor;
        } else if (ambito === 'partido') {
            const ronda = (categoria.rondas || [])[Number(datos.ronda)];
            const partido = ronda && Array.isArray(ronda.partidos)
                ? ronda.partidos[Number(datos.partido)]
                : null;
            if (partido) aplicarCampoCombate(partido, datos.campo, valor);
        } else if (ambito === 'tercero') {
            if (!categoria.tercerPuesto || typeof categoria.tercerPuesto !== 'object') {
                categoria.tercerPuesto = combateVacio();
            }
            aplicarCampoCombate(categoria.tercerPuesto, datos.campo, valor);
        } else if (ambito === 'grupo') {
            const grupo = (categoria.grupos || [])[Number(datos.grupo)];
            if (grupo) grupo[datos.campo] = valor;
        } else if (ambito === 'grupo-equipo') {
            const grupo = (categoria.grupos || [])[Number(datos.grupo)];
            if (grupo) {
                grupo.equipos = Array.isArray(grupo.equipos) ? grupo.equipos : [null, null, null];

                const slot = Number(datos.slot);
                const id = valor || null;

                grupo.equipos[slot] = id;

                // Un mismo equipo no puede estar dos veces en el grupo.
                if (id) {
                    grupo.equipos = grupo.equipos.map(function (actual, posicion) {
                        return posicion !== slot && actual === id ? null : actual;
                    });
                }
            }
        } else if (ambito === 'grupo-partido') {
            const grupo = (categoria.grupos || [])[Number(datos.grupo)];
            const partido = grupo && Array.isArray(grupo.partidos)
                ? grupo.partidos[Number(datos.partido)]
                : null;
            if (partido) aplicarCampoPartidoFutbol(partido, datos.campo, valor);
        } else if (ambito === 'playoff') {
            const partido = partidoPlayoff(categoria, datos.clave);
            if (partido) aplicarCampoPartidoFutbol(partido, datos.campo, valor);
        } else if (ambito === 'tiempo') {
            const entrada = (categoria.entradas || [])[Number(datos.fila)];
            if (entrada) entrada.equipo = valor || null;
        } else if (ambito === 'tiempo-tiempo') {
            const entrada = (categoria.entradas || [])[Number(datos.fila)];
            if (entrada) {
                const contenedor = control.closest('.admin-tiempo-campos');
                const segundos = contenedor
                    ? contenedor.querySelector('[data-campo="segundos"]')
                    : null;
                const milesimas = contenedor
                    ? contenedor.querySelector('[data-campo="milesimas"]')
                    : null;

                entrada.tiempos = Array.isArray(entrada.tiempos)
                    ? entrada.tiempos
                    : [null, null, null];

                entrada.tiempos[Number(datos.intento)] = Logica.unirTiempo(
                    segundos ? segundos.value : '',
                    milesimas ? milesimas.value : ''
                );
            }
        }

        marcarLlavesCambios();
        refrescarVistaEditor();
    }

    function manejarClickLlaves(evento) {
        const boton = evento.target.closest('button[data-accion]');
        if (!boton) return;

        const categoria = categoriaLlavesActual();
        const datos = boton.dataset;
        const accion = datos.accion;
        let cambio = false;

        if (accion === 'refrescar-editor') {
            renderizarEditorLlaves();
            return;
        }

        if (accion === 'add-equipo') {
            if (!llavesTrabajo) return;

            const clave = categoria && categoria.equipos
                ? claveCategoriaValida(categoria.equipos)
                : 'mini-sumo';

            llavesTrabajo.equipos = Array.isArray(llavesTrabajo.equipos)
                ? llavesTrabajo.equipos
                : [];

            llavesTrabajo.equipos.push({
                id: crearId('eq'),
                nombre: 'Nuevo equipo',
                institucion: '',
                categoria: clave
            });

            cambio = true;
        } else if (accion === 'del-equipo') {
            if (!llavesTrabajo || !Array.isArray(llavesTrabajo.equipos)) return;

            const id = datos.equipo;
            const equipo = llavesTrabajo.equipos.find(function (item) {
                return item.id === id;
            });

            if (!equipo) return;

            if (!confirm('¿Quitar "' + (equipo.nombre || 'el equipo') +
                '" de la lista? También se borra de todos los cruces y tiempos.')) {
                return;
            }

            llavesTrabajo.equipos = llavesTrabajo.equipos.filter(function (item) {
                return item.id !== id;
            });

            limpiarReferenciasEquipo(llavesTrabajo, id);
            cambio = true;
        } else if (!categoria) {
            return;
        } else if (accion === 'add-ronda') {
            categoria.rondas = Array.isArray(categoria.rondas) ? categoria.rondas : [];
            categoria.rondas.push({
                nombre: 'RONDA ' + (categoria.rondas.length + 1),
                partidos: [combateVacio()]
            });
            cambio = true;
        } else if (accion === 'del-ronda') {
            const ronda = (categoria.rondas || [])[Number(datos.ronda)];
            if (ronda && confirm('¿Quitar la ronda "' + (ronda.nombre || '') +
                '" y todos sus combates?')) {
                categoria.rondas.splice(Number(datos.ronda), 1);
                cambio = true;
            }
        } else if (accion === 'add-partido') {
            const ronda = (categoria.rondas || [])[Number(datos.ronda)];
            if (ronda) {
                ronda.partidos = Array.isArray(ronda.partidos) ? ronda.partidos : [];
                ronda.partidos.push(combateVacio());
                cambio = true;
            }
        } else if (accion === 'del-partido') {
            const ronda = (categoria.rondas || [])[Number(datos.ronda)];
            if (ronda && Array.isArray(ronda.partidos)) {
                ronda.partidos.splice(Number(datos.partido), 1);
                cambio = true;
            }
        } else if (accion === 'add-grupo') {
            categoria.grupos = Array.isArray(categoria.grupos) ? categoria.grupos : [];
            categoria.grupos.push({
                nombre: 'GRUPO ' + letraGrupo(categoria.grupos.length),
                equipos: [null, null, null],
                partidos: [partidoFutbolVacio()]
            });
            cambio = true;
        } else if (accion === 'del-grupo') {
            const grupo = (categoria.grupos || [])[Number(datos.grupo)];
            if (grupo && confirm('¿Quitar "' + (grupo.nombre || 'el grupo') + '"?')) {
                categoria.grupos.splice(Number(datos.grupo), 1);
                cambio = true;
            }
        } else if (accion === 'add-grupo-partido') {
            const grupo = (categoria.grupos || [])[Number(datos.grupo)];
            if (grupo) {
                grupo.partidos = Array.isArray(grupo.partidos) ? grupo.partidos : [];
                grupo.partidos.push(partidoFutbolVacio());
                cambio = true;
            }
        } else if (accion === 'del-grupo-partido') {
            const grupo = (categoria.grupos || [])[Number(datos.grupo)];
            if (grupo && Array.isArray(grupo.partidos)) {
                grupo.partidos.splice(Number(datos.partido), 1);
                cambio = true;
            }
        } else if (accion === 'add-tiempo') {
            categoria.entradas = Array.isArray(categoria.entradas) ? categoria.entradas : [];
            categoria.entradas.push({
                equipo: null,
                tiempos: [null, null, null]
            });
            cambio = true;
        } else if (accion === 'del-tiempo') {
            if (Array.isArray(categoria.entradas)) {
                categoria.entradas.splice(Number(datos.fila), 1);
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
        llavesTrabajo.version = 2;
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

            mostrarToast('Llaves y resultados publicados en la 2.ª TV.');
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
            const valido = registro && documentoConCategorias(registro.datos);

            if (valido) {
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
            mostrarToast(valido
                ? 'Datos recargados desde la nube.'
                : 'Se recargó la última copia disponible.');
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
            partes.push('Se muestran los datos locales. Guardá una vez para publicarlos en la 2.ª TV.');
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
        return !!(Logica && Logica.documentoValido(datos));
    }

    function firmaLlaves(datos) {
        return JSON.stringify(datos || {});
    }

    function clonar(valor) {
        return JSON.parse(JSON.stringify(valor === undefined ? null : valor));
    }

    function documentoEstatico() {
        if (typeof bracketsEvento === 'undefined' || !bracketsEvento) {
            return {
                version: 2,
                rotacionSegundos: 18,
                equipos: [],
                categorias: []
            };
        }

        const copia = clonar(bracketsEvento);
        delete copia.actualizadoEn;
        return copia;
    }

    function normalizarDocumento(original) {
        const doc = clonar(original || {});
        doc.version = 2;
        doc.rotacionSegundos = rotacionNormalizada(doc.rotacionSegundos);
        doc.sede = doc.sede || 'Nave Cultural · Mendoza';

        doc.equipos = (Array.isArray(doc.equipos) ? doc.equipos : [])
            .filter(function (equipo) {
                return equipo && equipo.id;
            })
            .map(function (equipo) {
                return {
                    id: String(equipo.id),
                    nombre: String(equipo.nombre || 'Equipo'),
                    institucion: String(equipo.institucion || ''),
                    categoria: claveCategoriaValida(equipo.categoria)
                };
            });

        const lista = Array.isArray(doc.categorias) ? doc.categorias : [];

        doc.categorias = lista.filter(function (categoria) {
            return categoria && typeof categoria === 'object';
        }).map(function (categoria, indice) {
            const datos = Object.assign({}, categoria);

            datos.id = datos.id || 'pantalla-' + (indice + 1);
            datos.titulo = datos.titulo || 'PANTALLA ' + (indice + 1);
            datos.corto = datos.corto || datos.titulo;
            datos.fase = datos.fase || '';
            datos.nota = datos.nota || '';
            datos.acento = colorValido(datos.acento) ? datos.acento : '#00ffff';
            datos.tipo = tipoPantallaValido(datos.tipo);

            if (datos.tipo === 'llaves') {
                datos.rondas = (Array.isArray(datos.rondas) ? datos.rondas : []).map(function (ronda, indiceRonda) {
                    const info = ronda && typeof ronda === 'object' ? ronda : {};

                    return {
                        nombre: info.nombre || 'RONDA ' + (indiceRonda + 1),
                        partidos: (Array.isArray(info.partidos) ? info.partidos : []).map(normalizarCombate)
                    };
                });

                datos.tercerPuesto = normalizarCombate(datos.tercerPuesto);
                datos.equipos = claveCategoriaValida(datos.equipos || 'mini-sumo');
            } else if (datos.tipo === 'futbol') {
                datos.equipos = 'futbol';

                datos.grupos = (Array.isArray(datos.grupos) ? datos.grupos : []).map(function (grupo, indiceGrupo) {
                    const info = grupo && typeof grupo === 'object' ? grupo : {};

                    return {
                        nombre: info.nombre || 'GRUPO ' + letraGrupo(indiceGrupo),
                        equipos: (Array.isArray(info.equipos) ? info.equipos : []).slice(0, 3),
                        partidos: (Array.isArray(info.partidos) ? info.partidos : []).map(normalizarPartidoFutbol)
                    };
                });

                const playoffs = datos.playoffs && typeof datos.playoffs === 'object'
                    ? datos.playoffs
                    : {};

                const semis = Array.isArray(playoffs.semifinales) ? playoffs.semifinales : [];

                datos.playoffs = {
                    semifinales: [
                        normalizarPartidoFutbol(semis[0]),
                        normalizarPartidoFutbol(semis[1])
                    ],
                    final: normalizarPartidoFutbol(playoffs.final),
                    tercerPuesto: normalizarPartidoFutbol(playoffs.tercerPuesto)
                };
            } else if (datos.tipo === 'tiempos') {
                datos.equipos = 'sigue-lineas';

                datos.entradas = (Array.isArray(datos.entradas) ? datos.entradas : []).map(function (entrada) {
                    const info = entrada && typeof entrada === 'object' ? entrada : {};
                    const tiempos = Array.isArray(info.tiempos) ? info.tiempos : [];

                    return {
                        equipo: info.equipo || null,
                        tiempos: [
                            numeroONull(tiempos[0]),
                            numeroONull(tiempos[1]),
                            numeroONull(tiempos[2])
                        ]
                    };
                });
            }

            return datos;
        });

        return doc;
    }

    function normalizarCombate(partido) {
        const datos = partido && typeof partido === 'object' ? partido : {};

        return {
            equipoA: datos.equipoA || null,
            equipoB: datos.equipoB || null,
            puntosA: numeroONull(datos.puntosA),
            puntosB: numeroONull(datos.puntosB),
            estado: estadoValido(datos.estado)
        };
    }

    function normalizarPartidoFutbol(partido) {
        const datos = partido && typeof partido === 'object' ? partido : {};

        return {
            equipoA: datos.equipoA || null,
            equipoB: datos.equipoB || null,
            golesA: numeroONull(datos.golesA),
            golesB: numeroONull(datos.golesB),
            penalesA: numeroONull(datos.penalesA),
            penalesB: numeroONull(datos.penalesB),
            estado: estadoValido(datos.estado)
        };
    }

    function aplicarCampoCombate(partido, campo, valor) {
        if (campo === 'equipoA' || campo === 'equipoB') {
            partido[campo] = valor || null;
            return;
        }

        if (campo === 'puntosA' || campo === 'puntosB') {
            partido[campo] = valor === '' ? null : numeroONull(valor);
            return;
        }

        if (campo === 'estado') {
            partido.estado = estadoValido(valor);
            return;
        }

        partido[campo] = valor;
    }

    function aplicarCampoPartidoFutbol(partido, campo, valor) {
        if (campo === 'equipoA' || campo === 'equipoB') {
            partido[campo] = valor || null;
            return;
        }

        if (campo === 'estado') {
            partido.estado = estadoValido(valor);
            return;
        }

        partido[campo] = valor === '' ? null : numeroONull(valor);
    }

    function partidoPlayoff(categoria, clave) {
        const playoffs = categoria && categoria.playoffs ? categoria.playoffs : null;
        if (!playoffs) return null;

        if (clave === 'final') return playoffs.final || null;
        if (clave === 'tercero') return playoffs.tercerPuesto || null;

        const indice = Number(String(clave).replace('semifinal-', ''));
        if (!Number.isFinite(indice)) return null;

        return Array.isArray(playoffs.semifinales) ? playoffs.semifinales[indice] : null;
    }

    function limpiarReferenciasEquipo(doc, id) {
        (doc.categorias || []).forEach(function (categoria) {
            if (!categoria || typeof categoria !== 'object') return;

            if (categoria.tipo === 'llaves') {
                (categoria.rondas || []).forEach(function (ronda) {
                    (ronda.partidos || []).forEach(function (partido) {
                        if (partido.equipoA === id) partido.equipoA = null;
                        if (partido.equipoB === id) partido.equipoB = null;
                    });
                });

                if (categoria.tercerPuesto) {
                    if (categoria.tercerPuesto.equipoA === id) categoria.tercerPuesto.equipoA = null;
                    if (categoria.tercerPuesto.equipoB === id) categoria.tercerPuesto.equipoB = null;
                }
            } else if (categoria.tipo === 'futbol') {
                (categoria.grupos || []).forEach(function (grupo) {
                    grupo.equipos = (grupo.equipos || []).map(function (equipo) {
                        return equipo === id ? null : equipo;
                    });

                    (grupo.partidos || []).forEach(function (partido) {
                        if (partido.equipoA === id) partido.equipoA = null;
                        if (partido.equipoB === id) partido.equipoB = null;
                    });
                });

                const playoffs = categoria.playoffs || {};
                const partidos = []
                    .concat(Array.isArray(playoffs.semifinales) ? playoffs.semifinales : [])
                    .concat([playoffs.final, playoffs.tercerPuesto]);

                partidos.forEach(function (partido) {
                    if (!partido) return;
                    if (partido.equipoA === id) partido.equipoA = null;
                    if (partido.equipoB === id) partido.equipoB = null;
                });
            } else if (categoria.tipo === 'tiempos') {
                categoria.entradas = (categoria.entradas || []).filter(function (entrada) {
                    return entrada.equipo !== id;
                });
            }
        });
    }

    function mejorTiempoEntrada(entrada) {
        const tiempos = entrada && Array.isArray(entrada.tiempos) ? entrada.tiempos : [];
        const validos = tiempos.map(numeroONull).filter(function (tiempo) {
            return tiempo !== null && tiempo > 0;
        });

        return validos.length ? Math.min.apply(null, validos) : null;
    }

    function textoPodio(categoria) {
        const podio = Logica.podioCategoria(categoria);

        return 'Podio actual · 1.º: ' + nombreEquipoPodio(podio.campeon) +
            ' · 2.º: ' + nombreEquipoPodio(podio.subcampeon) +
            ' · 3.º: ' + nombreEquipoPodio(podio.tercero) + '.';
    }

    function nombreEquipoPodio(id, pista) {
        const equipo = Logica.equipo(llavesTrabajo, id);
        if (equipo && equipo.nombre) return equipo.nombre;
        return pista || 'Por definir';
    }

    function rotacionNormalizada(valor) {
        const numero = Number(valor);
        if (!Number.isFinite(numero)) return 18;
        return Math.min(300, Math.max(5, Math.round(numero)));
    }

    function colorValido(color) {
        return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(color || ''));
    }

    function claveCategoriaValida(valor) {
        const encontrada = CATEGORIAS_EQUIPO.find(function (categoria) {
            return categoria.clave === valor;
        });

        return encontrada ? encontrada.clave : 'mini-sumo';
    }

    function etiquetaCategoriaEquipo(clave) {
        const encontrada = CATEGORIAS_EQUIPO.find(function (categoria) {
            return categoria.clave === clave;
        });

        return encontrada ? encontrada.etiqueta : String(clave || '');
    }

    function tipoPantallaValido(tipo) {
        if (tipo === 'llaves' || tipo === 'futbol' || tipo === 'tiempos' || tipo === 'resumen') {
            return tipo;
        }
        return 'resumen';
    }

    function estadoValido(estado) {
        if (estado === 'en_curso' || estado === 'finalizado') return estado;
        return 'pendiente';
    }

    function numeroONull(valor) {
        if (valor === null || valor === undefined || valor === '') return null;
        const numero = Number(valor);
        return Number.isFinite(numero) ? numero : null;
    }

    function etiquetaTipoLlaves(tipo) {
        if (tipo === 'llaves') return 'Llaves / eliminación directa';
        if (tipo === 'futbol') return 'Fútbol · grupos y eliminatorias';
        if (tipo === 'tiempos') return 'Tabla de tiempos';
        return 'Resumen y podios';
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

    function combateVacio() {
        return {
            equipoA: null,
            equipoB: null,
            puntosA: null,
            puntosB: null,
            estado: 'pendiente'
        };
    }

    function partidoFutbolVacio() {
        return {
            equipoA: null,
            equipoB: null,
            golesA: null,
            golesB: null,
            penalesA: null,
            penalesB: null,
            estado: 'pendiente'
        };
    }

    function crearId(prefijo) {
        return prefijo + '-' + Date.now().toString(36) + '-' +
            Math.random().toString(36).slice(2, 6);
    }

    function letraGrupo(indice) {
        const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        return letras[indice] || String(indice + 1);
    }

    /* ---------- Constructores de controles ---------- */

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

    function crearInputNumero(valor, dataset, opciones) {
        opciones = opciones || {};

        const input = document.createElement('input');
        input.type = 'number';
        input.min = opciones.min !== undefined ? opciones.min : '0';
        input.step = '1';
        input.inputMode = 'numeric';
        input.value = valor === null || valor === undefined ? '' : String(valor);

        if (opciones.placeholder) input.placeholder = opciones.placeholder;
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

    function crearSelectEquipos(claveCategoria, valor, dataset) {
        const select = document.createElement('select');

        const vacio = document.createElement('option');
        vacio.value = '';
        vacio.textContent = '— Por definir —';
        select.appendChild(vacio);

        const equipos = Logica.equiposDeCategoria(llavesTrabajo, claveCategoria);
        const actual = Logica.equipo(llavesTrabajo, valor);

        // Si el equipo ya no pertenece a la categoría (por ejemplo, se cambió
        // de categoría después de cargarlo), se muestra igual para no perder
        // el cruce, avisando que está fuera de la lista.
        if (actual && !equipos.some(function (equipo) { return equipo.id === actual.id; })) {
            equipos.unshift(actual);
        }

        equipos.forEach(function (equipo) {
            const opcion = document.createElement('option');
            opcion.value = equipo.id;

            const fueraDeCategoria = equipo.categoria !== claveCategoria;
            opcion.textContent = equipo.nombre +
                (equipo.institucion ? ' · ' + equipo.institucion : '') +
                (fueraDeCategoria ? ' (otra categoría)' : '');

            select.appendChild(opcion);
        });

        select.value = valor || '';
        asignarDatasetLlaves(select, dataset);
        return select;
    }

    function crearSelectNumero(valor, valores, dataset) {
        const opciones = [['', '—']];

        (valores || []).forEach(function (numero) {
            opciones.push([String(numero), String(numero)]);
        });

        return crearSelectLlaves(valor, opciones, dataset);
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

    function crearBloqueLlaves(titulo) {
        const bloque = crear('div', 'admin-llaves-bloque');
        const cabecera = crear('div', 'admin-llaves-bloque-head');

        cabecera.appendChild(crear('h3', '', titulo));
        bloque.appendChild(cabecera);

        return bloque;
    }

    function agregarAccionBloque(bloque, texto, accion, dataset) {
        const cabecera = bloque.querySelector('.admin-llaves-bloque-head');
        if (cabecera) {
            cabecera.appendChild(crearBotonLlaves(texto, 'ghost', accion, dataset));
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

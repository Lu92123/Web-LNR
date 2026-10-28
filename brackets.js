/**
 * Pantalla de llaves y posiciones · Probotae 2026
 *
 * - Carrusel automático a pantalla completa entre las pantallas definidas
 *   en brackets-data.js.
 * - El tiempo de cada pantalla sale de bracketsEvento.rotacionSegundos
 *   (también se puede forzar con ?seg=25 en la URL).
 * - Los cálculos (avance de ganadores, tablas, podios) están en
 *   brackets-logica.js, que se comparte con el panel de administración.
 * - Controles pensados para una TV: flechas ← →, ESPACIO pausa,
 *   F pantalla completa y un punto por pantalla en el pie.
 */
(function () {
    'use strict';

    const SEGUNDOS_POR_DEFECTO = 18;
    const SEGUNDOS_MINIMOS = 5;

    const Logica = window.BracketsLogica;

    const DATOS_ESTATICOS = typeof bracketsEvento !== 'undefined' && bracketsEvento
        ? clonar(bracketsEvento)
        : null;

    let documento = DATOS_ESTATICOS ? clonar(DATOS_ESTATICOS) : null;
    let firmaAplicada = null;

    let categorias = [];
    let indiceActual = 0;
    let duracionPantalla = SEGUNDOS_POR_DEFECTO * 1000;
    let restanteCiclo = duracionPantalla;
    let inicioCiclo = 0;
    let temporizador = null;
    let pausado = false;
    let pausaAutomatica = false;

    let appEl = null;
    let mainEl = null;
    let progresoEl = null;
    let puntosEl = null;
    let ayudaEl = null;
    let categoriaEl = null;
    let faseEl = null;
    let centroEl = null;
    let relojEl = null;

    document.addEventListener('DOMContentLoaded', iniciar);

    /* ------------------------------------------------------------------ */
    /* Arranque                                                           */
    /* ------------------------------------------------------------------ */

    function iniciar() {
        appEl = document.getElementById('brkApp');
        mainEl = document.getElementById('brkMain');
        progresoEl = document.getElementById('brkProgreso');
        puntosEl = document.getElementById('brkPuntos');
        ayudaEl = document.getElementById('brkAyuda');
        categoriaEl = document.getElementById('brkCategoriaActual');
        faseEl = document.getElementById('brkFaseActual');
        centroEl = document.querySelector('.brk-header-centro');
        relojEl = document.getElementById('brkClock');

        aplicarTema();
        actualizarReloj();
        setInterval(actualizarReloj, 1000);

        if (!Logica) {
            mostrarErrorDatos('No se cargó brackets-logica.js. Revisá los archivos de la web.');
            return;
        }

        if (!documento || !Array.isArray(documento.categorias) || !documento.categorias.length) {
            mostrarErrorDatos();
            return;
        }

        categorias = documento.categorias.filter(function (categoria) {
            return categoria && categoria.tipo;
        });

        if (!categorias.length) {
            mostrarErrorDatos();
            return;
        }

        duracionPantalla = calcularDuracion();
        restanteCiclo = duracionPantalla;

        actualizarPie();

        construirPantallas();
        construirPuntos();

        const indiceInicial = leerIndiceInicial();
        mostrarPantalla(indiceInicial, false);
        iniciarCicloCompleto();

        document.addEventListener('keydown', manejarTeclado);
        document.addEventListener('visibilitychange', manejarVisibilidad);

        iniciarSincronizacionLlaves();
    }

    function aplicarTema() {
        const params = new URLSearchParams(window.location.search);
        const tema = params.get('tema');
        if (tema === 'claro' || tema === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
        }
    }

    function calcularDuracion() {
        const params = new URLSearchParams(window.location.search);
        const segundosUrl = parseInt(params.get('seg'), 10);
        const segundosDatos = Number(documento.rotacionSegundos);

        let segundos = SEGUNDOS_POR_DEFECTO;
        if (Number.isFinite(segundosDatos) && segundosDatos >= SEGUNDOS_MINIMOS) {
            segundos = segundosDatos;
        }
        if (Number.isFinite(segundosUrl) && segundosUrl >= SEGUNDOS_MINIMOS) {
            segundos = segundosUrl;
        }

        return segundos * 1000;
    }

    function leerIndiceInicial() {
        const params = new URLSearchParams(window.location.search);
        const pedido = parseInt(params.get('slide'), 10);
        if (Number.isFinite(pedido) && pedido >= 1 && pedido <= categorias.length) {
            return pedido - 1;
        }
        return 0;
    }

    function mostrarErrorDatos(mensajeExtra) {
        if (!mainEl) return;
        mainEl.textContent = '';
        const mensaje = document.createElement('div');
        mensaje.className = 'brk-error';
        mensaje.innerHTML = '<strong>No hay pantallas para mostrar.</strong>' +
            '<span>' + (mensajeExtra ||
                'Revisá <code>brackets-data.js</code>: tiene que existir ' +
                '<code>bracketsEvento.categorias</code> con al menos una categoría.') + '</span>';
        mainEl.appendChild(mensaje);
    }

    /* ------------------------------------------------------------------ */
    /* Datos en vivo desde Supabase                                       */
    /* ------------------------------------------------------------------ */

    function iniciarSincronizacionLlaves() {
        if (!window.HorariosSync || typeof window.HorariosSync.iniciarLlaves !== 'function') {
            return;
        }

        if (typeof window.HorariosSync.estaConfigurado === 'function' &&
            !window.HorariosSync.estaConfigurado()) {
            return;
        }

        window.HorariosSync.iniciarLlaves({
            alCambiar: function (registro) {
                aplicarLlaves(registro);
            }
        }).catch(function (error) {
            console.warn('WebLiga: no se pudo iniciar la sincronización de llaves.', error);
        });
    }

    function aplicarLlaves(registro) {
        const datos = registro && registro.datos;

        if (!Logica.documentoValido(datos)) {
            return false;
        }

        const firmaNueva = JSON.stringify(datos);

        if (firmaNueva === firmaAplicada) {
            actualizarPie(registro);
            return true;
        }

        firmaAplicada = firmaNueva;

        const anterior = categorias[indiceActual];
        const idAnterior = anterior ? (anterior.id || anterior.titulo) : null;

        documento = Object.assign({}, documento, datos);

        const nuevasCategorias = documento.categorias.filter(function (categoria) {
            return categoria && categoria.tipo;
        });

        if (!nuevasCategorias.length) return false;

        categorias = nuevasCategorias;
        duracionPantalla = calcularDuracion();

        construirPantallas();
        construirPuntos();

        let indiceNuevo = 0;

        if (idAnterior) {
            const encontrado = categorias.findIndex(function (categoria) {
                return (categoria.id || categoria.titulo) === idAnterior;
            });

            if (encontrado >= 0) {
                indiceNuevo = encontrado;
            } else {
                indiceNuevo = Math.min(indiceActual, categorias.length - 1);
            }
        }

        const estabaPausado = pausado;

        mostrarPantalla(indiceNuevo, false);
        iniciarCicloCompleto();

        if (estabaPausado) pausarCiclo();

        actualizarPie(registro);
        return true;
    }

    function actualizarPie(registro) {
        const actualizado = document.getElementById('brkActualizado');
        if (!actualizado) return;

        if (registro && registro.actualizadoEn) {
            actualizado.textContent = 'Actualizado: ' + formatearFechaHora(registro.actualizadoEn);
            return;
        }

        if (documento && documento.actualizadoEn) {
            actualizado.textContent = 'Actualizado: ' + documento.actualizadoEn;
            return;
        }

        actualizado.textContent = 'Datos locales';
    }

    function formatearFechaHora(fecha) {
        try {
            const valor = new Date(fecha);
            if (isNaN(valor.getTime())) return String(fecha);

            return valor.toLocaleString('es-AR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return String(fecha);
        }
    }

    /* ------------------------------------------------------------------ */
    /* Construcción de las pantallas                                      */
    /* ------------------------------------------------------------------ */

    function construirPantallas() {
        mainEl.textContent = '';

        categorias.forEach(function (categoria, indice) {
            const seccion = document.createElement('section');
            seccion.className = 'brk-slide';
            seccion.dataset.indice = String(indice);
            seccion.setAttribute('aria-hidden', 'true');
            seccion.setAttribute('role', 'group');
            seccion.setAttribute('aria-label', categoria.titulo +
                (categoria.fase ? ' · ' + categoria.fase : ''));

            if (categoria.nota) {
                seccion.appendChild(crearEl('p', 'brk-nota', categoria.nota));
            }

            if (categoria.tipo === 'llaves') {
                seccion.appendChild(crearLlaves(categoria));
            } else if (categoria.tipo === 'futbol') {
                seccion.appendChild(crearFutbol(categoria));
            } else if (categoria.tipo === 'tiempos') {
                seccion.appendChild(crearTablaTiempos(categoria));
            } else if (categoria.tipo === 'resumen') {
                seccion.appendChild(crearResumen(categoria));
            } else {
                seccion.appendChild(crearAviso('Tipo de pantalla desconocido: ' + categoria.tipo));
            }

            mainEl.appendChild(seccion);
        });
    }

    function construirPuntos() {
        puntosEl.textContent = '';

        categorias.forEach(function (categoria, indice) {
            const boton = document.createElement('button');
            boton.type = 'button';
            boton.className = 'brk-punto';
            boton.setAttribute('role', 'tab');
            boton.setAttribute('aria-selected', 'false');
            boton.title = 'Ir a ' + categoria.titulo;
            boton.textContent = categoria.corto || categoria.titulo;

            boton.addEventListener('click', function () {
                mostrarPantalla(indice, true);
            });

            puntosEl.appendChild(boton);
        });
    }

    /* ------------------------------------------------------------------ */
    /* Llaves de eliminación directa                                      */
    /* ------------------------------------------------------------------ */

    function crearLlaves(categoria) {
        const resuelto = Logica.resolverLlaves(categoria);
        const contenedor = crearEl('div', 'brk-bracket');

        resuelto.rondas.forEach(function (ronda, indice) {
            const columna = crearEl('div', 'brk-ronda');
            columna.appendChild(crearEl('h2', 'brk-ronda-titulo',
                ronda.nombre || 'RONDA ' + (indice + 1)));

            const partidos = crearEl('div', 'brk-partidos');

            if (ronda.partidos.length) {
                ronda.partidos.forEach(function (partido) {
                    partidos.appendChild(crearPartidoLlave(partido));
                });
            } else {
                partidos.appendChild(crearEl('p', 'brk-sin-partidos', 'Sin cruces cargados'));
            }

            columna.appendChild(partidos);
            contenedor.appendChild(columna);
        });

        const podio = crearEl('div', 'brk-podio');
        podio.appendChild(crearEl('h2', 'brk-ronda-titulo', 'TERCER PUESTO'));

        const cajaTercero = crearEl('div', 'brk-partidos brk-partidos--tercero');
        cajaTercero.appendChild(crearPartidoLlave(resuelto.tercero, 'brk-partido--tercero'));
        podio.appendChild(cajaTercero);

        podio.appendChild(crearCampeon(resuelto.campeon, categoria));
        contenedor.appendChild(podio);

        return contenedor;
    }

    function crearPartidoLlave(partido, claseExtra) {
        const datos = partido || {};
        const estado = datos.estado || 'pendiente';
        const articulo = crearEl('article', 'brk-partido brk-partido--' + estado +
            (claseExtra ? ' ' + claseExtra : ''));

        if (estado === 'en_curso') {
            articulo.appendChild(crearEl('span', 'brk-en-vivo', 'EN VIVO'));
        }

        const ganador = Logica.ganadorLlave(datos);
        const ganaA = !!ganador && ganador === datos.equipoA;
        const ganaB = !!ganador && ganador === datos.equipoB;

        articulo.appendChild(crearJugador(datos.equipoA, datos.puntosA, ganaA));
        articulo.appendChild(crearJugador(datos.equipoB, datos.puntosB, ganaB));

        return articulo;
    }

    function crearJugador(idEquipo, puntos, ganador) {
        const fila = crearEl('div', 'brk-jugador');
        const equipo = Logica.equipo(documento, idEquipo);

        if (ganador) fila.classList.add('brk-ganador');
        if (!equipo) fila.classList.add('brk-vacio');

        const info = crearEl('span', 'brk-jugador-info');
        info.appendChild(crearEl('span', 'brk-jugador-nombre',
            equipo ? equipo.nombre : 'Por definir'));

        if (equipo && equipo.institucion) {
            info.appendChild(crearEl('span', 'brk-jugador-inst', equipo.institucion));
        }

        fila.appendChild(info);
        fila.appendChild(crearEl('span', 'brk-jugador-puntos',
            puntos === null ? '—' : String(puntos)));

        return fila;
    }

    function crearCampeon(idCampeon, categoria) {
        const equipo = Logica.equipo(documento, idCampeon);
        const tarjeta = crearEl('aside', 'brk-campeon' + (equipo ? '' : ' brk-campeon--vacio'));

        tarjeta.appendChild(crearEl('span', 'brk-campeon-label', 'CAMPEÓN'));
        tarjeta.appendChild(crearEl('span', 'brk-campeon-nombre',
            equipo ? equipo.nombre : 'Por definir'));

        if (equipo) {
            if (equipo.institucion) {
                tarjeta.appendChild(crearEl('span', 'brk-campeon-detalle', equipo.institucion));
            }
            if (categoria && categoria.titulo) {
                tarjeta.appendChild(crearEl('span', 'brk-campeon-detalle', categoria.titulo));
            }
        }

        return tarjeta;
    }

    /* ------------------------------------------------------------------ */
    /* Fútbol de robots                                                   */
    /* ------------------------------------------------------------------ */

    function crearFutbol(categoria) {
        const resuelto = Logica.resolverFutbol(categoria);
        const contenedor = crearEl('div', 'brk-futbol');

        /* ----- Fase de grupos ----- */
        const gruposWrap = crearEl('div', 'brk-futbol-grupos');
        const grupos = Array.isArray(categoria.grupos) ? categoria.grupos : [];

        grupos.forEach(function (grupo) {
            const panel = crearEl('div', 'brk-grupo');
            panel.appendChild(crearEl('h2', 'brk-grupo-titulo',
                grupo.nombre || 'GRUPO'));

            const filas = Logica.tablaGrupo(grupo);
            panel.appendChild(crearTablaGrupo(filas));
            gruposWrap.appendChild(panel);
        });

        if (!grupos.length) {
            gruposWrap.appendChild(crearAviso('Sin grupos cargados'));
        }

        contenedor.appendChild(gruposWrap);

        /* ----- Eliminatorias ----- */
        const llave = crearEl('div', 'brk-futbol-llave');

        const columnaIzq = crearEl('div', 'brk-futbol-col');
        columnaIzq.appendChild(crearEl('h2', 'brk-futbol-titulo', 'SEMIFINALES'));

        const semis = crearEl('div', 'brk-partidos');
        semis.appendChild(crearPartidoFutbol(resuelto.semifinales[0], '1.º Grupo A', '2.º Grupo B'));
        semis.appendChild(crearPartidoFutbol(resuelto.semifinales[1], '1.º Grupo B', '2.º Grupo A'));
        columnaIzq.appendChild(semis);

        columnaIzq.appendChild(crearEl('h2', 'brk-futbol-titulo brk-futbol-titulo--separada', 'TERCER PUESTO'));

        const tercero = crearEl('div', 'brk-partidos brk-partidos--tercero');
        tercero.appendChild(crearPartidoFutbol(resuelto.tercerPuesto,
            'Perdedor SF1', 'Perdedor SF2', 'brk-partido--tercero'));
        columnaIzq.appendChild(tercero);

        const columnaDer = crearEl('div', 'brk-futbol-col');
        columnaDer.appendChild(crearEl('h2', 'brk-futbol-titulo', 'FINAL'));

        const final = crearEl('div', 'brk-partidos');
        final.appendChild(crearPartidoFutbol(resuelto.final, 'Ganador SF1', 'Ganador SF2'));
        columnaDer.appendChild(final);

        columnaDer.appendChild(crearCampeon(resuelto.campeon, categoria));

        llave.appendChild(columnaIzq);
        llave.appendChild(columnaDer);
        contenedor.appendChild(llave);

        return contenedor;
    }

    function crearTablaGrupo(filas) {
        const tabla = crearEl('table', 'brk-tabla brk-tabla--grupo');
        const thead = document.createElement('thead');
        const filaHead = document.createElement('tr');

        [
            { titulo: 'POS', clase: 'brk-col-pos' },
            { titulo: 'EQUIPO', clase: 'brk-col-equipo brk-izq' },
            { titulo: 'PJ', clase: 'brk-col-pj' },
            { titulo: 'DG', clase: 'brk-col-dg' },
            { titulo: 'PTS', clase: 'brk-col-pts' }
        ].forEach(function (columna) {
            const th = document.createElement('th');
            th.textContent = columna.titulo;
            th.className = columna.clase;
            filaHead.appendChild(th);
        });

        thead.appendChild(filaHead);
        tabla.appendChild(thead);

        const tbody = document.createElement('tbody');

        filas.forEach(function (fila, indice) {
            const tr = document.createElement('tr');

            if (indice < 2) tr.classList.add('brk-clasifica');

            const celdas = [
                String(indice + 1),
                Logica.nombreEquipo(documento, fila.equipo) || 'Por definir',
                String(fila.pj),
                (fila.dg > 0 ? '+' : '') + fila.dg,
                String(fila.pts)
            ];

            celdas.forEach(function (valor, posicion) {
                const td = document.createElement('td');
                td.textContent = valor;
                if (posicion === 1) td.classList.add('brk-izq');
                if (posicion === 0) td.classList.add('brk-pos-celda');
                if (posicion === 4) td.classList.add('brk-celda-destacada');
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });

        if (!filas.length) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 5;
            td.className = 'brk-tabla-vacia-celda';
            td.textContent = 'Sin equipos cargados';
            tr.appendChild(td);
            tbody.appendChild(tr);
        }

        tabla.appendChild(tbody);
        return tabla;
    }

    function crearPartidoFutbol(partido, pistaA, pistaB, claseExtra) {
        const datos = partido || {};
        const estado = datos.estado || 'pendiente';
        const articulo = crearEl('article', 'brk-partido brk-partido--' + estado +
            (claseExtra ? ' ' + claseExtra : ''));

        if (estado === 'en_curso') {
            articulo.appendChild(crearEl('span', 'brk-en-vivo', 'EN VIVO'));
        }

        const ganador = Logica.ganadorFutbol(datos);
        const ganaA = !!ganador && ganador === datos.equipoA;
        const ganaB = !!ganador && ganador === datos.equipoB;

        articulo.appendChild(crearJugadorFutbol(datos.equipoA, datos.golesA, ganaA, pistaA));
        articulo.appendChild(crearJugadorFutbol(datos.equipoB, datos.golesB, ganaB, pistaB));

        if (datos.penalesA !== null || datos.penalesB !== null) {
            articulo.appendChild(crearEl('p', 'brk-partido-penales',
                'Penales ' + (datos.penalesA === null ? '—' : datos.penalesA) +
                ' - ' + (datos.penalesB === null ? '—' : datos.penalesB)));
        }

        return articulo;
    }

    function crearJugadorFutbol(idEquipo, goles, ganador, pista) {
        const fila = crearEl('div', 'brk-jugador');
        const equipo = Logica.equipo(documento, idEquipo);

        if (ganador) fila.classList.add('brk-ganador');
        if (!equipo) fila.classList.add('brk-vacio');

        const info = crearEl('span', 'brk-jugador-info');
        info.appendChild(crearEl('span', 'brk-jugador-nombre',
            equipo ? equipo.nombre : (pista || 'Por definir')));

        if (equipo && equipo.institucion) {
            info.appendChild(crearEl('span', 'brk-jugador-inst', equipo.institucion));
        }

        fila.appendChild(info);
        fila.appendChild(crearEl('span', 'brk-jugador-puntos',
            goles === null ? '—' : String(goles)));

        return fila;
    }

    /* ------------------------------------------------------------------ */
    /* Sigue Líneas: tabla de tiempos                                     */
    /* ------------------------------------------------------------------ */

    function crearTablaTiempos(categoria) {
        const filas = Logica.tablaTiempos(categoria);
        const panel = crearEl('div', 'brk-tabla-panel');
        const tabla = crearEl('table', 'brk-tabla brk-tabla--tiempos');

        const thead = document.createElement('thead');
        const filaHead = document.createElement('tr');

        [
            { titulo: 'POS' },
            { titulo: 'ROBOT', izquierda: true },
            { titulo: 'INSTITUCIÓN', izquierda: true },
            { titulo: 'PASADA 1' },
            { titulo: 'PASADA 2' },
            { titulo: 'PASADA 3' },
            { titulo: 'MEJOR TIEMPO', destacada: true }
        ].forEach(function (columna) {
            const th = document.createElement('th');
            th.textContent = columna.titulo;
            if (columna.izquierda) th.classList.add('brk-izq');
            if (columna.destacada) th.classList.add('brk-celda-destacada');
            filaHead.appendChild(th);
        });

        thead.appendChild(filaHead);
        tabla.appendChild(thead);

        const tbody = document.createElement('tbody');

        filas.forEach(function (fila, indice) {
            const tr = document.createElement('tr');
            const equipo = Logica.equipo(documento, fila.equipo);

            if (indice < 3 && fila.mejor !== null) tr.classList.add('brk-fila-' + (indice + 1));

            const celdas = [
                { valor: String(indice + 1), clase: 'brk-pos-celda' },
                { valor: equipo ? equipo.nombre : 'Por definir', clase: 'brk-izq brk-celda-robot' },
                { valor: equipo && equipo.institucion ? equipo.institucion : '—', clase: 'brk-izq brk-celda-inst' },
                { valor: Logica.formatearTiempo(fila.tiempos[0]), clase: 'brk-celda-tiempo' },
                { valor: Logica.formatearTiempo(fila.tiempos[1]), clase: 'brk-celda-tiempo' },
                { valor: Logica.formatearTiempo(fila.tiempos[2]), clase: 'brk-celda-tiempo' },
                { valor: Logica.formatearTiempo(fila.mejor), clase: 'brk-celda-tiempo brk-celda-destacada' }
            ];

            celdas.forEach(function (celda) {
                const td = document.createElement('td');
                td.textContent = celda.valor;
                if (celda.clase) td.className = celda.clase;
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });

        if (!filas.length) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 7;
            td.className = 'brk-tabla-vacia-celda';
            td.textContent = 'Sin tiempos cargados';
            tr.appendChild(td);
            tbody.appendChild(tr);
        }

        tabla.appendChild(tbody);
        panel.appendChild(tabla);
        return panel;
    }

    /* ------------------------------------------------------------------ */
    /* Resumen del torneo (podios)                                        */
    /* ------------------------------------------------------------------ */

    function crearResumen(categoria) {
        const contenedor = crearEl('div', 'brk-resumen');

        const equipos = Logica.listaEquipos(documento);
        const categoriasConPodio = categorias.filter(function (item) {
            return item && item.tipo && item.tipo !== 'resumen';
        });

        const stats = crearEl('div', 'brk-resumen-stats');

        const datosStats = [
            { valor: String(equipos.length), etiqueta: 'EQUIPOS INSCRIPTOS' },
            { valor: String(categoriasConPodio.length), etiqueta: 'CATEGORÍAS' },
            { valor: documento.sede || 'Nave Cultural', etiqueta: 'SEDE DEL TORNEO' }
        ];

        datosStats.forEach(function (dato) {
            const caja = crearEl('div', 'brk-stat');
            caja.appendChild(crearEl('span', 'brk-stat-valor', dato.valor));
            caja.appendChild(crearEl('span', 'brk-stat-etiqueta', dato.etiqueta));
            stats.appendChild(caja);
        });

        contenedor.appendChild(stats);

        const grilla = crearEl('div', 'brk-resumen-grilla');

        categoriasConPodio.forEach(function (item) {
            grilla.appendChild(crearTarjetaPodio(item));
        });

        contenedor.appendChild(grilla);

        if (!categoriasConPodio.length) {
            contenedor.appendChild(crearAviso('Sin categorías para resumir'));
        }

        return contenedor;
    }

    function crearTarjetaPodio(categoria) {
        const podio = Logica.podioCategoria(categoria);
        const tarjeta = crearEl('article', 'brk-podio-card');

        const color = normalizarColor(categoria.acento);
        tarjeta.style.setProperty('--brk-card-acento', color.hex);
        tarjeta.style.setProperty('--brk-card-acento-texto', textoAcento(color.hex));

        tarjeta.appendChild(crearEl('h2', 'brk-podio-titulo', categoria.titulo || 'CATEGORÍA'));

        const medallas = [
            { puesto: '1', etiqueta: 'CAMPEÓN', equipo: podio.campeon, clase: 'oro' },
            { puesto: '2', etiqueta: 'SUBCAMPEÓN', equipo: podio.subcampeon, clase: 'plata' },
            { puesto: '3', etiqueta: 'TERCER PUESTO', equipo: podio.tercero, clase: 'bronce' }
        ];

        medallas.forEach(function (medalla) {
            const equipo = Logica.equipo(documento, medalla.equipo);
            const fila = crearEl('div', 'brk-medalla brk-medalla--' + medalla.clase +
                (equipo ? '' : ' brk-medalla--vacia'));

            fila.appendChild(crearEl('span', 'brk-medalla-puesto', medalla.puesto));

            const info = crearEl('span', 'brk-medalla-info');
            info.appendChild(crearEl('span', 'brk-medalla-etiqueta', medalla.etiqueta));
            info.appendChild(crearEl('span', 'brk-medalla-equipo',
                equipo ? equipo.nombre : 'Por definir'));

            if (equipo && equipo.institucion) {
                info.appendChild(crearEl('span', 'brk-medalla-inst', equipo.institucion));
            }

            fila.appendChild(info);
            tarjeta.appendChild(fila);
        });

        return tarjeta;
    }

    function crearAviso(texto) {
        return crearEl('p', 'brk-sin-partidos', texto);
    }

    /* ------------------------------------------------------------------ */
    /* Carrusel                                                           */
    /* ------------------------------------------------------------------ */

    function mostrarPantalla(indice, reiniciar) {
        if (!categorias.length) return;

        const total = categorias.length;
        indiceActual = ((indice % total) + total) % total;

        const categoria = categorias[indiceActual];

        Array.prototype.forEach.call(mainEl.children, function (seccion, posicion) {
            const activa = posicion === indiceActual;
            seccion.classList.toggle('activa', activa);
            seccion.setAttribute('aria-hidden', activa ? 'false' : 'true');
        });

        Array.prototype.forEach.call(puntosEl.children, function (punto, posicion) {
            const activo = posicion === indiceActual;
            punto.classList.toggle('activo', activo);
            punto.setAttribute('aria-selected', activo ? 'true' : 'false');
        });

        aplicarAcento(categoria.acento);
        actualizarCabecera(categoria);

        if (reiniciar !== false) {
            iniciarCicloCompleto();
        }
    }

    function actualizarCabecera(categoria) {
        categoriaEl.textContent = categoria.titulo || '';

        faseEl.textContent = categoria.fase || '';
        faseEl.hidden = !categoria.fase;

        document.title = (categoria.titulo || 'Llaves') + ' · Probotae 2026';

        if (centroEl) {
            centroEl.classList.remove('brk-cambio');
            void centroEl.offsetWidth;
            centroEl.classList.add('brk-cambio');
        }
    }

    function aplicarAcento(acento) {
        const color = normalizarColor(acento);
        const [r, g, b] = color.rgb;

        appEl.style.setProperty('--brk-acento', color.hex);
        appEl.style.setProperty('--brk-acento-texto', textoAcento(color.hex));
        appEl.style.setProperty('--brk-acento-suave', 'rgba(' + r + ', ' + g + ', ' + b + ', 0.14)');
        appEl.style.setProperty('--brk-acento-medio', 'rgba(' + r + ', ' + g + ', ' + b + ', 0.45)');
        appEl.style.setProperty('--brk-acento-brillo', 'rgba(' + r + ', ' + g + ', ' + b + ', 0.35)');
    }

    /**
     * En tema claro el neón puro no se lee sobre blanco: se oscurece el
     * mismo tono para los textos, manteniendo el color vivo en bordes y brillos.
     */
    function textoAcento(color) {
        const normalizado = normalizarColor(color);

        if (document.documentElement.getAttribute('data-theme') !== 'light') {
            return normalizado.hex;
        }

        const oscuro = normalizado.rgb.map(function (valor) {
            return Math.round(valor * 0.45);
        });

        return rgbAHex(oscuro);
    }

    function rgbAHex(rgb) {
        return '#' + rgb.map(function (valor) {
            return Math.max(0, Math.min(255, Math.round(valor)))
                .toString(16)
                .padStart(2, '0');
        }).join('');
    }

    function iniciarCicloCompleto() {
        detenerTemporizador();
        pausado = false;

        if (progresoEl) progresoEl.classList.remove('pausado');

        restanteCiclo = duracionPantalla;
        inicioCiclo = Date.now();

        reiniciarProgreso(duracionPantalla);
        actualizarAyuda();

        temporizador = setTimeout(avanzar, restanteCiclo);
    }

    function reanudarCiclo() {
        if (!categorias.length) return;

        pausado = false;
        pausaAutomatica = false;
        inicioCiclo = Date.now();

        if (progresoEl) progresoEl.classList.remove('pausado');

        actualizarAyuda();
        detenerTemporizador();
        temporizador = setTimeout(avanzar, Math.max(500, restanteCiclo));
    }

    function pausarCiclo() {
        if (pausado) return;

        pausado = true;
        detenerTemporizador();
        restanteCiclo = Math.max(0, restanteCiclo - (Date.now() - inicioCiclo));

        if (progresoEl) progresoEl.classList.add('pausado');

        actualizarAyuda();
    }

    function alternarPausa() {
        if (pausado) {
            reanudarCiclo();
        } else {
            pausarCiclo();
        }
    }

    function detenerTemporizador() {
        if (temporizador) {
            clearTimeout(temporizador);
            temporizador = null;
        }
    }

    function avanzar() {
        mostrarPantalla(indiceActual + 1, true);
    }

    function reiniciarProgreso(milisegundos) {
        if (!progresoEl) return;
        progresoEl.classList.remove('corriendo');
        progresoEl.classList.remove('pausado');
        progresoEl.style.setProperty('--brk-duracion', milisegundos + 'ms');
        void progresoEl.offsetWidth;
        progresoEl.classList.add('corriendo');
    }

    function actualizarAyuda() {
        if (!ayudaEl) return;

        if (pausado) {
            ayudaEl.textContent = 'EN PAUSA · ESPACIO para continuar';
            ayudaEl.classList.add('brk-ayuda--pausa');
        } else {
            ayudaEl.textContent = '← → cambian · ESPACIO pausa · F pantalla completa';
            ayudaEl.classList.remove('brk-ayuda--pausa');
        }
    }

    /* ------------------------------------------------------------------ */
    /* Reloj y controles                                                  */
    /* ------------------------------------------------------------------ */

    function actualizarReloj() {
        if (!relojEl) return;

        const ahora = new Date();
        relojEl.textContent = [
            String(ahora.getHours()).padStart(2, '0'),
            String(ahora.getMinutes()).padStart(2, '0'),
            String(ahora.getSeconds()).padStart(2, '0')
        ].join(':');
    }

    function manejarTeclado(evento) {
        if (evento.target && /^(INPUT|TEXTAREA|SELECT)$/.test(evento.target.tagName)) return;

        if (evento.key === 'ArrowRight') {
            evento.preventDefault();
            mostrarPantalla(indiceActual + 1, true);
        } else if (evento.key === 'ArrowLeft') {
            evento.preventDefault();
            mostrarPantalla(indiceActual - 1, true);
        } else if (evento.key === ' ' || evento.key === 'Spacebar') {
            evento.preventDefault();
            alternarPausa();
        } else if (evento.key === 'f' || evento.key === 'F') {
            evento.preventDefault();
            alternarPantallaCompleta();
        }
    }

    function alternarPantallaCompleta() {
        if (document.fullscreenElement) {
            if (document.exitFullscreen) document.exitFullscreen();
            return;
        }

        const raiz = document.documentElement;
        if (raiz.requestFullscreen) {
            raiz.requestFullscreen().catch(function () { /* sin permisos */ });
        }
    }

    function manejarVisibilidad() {
        if (document.hidden) {
            if (!pausado) {
                pausaAutomatica = true;
                pausarCiclo();
            }
        } else if (pausaAutomatica && pausado) {
            reanudarCiclo();
        }
    }

    /* ------------------------------------------------------------------ */
    /* Utilidades                                                         */
    /* ------------------------------------------------------------------ */

    function crearEl(etiqueta, clase, texto) {
        const elemento = document.createElement(etiqueta);
        if (clase) elemento.className = clase;
        if (texto !== undefined && texto !== null) elemento.textContent = texto;
        return elemento;
    }

    function clonar(valor) {
        return JSON.parse(JSON.stringify(valor === undefined ? null : valor));
    }

    function normalizarColor(color) {
        const porDefecto = { hex: '#00ffff', rgb: [0, 255, 255] };
        if (typeof color !== 'string') return porDefecto;

        let limpio = color.trim().replace(/^#/, '');

        if (/^[0-9a-fA-F]{3}$/.test(limpio)) {
            limpio = limpio.split('').map(function (caracter) {
                return caracter + caracter;
            }).join('');
        }

        if (!/^[0-9a-fA-F]{6}$/.test(limpio)) return porDefecto;

        const r = parseInt(limpio.slice(0, 2), 16);
        const g = parseInt(limpio.slice(2, 4), 16);
        const b = parseInt(limpio.slice(4, 6), 16);

        return { hex: '#' + limpio.toLowerCase(), rgb: [r, g, b] };
    }
})();

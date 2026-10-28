/**
 * Pantalla de llaves y posiciones · Probotae 2026
 *
 * - Carrusel automático a pantalla completa entre las categorías definidas
 *   en brackets-data.js.
 * - El tiempo de cada pantalla sale de bracketsEvento.rotacionSegundos
 *   (también se puede forzar con ?seg=25 en la URL).
 * - Controles pensados para una TV: flechas ← →, ESPACIO pausa,
 *   F pantalla completa y un punto por pantalla en el pie.
 */
(function () {
    'use strict';

    const SEGUNDOS_POR_DEFECTO = 18;
    const SEGUNDOS_MINIMOS = 5;

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

        if (typeof bracketsEvento === 'undefined' || !bracketsEvento ||
            !Array.isArray(bracketsEvento.categorias) || !bracketsEvento.categorias.length) {
            mostrarErrorDatos();
            return;
        }

        categorias = bracketsEvento.categorias.filter(function (categoria) {
            return categoria && categoria.tipo;
        });

        if (!categorias.length) {
            mostrarErrorDatos();
            return;
        }

        duracionPantalla = calcularDuracion();
        restanteCiclo = duracionPantalla;

        const actualizado = document.getElementById('brkActualizado');
        if (actualizado) {
            actualizado.textContent = bracketsEvento.actualizadoEn
                ? 'Actualizado: ' + bracketsEvento.actualizadoEn
                : '';
        }

        construirPantallas();
        construirPuntos();

        const indiceInicial = leerIndiceInicial();
        mostrarPantalla(indiceInicial, false);
        iniciarCicloCompleto();

        document.addEventListener('keydown', manejarTeclado);
        document.addEventListener('visibilitychange', manejarVisibilidad);
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
        const segundosDatos = Number(bracketsEvento.rotacionSegundos);

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

    function mostrarErrorDatos() {
        if (!mainEl) return;
        mainEl.textContent = '';
        const mensaje = document.createElement('div');
        mensaje.className = 'brk-error';
        mensaje.innerHTML = '<strong>No hay pantallas para mostrar.</strong>' +
            '<span>Revisá <code>brackets-data.js</code>: tiene que existir ' +
            '<code>bracketsEvento.categorias</code> con al menos una categoría.</span>';
        mainEl.appendChild(mensaje);
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
            } else if (categoria.tipo === 'grupos') {
                seccion.appendChild(crearGrupos(categoria));
            } else {
                seccion.appendChild(crearTablaPanel(categoria));
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

    function crearLlaves(categoria) {
        const contenedor = crearEl('div', 'brk-bracket');
        const rondas = Array.isArray(categoria.rondas) ? categoria.rondas : [];

        rondas.forEach(function (ronda, indice) {
            const columna = crearEl('div', 'brk-ronda');
            columna.appendChild(crearEl('h2', 'brk-ronda-titulo',
                ronda.nombre || 'RONDA ' + (indice + 1)));

            const partidos = crearEl('div', 'brk-partidos');
            const lista = Array.isArray(ronda.partidos) ? ronda.partidos : [];

            if (lista.length) {
                lista.forEach(function (partido) {
                    partidos.appendChild(crearPartido(partido));
                });
            } else {
                partidos.appendChild(crearEl('p', 'brk-sin-partidos', 'Sin cruces cargados'));
            }

            columna.appendChild(partidos);
            contenedor.appendChild(columna);
        });

        contenedor.appendChild(crearCampeon(categoria.campeon));
        return contenedor;
    }

    function crearPartido(partido) {
        const datos = partido || {};
        const estado = datos.estado || 'pendiente';
        const articulo = crearEl('article', 'brk-partido brk-partido--' + estado);

        if (estado === 'en_curso') {
            articulo.appendChild(crearEl('span', 'brk-en-vivo', 'EN VIVO'));
        }

        const puntajeA = numeroONull(datos.puntosA);
        const puntajeB = numeroONull(datos.puntosB);
        let ganaA = false;
        let ganaB = false;

        if (datos.ganador === 'A' || datos.ganador === 'B') {
            ganaA = datos.ganador === 'A';
            ganaB = datos.ganador === 'B';
        } else if (estado === 'finalizado' && puntajeA !== null && puntajeB !== null) {
            ganaA = puntajeA > puntajeB;
            ganaB = puntajeB > puntajeA;
        }

        articulo.appendChild(crearJugador(datos.equipoA, puntajeA, ganaA));
        articulo.appendChild(crearJugador(datos.equipoB, puntajeB, ganaB));

        return articulo;
    }

    function crearJugador(equipo, puntos, ganador) {
        const fila = crearEl('div', 'brk-jugador');

        if (ganador) fila.classList.add('brk-ganador');
        if (!equipo) fila.classList.add('brk-vacio');

        fila.appendChild(crearEl('span', 'brk-jugador-nombre', equipo || 'Por definir'));
        fila.appendChild(crearEl('span', 'brk-jugador-puntos',
            puntos === null ? '—' : String(puntos)));

        return fila;
    }

    function crearCampeon(campeon) {
        const datos = campeon || {};
        const tiene = !!datos.equipo;

        const tarjeta = crearEl('aside', 'brk-campeon' + (tiene ? '' : ' brk-campeon--vacio'));
        tarjeta.appendChild(crearEl('span', 'brk-campeon-label', 'CAMPEÓN'));
        tarjeta.appendChild(crearEl('span', 'brk-campeon-nombre',
            tiene ? datos.equipo : 'Por definir'));

        if (tiene && datos.detalle) {
            tarjeta.appendChild(crearEl('span', 'brk-campeon-detalle', datos.detalle));
        }

        return tarjeta;
    }

    function crearGrupos(categoria) {
        const contenedor = crearEl('div', 'brk-grupos');
        const grupos = Array.isArray(categoria.grupos) ? categoria.grupos : [];

        const filas = crearEl('div', 'brk-grupos-filas');

        grupos.forEach(function (grupo) {
            const panel = crearEl('div', 'brk-grupo');
            panel.appendChild(crearEl('h2', 'brk-grupo-titulo', grupo.nombre || 'GRUPO'));
            panel.appendChild(crearTabla(categoria.columnas, grupo.equipos));
            filas.appendChild(panel);
        });

        contenedor.appendChild(filas);

        const cruces = categoria.cruces;
        if (cruces && Array.isArray(cruces.partidos) && cruces.partidos.length) {
            const bloque = crearEl('div', 'brk-cruces');
            bloque.appendChild(crearEl('h2', 'brk-cruces-titulo', cruces.titulo || 'CRUCES'));

            const lista = crearEl('div', 'brk-cruces-lista');
            cruces.partidos.forEach(function (partido) {
                lista.appendChild(crearPartido(partido));
            });

            bloque.appendChild(lista);
            contenedor.appendChild(bloque);
        }

        return contenedor;
    }

    function crearTablaPanel(categoria) {
        const panel = crearEl('div', 'brk-tabla-panel');
        panel.appendChild(crearTabla(categoria.columnas, categoria.filas));
        return panel;
    }

    function crearTabla(columnas, filas) {
        const columnasValidas = Array.isArray(columnas) && columnas.length
            ? columnas
            : [{ clave: 'equipo', titulo: 'EQUIPO', alineacion: 'izq' }];
        const filasValidas = Array.isArray(filas) ? filas : [];

        const tabla = crearEl('table', 'brk-tabla');
        const thead = document.createElement('thead');
        const filaHead = document.createElement('tr');

        columnasValidas.forEach(function (columna) {
            const th = document.createElement('th');
            th.textContent = columna.titulo || columna.clave;
            th.className = 'brk-col-' + columna.clave;
            if (columna.alineacion === 'izq') th.classList.add('brk-izq');
            filaHead.appendChild(th);
        });

        thead.appendChild(filaHead);
        tabla.appendChild(thead);

        const tbody = document.createElement('tbody');

        filasValidas.forEach(function (fila, indice) {
            const tr = document.createElement('tr');

            if (indice < 3) tr.classList.add('brk-fila-' + (indice + 1));

            columnasValidas.forEach(function (columna) {
                const td = document.createElement('td');
                let valor = fila ? fila[columna.clave] : '';

                if (columna.clave === 'pos' && (valor === undefined || valor === null || valor === '')) {
                    valor = indice + 1;
                }

                td.textContent = valor === undefined || valor === null ? '—' : String(valor);
                td.className = 'brk-col-' + columna.clave;
                if (columna.alineacion === 'izq') td.classList.add('brk-izq');
                if (columna.clave === 'pos') td.classList.add('brk-pos-celda');
                if (columna.destacar) td.classList.add('brk-celda-destacada');
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });

        tabla.appendChild(tbody);

        if (!filasValidas.length) {
            const aviso = crearEl('p', 'brk-sin-partidos', 'Sin datos cargados');
            const contenedor = crearEl('div', 'brk-tabla-vacia');
            contenedor.appendChild(aviso);
            return contenedor;
        }

        return tabla;
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
        appEl.style.setProperty('--brk-acento-suave', 'rgba(' + r + ', ' + g + ', ' + b + ', 0.14)');
        appEl.style.setProperty('--brk-acento-medio', 'rgba(' + r + ', ' + g + ', ' + b + ', 0.45)');
        appEl.style.setProperty('--brk-acento-brillo', 'rgba(' + r + ', ' + g + ', ' + b + ', 0.35)');
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

    function numeroONull(valor) {
        if (valor === null || valor === undefined || valor === '') return null;
        const numero = Number(valor);
        return Number.isFinite(numero) ? numero : null;
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

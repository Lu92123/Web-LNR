/**
 * Lógica compartida de la pantalla de llaves (brackets.html y admin.html)
 * ======================================================================
 *
 * Este archivo no toca el DOM: solo calcula.
 *
 * - Resuelve los equipos por id (la lista maestra vive en brackets-data.js).
 * - Avanza solo los ganadores de una ronda a la siguiente.
 * - Calcula la tabla de la fase de grupos del fútbol.
 * - Arma las semifinales, la final y el tercer puesto del fútbol.
 * - Ordena la tabla de tiempos de Sigue Líneas.
 * - Devuelve el podio de cada categoría.
 *
 * Se usa igual en la TV y en el panel de administración para que ambos
 * muestren exactamente lo mismo.
 */
(function (global) {
    'use strict';

    /* ------------------------------------------------------------------ */
    /* Números y tiempos                                                  */
    /* ------------------------------------------------------------------ */

    function num(valor) {
        if (valor === null || valor === undefined || valor === '') return null;
        const numero = Number(valor);
        return Number.isFinite(numero) ? numero : null;
    }

    /**
     * 12480 -> "12.480 s"
     * Se usa punto decimal y siempre tres milésimas, para que la tabla
     * quede alineada en la TV.
     */
    function formatearTiempo(milisegundos) {
        const valor = num(milisegundos);
        if (valor === null || valor < 0) return '—';

        const total = Math.round(valor);
        const segundos = Math.floor(total / 1000);
        const milesimas = total % 1000;

        return segundos + '.' + String(milesimas).padStart(3, '0') + ' s';
    }

    /** Separa un tiempo en segundos y milésimas para los campos del panel. */
    function partirTiempo(milisegundos) {
        const valor = num(milisegundos);
        if (valor === null || valor < 0) return { segundos: '', milesimas: '' };

        const total = Math.round(valor);
        return {
            segundos: Math.floor(total / 1000),
            milesimas: total % 1000
        };
    }

    /** Une segundos + milésimas en milisegundos. Devuelve null si no hay segundos. */
    function unirTiempo(segundos, milesimas) {
        const seg = num(segundos);
        if (seg === null || seg < 0) return null;

        let mil = num(milesimas);
        if (mil === null || mil < 0) mil = 0;
        mil = Math.min(999, Math.round(mil));

        return Math.round(seg) * 1000 + mil;
    }

    /* ------------------------------------------------------------------ */
    /* Equipos                                                            */
    /* ------------------------------------------------------------------ */

    function listaEquipos(documento) {
        return documento && Array.isArray(documento.equipos) ? documento.equipos : [];
    }

    function equipo(documento, id) {
        if (!id) return null;

        const lista = listaEquipos(documento);
        for (let i = 0; i < lista.length; i += 1) {
            if (lista[i] && lista[i].id === id) return lista[i];
        }
        return null;
    }

    function nombreEquipo(documento, id) {
        const encontrado = equipo(documento, id);
        return encontrado && encontrado.nombre ? encontrado.nombre : null;
    }

    function institucionEquipo(documento, id) {
        const encontrado = equipo(documento, id);
        return encontrado && encontrado.institucion ? encontrado.institucion : '';
    }

    /** Equipos de una categoría, ordenados por nombre. */
    function equiposDeCategoria(documento, clave) {
        return listaEquipos(documento)
            .filter(function (item) {
                return item && (!clave || item.categoria === clave);
            })
            .sort(function (a, b) {
                return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
            });
    }

    /* ------------------------------------------------------------------ */
    /* Llaves de eliminación directa (Mini Sumo y Sumo)                    */
    /* ------------------------------------------------------------------ */

    function normalizarPartido(partido) {
        const datos = partido && typeof partido === 'object' ? partido : {};

        return {
            equipoA: datos.equipoA || null,
            equipoB: datos.equipoB || null,
            puntosA: num(datos.puntosA),
            puntosB: num(datos.puntosB),
            estado: datos.estado || 'pendiente',
            ganador: datos.ganador === 'A' || datos.ganador === 'B' ? datos.ganador : null
        };
    }

    function ganadorLlave(partido) {
        if (!partido) return null;

        if (partido.ganador === 'A') return partido.equipoA || null;
        if (partido.ganador === 'B') return partido.equipoB || null;

        if (partido.estado !== 'finalizado') return null;
        if (partido.puntosA === null || partido.puntosB === null) return null;
        if (partido.puntosA === partido.puntosB) return null;

        return partido.puntosA > partido.puntosB
            ? (partido.equipoA || null)
            : (partido.equipoB || null);
    }

    function perdedorLlave(partido) {
        if (!partido) return null;

        const ganador = ganadorLlave(partido);
        if (!ganador) return null;

        if (partido.equipoA === ganador) return partido.equipoB || null;
        if (partido.equipoB === ganador) return partido.equipoA || null;
        return null;
    }

    /**
     * Devuelve las rondas con los equipos ya resueltos: si una semifinal
     * tiene el casillero vacío, se completa con el ganador de cuartos.
     * El dato guardado no se modifica.
     */
    function resolverLlaves(categoria) {
        const datos = categoria && typeof categoria === 'object' ? categoria : {};

        const rondas = (Array.isArray(datos.rondas) ? datos.rondas : []).map(function (ronda, indice) {
            const info = ronda && typeof ronda === 'object' ? ronda : {};

            return {
                nombre: info.nombre || 'RONDA ' + (indice + 1),
                partidos: (Array.isArray(info.partidos) ? info.partidos : []).map(normalizarPartido)
            };
        });

        // Autoavance: cada partido toma como equipo A/B al ganador del
        // partido que le corresponde en la ronda anterior.
        for (let r = 1; r < rondas.length; r += 1) {
            rondas[r].partidos.forEach(function (partido, indice) {
                const previos = rondas[r - 1].partidos;

                if (!partido.equipoA && previos[indice * 2]) {
                    partido.equipoA = ganadorLlave(previos[indice * 2]);
                }
                if (!partido.equipoB && previos[indice * 2 + 1]) {
                    partido.equipoB = ganadorLlave(previos[indice * 2 + 1]);
                }
            });
        }

        // Tercer puesto: perdedores de las semifinales (antepenúltima ronda).
        const tercero = normalizarPartido(datos.tercerPuesto || {});

        if (rondas.length >= 2) {
            const semis = rondas[rondas.length - 2].partidos;

            if (!tercero.equipoA && semis[0]) tercero.equipoA = perdedorLlave(semis[0]);
            if (!tercero.equipoB && semis[1]) tercero.equipoB = perdedorLlave(semis[1]);
        }

        const ultima = rondas.length ? rondas[rondas.length - 1].partidos : [];
        const final = ultima.length ? ultima[ultima.length - 1] : null;

        return {
            rondas: rondas,
            tercero: tercero,
            final: final,
            campeon: ganadorLlave(final),
            subcampeon: perdedorLlave(final),
            terceroGanador: ganadorLlave(tercero)
        };
    }

    /* ------------------------------------------------------------------ */
    /* Fútbol: fase de grupos                                             */
    /* ------------------------------------------------------------------ */

    function filaVacia(idEquipo) {
        return {
            equipo: idEquipo,
            pj: 0,
            pg: 0,
            pe: 0,
            pp: 0,
            gf: 0,
            gc: 0,
            dg: 0,
            pts: 0
        };
    }

    function tablaGrupo(grupo) {
        const datos = grupo && typeof grupo === 'object' ? grupo : {};
        const filas = new Map();

        function fila(id) {
            if (!filas.has(id)) filas.set(id, filaVacia(id));
            return filas.get(id);
        }

        (Array.isArray(datos.equipos) ? datos.equipos : []).forEach(function (id) {
            if (id) fila(id);
        });

        (Array.isArray(datos.partidos) ? datos.partidos : []).forEach(function (partido) {
            if (!partido || partido.estado !== 'finalizado') return;

            const golesA = num(partido.golesA);
            const golesB = num(partido.golesB);

            if (!partido.equipoA || !partido.equipoB) return;
            if (golesA === null || golesB === null) return;

            const a = fila(partido.equipoA);
            const b = fila(partido.equipoB);

            a.pj += 1;
            b.pj += 1;
            a.gf += golesA;
            a.gc += golesB;
            b.gf += golesB;
            b.gc += golesA;

            if (golesA > golesB) {
                a.pg += 1;
                b.pp += 1;
                a.pts += 3;
            } else if (golesB > golesA) {
                b.pg += 1;
                a.pp += 1;
                b.pts += 3;
            } else {
                a.pe += 1;
                b.pe += 1;
                a.pts += 1;
                b.pts += 1;
            }
        });

        const lista = Array.from(filas.values());

        lista.forEach(function (fila) {
            fila.dg = fila.gf - fila.gc;
        });

        lista.sort(function (a, b) {
            if (b.pts !== a.pts) return b.pts - a.pts;
            if (b.dg !== a.dg) return b.dg - a.dg;
            if (b.gf !== a.gf) return b.gf - a.gf;
            return String(a.equipo).localeCompare(String(b.equipo), 'es');
        });

        return lista;
    }

    function grupoCompleto(grupo) {
        const partidos = grupo && Array.isArray(grupo.partidos) ? grupo.partidos : [];
        if (!partidos.length) return false;

        return partidos.every(function (partido) {
            return partido &&
                partido.estado === 'finalizado' &&
                !!partido.equipoA &&
                !!partido.equipoB &&
                num(partido.golesA) !== null &&
                num(partido.golesB) !== null;
        });
    }

    /**
     * Devuelve los clasificados (1.º y 2.º de cada grupo) solo cuando la
     * fase de grupos está completa. Si falta algún partido, null.
     */
    function clasificadosFutbol(categoria) {
        const grupos = categoria && Array.isArray(categoria.grupos) ? categoria.grupos : [];
        if (grupos.length < 2) return null;

        const tablas = grupos.map(tablaGrupo);

        const completos = grupos.every(function (grupo, indice) {
            return grupoCompleto(grupo) && tablas[indice].length >= 2;
        });

        if (!completos) return null;

        return {
            A1: tablas[0][0].equipo,
            A2: tablas[0][1].equipo,
            B1: tablas[1][0].equipo,
            B2: tablas[1][1].equipo
        };
    }

    /* ------------------------------------------------------------------ */
    /* Fútbol: eliminatorias                                              */
    /* ------------------------------------------------------------------ */

    function normalizarPartidoFutbol(partido) {
        const datos = partido && typeof partido === 'object' ? partido : {};

        return {
            equipoA: datos.equipoA || null,
            equipoB: datos.equipoB || null,
            golesA: num(datos.golesA),
            golesB: num(datos.golesB),
            penalesA: num(datos.penalesA),
            penalesB: num(datos.penalesB),
            estado: datos.estado || 'pendiente'
        };
    }

    function ganadorFutbol(partido) {
        if (!partido || partido.estado !== 'finalizado') return null;
        if (partido.golesA === null || partido.golesB === null) return null;

        if (partido.golesA !== partido.golesB) {
            return partido.golesA > partido.golesB
                ? (partido.equipoA || null)
                : (partido.equipoB || null);
        }

        if (partido.penalesA !== null && partido.penalesB !== null &&
            partido.penalesA !== partido.penalesB) {
            return partido.penalesA > partido.penalesB
                ? (partido.equipoA || null)
                : (partido.equipoB || null);
        }

        return null;
    }

    function perdedorFutbol(partido) {
        const ganador = ganadorFutbol(partido);
        if (!ganador) return null;

        if (partido.equipoA === ganador) return partido.equipoB || null;
        if (partido.equipoB === ganador) return partido.equipoA || null;
        return null;
    }

    function resolverFutbol(categoria) {
        const datos = categoria && typeof categoria === 'object' ? categoria : {};
        const playoffs = datos.playoffs && typeof datos.playoffs === 'object' ? datos.playoffs : {};
        const clasificados = clasificadosFutbol(datos);

        const semifinales = (Array.isArray(playoffs.semifinales) ? playoffs.semifinales : [])
            .map(normalizarPartidoFutbol);

        while (semifinales.length < 2) {
            semifinales.push(normalizarPartidoFutbol({}));
        }

        // 1.º A vs 2.º B  ·  1.º B vs 2.º A
        if (!semifinales[0].equipoA && clasificados) semifinales[0].equipoA = clasificados.A1;
        if (!semifinales[0].equipoB && clasificados) semifinales[0].equipoB = clasificados.B2;
        if (!semifinales[1].equipoA && clasificados) semifinales[1].equipoA = clasificados.B1;
        if (!semifinales[1].equipoB && clasificados) semifinales[1].equipoB = clasificados.A2;

        const final = normalizarPartidoFutbol(playoffs.final);
        if (!final.equipoA) final.equipoA = ganadorFutbol(semifinales[0]);
        if (!final.equipoB) final.equipoB = ganadorFutbol(semifinales[1]);

        const tercerPuesto = normalizarPartidoFutbol(playoffs.tercerPuesto);
        if (!tercerPuesto.equipoA) tercerPuesto.equipoA = perdedorFutbol(semifinales[0]);
        if (!tercerPuesto.equipoB) tercerPuesto.equipoB = perdedorFutbol(semifinales[1]);

        return {
            clasificados: clasificados,
            semifinales: semifinales,
            final: final,
            tercerPuesto: tercerPuesto,
            campeon: ganadorFutbol(final),
            subcampeon: perdedorFutbol(final),
            tercero: ganadorFutbol(tercerPuesto)
        };
    }

    /* ------------------------------------------------------------------ */
    /* Sigue Líneas: tabla de tiempos                                     */
    /* ------------------------------------------------------------------ */

    function tablaTiempos(categoria) {
        const entradas = categoria && Array.isArray(categoria.entradas) ? categoria.entradas : [];

        const filas = entradas.map(function (entrada) {
            const datos = entrada && typeof entrada === 'object' ? entrada : {};
            const tiempos = (Array.isArray(datos.tiempos) ? datos.tiempos : [])
                .slice(0, 3)
                .map(num);

            while (tiempos.length < 3) tiempos.push(null);

            const validos = tiempos.filter(function (tiempo) {
                return tiempo !== null && tiempo > 0;
            });

            return {
                equipo: datos.equipo || null,
                tiempos: tiempos,
                mejor: validos.length ? Math.min.apply(null, validos) : null
            };
        });

        filas.sort(function (a, b) {
            if (a.mejor === null && b.mejor === null) return 0;
            if (a.mejor === null) return 1;
            if (b.mejor === null) return -1;
            return a.mejor - b.mejor;
        });

        return filas;
    }

    /* ------------------------------------------------------------------ */
    /* Laberinto: dos configuraciones, mejor pasada de cada una           */
    /* ------------------------------------------------------------------ */

    const PASADAS_LABERINTO = 5;
    const CONFIGURACIONES_LABERINTO = 2;

    function normalizarPasada(pasada) {
        const datos = pasada && typeof pasada === 'object' ? pasada : {};
        const tiempo = num(datos.tiempo);
        const restante = num(datos.restante);

        return {
            tiempo: tiempo !== null && tiempo > 0 ? tiempo : null,
            restante: restante !== null && restante >= 0 ? restante : null
        };
    }

    /**
     * Mejor pasada de una configuración (reglamento LNR 5.2.1):
     * si el robot llegó a la meta vale el menor tiempo; si no llegó, se
     * clasifica por la menor cantidad de celdas restantes.
     */
    function mejorPasada(pasadas) {
        const lista = (Array.isArray(pasadas) ? pasadas : []).map(normalizarPasada);
        const tiempos = [];
        const restantes = [];

        lista.forEach(function (pasada) {
            if (pasada.tiempo !== null) tiempos.push(pasada.tiempo);
            else if (pasada.restante !== null) restantes.push(pasada.restante);
        });

        if (tiempos.length) {
            return {
                resuelta: true,
                tiempo: Math.min.apply(null, tiempos),
                restante: null
            };
        }

        if (restantes.length) {
            return {
                resuelta: false,
                tiempo: null,
                restante: Math.min.apply(null, restantes)
            };
        }

        return { resuelta: false, tiempo: null, restante: null };
    }

    function configuracionesLaberinto(entrada) {
        const configuraciones = entrada && Array.isArray(entrada.configuraciones)
            ? entrada.configuraciones
            : [];

        const resultado = [];

        for (let i = 0; i < CONFIGURACIONES_LABERINTO; i += 1) {
            const configuracion = configuraciones[i] && typeof configuraciones[i] === 'object'
                ? configuraciones[i]
                : {};

            resultado.push(mejorPasada(configuracion.pasadas));
        }

        return resultado;
    }

    /**
     * Tabla de Laberinto con la clasificación grupal del reglamento (5.2.2):
     *   1. Más configuraciones resueltas.
     *   2. Menor tiempo total sumando las configuraciones resueltas.
     *   3. Menor distancia restante promedio.
     */
    function tablaLaberinto(categoria) {
        const entradas = categoria && Array.isArray(categoria.entradas) ? categoria.entradas : [];

        const filas = entradas.map(function (entrada) {
            const datos = entrada && typeof entrada === 'object' ? entrada : {};
            const configuraciones = configuracionesLaberinto(datos);
            const resueltas = configuraciones.filter(function (config) {
                return config.resuelta;
            });

            const restantes = configuraciones
                .filter(function (config) {
                    return !config.resuelta && config.restante !== null;
                })
                .map(function (config) {
                    return config.restante;
                });

            return {
                equipo: datos.equipo || null,
                configuraciones: configuraciones,
                resueltas: resueltas.length,
                total: resueltas.length
                    ? resueltas.reduce(function (suma, config) {
                        return suma + config.tiempo;
                    }, 0)
                    : null,
                promedioRestante: restantes.length
                    ? restantes.reduce(function (suma, valor) {
                        return suma + valor;
                    }, 0) / restantes.length
                    : null
            };
        });

        filas.sort(function (a, b) {
            if (b.resueltas !== a.resueltas) return b.resueltas - a.resueltas;

            if (a.total !== null && b.total !== null && a.total !== b.total) {
                return a.total - b.total;
            }

            if (a.promedioRestante !== null && b.promedioRestante !== null &&
                a.promedioRestante !== b.promedioRestante) {
                return a.promedioRestante - b.promedioRestante;
            }

            if (a.promedioRestante === null && b.promedioRestante !== null) return 1;
            if (a.promedioRestante !== null && b.promedioRestante === null) return -1;

            return String(a.equipo).localeCompare(String(b.equipo), 'es');
        });

        return filas;
    }

    /** Texto corto de una configuración para la TV y el panel. */
    function textoConfiguracion(configuracion) {
        if (!configuracion) return '—';
        if (configuracion.resuelta) return formatearTiempo(configuracion.tiempo);
        if (configuracion.restante !== null) {
            return 'Faltan ' + configuracion.restante +
                (configuracion.restante === 1 ? ' celda' : ' celdas');
        }
        return '—';
    }

    /* ------------------------------------------------------------------ */
    /* Podios                                                             */
    /* ------------------------------------------------------------------ */

    function podioCategoria(categoria) {
        const vacio = { campeon: null, subcampeon: null, tercero: null };

        if (!categoria || typeof categoria !== 'object') return vacio;

        if (categoria.tipo === 'llaves') {
            const resuelto = resolverLlaves(categoria);
            return {
                campeon: resuelto.campeon,
                subcampeon: resuelto.subcampeon,
                tercero: resuelto.terceroGanador
            };
        }

        if (categoria.tipo === 'futbol') {
            const resuelto = resolverFutbol(categoria);
            return {
                campeon: resuelto.campeon,
                subcampeon: resuelto.subcampeon,
                tercero: resuelto.tercero
            };
        }

        if (categoria.tipo === 'tiempos') {
            const tabla = tablaTiempos(categoria);
            return {
                campeon: tabla[0] ? tabla[0].equipo : null,
                subcampeon: tabla[1] ? tabla[1].equipo : null,
                tercero: tabla[2] ? tabla[2].equipo : null
            };
        }

        if (categoria.tipo === 'laberinto') {
            const tabla = tablaLaberinto(categoria);
            return {
                campeon: tabla[0] ? tabla[0].equipo : null,
                subcampeon: tabla[1] ? tabla[1].equipo : null,
                tercero: tabla[2] ? tabla[2].equipo : null
            };
        }

        return vacio;
    }

    /* ------------------------------------------------------------------ */
    /* Validación del documento                                           */
    /* ------------------------------------------------------------------ */

    const VERSION_ACTUAL = 2;

    /* ------------------------------------------------------------------ */
    /* Estructura de las pantallas                                        */
    /* ------------------------------------------------------------------ */

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

    /** Copia la estructura de una pantalla base pero sin equipos ni resultados. */
    function pantallaVacia(base) {
        const copia = JSON.parse(JSON.stringify(base || {}));

        if (copia.tipo === 'llaves') {
            copia.rondas = (Array.isArray(copia.rondas) ? copia.rondas : []).map(function (ronda) {
                const info = ronda && typeof ronda === 'object' ? ronda : {};

                return {
                    nombre: info.nombre || '',
                    partidos: (Array.isArray(info.partidos) ? info.partidos : []).map(function () {
                        return combateVacio();
                    })
                };
            });

            copia.tercerPuesto = combateVacio();
        } else if (copia.tipo === 'futbol') {
            copia.grupos = (Array.isArray(copia.grupos) ? copia.grupos : []).map(function (grupo) {
                const info = grupo && typeof grupo === 'object' ? grupo : {};

                return {
                    nombre: info.nombre || '',
                    equipos: [null, null, null],
                    partidos: [partidoFutbolVacio()]
                };
            });

            copia.playoffs = {
                semifinales: [partidoFutbolVacio(), partidoFutbolVacio()],
                final: partidoFutbolVacio(),
                tercerPuesto: partidoFutbolVacio()
            };
        } else if (copia.tipo === 'tiempos' || copia.tipo === 'laberinto') {
            copia.entradas = [];
        }

        return copia;
    }

    /**
     * Ordena las pantallas guardadas según la lista base (brackets-data.js) y
     * agrega vacías las que falten (por ejemplo, una categoría nueva). Las
     * pantallas que no están en la base se conservan al final.
     */
    function fusionarPantallas(lista, base) {
        const guardadas = Array.isArray(lista) ? lista : [];
        const modelo = Array.isArray(base) ? base : [];

        if (!modelo.length) return guardadas.slice();

        const usadas = [];
        const resultado = [];

        modelo.forEach(function (categoria) {
            if (!categoria || !categoria.id) return;

            const encontrada = guardadas.find(function (guardada) {
                return guardada && guardada.id === categoria.id &&
                    usadas.indexOf(guardada) === -1;
            });

            if (encontrada) {
                usadas.push(encontrada);
                resultado.push(encontrada);
            } else {
                resultado.push(pantallaVacia(categoria));
            }
        });

        guardadas.forEach(function (guardada) {
            if (!guardada || usadas.indexOf(guardada) !== -1) return;

            const estaEnBase = modelo.some(function (categoria) {
                return categoria && categoria.id === guardada.id;
            });

            if (!estaEnBase) resultado.push(guardada);
        });

        return resultado;
    }

    function documentoValido(datos) {
        return !!(datos &&
            Number(datos.version) >= VERSION_ACTUAL &&
            Array.isArray(datos.equipos) &&
            Array.isArray(datos.categorias) &&
            datos.categorias.length);
    }

    global.BracketsLogica = {
        VERSION_ACTUAL: VERSION_ACTUAL,
        combateVacio: combateVacio,
        partidoFutbolVacio: partidoFutbolVacio,
        pantallaVacia: pantallaVacia,
        fusionarPantallas: fusionarPantallas,
        num: num,
        formatearTiempo: formatearTiempo,
        partirTiempo: partirTiempo,
        unirTiempo: unirTiempo,
        listaEquipos: listaEquipos,
        equipo: equipo,
        nombreEquipo: nombreEquipo,
        institucionEquipo: institucionEquipo,
        equiposDeCategoria: equiposDeCategoria,
        ganadorLlave: ganadorLlave,
        perdedorLlave: perdedorLlave,
        resolverLlaves: resolverLlaves,
        tablaGrupo: tablaGrupo,
        grupoCompleto: grupoCompleto,
        clasificadosFutbol: clasificadosFutbol,
        ganadorFutbol: ganadorFutbol,
        perdedorFutbol: perdedorFutbol,
        resolverFutbol: resolverFutbol,
        tablaTiempos: tablaTiempos,
        PASADAS_LABERINTO: PASADAS_LABERINTO,
        CONFIGURACIONES_LABERINTO: CONFIGURACIONES_LABERINTO,
        mejorPasada: mejorPasada,
        configuracionesLaberinto: configuracionesLaberinto,
        tablaLaberinto: tablaLaberinto,
        textoConfiguracion: textoConfiguracion,
        podioCategoria: podioCategoria,
        documentoValido: documentoValido
    };
})(typeof window !== 'undefined' ? window : globalThis);

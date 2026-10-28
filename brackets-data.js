/**
 * Datos de la pantalla de llaves y posiciones (brackets.html)
 * ============================================================
 *
 * Torneo local · Nave Cultural · Mendoza · 2026
 *
 * Este archivo define la lista maestra de equipos y el estado de cada
 * categoría según el reglamento de la Liga Nacional de Robótica (LNR).
 * NO se usa el ranking nacional: solo importa el torneo de la sede.
 *
 * ESTRUCTURA
 * ----------
 *   bracketsEvento.version          -> versión del formato (2)
 *   bracketsEvento.rotacionSegundos -> segundos que dura cada pantalla
 *   bracketsEvento.actualizadoEn    -> texto del pie de la TV
 *   bracketsEvento.equipos[]        -> lista maestra de equipos inscriptos
 *   bracketsEvento.categorias[]     -> una entrada por pantalla del carrusel
 *
 * LISTA MAESTRA DE EQUIPOS
 * ------------------------
 *   { id: "ms-titanio", nombre: "Titanio", institucion: "E.E.S.T. N° 4",
 *     categoria: "mini-sumo" }
 *
 *   Los partidos guardan el "id" del equipo, no su nombre. Si se cambia el
 *   nombre en el panel, la TV lo actualiza en todos lados.
 *
 *   Categorías válidas: "mini-sumo" | "sumo" | "futbol" | "sigue-lineas" |
 *   "laberinto"
 *
 * TIPOS DE PANTALLA (campo "tipo")
 * -------------------------------
 *   "llaves"    -> eliminación directa: cuartos, semifinales, final y 3.er puesto
 *   "futbol"    -> fase de grupos + semifinales + final + 3.er puesto
 *   "tiempos"   -> tabla de tiempos de Sigue Líneas (3 pasadas, mejor tiempo)
 *   "laberinto" -> 2 configuraciones × 5 pasadas, mejor pasada de cada una
 *   "resumen"   -> podios de todas las categorías (se calcula solo)
 *
 * MINI SUMO Y SUMO (reglamento LNR)
 * ---------------------------------
 *   Combate al mejor de 3 asaltos, 3 minutos por asalto. Gana quien llega
 *   primero a 2 Yuhkoh. Por eso los puntos van de 0 a 2.
 *   El ganador de cada llave avanza solo a la ronda siguiente.
 *
 * FÚTBOL DE ROBOTS (reglamento LNR)
 * ---------------------------------
 *   Dos tiempos de 3 minutos. En eliminación directa, si hay empate se
 *   define por penales. Fase de grupos: clasifican 1.º y 2.º de cada grupo.
 *   Los cruces se arman solos: 1.º A vs 2.º B y 1.º B vs 2.º A.
 *
 * SIGUE LÍNEAS
 * ------------
 *   Tres pasadas por robot. Los tiempos se guardan en MILISEGUNDOS y la TV
 *   los muestra como "12.480 s". Gana el menor tiempo.
 *
 * LABERINTO (reglamento LNR)
 * --------------------------
 *   Dos configuraciones del laberinto, cinco pasadas por robot en cada una.
 *   Vale la mejor pasada de cada configuración: si el robot llega a la meta
 *   se toma el menor tiempo; si no llega, la menor cantidad de celdas
 *   restantes. Clasificación: primero quien resuelve más configuraciones,
 *   después el menor tiempo total y por último la menor distancia restante.
 */

const bracketsEvento = {
    version: 2,

    // Tiempo de cada pantalla en el carrusel (en segundos).
    rotacionSegundos: 18,

    // Texto informativo del pie de página.
    actualizadoEn: "27/10/2026 · 21:30",

    // Sede del torneo local.
    sede: "Nave Cultural · Mendoza",

    /* ================================================================ */
    /* LISTA MAESTRA DE EQUIPOS INSCRIPTOS                              */
    /* ================================================================ */
    equipos: [
        /* ---------- Mini Sumo (8 robots) ---------- */
        { id: "ms-titanio", nombre: "Titanio", institucion: "E.E.S.T. N° 4", categoria: "mini-sumo" },
        { id: "ms-escorpion", nombre: "Escorpión", institucion: "Colegio San Rafael", categoria: "mini-sumo" },
        { id: "ms-furia", nombre: "Furia", institucion: "Instituto Andes", categoria: "mini-sumo" },
        { id: "ms-vendaval", nombre: "Vendaval", institucion: "Escuela N° 12", categoria: "mini-sumo" },
        { id: "ms-kripton", nombre: "Kriptón", institucion: "E.E.T. N° 6", categoria: "mini-sumo" },
        { id: "ms-golem", nombre: "Golem", institucion: "Fundación TAE", categoria: "mini-sumo" },
        { id: "ms-relampago", nombre: "Relámpago", institucion: "Colegio Del Sol", categoria: "mini-sumo" },
        { id: "ms-sabueso", nombre: "Sabueso", institucion: "Colegio Norte", categoria: "mini-sumo" },

        /* ---------- Sumo (8 robots) ---------- */
        { id: "su-coloso", nombre: "Coloso", institucion: "E.E.S.T. N° 4", categoria: "sumo" },
        { id: "su-martillo", nombre: "Martillo", institucion: "Instituto Andes", categoria: "sumo" },
        { id: "su-vulcano", nombre: "Vulcano", institucion: "Fundación TAE", categoria: "sumo" },
        { id: "su-hercules", nombre: "Hércules", institucion: "Colegio San Rafael", categoria: "sumo" },
        { id: "su-destructor", nombre: "Destructor", institucion: "Escuela Industrial", categoria: "sumo" },
        { id: "su-titan", nombre: "Titán", institucion: "E.E.T. N° 6", categoria: "sumo" },
        { id: "su-acorazado", nombre: "Acorazado", institucion: "Colegio Del Sol", categoria: "sumo" },
        { id: "su-bisonte", nombre: "Bisonte", institucion: "Univ. Mendoza", categoria: "sumo" },

        /* ---------- Fútbol de Robots (6 equipos) ---------- */
        { id: "fu-robogol", nombre: "RoboGol", institucion: "E.E.S.T. N° 4", categoria: "futbol" },
        { id: "fu-fieras", nombre: "Fieras FC", institucion: "Instituto Andes", categoria: "futbol" },
        { id: "fu-condores", nombre: "Los Cóndores", institucion: "E.E.T. N° 6", categoria: "futbol" },
        { id: "fu-metal", nombre: "Metal FC", institucion: "Fundación TAE", categoria: "futbol" },
        { id: "fu-cyber", nombre: "Cyber United", institucion: "Colegio San Rafael", categoria: "futbol" },
        { id: "fu-rayo", nombre: "Rayo Verde", institucion: "Colegio Del Sol", categoria: "futbol" },

        /* ---------- Sigue Líneas (10 robots) ---------- */
        { id: "sl-bolido", nombre: "Bólido", institucion: "Colegio Del Sol", categoria: "sigue-lineas" },
        { id: "sl-chispa", nombre: "Chispa", institucion: "Fundación TAE", categoria: "sigue-lineas" },
        { id: "sl-flecha", nombre: "Flecha", institucion: "E.E.S.T. N° 4", categoria: "sigue-lineas" },
        { id: "sl-centella", nombre: "Centella", institucion: "Instituto Andes", categoria: "sigue-lineas" },
        { id: "sl-nitro", nombre: "Nitro", institucion: "Colegio San Rafael", categoria: "sigue-lineas" },
        { id: "sl-puma", nombre: "Puma", institucion: "Univ. Mendoza", categoria: "sigue-lineas" },
        { id: "sl-cometa", nombre: "Cometa", institucion: "E.E.T. N° 6", categoria: "sigue-lineas" },
        { id: "sl-vertigo", nombre: "Vértigo", institucion: "Escuela N° 12", categoria: "sigue-lineas" },
        { id: "sl-trueno", nombre: "Trueno", institucion: "Colegio Norte", categoria: "sigue-lineas" },
        { id: "sl-dinamo", nombre: "Dínamo", institucion: "Escuela Industrial", categoria: "sigue-lineas" },

        /* ---------- Laberinto (8 robots) ---------- */
        { id: "lb-teseo", nombre: "Teseo", institucion: "E.E.S.T. N° 4", categoria: "laberinto" },
        { id: "lb-ariadna", nombre: "Ariadna", institucion: "Colegio Del Sol", categoria: "laberinto" },
        { id: "lb-dedalo", nombre: "Dédalo", institucion: "Fundación TAE", categoria: "laberinto" },
        { id: "lb-minotauro", nombre: "Minotauro", institucion: "Instituto Andes", categoria: "laberinto" },
        { id: "lb-icaro", nombre: "Ícaro", institucion: "E.E.T. N° 6", categoria: "laberinto" },
        { id: "lb-brujula", nombre: "Brújula", institucion: "Escuela N° 12", categoria: "laberinto" },
        { id: "lb-nexo", nombre: "Nexo", institucion: "Colegio San Rafael", categoria: "laberinto" },
        { id: "lb-ruta", nombre: "Ruta", institucion: "Univ. Mendoza", categoria: "laberinto" }
    ],

    /* ================================================================ */
    /* PANTALLAS DEL CARRUSEL                                           */
    /* ================================================================ */
    categorias: [
        /* ------------------------------------------------------------ */
        /* 1. MINI SUMO · eliminación directa                           */
        /* ------------------------------------------------------------ */
        {
            id: "mini-sumo",
            tipo: "llaves",
            titulo: "MINI SUMO",
            fase: "CUARTOS · SEMIFINALES · FINAL",
            corto: "MINI SUMO",
            acento: "#00ffff",
            equipos: "mini-sumo",
            unidad: "Yuhkoh",
            nota: "Eliminación directa · mejor de 3 asaltos · gana quien llega a 2 Yuhkoh",
            rondas: [
                {
                    nombre: "CUARTOS DE FINAL",
                    partidos: [
                        { equipoA: "ms-titanio", equipoB: "ms-escorpion", puntosA: 2, puntosB: 0, estado: "finalizado" },
                        { equipoA: "ms-furia", equipoB: "ms-vendaval", puntosA: 2, puntosB: 1, estado: "finalizado" },
                        { equipoA: "ms-kripton", equipoB: "ms-golem", puntosA: 0, puntosB: 2, estado: "finalizado" },
                        { equipoA: "ms-relampago", equipoB: "ms-sabueso", puntosA: 2, puntosB: 0, estado: "finalizado" }
                    ]
                },
                {
                    nombre: "SEMIFINALES",
                    partidos: [
                        { equipoA: null, equipoB: null, puntosA: 2, puntosB: 1, estado: "finalizado" },
                        { equipoA: null, equipoB: null, puntosA: 0, puntosB: 2, estado: "finalizado" }
                    ]
                },
                {
                    nombre: "FINAL",
                    partidos: [
                        { equipoA: null, equipoB: null, puntosA: 1, puntosB: 2, estado: "finalizado" }
                    ]
                }
            ],
            tercerPuesto: {
                equipoA: null,
                equipoB: null,
                puntosA: 2,
                puntosB: 0,
                estado: "finalizado"
            }
        },

        /* ------------------------------------------------------------ */
        /* 2. SUMO · eliminación directa (en curso)                     */
        /* ------------------------------------------------------------ */
        {
            id: "sumo",
            tipo: "llaves",
            titulo: "SUMO",
            fase: "CUARTOS · SEMIFINALES · FINAL",
            corto: "SUMO",
            acento: "#ff00ff",
            equipos: "sumo",
            unidad: "Yuhkoh",
            nota: "Eliminación directa · mejor de 3 asaltos · gana quien llega a 2 Yuhkoh",
            rondas: [
                {
                    nombre: "CUARTOS DE FINAL",
                    partidos: [
                        { equipoA: "su-coloso", equipoB: "su-martillo", puntosA: 2, puntosB: 0, estado: "finalizado" },
                        { equipoA: "su-vulcano", equipoB: "su-hercules", puntosA: 2, puntosB: 1, estado: "finalizado" },
                        { equipoA: "su-destructor", equipoB: "su-titan", puntosA: 1, puntosB: 1, estado: "en_curso" },
                        { equipoA: "su-acorazado", equipoB: "su-bisonte", puntosA: null, puntosB: null, estado: "pendiente" }
                    ]
                },
                {
                    nombre: "SEMIFINALES",
                    partidos: [
                        { equipoA: null, equipoB: null, puntosA: null, puntosB: null, estado: "pendiente" },
                        { equipoA: null, equipoB: null, puntosA: null, puntosB: null, estado: "pendiente" }
                    ]
                },
                {
                    nombre: "FINAL",
                    partidos: [
                        { equipoA: null, equipoB: null, puntosA: null, puntosB: null, estado: "pendiente" }
                    ]
                }
            ],
            tercerPuesto: {
                equipoA: null,
                equipoB: null,
                puntosA: null,
                puntosB: null,
                estado: "pendiente"
            }
        },

        /* ------------------------------------------------------------ */
        /* 3. FÚTBOL DE ROBOTS · grupos + eliminatorias                 */
        /* ------------------------------------------------------------ */
        {
            id: "futbol",
            tipo: "futbol",
            titulo: "FÚTBOL DE ROBOTS",
            fase: "GRUPOS · SEMIFINALES · FINAL",
            corto: "FÚTBOL",
            acento: "#00ff88",
            equipos: "futbol",
            nota: "2 tiempos de 3 minutos · clasifican 1.º y 2.º de cada grupo · empates en eliminación se definen por penales",
            grupos: [
                {
                    nombre: "GRUPO A",
                    equipos: ["fu-robogol", "fu-fieras", "fu-condores"],
                    partidos: [
                        { equipoA: "fu-robogol", equipoB: "fu-fieras", golesA: 4, golesB: 1, estado: "finalizado" },
                        { equipoA: "fu-fieras", equipoB: "fu-condores", golesA: 2, golesB: 2, estado: "finalizado" },
                        { equipoA: "fu-condores", equipoB: "fu-robogol", golesA: null, golesB: null, estado: "pendiente" }
                    ]
                },
                {
                    nombre: "GRUPO B",
                    equipos: ["fu-metal", "fu-cyber", "fu-rayo"],
                    partidos: [
                        { equipoA: "fu-metal", equipoB: "fu-cyber", golesA: 3, golesB: 0, estado: "finalizado" },
                        { equipoA: "fu-cyber", equipoB: "fu-rayo", golesA: 1, golesB: 1, estado: "finalizado" },
                        { equipoA: "fu-rayo", equipoB: "fu-metal", golesA: 0, golesB: 1, estado: "en_curso" }
                    ]
                }
            ],
            playoffs: {
                semifinales: [
                    { equipoA: null, equipoB: null, golesA: null, golesB: null, penalesA: null, penalesB: null, estado: "pendiente" },
                    { equipoA: null, equipoB: null, golesA: null, golesB: null, penalesA: null, penalesB: null, estado: "pendiente" }
                ],
                final: {
                    equipoA: null, equipoB: null,
                    golesA: null, golesB: null,
                    penalesA: null, penalesB: null,
                    estado: "pendiente"
                },
                tercerPuesto: {
                    equipoA: null, equipoB: null,
                    golesA: null, golesB: null,
                    penalesA: null, penalesB: null,
                    estado: "pendiente"
                }
            }
        },

        /* ------------------------------------------------------------ */
        /* 4. SIGUE LÍNEAS · tabla de tiempos                           */
        /* ------------------------------------------------------------ */
        {
            id: "sigue-lineas",
            tipo: "tiempos",
            titulo: "SIGUE LÍNEAS",
            fase: "TABLA DE TIEMPOS",
            corto: "SIGUE LÍNEAS",
            acento: "#ffaa00",
            equipos: "sigue-lineas",
            nota: "3 pasadas por robot · se ordena por el mejor tiempo · gana el menor tiempo",
            entradas: [
                { equipo: "sl-bolido", tiempos: [12480, 12510, 12390] },
                { equipo: "sl-chispa", tiempos: [12910, 12840, null] },
                { equipo: "sl-flecha", tiempos: [13050, 12990, 13120] },
                { equipo: "sl-centella", tiempos: [13440, null, null] },
                { equipo: "sl-nitro", tiempos: [13820, 13760, null] },
                { equipo: "sl-puma", tiempos: [14100, 14230, 14050] },
                { equipo: "sl-cometa", tiempos: [14550, 14490, null] },
                { equipo: "sl-vertigo", tiempos: [15020, null, null] },
                { equipo: "sl-trueno", tiempos: [15400, 15310, 15280] },
                { equipo: "sl-dinamo", tiempos: [null, null, null] }
            ]
        },

        /* ------------------------------------------------------------ */
        /* 5. LABERINTO · 2 configuraciones × 5 pasadas                 */
        /* ------------------------------------------------------------ */
        {
            id: "laberinto",
            tipo: "laberinto",
            titulo: "LABERINTO",
            fase: "2 CONFIGURACIONES · MEJOR PASADA",
            corto: "LABERINTO",
            acento: "#b026ff",
            equipos: "laberinto",
            configuraciones: 2,
            pasadas: 5,
            nota: "5 pasadas por robot en cada configuración · vale la mejor pasada · si no llega, se cuenta la distancia restante",
            entradas: [
                {
                    equipo: "lb-teseo",
                    configuraciones: [
                        { pasadas: [{ tiempo: 45320 }, { tiempo: 44120 }, { tiempo: 43870 }, null, null] },
                        { pasadas: [{ tiempo: 51200 }, { tiempo: 49880 }, null, null, null] }
                    ]
                },
                {
                    equipo: "lb-ariadna",
                    configuraciones: [
                        { pasadas: [{ tiempo: 47110 }, { tiempo: 46980 }, null, null, null] },
                        { pasadas: [{ tiempo: 48230 }, { tiempo: 47900 }, null, null, null] }
                    ]
                },
                {
                    equipo: "lb-icaro",
                    configuraciones: [
                        { pasadas: [{ tiempo: 55900 }, { tiempo: 54310 }, null, null, null] },
                        { pasadas: [{ tiempo: 58200 }, null, null, null, null] }
                    ]
                },
                {
                    equipo: "lb-dedalo",
                    configuraciones: [
                        { pasadas: [{ tiempo: 49540 }, null, null, null, null] },
                        { pasadas: [{ restante: 3 }, { restante: 2 }, null, null, null] }
                    ]
                },
                {
                    equipo: "lb-minotauro",
                    configuraciones: [
                        { pasadas: [{ tiempo: 52480 }, null, null, null, null] },
                        { pasadas: [{ restante: 5 }, { restante: 6 }, null, null, null] }
                    ]
                },
                {
                    equipo: "lb-nexo",
                    configuraciones: [
                        { pasadas: [{ tiempo: 61200 }, { tiempo: 62050 }, null, null, null] },
                        { pasadas: [null, null, null, null, null] }
                    ]
                },
                {
                    equipo: "lb-brujula",
                    configuraciones: [
                        { pasadas: [{ restante: 4 }, { restante: 5 }, null, null, null] },
                        { pasadas: [{ restante: 6 }, null, null, null, null] }
                    ]
                },
                {
                    equipo: "lb-ruta",
                    configuraciones: [
                        { pasadas: [{ restante: 7 }, { restante: 6 }, null, null, null] },
                        { pasadas: [{ restante: 8 }, null, null, null, null] }
                    ]
                }
            ]
        },

        /* ------------------------------------------------------------ */
        /* 6. RESUMEN DEL TORNEO · podios (se calcula solo)             */
        /* ------------------------------------------------------------ */
        {
            id: "resumen",
            tipo: "resumen",
            titulo: "RESUMEN DEL TORNEO",
            fase: "PODIOS Y MEDALLERO",
            corto: "RESUMEN",
            acento: "#ff3366",
            nota: "Torneo local · Nave Cultural · Mendoza · Los podios se actualizan con los resultados"
        }
    ]
};

// Compatibilidad: algunos scripts viejos buscaban window.bracketsEvento.
if (typeof window !== 'undefined') window.bracketsEvento = bracketsEvento;

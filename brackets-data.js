/**
 * Datos de la pantalla de llaves y posiciones (brackets.html)
 * ============================================================
 *
 * ESTE ES EL ÚNICO ARCHIVO QUE HAY QUE EDITAR DURANTE EL EVENTO.
 * Después de guardar los cambios, la TV de competidores los muestra al
 * instante (si hace falta, recarga con F5).
 *
 * Estructura general:
 *   bracketsEvento.rotacionSegundos  -> cada cuántos segundos cambia de pantalla
 *   bracketsEvento.actualizadoEn     -> texto que se muestra al pie
 *   bracketsEvento.categorias[]      -> una entrada por pantalla del carrusel
 *
 * Tipos de pantalla (campo "tipo"):
 *   "llaves" -> eliminatoria directa (cuartos, semifinales, final, campeón)
 *   "grupos" -> fase de grupos (varias tablas)
 *   "tabla"  -> una tabla de posiciones / tiempos
 *
 * En las llaves, cada partido se escribe así:
 *   {
 *       equipoA: "Nombre del robot o equipo",
 *       equipoB: "Nombre del robot o equipo",
 *       puntosA: 3,                 // número, o null si todavía no jugaron
 *       puntosB: 1,
 *       estado: "finalizado"        // "finalizado" | "en_curso" | "pendiente"
 *   }
 * Si un equipo todavía no se conoce, usar null en equipoA/equipoB y
 * estado "pendiente": se muestra "Por definir".
 * El ganador se marca solo con el puntaje; si hace falta forzarlo, agregar
 * "ganador": "A" (o "B") en el partido.
 *
 * En las tablas, "columnas" define los encabezados y "filas" los datos.
 * Cada columna tiene una "clave" que debe coincidir con las claves de las filas.
 */

const bracketsEvento = {
    // Tiempo de cada pantalla en el carrusel (en segundos).
    rotacionSegundos: 18,

    // Texto informativo del pie de página.
    actualizadoEn: "27/10/2026 · 21:30",

    categorias: [
        /* ============================================================ */
        /* 1. MINI SUMO - LLAVES                                        */
        /* ============================================================ */
        {
            id: "minisumo",
            titulo: "MINI SUMO",
            fase: "FASE DE LLAVES",
            corto: "MINI SUMO",
            acento: "#00ffff",
            tipo: "llaves",
            nota: "Eliminación directa · combates al mejor de 5",
            rondas: [
                {
                    nombre: "CUARTOS DE FINAL",
                    partidos: [
                        { equipoA: "Titanio", equipoB: "Escorpión", puntosA: 3, puntosB: 1, estado: "finalizado" },
                        { equipoA: "Furia", equipoB: "Vendaval", puntosA: 3, puntosB: 2, estado: "finalizado" },
                        { equipoA: "Kriptón", equipoB: "Golem", puntosA: 1, puntosB: 3, estado: "finalizado" },
                        { equipoA: "Relámpago", equipoB: "Sabueso", puntosA: 3, puntosB: 0, estado: "finalizado" }
                    ]
                },
                {
                    nombre: "SEMIFINALES",
                    partidos: [
                        { equipoA: "Titanio", equipoB: "Furia", puntosA: 3, puntosB: 2, estado: "finalizado" },
                        { equipoA: "Golem", equipoB: "Relámpago", puntosA: 3, puntosB: 1, estado: "finalizado" }
                    ]
                },
                {
                    nombre: "FINAL",
                    partidos: [
                        { equipoA: "Titanio", equipoB: "Golem", puntosA: 2, puntosB: 3, estado: "finalizado" }
                    ]
                }
            ],
            campeon: { equipo: "Golem", detalle: "Mini Sumo · 2026" }
        },

        /* ============================================================ */
        /* 2. SUMO - LLAVES                                             */
        /* ============================================================ */
        {
            id: "sumo",
            titulo: "SUMO",
            fase: "FASE DE LLAVES",
            corto: "SUMO",
            acento: "#ff00ff",
            tipo: "llaves",
            nota: "Eliminación directa · combates al mejor de 5",
            rondas: [
                {
                    nombre: "CUARTOS DE FINAL",
                    partidos: [
                        { equipoA: "Coloso", equipoB: "Martillo", puntosA: 2, puntosB: 1, estado: "finalizado" },
                        { equipoA: "Vulcano", equipoB: "Hércules", puntosA: 3, puntosB: 0, estado: "finalizado" },
                        { equipoA: "Destructor", equipoB: "Titán", puntosA: 1, puntosB: 1, estado: "en_curso" },
                        { equipoA: "Acorazado", equipoB: "Bisonte", puntosA: null, puntosB: null, estado: "pendiente" }
                    ]
                },
                {
                    nombre: "SEMIFINALES",
                    partidos: [
                        { equipoA: "Coloso", equipoB: "Vulcano", puntosA: null, puntosB: null, estado: "pendiente" },
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
            campeon: { equipo: null, detalle: "Sumo · 2026" }
        },

        /* ============================================================ */
        /* 3. FÚTBOL DE ROBOTS - FASE DE GRUPOS                         */
        /* ============================================================ */
        {
            id: "futbol",
            titulo: "FÚTBOL DE ROBOTS",
            fase: "FASE DE GRUPOS",
            corto: "FÚTBOL",
            acento: "#00ff88",
            tipo: "grupos",
            nota: "Clasifican los dos primeros de cada grupo a semifinales",
            columnas: [
                { clave: "pos", titulo: "POS" },
                { clave: "equipo", titulo: "EQUIPO", alineacion: "izq" },
                { clave: "pj", titulo: "PJ" },
                { clave: "dg", titulo: "DIF" },
                { clave: "pts", titulo: "PTS", destacar: true }
            ],
            grupos: [
                {
                    nombre: "GRUPO A",
                    equipos: [
                        { equipo: "RoboGol", pj: 3, dg: "+7", pts: 9 },
                        { equipo: "Fieras FC", pj: 3, dg: "+3", pts: 6 },
                        { equipo: "Los Galácticos", pj: 3, dg: "-1", pts: 3 },
                        { equipo: "Tornado FC", pj: 3, dg: "-9", pts: 0 }
                    ]
                },
                {
                    nombre: "GRUPO B",
                    equipos: [
                        { equipo: "Metal FC", pj: 3, dg: "+6", pts: 9 },
                        { equipo: "Cyber United", pj: 3, dg: "+4", pts: 6 },
                        { equipo: "Los Cóndores", pj: 3, dg: "-2", pts: 3 },
                        { equipo: "Rayo Verde", pj: 3, dg: "-8", pts: 0 }
                    ]
                }
            ],
            // Cruces que se muestran debajo de los grupos (opcional).
            // Si todavía no están definidos, dejar equipoA/equipoB en null.
            cruces: {
                titulo: "SEMIFINALES",
                partidos: [
                    { equipoA: "RoboGol", equipoB: "Cyber United", puntosA: null, puntosB: null, estado: "pendiente" },
                    { equipoA: "Metal FC", equipoB: "Fieras FC", puntosA: null, puntosB: null, estado: "pendiente" }
                ]
            }
        },

        /* ============================================================ */
        /* 4. SIGUE LÍNEAS - TABLA DE TIEMPOS Y PUNTOS                  */
        /* ============================================================ */
        {
            id: "sigue-lineas",
            titulo: "SIGUE LÍNEAS",
            fase: "TABLA DE POSICIONES",
            corto: "SIGUE LÍNEAS",
            acento: "#ffaa00",
            tipo: "tabla",
            nota: "Se ordena por mejor tiempo de pista · 3 pasadas por robot",
            columnas: [
                { clave: "pos", titulo: "POS" },
                { clave: "robot", titulo: "ROBOT", alineacion: "izq" },
                { clave: "equipo", titulo: "EQUIPO", alineacion: "izq" },
                { clave: "tiempo", titulo: "MEJOR TIEMPO", destacar: true },
                { clave: "puntos", titulo: "PUNTOS", destacar: true }
            ],
            filas: [
                { robot: "Bólido", equipo: "Rayo Verde", tiempo: "12.48 s", puntos: 100 },
                { robot: "Chispa", equipo: "Metal FC", tiempo: "12.91 s", puntos: 90 },
                { robot: "Flecha", equipo: "Cyber United", tiempo: "13.05 s", puntos: 85 },
                { robot: "Tornado", equipo: "Tornado FC", tiempo: "13.44 s", puntos: 80 },
                { robot: "Relámpago", equipo: "Fieras FC", tiempo: "13.82 s", puntos: 75 },
                { robot: "Kriptón", equipo: "RoboGol", tiempo: "14.10 s", puntos: 70 },
                { robot: "Titán", equipo: "Los Cóndores", tiempo: "14.55 s", puntos: 65 },
                { robot: "Nitro", equipo: "Los Galácticos", tiempo: "15.02 s", puntos: 60 },
                { robot: "Puma", equipo: "Andes Bots", tiempo: "15.40 s", puntos: 55 },
                { robot: "Golem", equipo: "TAE Robotics", tiempo: "16.11 s", puntos: 50 }
            ]
        },

        /* ============================================================ */
        /* 5. LIGA NACIONAL OFICIAL - TABLA GENERAL                     */
        /* ============================================================ */
        {
            id: "liga-nacional",
            titulo: "LIGA NACIONAL OFICIAL",
            fase: "TABLA GENERAL",
            corto: "LIGA NACIONAL",
            acento: "#ff3366",
            tipo: "tabla",
            nota: "Puntaje acumulado en las fechas de la Liga Nacional de Robótica",
            columnas: [
                { clave: "pos", titulo: "POS" },
                { clave: "equipo", titulo: "EQUIPO", alineacion: "izq" },
                { clave: "institucion", titulo: "INSTITUCIÓN", alineacion: "izq" },
                { clave: "puntos", titulo: "PUNTOS", destacar: true }
            ],
            filas: [
                { equipo: "Rayo Verde", institucion: "Esc. Técnica N° 4", puntos: 480 },
                { equipo: "Metal FC", institucion: "Instituto Andes", puntos: 455 },
                { equipo: "Cyber United", institucion: "Colegio San Rafael", puntos: 430 },
                { equipo: "Fieras FC", institucion: "Esc. N° 12", puntos: 410 },
                { equipo: "RoboGol", institucion: "ITYT", puntos: 385 },
                { equipo: "Tornado FC", institucion: "Colegio Del Sol", puntos: 360 },
                { equipo: "Los Cóndores", institucion: "Esc. Técnica N° 6", puntos: 340 },
                { equipo: "Andes Bots", institucion: "Univ. Mendoza", puntos: 315 },
                { equipo: "TAE Robotics", institucion: "Fundación TAE", puntos: 295 },
                { equipo: "Los Galácticos", institucion: "Colegio Norte", puntos: 270 }
            ]
        }
    ]
};

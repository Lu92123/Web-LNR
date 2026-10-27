/**
 * Datos del evento - Competencia de Robótica WebLiga
 * Estructura con eventos del día para el tablero en TV
 *
 * IMPORTANTE:
 * - Cada categoría tiene su propia fila en el cronograma, aunque su horario
 *   se superponga con otras. Así se puede ver el estado de cada una por separado.
 * - Los horarios de abajo son orientativos. En la pantalla se pueden ajustar
 *   en vivo con doble clic sobre la fila (los cambios se pierden al recargar).
 */

const eventos = [
    {
        id: 1,
        horaInicio: "09:00",
        horaFin: "10:00",
        titulo: "Homologación",
        zona: "Zona de Homologación",
        zonaId: ["homo-liga", "homo-tae", "bascula"]
    },
    {
        id: 2,
        horaInicio: "10:00",
        horaFin: "13:30",
        titulo: "Mini Sumo",
        zona: "Pista de Competencia",
        zonaId: ["torneo-robotica", "bascula"]
    },
    {
        id: 3,
        horaInicio: "10:00",
        horaFin: "13:30",
        titulo: "Fútbol",
        zona: "Pista de Competencia",
        zonaId: ["torneo-robotica", "bascula"]
    },
    {
        id: 4,
        horaInicio: "10:00",
        horaFin: "13:30",
        titulo: "Carrera",
        zona: "Pista de Competencia",
        zonaId: ["torneo-robotica", "bascula"]
    },
    {
        id: 5,
        horaInicio: "10:00",
        horaFin: "13:30",
        titulo: "Laberinto",
        zona: "Pista de Competencia",
        zonaId: ["torneo-robotica", "bascula"]
    },
    {
        id: 6,
        horaInicio: "13:30",
        horaFin: "14:00",
        titulo: "Almuerzo",
        zona: "Comedor",
        zonaId: "buffet"
    },
    {
        id: 7,
        horaInicio: "14:00",
        horaFin: "16:00",
        titulo: "Sumo",
        zona: "Pista de Competencia",
        zonaId: ["torneo-robotica", "bascula"]
    },
    {
        id: 8,
        horaInicio: "16:00",
        horaFin: "17:00",
        titulo: "Juego de Finales",
        zona: "Pista Principal",
        zonaId: ["torneo-robotica", "bascula"]
    },
    {
        id: 9,
        horaInicio: "17:00",
        horaFin: "18:00",
        titulo: "Premiación",
        zona: "Auditorio",
        zonaId: ["bascula"]
    }
];

/**
 * Función auxiliar para convertir string de hora HH:MM a minutos totales
 * @param {string} timeString - Hora en formato HH:MM
 * @returns {number} Total de minutos desde medianoche
 */
function horaAMinutos(timeString) {
    const [horas, minutos] = timeString.split(':').map(Number);
    return horas * 60 + minutos;
}

/**
 * Obtener hora actual en formato HH:MM
 * @returns {string} Hora actual
 */
function obtenerHoraActualString() {
    const now = new Date();
    const horas = String(now.getHours()).padStart(2, '0');
    const minutos = String(now.getMinutes()).padStart(2, '0');
    return `${horas}:${minutos}`;
}

/**
 * Obtener hora y segundos actual en formato HH:MM:SS
 * @returns {string} Hora actual con segundos
 */
function obtenerHoraConSegundos() {
    const now = new Date();
    const horas = String(now.getHours()).padStart(2, '0');
    const minutos = String(now.getMinutes()).padStart(2, '0');
    const segundos = String(now.getSeconds()).padStart(2, '0');
    return `${horas}:${minutos}:${segundos}`;
}

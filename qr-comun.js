/**
 * Utilidades para generar y descargar el QR de WebLiga.
 * Requiere: lib/qrcode-generator.js
 */
(function (global) {
    'use strict';

    function crearSvg(texto, opciones) {
        opciones = opciones || {};

        if (typeof global.qrcode !== 'function') {
            console.error('WebLiga: no se cargó el generador de QR.');
            return '';
        }

        const qr = global.qrcode(0, opciones.nivel || 'M');
        qr.addData(texto);
        qr.make();

        return qr.createSvgTag({
            cellSize: opciones.cellSize || 8,
            margin: typeof opciones.margin === 'number' ? opciones.margin : 4,
            alt: opciones.alt || 'Código QR del tablero WebLiga'
        });
    }

    function dibujar(contenedor, texto, opciones) {
        if (!contenedor) return null;

        contenedor.innerHTML = crearSvg(texto, opciones);
        return contenedor.querySelector('svg');
    }

    function descargarSvg(svg, nombre) {
        if (!svg) return;

        const copia = svg.cloneNode(true);
        copia.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

        const texto = new XMLSerializer().serializeToString(copia);
        const blob = new Blob([texto], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement('a');

        enlace.href = url;
        enlace.download = nombre || 'qr-webliga.svg';
        document.body.appendChild(enlace);
        enlace.click();
        enlace.remove();

        setTimeout(function () {
            URL.revokeObjectURL(url);
        }, 1000);
    }

    global.QRWebLiga = {
        crearSvg: crearSvg,
        dibujar: dibujar,
        descargarSvg: descargarSvg
    };
})(window);

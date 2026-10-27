/**
 * Genera el QR grande del tablero público.
 */
(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
        const url = (window.HorariosSync && window.HorariosSync.urlPublica())
            ? window.HorariosSync.urlPublica()
            : window.location.href;

        const contenedor = document.getElementById('qrCode');
        const etiqueta = document.getElementById('qrUrl');
        const botonImprimir = document.getElementById('printBtn');

        if (etiqueta) etiqueta.textContent = url;

        if (window.QRWebLiga) {
            window.QRWebLiga.dibujar(contenedor, url, {
                cellSize: 12,
                margin: 4,
                alt: 'Código QR para abrir el tablero de WebLiga'
            });
        }

        if (botonImprimir) {
            botonImprimir.addEventListener('click', function () {
                window.print();
            });
        }

        // Permite abrir qr.html?print=1 para imprimir directo.
        if (new URLSearchParams(window.location.search).get('print') === '1') {
            setTimeout(function () {
                window.print();
            }, 400);
        }
    });
})();

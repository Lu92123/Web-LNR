/**
 * Sincronización de horarios con Supabase - WebLiga
 *
 * - Descarga los cambios guardados en la tabla `horarios`.
 * - Los mantiene actualizados con Realtime y, como respaldo, con polling.
 * - Guarda una copia en localStorage para que el tablero siga mostrando
 *   el último estado conocido si se corta internet.
 * - Expone el login del administrador y las operaciones de escritura.
 *
 * Requiere: lib/supabase.js, supabase-config.js
 */
(function (global) {
    'use strict';

    const TABLA = 'horarios';
    const TABLA_AVISOS = 'avisos';
    const CLAVE_CACHE = 'webliga-horarios-cache-v1';
    const CLAVE_CACHE_AVISO = 'webliga-aviso-cache-v1';
    const INTERVALO_RESPALDO = 30000;
    const TIEMPO_MAXIMO_LECTURA = 12000;
    const TIEMPO_MAXIMO_ESCRITURA = 15000;

    let cliente = null;
    let iniciado = false;
    let canal = null;
    let intervalo = null;
    let temporizadorRefresco = null;
    let temporizadorAviso = null;
    let peticionActual = 0;
    let peticionAvisoActual = 0;

    let alCambiar = null;
    let alEstado = null;
    let alAviso = null;
    let ultimaSync = null;
    let estadoActual = 'inicial';
    let falloAviso = '';

    /* ------------------------------------------------------------------ */
    /* Configuración y cliente                                            */
    /* ------------------------------------------------------------------ */

    function leerConfig() {
        const cfg = global.WEBLIGA_CONFIG || {};
        return {
            url: String(cfg.supabaseUrl || '').trim(),
            clave: String(cfg.supabaseAnonKey || '').trim(),
            urlPublica: String(cfg.urlPublica || '').trim()
        };
    }

    function estaConfigurado() {
        const cfg = leerConfig();
        return !!(cfg.url && cfg.clave);
    }

    function referenciaDeClave(clave) {
        // La clave anon clásica es un JWT que incluye el proyecto en el campo "ref".
        const partes = String(clave || '').split('.');
        if (partes.length !== 3 || typeof global.atob !== 'function') return '';

        try {
            const base64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
            const relleno = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
            const datos = JSON.parse(global.atob(relleno));
            return typeof datos.ref === 'string' ? datos.ref : '';
        } catch (e) {
            return '';
        }
    }

    function problemaDeConfiguracion() {
        const cfg = leerConfig();
        if (!cfg.url || !cfg.clave) return '';

        // Las claves nuevas (sb_publishable_...) no incluyen el proyecto.
        if (cfg.clave.indexOf('sb_publishable_') === 0) return '';

        const ref = referenciaDeClave(cfg.clave);
        if (!ref) return '';

        let host = '';
        try {
            host = new URL(cfg.url).hostname.toLowerCase();
        } catch (e) {
            return 'La URL de Supabase no es válida: "' + cfg.url + '". Copiala de Project Settings → API.';
        }

        const esperado = ref.toLowerCase() + '.supabase.co';
        if (host !== esperado) {
            return 'La URL de Supabase no coincide con la clave anon: la clave pertenece al proyecto "' +
                ref + '", así que la URL debe ser https://' + esperado + '.';
        }

        return '';
    }

    function obtenerCliente() {
        // Permite inyectar un cliente falso en pruebas.
        if (global.__WEBLIGA_SUPABASE_CLIENT__) {
            return global.__WEBLIGA_SUPABASE_CLIENT__;
        }

        if (cliente) return cliente;
        if (!estaConfigurado()) return null;

        if (!global.supabase || typeof global.supabase.createClient !== 'function') {
            console.error('WebLiga: no se cargó el SDK de Supabase.');
            return null;
        }

        const cfg = leerConfig();
        cliente = global.supabase.createClient(cfg.url, cfg.clave, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: false
            }
        });

        return cliente;
    }

    function urlPublica() {
        const cfg = leerConfig();
        if (cfg.urlPublica) return cfg.urlPublica;

        try {
            const url = new URL('index.html', global.location.href);
            url.search = '';
            url.hash = '';
            return url.href;
        } catch (e) {
            return global.location.href;
        }
    }

    /* ------------------------------------------------------------------ */
    /* Datos y caché local                                                */
    /* ------------------------------------------------------------------ */

    function filaAOverride(fila) {
        return {
            horaInicio: fila.hora_inicio,
            horaFin: fila.hora_fin,
            finalizado: !!fila.finalizado,
            actualizadoEn: fila.actualizado_en || null,
            actualizadoPor: fila.actualizado_por || null
        };
    }

    function filasAOverrides(filas) {
        const salida = {};

        (filas || []).forEach(function (fila) {
            if (fila && fila.evento_id !== null && fila.evento_id !== undefined) {
                salida[String(fila.evento_id)] = filaAOverride(fila);
            }
        });

        return salida;
    }

    function leerCache() {
        try {
            const crudo = global.localStorage.getItem(CLAVE_CACHE);
            if (!crudo) return null;

            const datos = JSON.parse(crudo);
            if (!datos || typeof datos.overrides !== 'object') return null;

            return datos;
        } catch (e) {
            return null;
        }
    }

    function guardarCache(overrides) {
        try {
            global.localStorage.setItem(CLAVE_CACHE, JSON.stringify({
                overrides: overrides,
                guardadoEn: new Date().toISOString()
            }));
        } catch (e) {
            // Sin espacio o navegación privada: seguimos funcionando online.
        }
    }

    function leerCacheAviso() {
        try {
            const crudo = global.localStorage.getItem(CLAVE_CACHE_AVISO);
            if (!crudo) return null;

            const datos = JSON.parse(crudo);
            if (!datos || typeof datos.texto !== 'string') return null;

            return datos;
        } catch (e) {
            return null;
        }
    }

    function guardarCacheAviso(aviso) {
        try {
            global.localStorage.setItem(CLAVE_CACHE_AVISO, JSON.stringify({
                texto: aviso.texto,
                activo: !!aviso.activo,
                actualizadoEn: aviso.actualizadoEn || null,
                guardadoEn: new Date().toISOString()
            }));
        } catch (e) {
            // Sin espacio o navegación privada: seguimos funcionando online.
        }
    }

    function filaAAviso(fila) {
        return {
            texto: fila.texto || '',
            activo: !!fila.activo,
            actualizadoEn: fila.actualizado_en || null,
            actualizadoPor: fila.actualizado_por || null
        };
    }

    function emitirAviso(aviso, origen) {
        if (typeof alAviso !== 'function') return;

        // Solo se muestra un aviso activo y con texto real
        const texto = aviso ? String(aviso.texto || '').trim() : '';
        const mostrar = aviso && aviso.activo && texto;

        if (!mostrar) {
            alAviso(null, { origen: origen });
            return;
        }

        alAviso({
            texto: texto,
            activo: !!aviso.activo,
            actualizadoEn: aviso.actualizadoEn || null,
            actualizadoPor: aviso.actualizadoPor || null
        }, {
            origen: origen,
            fecha: aviso.actualizadoEn
        });
    }

    function emitirCambio(overrides, origen) {
        ultimaSync = new Date();

        if (typeof alCambiar === 'function') {
            alCambiar(overrides, {
                origen: origen,
                fecha: ultimaSync
            });
        }
    }

    function emitirEstado(estado, detalle) {
        estadoActual = estado;

        if (typeof alEstado === 'function') {
            alEstado(estado, detalle || {});
        }
    }

    /**
     * Corta una operación que no responde para no dejar el tablero
     * "SINCRONIZANDO" para siempre en una red que se quedó colgada.
     */
    function conTiempoLimite(promesa, milisegundos, mensaje) {
        return new Promise(function (resolve, reject) {
            const temporizador = setTimeout(function () {
                reject(new Error(mensaje || 'La operación tardó demasiado. Revisá la conexión.'));
            }, milisegundos);

            Promise.resolve(promesa).then(
                function (valor) {
                    clearTimeout(temporizador);
                    resolve(valor);
                },
                function (error) {
                    clearTimeout(temporizador);
                    reject(error);
                }
            );
        });
    }

    /* ------------------------------------------------------------------ */
    /* Lectura y suscripción                                              */
    /* ------------------------------------------------------------------ */

    async function descargarOverrides(silencioso) {
        const supabase = obtenerCliente();
        if (!supabase) {
            emitirEstado('sin-configurar');
            return null;
        }

        const numeroPeticion = ++peticionActual;

        if (!silencioso) emitirEstado('sincronizando');

        try {
            const respuesta = await conTiempoLimite(
                supabase
                    .from(TABLA)
                    .select('evento_id,hora_inicio,hora_fin,finalizado,actualizado_en,actualizado_por'),
                TIEMPO_MAXIMO_LECTURA,
                'No se pudo conectar con el servidor de horarios.'
            );

            if (respuesta.error) throw respuesta.error;
            if (numeroPeticion !== peticionActual) return null;

            const overrides = filasAOverrides(respuesta.data);
            guardarCache(overrides);
            emitirCambio(overrides, 'nube');
            emitirEstado('conectado', { fecha: new Date() });

            return overrides;
        } catch (error) {
            if (numeroPeticion !== peticionActual) return null;

            console.error('WebLiga: no se pudieron cargar los horarios. ' + (error.message || error));
            emitirEstado('sin-conexion', { error: error });

            return null;
        }
    }

    async function descargarAviso(silencioso) {
        const supabase = obtenerCliente();
        if (!supabase) return null;

        const numeroPeticion = ++peticionAvisoActual;

        try {
            const respuesta = await conTiempoLimite(
                supabase
                    .from(TABLA_AVISOS)
                    .select('texto,activo,actualizado_en,actualizado_por')
                    .limit(1),
                TIEMPO_MAXIMO_LECTURA,
                'No se pudo conectar con el servidor de avisos.'
            );

            if (respuesta.error) throw respuesta.error;
            if (numeroPeticion !== peticionAvisoActual) return null;

            falloAviso = '';

            const aviso = respuesta.data && respuesta.data.length
                ? filaAAviso(respuesta.data[0])
                : null;

            if (aviso) guardarCacheAviso(aviso);

            emitirAviso(aviso, 'nube');
            return aviso;
        } catch (error) {
            if (numeroPeticion !== peticionAvisoActual) return null;

            // Los avisos no definen el estado de conexión del tablero
            // (eso lo controlan los horarios). Con la caché basta.
            falloAviso = String(error && error.message ? error.message : error);
            console.warn('WebLiga: no se pudo actualizar el aviso. ' + falloAviso);

            const cache = leerCacheAviso();
            if (!silencioso || cache) {
                emitirAviso(cache, 'cache');
            }

            return null;
        }
    }

    async function obtenerAviso() {
        return await descargarAviso(true);
    }

    function problemaAviso() {
        return falloAviso;
    }

    function suscribir() {
        const supabase = obtenerCliente();
        if (!supabase || canal) return;

        canal = supabase
            .channel('webliga-horarios')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: TABLA },
                function () {
                    if (temporizadorRefresco !== null) {
                        clearTimeout(temporizadorRefresco);
                    }

                    temporizadorRefresco = setTimeout(function () {
                        temporizadorRefresco = null;
                        descargarOverrides(true);
                    }, 200);
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: TABLA_AVISOS },
                function () {
                    if (temporizadorAviso !== null) {
                        clearTimeout(temporizadorAviso);
                    }

                    temporizadorAviso = setTimeout(function () {
                        temporizadorAviso = null;
                        descargarAviso(true);
                    }, 200);
                }
            )
            .subscribe(function (estado) {
                if (estado === 'SUBSCRIBED') {
                    // Tener el canal Realtime abierto no garantiza que los datos
                    // se hayan podido descargar. Verificamos con una lectura.
                    descargarOverrides(true);
                    descargarAviso(true);
                    return;
                }

                if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT') {
                    // Realtime puede fallar (por ejemplo, en una red restrictiva).
                    // Probamos la descarga normal; si funciona, seguimos online.
                    descargarOverrides(true);
                    descargarAviso(true);
                }
            });
    }

    /* ------------------------------------------------------------------ */
    /* Respaldo: polling y eventos de red                                 */
    /* ------------------------------------------------------------------ */

    function alVolverOnline() {
        descargarOverrides(true);
        descargarAviso(true);
    }

    function alPerderConexion() {
        if (estadoActual === 'conectado') emitirEstado('sin-conexion');
    }

    function alCambiarVisibilidad() {
        if (global.document.visibilityState === 'visible') {
            descargarOverrides(true);
            descargarAviso(true);
        }
    }

    function iniciarRespaldo() {
        detenerRespaldo();

        intervalo = setInterval(function () {
            if (!iniciado) return;
            if (global.document.visibilityState === 'hidden') return;

            if (global.navigator && global.navigator.onLine === false) {
                if (estadoActual === 'conectado') emitirEstado('sin-conexion');
                return;
            }

            descargarOverrides(true);
            descargarAviso(true);
        }, INTERVALO_RESPALDO);

        global.addEventListener('online', alVolverOnline);
        global.addEventListener('offline', alPerderConexion);
        global.document.addEventListener('visibilitychange', alCambiarVisibilidad);
    }

    function detenerRespaldo() {
        if (intervalo !== null) {
            clearInterval(intervalo);
            intervalo = null;
        }

        global.removeEventListener('online', alVolverOnline);
        global.removeEventListener('offline', alPerderConexion);
        global.document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    }

    /* ------------------------------------------------------------------ */
    /* Inicio / detención                                                 */
    /* ------------------------------------------------------------------ */

    async function iniciar(opciones) {
        opciones = opciones || {};

        if (opciones.alCambiar) alCambiar = opciones.alCambiar;
        if (opciones.alEstado) alEstado = opciones.alEstado;
        if (opciones.alAviso) alAviso = opciones.alAviso;

        if (!estaConfigurado()) {
            emitirEstado('sin-configurar');
            return { configurado: false };
        }

        if (iniciado) return { configurado: true, yaIniciado: true };

        iniciado = true;

        const cache = leerCache();
        if (cache && cache.overrides) {
            emitirCambio(cache.overrides, 'cache');
        }

        const cacheAviso = leerCacheAviso();
        if (cacheAviso) {
            emitirAviso(cacheAviso, 'cache');
        }

        emitirEstado('sincronizando');

        // Nos suscribimos antes de la primera descarga para no perder ningún
        // cambio que ocurra mientras se está leyendo la tabla.
        try {
            suscribir();
        } catch (error) {
            console.error('WebLiga: no se pudo abrir Realtime. ' + (error.message || error));
        }

        await descargarOverrides(false);
        await descargarAviso(true);
        iniciarRespaldo();

        return { configurado: true };
    }

    function detener() {
        iniciado = false;

        if (temporizadorRefresco !== null) {
            clearTimeout(temporizadorRefresco);
            temporizadorRefresco = null;
        }

        if (temporizadorAviso !== null) {
            clearTimeout(temporizadorAviso);
            temporizadorAviso = null;
        }

        if (canal) {
            canal.unsubscribe();
            canal = null;
        }

        detenerRespaldo();
    }

    /* ------------------------------------------------------------------ */
    /* Autenticación                                                      */
    /* ------------------------------------------------------------------ */

    async function iniciarSesion(email, password) {
        const supabase = obtenerCliente();
        if (!supabase) throw new Error('Falta configurar Supabase (supabase-config.js).');

        const respuesta = await conTiempoLimite(
            supabase.auth.signInWithPassword({
                email: email,
                password: password
            }),
            TIEMPO_MAXIMO_ESCRITURA,
            'El servidor tardó demasiado en responder.'
        );

        if (respuesta.error) throw respuesta.error;

        return respuesta.data.session;
    }

    async function cerrarSesion() {
        const supabase = obtenerCliente();
        if (!supabase) return;
        await supabase.auth.signOut();
    }

    async function obtenerSesion() {
        const supabase = obtenerCliente();
        if (!supabase) return null;

        const respuesta = await supabase.auth.getSession();
        if (respuesta.error) return null;

        return respuesta.data.session || null;
    }

    function alCambiarSesion(callback) {
        const supabase = obtenerCliente();
        if (!supabase || typeof callback !== 'function') {
            return function () {};
        }

        const respuesta = supabase.auth.onAuthStateChange(function (evento, sesion) {
            callback(sesion, evento);
        });

        return function () {
            respuesta.data.subscription.unsubscribe();
        };
    }

    /* ------------------------------------------------------------------ */
    /* Escritura (solo administrador)                                     */
    /* ------------------------------------------------------------------ */

    async function guardarHorario(eventoId, cambios, email) {
        const supabase = obtenerCliente();
        if (!supabase) throw new Error('Falta configurar Supabase (supabase-config.js).');

        const respuesta = await conTiempoLimite(
            supabase
                .from(TABLA)
                .upsert({
                    evento_id: Number(eventoId),
                    hora_inicio: cambios.horaInicio,
                    hora_fin: cambios.horaFin,
                    finalizado: !!cambios.finalizado,
                    actualizado_por: email || null,
                    actualizado_en: new Date().toISOString()
                }, { onConflict: 'evento_id' }),
            TIEMPO_MAXIMO_ESCRITURA,
            'El servidor tardó demasiado en guardar el cambio.'
        );

        if (respuesta.error) throw respuesta.error;

        await descargarOverrides(true);
        return true;
    }

    async function restablecerHorario(eventoId) {
        const supabase = obtenerCliente();
        if (!supabase) throw new Error('Falta configurar Supabase (supabase-config.js).');

        const respuesta = await conTiempoLimite(
            supabase
                .from(TABLA)
                .delete()
                .eq('evento_id', Number(eventoId)),
            TIEMPO_MAXIMO_ESCRITURA,
            'El servidor tardó demasiado en restablecer el horario.'
        );

        if (respuesta.error) throw respuesta.error;

        await descargarOverrides(true);
        return true;
    }

    async function restablecerTodo(ids) {
        const supabase = obtenerCliente();
        if (!supabase) throw new Error('Falta configurar Supabase (supabase-config.js).');

        const lista = (ids || []).map(Number).filter(function (id) {
            return Number.isFinite(id);
        });

        if (lista.length === 0) return true;

        const respuesta = await conTiempoLimite(
            supabase
                .from(TABLA)
                .delete()
                .in('evento_id', lista),
            TIEMPO_MAXIMO_ESCRITURA,
            'El servidor tardó demasiado en restablecer los horarios.'
        );

        if (respuesta.error) throw respuesta.error;

        await descargarOverrides(true);
        return true;
    }

    /* ------------------------------------------------------------------ */
    /* Avisos: escritura (solo administrador)                              */
    /* ------------------------------------------------------------------ */

    async function guardarAviso(cambios, email) {
        const supabase = obtenerCliente();
        if (!supabase) throw new Error('Falta configurar Supabase (supabase-config.js).');

        const texto = String(cambios && cambios.texto ? cambios.texto : '').trim();

        if (cambios && cambios.activo && !texto) {
            throw new Error('Escribí un texto para el aviso o apagalo antes de guardar.');
        }

        const respuesta = await conTiempoLimite(
            supabase
                .from(TABLA_AVISOS)
                .upsert({
                    id: 1,
                    texto: texto,
                    activo: !!cambios && !!cambios.activo,
                    actualizado_por: email || null,
                    actualizado_en: new Date().toISOString()
                }, { onConflict: 'id' }),
            TIEMPO_MAXIMO_ESCRITURA,
            'El servidor tardó demasiado en guardar el aviso.'
        );

        if (respuesta.error) throw respuesta.error;

        await descargarAviso(true);
        return true;
    }

    /* ------------------------------------------------------------------ */
    /* API pública                                                        */
    /* ------------------------------------------------------------------ */

    global.HorariosSync = {
        estaConfigurado: estaConfigurado,
        problemaDeConfiguracion: problemaDeConfiguracion,
        urlPublica: urlPublica,
        iniciar: iniciar,
        detener: detener,
        descargarOverrides: descargarOverrides,
        leerCache: leerCache,
        leerCacheAviso: leerCacheAviso,
        obtenerAviso: obtenerAviso,
        problemaAviso: problemaAviso,
        guardarAviso: guardarAviso,
        obtenerEstado: function () { return estadoActual; },
        obtenerUltimaSync: function () { return ultimaSync; },
        iniciarSesion: iniciarSesion,
        cerrarSesion: cerrarSesion,
        obtenerSesion: obtenerSesion,
        alCambiarSesion: alCambiarSesion,
        guardarHorario: guardarHorario,
        restablecerHorario: restablecerHorario,
        restablecerTodo: restablecerTodo
    };
})(window);

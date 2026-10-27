/**
 * Configuración pública de Supabase - WebLiga
 *
 * Pegá acá los dos datos de tu proyecto (Panel de Supabase > Project Settings > API):
 *   - Project URL
 *   - anon public key
 *
 * La clave "anon" es pública y se puede ver en el navegador. No es una contraseña:
 * la seguridad la dan las políticas RLS del archivo supabase/schema.sql.
 *
 * NUNCA pongas acá la clave "service_role".
 *
 * Guía paso a paso: GUIA-SUPABASE.md
 */
window.WEBLIGA_CONFIG = {
    supabaseUrl: '',
    supabaseAnonKey: '',

    // Dirección que se codifica en el QR (la página pública del tablero).
    // Si usás otro dominio, cambiala.
    urlPublica: 'https://lu92123.github.io/Web-LNR/'
};

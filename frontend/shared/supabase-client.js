// Cria um único cliente Supabase para as páginas do site.

if (!window.NEXUS_CONFIG || !window.supabase) {
    throw new Error(
        "Carregue a configuração e a biblioteca do Supabase primeiro."
    );
}

window.supabaseClient = window.supabase.createClient(
    window.NEXUS_CONFIG.SUPABASE_URL,
    window.NEXUS_CONFIG.SUPABASE_PUBLISHABLE_KEY,
    {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true
        }
    }
);
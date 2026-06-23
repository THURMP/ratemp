export const supabaseConfig = {
  url: "https://yongznyjoipfhusfovuw.supabase.co",
  anonKey: "sb_publishable_oNmwyxPHP2EHQijG28q41g_OApP8_Gr"
};

export function isSupabaseConfigured() {
  return Boolean(supabaseConfig.url && supabaseConfig.anonKey);
}

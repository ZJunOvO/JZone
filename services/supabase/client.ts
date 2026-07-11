import { hasSupabaseConfig, supabase } from '../../supabaseClient';

export const isSupabaseEnabled = () => hasSupabaseConfig;

export const ensureSupabase = () => {
  if (!hasSupabaseConfig) throw new Error('Supabase 未配置');
  return supabase;
};

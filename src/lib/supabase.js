// Compatibility re-export — all components now import from here but get the
// self-hosted API client instead of the old Supabase client.
export { api as supabase } from './api.js'

// Fill these in once the Supabase project and Discord app exist (see supabase/README.md).
// The anon key is meant to be public; access is controlled by row-level security in schema.sql.
export const CONFIG = {
  supabaseUrl: "",          // e.g. https://abcd1234.supabase.co
  supabaseAnonKey: "",
  discordInvite: "",        // e.g. https://discord.gg/xxxx
  downloadUrl: "https://github.com/odenness/nova-meter/releases/latest",  // fallback if GitHub's API doesn't answer
  githubRepo: "odenness/nova-meter",   // the Download buttons link straight to the newest installer (.exe) here
};

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "https://ggmandbeltvvcvblbvqg.supabase.co";
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_7SgNlY2914sGKl39XLfAVQ_Ao06exAO";

export const supabase = createClient(supabaseUrl, supabaseKey);


import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkSchema() {
    const { data, error } = await supabase.from('ingredients').select('*').limit(3);
    if (error) {
        console.error(error);
    } else {
        console.log("Ingredients Data Sample:");
        console.log(JSON.stringify(data, null, 2));
    }
}

checkSchema();

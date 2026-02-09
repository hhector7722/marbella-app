
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function checkSchema() {
    console.log("Checking schema for cash_closings...");
    const { data, error } = await supabase.from('cash_closings').select('*').limit(1);
    if (error) {
        console.error("Error fetching cash_closings:", error);
    } else {
        console.log("Columns in cash_closings:", Object.keys(data[0] || {}));
    }

    console.log("\nChecking schema for profiles (to verify role enum):");
    const { data: profileData, error: profileError } = await supabase.from('profiles').select('*').limit(1);
    if (profileError) {
        console.error("Error fetching profiles:", profileError);
    } else {
        console.log("Columns in profiles:", Object.keys(profileData[0] || {}));
    }
}

checkSchema();

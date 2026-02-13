
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function testInsert() {
    const testName = "TEST_INGREDIENT_" + Date.now();
    console.log("Attempting to insert test ingredient:", testName);

    const { data, error } = await supabase.from('ingredients').insert({
        name: testName,
        current_price: 1.23,
        purchase_unit: 'kg',
        unit_type: 'kg',
        category: 'Alimentos'
    }).select();

    if (error) {
        console.error("Insert failed:", error);
    } else {
        console.log("Insert successful:", data);

        // Cleanup
        console.log("Cleaning up test ingredient...");
        await supabase.from('ingredients').delete().eq('id', data[0].id);
        console.log("Cleanup done.");
    }
}

testInsert();

import { createClient } from '@/utils/supabase/client';
import type { PurchaseMultiSourcePayload } from '@/components/PurchaseMultiSourceForm';

/**
 * All funding sources and the TPV2 pending expense are saved in ONE database
 * transaction. Only the closing trigger posts TPV2's OUT to Caja inicial.
 */
export async function registerMultiSourcePurchase(
    payload: PurchaseMultiSourcePayload,
    notes: string
): Promise<void> {
    const { error } = await createClient().rpc('register_multi_source_purchase', {
        p_request_id: payload.requestId,
        p_sources: payload.sources,
        p_notes: notes,
        p_purchase_at: payload.customDate ?? new Date().toISOString(),
        p_change_amount: payload.changeAmount,
        p_change_box_id: payload.changeDestinationBoxId,
        p_change_breakdown: payload.changeBreakdown,
    });
    if (error) throw error;
}

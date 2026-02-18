WITH balance_at_date AS (
    SELECT 
        SUM(CASE 
            WHEN type = 'OUT' THEN -amount 
            ELSE amount 
        END) as calculated_balance
    FROM treasury_log
    WHERE date <= '2026-02-13 23:59:59'
)
SELECT 
    calculated_balance as current_calculated,
    336.21 as target,
    336.21 - calculated_balance as needed_adjustment
FROM balance_at_date;

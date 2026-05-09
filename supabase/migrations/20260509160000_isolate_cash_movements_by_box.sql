-- Isolation of cash movements by box
-- Updates v_treasury_movements_balance to calculate running balance partitioned by box_id

CREATE OR REPLACE VIEW "public"."v_treasury_movements_balance" AS
 SELECT "id",
    "box_id",
    "type",
    "amount",
    "breakdown",
    "notes",
    "created_at",
    "user_id",
    "closing_id",
    "sum"(
        CASE
            WHEN ("type" = ANY (ARRAY['IN'::"text", 'CLOSE_ENTRY'::"text"])) THEN "amount"
            WHEN ("type" = 'OUT'::"text") THEN (- "amount")
            ELSE (0)::numeric
        END) OVER (PARTITION BY "box_id" ORDER BY "created_at", "id" ROWS UNBOUNDED PRECEDING) AS "running_balance"
   FROM "public"."treasury_log"
  WHERE ("type" = ANY (ARRAY['IN'::"text", 'OUT'::"text", 'CLOSE_ENTRY'::"text", 'ADJUSTMENT'::"text", 'SWAP'::"text"]));

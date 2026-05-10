import { ACTION_SCHEMA } from "../src/lib/copilot/actions.ts";
import { z } from "zod";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function stripSchemaMetadata(value) {
  if (Array.isArray(value)) {
    return value.map(stripSchemaMetadata);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "$schema" || key === "default") continue;
    out[key] = stripSchemaMetadata(child);
  }
  return out;
}

function zodInputToRealtimeSchema(schema) {
  const clean = stripSchemaMetadata(z.toJSONSchema(schema, { io: "input" }));
  if (clean.type !== "object") {
    return { type: "object", properties: { p_data: clean }, required: ["p_data"] };
  }
  if (!clean.properties) {
    clean.properties = {};
  }
  return clean;
}

const recipes = zodInputToRealtimeSchema(ACTION_SCHEMA.gestionar_recetas.schema);
assert(recipes.type === "object", "gestionar_recetas must expose an object schema");
assert(
  recipes.properties?.p_accion?.enum?.includes("buscar"),
  "gestionar_recetas must expose p_accion enum"
);
assert(
  recipes.properties?.p_datos?.properties?.nombre?.type === "string",
  "gestionar_recetas must expose nested p_datos.nombre"
);

const attendance = zodInputToRealtimeSchema(ACTION_SCHEMA.consultar_registros_asistencia.schema);
assert(
  attendance.properties?.p_user_id?.format === "uuid",
  "consultar_registros_asistencia must expose p_user_id as uuid"
);
assert(
  attendance.properties?.p_fecha_inicio?.type === "string" &&
    attendance.properties?.p_fecha_fin?.type === "string",
  "consultar_registros_asistencia must expose date string params"
);
assert(
  attendance.required?.includes("p_user_id") &&
    attendance.required?.includes("p_fecha_inicio") &&
    attendance.required?.includes("p_fecha_fin"),
  "consultar_registros_asistencia must require uuid and date params"
);

const openOrders = zodInputToRealtimeSchema(ACTION_SCHEMA.consultar_pedidos_abiertos.schema);
assert(openOrders.type === "object", "empty-object tools must stay object schemas");
assert(openOrders.properties && Object.keys(openOrders.properties).length === 0, "empty-object tools must have empty properties");

console.log("Copilot voice schemas OK");

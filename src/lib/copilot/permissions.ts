import { ACTION_SCHEMA, type CopilotAction } from "./actions";

/** Valores válidos según BD (profiles_role_check migraciones). */
export type RoleName = "staff" | "supervisor" | "manager" | "admin" | "chef";

/** Normaliza texto de perfil para permisos de copiloto. */
export function normalizeCopilotRole(raw: string | null | undefined): RoleName | null {
  const r = (raw ?? "").trim().toLowerCase();
  if (r === "staff" || r === "supervisor" || r === "manager" || r === "admin" || r === "chef") return r as RoleName;
  return null;
}

const SUPERVISOR_ACTIONS: CopilotAction[] = [
  "crear_pedido",
  "consultar_pedidos_abiertos",
  "cerrar_caja",
  "consultar_flujos_caja_efectivo",
  "gestionar_flujos_caja_efectivo",
  "consultar_cambios_entre_cajas",
  "gestionar_cambios_entre_cajas",
  "consultar_inventario",
  "actualizar_stock",
  "gestionar_carta",
  "gestionar_recetas",
  "gestionar_ingredientes",
  "gestionar_proveedores",
  "gestionar_consumo_personal",
  "consultar_reservas",
  "gestionar_reservas",
  "consultar_manuales",
  "consultar_registros_asistencia",
  "consultar_registros_horas_extras",
  "consultar_costes_mano_obra",
  "gestionar_horarios",
];

/**
 * admin se trata igual que manager; chef alineado a supervisor (similar a políticas RLS inventario/carta).
 */
const PERMISSIONS: Record<RoleName, CopilotAction[]> = {
  staff: [
    "crear_pedido",
    "consultar_pedidos_abiertos",
    "cerrar_caja",
    "consultar_flujos_caja_efectivo",
    "gestionar_flujos_caja_efectivo",
    "consultar_cambios_entre_cajas",
    "gestionar_cambios_entre_cajas",
    "consultar_inventario",
    "actualizar_stock",
    "consultar_reservas",
    "gestionar_reservas",
    "consultar_manuales",
    "consultar_registros_asistencia",
    "consultar_registros_horas_extras",
  ],
  supervisor: [...SUPERVISOR_ACTIONS],
  chef: [...SUPERVISOR_ACTIONS],
  manager: [...(Object.keys(ACTION_SCHEMA) as CopilotAction[])],
  admin: [...(Object.keys(ACTION_SCHEMA) as CopilotAction[])],
};

export function canExecute(role: RoleName, action: CopilotAction): boolean {
  return PERMISSIONS[role]?.includes(action) ?? false;
}

import { z } from "zod";

export type CopilotAction =
  | "crear_pedido"
  | "consultar_pedidos_abiertos"
  | "cerrar_caja"
  | "consultar_flujos_caja_efectivo"
  | "gestionar_flujos_caja_efectivo"
  | "consultar_cambios_entre_cajas"
  | "gestionar_cambios_entre_cajas"
  | "consultar_inventario"
  | "actualizar_stock"
  | "gestionar_carta"
  | "gestionar_recetas"
  | "gestionar_ingredientes"
  | "gestionar_consumo_personal"
  | "gestionar_proveedores"
  | "consultar_registros_asistencia"
  | "consultar_registros_horas_extras"
  | "consultar_costes_mano_obra"
  | "gestionar_horarios"
  | "consultar_reservas"
  | "gestionar_reservas"
  | "consultar_metricas_basicas"
  | "generar_informe_diario"
  | "generar_informe_semanal"
  | "generar_informe_personalizado"
  | "consultar_manuales"
  | "consultar_usuarios"
  | "crear_usuario"
  | "editar_usuario"
  | "asignar_roles";

export type CopilotModule =
  | "pedidos"
  | "inventario"
  | "rrhh"
  | "reservas"
  | "metricas"
  | "usuarios"
  | "documentacion";

export type ActionDefinition = {
  module: CopilotModule;
  rpc: string | null;
  description: string;
  schema: z.ZodType<unknown>;
};

/** Schemas nombrados como argumentos RPC (PostgREST) */
export const ACTION_SCHEMA: Record<CopilotAction, ActionDefinition> = {
  crear_pedido: {
    module: "pedidos",
    rpc: "crear_pedido",
    description: "Intenta crear un pedido desde copiloto (no operativo real; devuelve aviso si no aplicable).",
    schema: z.object({
      p_mesa: z.string(),
      p_items: z.array(z.unknown()),
    }),
  },
  consultar_pedidos_abiertos: {
    module: "pedidos",
    rpc: "consultar_pedidos_abiertos",
    description:
      "Obtiene comandas activas según estado_sala (radiografía sala / mesas con productos positivos).",
    schema: z.object({}),
  },
  cerrar_caja: {
    module: "pedidos",
    rpc: "cerrar_caja",
    description: "Cierre de caja (delegar siempre en flujo UI nativo cuando la RPC indica no_implementada).",
    schema: z.object({ p_usuario_id: z.string().uuid() }),
  },
  consultar_flujos_caja_efectivo: {
    module: "pedidos",
    rpc: "consultar_flujos_caja_efectivo",
    description: "Movimientos de tesorería en un rango (YYYY-MM-DD).",
    schema: z.object({
      p_fecha_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      p_fecha_fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  },
  gestionar_flujos_caja_efectivo: {
    module: "pedidos",
    rpc: "gestionar_flujos_caja_efectivo",
    description:
      "Registro manual de tesorería (pendiente de implementación RPC; informa al modelo del estado).",
    schema: z.object({
      p_accion: z.string(),
      p_datos: z.record(z.string(), z.unknown()).default({}),
    }),
  },
  consultar_cambios_entre_cajas: {
    module: "pedidos",
    rpc: "consultar_cambios_entre_cajas",
    description: "Consulta transferencias SWAP entre cajas en rango.",
    schema: z.object({
      p_fecha_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      p_fecha_fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  },
  gestionar_cambios_entre_cajas: {
    module: "pedidos",
    rpc: "gestionar_cambios_entre_cajas",
    description: "Registrar cambios entre cajas (pendiente RPC).",
    schema: z.object({
      p_accion: z.string(),
      p_datos: z.record(z.string(), z.unknown()).default({}),
    }),
  },
  consultar_inventario: {
    module: "inventario",
    rpc: "consultar_inventario",
    description: "Lista ingredientes con stock_actual y unidad de medida.",
    schema: z.object({}),
  },
  actualizar_stock: {
    module: "inventario",
    rpc: "actualizar_stock",
    description: "Ajuste de stock_current de un ingrediente (UUID del producto, delta numérico).",
    schema: z.object({
      p_producto_id: z.string().uuid(),
      p_cantidad: z.number(),
    }),
  },
  gestionar_carta: {
    module: "inventario",
    rpc: "gestionar_carta",
    description: "Carta/menú (pendiente RPC).",
    schema: z.object({
      p_accion: z.string(),
      p_datos: z.record(z.string(), z.unknown()).default({}),
    }),
  },
  gestionar_recetas: {
    module: "inventario",
    rpc: "gestionar_recetas",
    description: "Recetas (pendiente RPC).",
    schema: z.object({
      p_accion: z.string(),
      p_datos: z.record(z.string(), z.unknown()).default({}),
    }),
  },
  gestionar_ingredientes: {
    module: "inventario",
    rpc: "gestionar_ingredientes",
    description: "Ingredientes catalog (pendiente RPC).",
    schema: z.object({
      p_accion: z.string(),
      p_datos: z.record(z.string(), z.unknown()).default({}),
    }),
  },
  gestionar_consumo_personal: {
    module: "inventario",
    rpc: "gestionar_consumo_personal",
    description: "Consumo staff (pendiente RPC).",
    schema: z.object({
      p_accion: z.string(),
      p_datos: z.record(z.string(), z.unknown()).default({}),
    }),
  },
  gestionar_proveedores: {
    module: "inventario",
    rpc: "gestionar_proveedores",
    description: "Proveedores (pendiente RPC).",
    schema: z.object({
      p_accion: z.string(),
      p_datos: z.record(z.string(), z.unknown()).default({}),
    }),
  },
  consultar_registros_asistencia: {
    module: "rrhh",
    rpc: "consultar_registros_asistencia",
    description: "Fichajes time_logs entre fechas por usuario UUID.",
    schema: z.object({
      p_user_id: z.string().uuid(),
      p_fecha_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      p_fecha_fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  },
  consultar_registros_horas_extras: {
    module: "rrhh",
    rpc: "consultar_registros_horas_extras",
    description: "Snapshots semanales (solape con el rango) por usuario UUID.",
    schema: z.object({
      p_user_id: z.string().uuid(),
      p_fecha_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      p_fecha_fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  },
  consultar_costes_mano_obra: {
    module: "rrhh",
    rpc: "consultar_costes_mano_obra",
    description: "Coste laboral estimado entre fechas (gerencia/cocina/supervisor).",
    schema: z.object({
      p_fecha_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      p_fecha_fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  },
  gestionar_horarios: {
    module: "rrhh",
    rpc: "gestionar_horarios",
    description: "Turnos shifts (pendiente RPC).",
    schema: z.object({
      p_accion: z.string(),
      p_datos: z.record(z.string(), z.unknown()).default({}),
    }),
  },
  consultar_reservas: {
    module: "reservas",
    rpc: "consultar_reservas",
    description: "Reservas (sin tabla dedicada actualmente — respuesta declarada vacía).",
    schema: z.object({
      p_fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  },
  gestionar_reservas: {
    module: "reservas",
    rpc: "gestionar_reservas",
    description: "Reservas (pendiente RPC).",
    schema: z.object({
      p_accion: z.string(),
      p_datos: z.record(z.string(), z.unknown()).default({}),
    }),
  },
  consultar_metricas_basicas: {
    module: "metricas",
    rpc: "consultar_metricas_basicas",
    description: "get_daily_sales_stats del día Madrid/calendario servidor (fecha current_date).",
    schema: z.object({}),
  },
  generar_informe_diario: {
    module: "metricas",
    rpc: "generar_informe_diario",
    description: "get_daily_sales_stats para una fecha concreta (YYYY-MM-DD).",
    schema: z.object({
      p_fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  },
  generar_informe_semanal: {
    module: "metricas",
    rpc: "generar_informe_semanal",
    description: "Agrega ventas diarias por rango y resumen cash_closings.",
    schema: z.object({
      p_fecha_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      p_fecha_fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  },
  generar_informe_personalizado: {
    module: "metricas",
    rpc: "generar_informe_personalizado",
    description: "Informe parametrizado (stub).",
    schema: z.object({
      p_filtros: z.record(z.string(), z.unknown()),
    }),
  },
  consultar_manuales: {
    module: "documentacion",
    rpc: "consultar_manuales",
    description: "Lista PDFs/medios públicos conocidos para manuales del bar.",
    schema: z.object({ p_tema: z.string() }),
  },
  consultar_usuarios: {
    module: "usuarios",
    rpc: "consultar_usuarios",
    description: "Listado profiles (solo manager/admin/supervisor en RPC).",
    schema: z.object({
      p_filtros: z.record(z.string(), z.unknown()).default({}),
    }),
  },
  crear_usuario: {
    module: "usuarios",
    rpc: "crear_usuario",
    description: "Alta usuario (pendiente RPC).",
    schema: z.object({
      p_datos: z.record(z.string(), z.unknown()).default({}),
    }),
  },
  editar_usuario: {
    module: "usuarios",
    rpc: "editar_usuario",
    description: "Editar usuario (pendiente RPC).",
    schema: z.object({
      p_user_id: z.string().uuid(),
      p_datos: z.record(z.string(), z.unknown()).default({}),
    }),
  },
  asignar_roles: {
    module: "usuarios",
    rpc: "asignar_roles",
    description: "Cambia profiles.role del uuid indicado.",
    schema: z.object({
      p_user_id: z.string().uuid(),
      p_role: z.enum(["staff", "supervisor", "manager", "chef", "admin"]),
    }),
  },
};

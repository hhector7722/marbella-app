export type KDSOrderStatus = 'activa' | 'completada';
export type KDSItemStatus = 'pendiente' | 'terminado' | 'cancelado';

export interface KDSOrderLine {
    id: string;
    kds_order_id: string;
    producto_nombre: string;
    cantidad: number;
    notas: string | null;
    /** Notas solo cocina (KDS); no altera la reconciliación fncalcdelta con el TPV */
    notas_cocina?: string | null;
    departamento: string | null;
    estado: KDSItemStatus;
    created_at: string;
    completed_at: string | null;
}

export interface KDSOrder {
    id: string;
    /** Mismo ticket TPV / mesa; puede haber varias cabeceras (tandas) con el mismo valor */
    id_ticket?: string | null;
    origen_referencia: string | null;
    mesa: string | null;
    nombre_cliente?: string | null;
    notas_comanda: string | null;
    origen: string | null;
    estado: KDSOrderStatus;
    created_at: string;
    completed_at: string | null;
    lineas?: KDSOrderLine[];
}

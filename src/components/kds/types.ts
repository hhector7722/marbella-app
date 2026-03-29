export type KDSOrderStatus = 'activa' | 'completada';
export type KDSItemStatus = 'pendiente' | 'terminado' | 'cancelado';

export interface KDSOrderLine {
    id: string;
    kds_order_id: string;
    producto_nombre: string;
    cantidad: number;
    notas: string | null;
    departamento: string | null;
    estado: KDSItemStatus;
    created_at: string;
    completed_at: string | null;
}

export interface KDSOrder {
    id: string;
    origen_referencia: string | null;
    mesa: string | null;
    notas_comanda: string | null;
    origen: string | null;
    estado: KDSOrderStatus;
    created_at: string;
    completed_at: string | null;
    lineas?: KDSOrderLine[];
}

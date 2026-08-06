# Importación Histórica de Nóminas (Backfill)

Esta carpeta (`/imports/payroll-history`) está dedicada exclusivamente a la ingesta temporal del histórico de documentos PDF de gestoría. No forma parte del flujo normal de producción ni interactúa con Google Apps Script.

## Instrucciones de uso

1. Copia aquí los PDFs históricos.
2. Puedes mezclar **Nóminas individuales** y **Resúmenes mensuales de costes**.
3. El proceso de backfill analizará cada archivo y **detectará automáticamente** de qué tipo de documento se trata.
4. El proceso reutilizará el 100% de la arquitectura oficial existente para parsear y persistir los documentos, garantizando que el estado final sea idempotente y equivalente al sistema en vivo.

**ATENCIÓN**: No elimines esta carpeta ni subas PDFs de otra índole (facturas, contratos, etc.). Esta ruta es estrictamente para la auditoría y backfill de nóminas.

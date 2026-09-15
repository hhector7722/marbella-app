# Worker Docling K3

Este servicio solo sirve evidencia documental. No contiene credenciales de Supabase ni puede acceder a la Data API.

## Variables del mini-PC

Copiar `.env.example` a `.env` y definir dos secretos distintos: `DOCLING_WORKER_TOKEN` autentica el worker ante la Edge Function y `DOCLING_API_KEY` protege la API Docling dentro de la red Docker.

## Arranque

```bash
docker compose --env-file .env up -d --build
```

La API Docling queda ligada a `127.0.0.1:5001`; no se publica en la red. El worker obtiene un trabajo, recibe una URL de Storage firmada durante diez minutos, procesa el documento y solo devuelve evidencia, tablas crudas y métricas a la Edge Function.

`DOCLING_SERVE_ENG_KIND=local`, un worker de conversión, CPU y cuatro hilos están elegidos para el Intel N150. No hay Redis ni otro servicio persistente.

## Verificación

```bash
python3 worker_test.py
docker compose --env-file .env ps
```

Los documentos originales y la evidencia no se borran. Un fallo queda en `document_processing_jobs` y su secuencia de eventos; no se fabrica una extracción de error. Así el reintento reanuda el mismo trabajo sin sobrescribir evidence previa.

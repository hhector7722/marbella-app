# Marbella

Sistema operativo del negocio de Bar La Marbella: asistencia, caja, coste laboral, compras, cocina, carta y eventos en una sola aplicación instalable.

## La documentación está en Marbella OS

**Antes de cambiar cualquier cosa, [`marbella-os/`](./marbella-os/README.md).**

Ahí vive la única fuente de verdad sobre qué es el producto, cómo se comporta, cómo se ve y cómo se construye. Este README solo explica cómo arrancar el proyecto.

| Si buscas | Ve a |
|---|---|
| Qué es Marbella y para quién | [VISION](./marbella-os/1-producto/VISION.md) |
| Cómo debe comportarse la interfaz | [EXPERIENCIA](./marbella-os/2-diseno/EXPERIENCIA.md) |
| Colores, tipografía y medidas | [TOKENS](./marbella-os/2-diseno/TOKENS.md) |
| Reglas de código del frontend | [FRONTEND](./marbella-os/3-ingenieria/FRONTEND.md) |
| Cómo se calcula el coste de personal | [dominio/COSTE-LABORAL](./marbella-os/3-ingenieria/dominio/COSTE-LABORAL.md) |
| Cómo está el sistema hoy | [ESTADO](./marbella-os/5-estado/ESTADO.md) |
| Qué está mal a propósito | [DEUDA](./marbella-os/5-estado/DEUDA.md) |

---

## Arranque

```bash
npm install
npm run dev
```

En [http://localhost:3000](http://localhost:3000).

### Requisitos

- Node.js 20 o superior.
- Proyecto de Supabase con las migraciones de [`supabase/migrations`](./supabase/migrations/README_MIGRACIONES.md) aplicadas.
- `ffmpeg` instalado, solo si se usa dictado por voz.

### Variables de entorno

Necesarias para arrancar:

| Variable | Para qué |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Dirección del proyecto de Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Operaciones de servidor con permisos elevados |
| `CRON_SECRET` | Autenticación de las tareas programadas |

Opcionales, cada una habilita una función concreta:

| Variable | Habilita |
|---|---|
| `GEMINI_API_KEY` | Lectura de albaranes y documentos por visión artificial |
| `STT_PROVIDER`, `OPENAI_API_KEY` | Dictado por voz mediante servicio externo |
| `STT_PROVIDER=whisper_local`, `WHISPER_COMMAND` | Dictado por voz con proceso local |
| `MAX_STT_FILE_MB` | Límite de tamaño del audio, 10 MB por omisión |
| `VOICE_WS_SECRET` | Llamada de voz en tiempo real |

`VOICE_WS_SECRET` **solo existe en servidor**. Nunca se expone como variable pública.

## Comandos

```bash
npm run dev            # Desarrollo
npm run build          # Compilación de producción
npm run lint           # Análisis estático
node --test test/      # Pruebas de la lógica de negocio crítica
```

## Estructura del repositorio

| Carpeta | Contenido |
|---|---|
| [`marbella-os/`](./marbella-os/README.md) | **Documentación oficial del producto** |
| `src/` | Aplicación: rutas, componentes, motores de cálculo |
| [`supabase/`](./supabase/migrations/README_MIGRACIONES.md) | Migraciones y configuración de la base de datos |
| [`integrations/`](./integrations/README.md) | Código que se ejecuta fuera de la aplicación |
| `sql/` | Consultas de diagnóstico, no migraciones |
| [`reference/`](./reference/legacy-bdp/README.md) | Material del sistema heredado, congelado |
| `test/` | Pruebas de la lógica de negocio |

## Llamada de voz

Servidor independiente y opcional, para conversación en tiempo real:

```bash
cd voice-server && npm install && npm run build && npm start
```

El cliente pide un token efímero, que el servidor de voz reenvía a la aplicación para validar identidad y permisos reales. Requiere `ffmpeg` y `STT_PROVIDER` configurados.

## Antes de tocar código

1. Lee el documento de Marbella OS que gobierna lo que vas a cambiar.
2. Si el cambio contradice ese documento, **cambia primero el documento** o justifica la excepción.
3. Si el cambio altera comportamiento visible, anótalo en [CHANGELOG](./marbella-os/5-estado/CHANGELOG.md).

La razón es directa: cuando el código y la documentación divergen, el trabajo siguiente se hace sobre información falsa. Es lo que se acaba de arreglar y no conviene repetir.

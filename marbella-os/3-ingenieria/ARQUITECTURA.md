---
documento: ARQUITECTURA
clase: vivo
estado: vigente
capa: ingenieria
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-10-07
caducidad: 6 meses
supersede: —
---

# ARQUITECTURA — Piezas del sistema y por dónde circula un dato

Vista de conjunto. Responde dónde vive cada cosa y en qué orden se toca. Las reglas de escritura de interfaz están en [FRONTEND](./FRONTEND.md); las fórmulas, en [dominio](./dominio/README.md).

---

## 1. Las piezas

| Pieza | Qué es | Dónde |
|---|---|---|
| Aplicación | Web instalable, Next.js con enrutador de aplicación | `src/` |
| Base de datos | Postgres gestionado por Supabase, con autenticación y almacenamiento | `supabase/` |
| Extractor del punto de venta | Proceso que lee el ERP en el equipo del local | `integrations/tpv-bridge/` |
| Pasarela | Receptor HTTP que escribe el estado de sala | `integrations/gateway/` |
| Scripts de correo | Tres procesos de Google que leen adjuntos entrantes | `integrations/apps-script/` |
| Servidor de voz | Proceso independiente y opcional para conversación en tiempo real | `voice-server/` |
| Procesador Mistral | Extracción privada y versionada de albaranes | `src/app/api/internal/albaranes/mistral-process/` |

**El punto de venta es un sistema ajeno del que solo se lee.** Marbella nunca escribe en él. Ver [VISION](../1-producto/VISION.md).

---

## 2. Dimensiones reales

Cifras verificadas el 2026-07-29. Sirven para dimensionar, no como objetivo:

- **586 ficheros** en `src`, de los cuales **227 son de cliente (39 %)**.
- **165 ficheros** de rutas, **178** de componentes, **215** de librería.
- **25 rutas de API**, **40 ficheros con acciones de servidor**.
- **290 migraciones**, entre febrero y julio de 2026.
- **72 tablas tipadas**, 7 vistas, 107 funciones de base de datos.

Lo relevante de estas cifras: **hay 107 funciones de base de datos y 40 ficheros de acciones de servidor**. La lógica está repartida entre Postgres y TypeScript, y saber en cuál de los dos vive una regla concreta no es evidente. Es el mayor coste de comprensión del sistema.

---

## 3. Capas y su orden

```
Navegador
   ↓
Guardián de rutas (src/proxy.ts)
   ↓
Componente de servidor  →  lee de Supabase con la sesión del usuario
   ↓                        (las políticas de acceso filtran)
Componente de cliente   →  interactividad, suscripciones en vivo
   ↓
Acción de servidor      →  escribe, tras verificar identidad y permiso
   ↓
Motor de cálculo        →  produce la magnitud
   ↓
Escritor                →  persiste el resultado
```

**Ninguna capa se salta.** Los dos incumplimientos habituales de esta cadena:

1. Un componente de cliente que consulta directamente en lugar de recibir el dato del servidor.
2. Una pantalla que calcula una magnitud en lugar de leerla. Prohibido por el [principio 3](../1-producto/PRINCIPIOS.md).

### Guardián de rutas

Vive en `src/proxy.ts`, no en un fichero de middleware: es la convención de la versión de Next.js que usa el proyecto.

Decide con dos datos, en este orden: **si hay sesión** y **cuál es el rol**. Su comportamiento exacto, incluidas las rutas exentas y las decisiones por rol, está en [SEGURIDAD](./SEGURIDAD.md).

---

## 4. Superficies

| Superficie | Rutas | Quién entra |
|---|---|---|
| Pública | `carta`, `eventos`, `pedido`, `reporte`, `propuestas` | Cualquiera |
| Personal | `staff`, `profile`, `horario` | Persona con sesión |
| Gestión | `dashboard` y sus 24 subrutas | Según rol |
| Maestra | `master` | Condición por correo electrónico |
| Cocina | `dashboard/kds` | Pantalla dedicada, sin interacción táctil fina |
| Máquina | `api` | Secreto compartido, sesión o nada |

**La superficie de máquina no pasa por el guardián de rutas.** Cada punto de acceso se autentica solo. Es correcto por diseño —un webhook no tiene sesión— pero significa que **olvidarse de autenticar deja el punto abierto**, sin red de seguridad.

**La carta comercial solo proyecta recetas con `is_sellable`.** El selector y los editores ignoran un mapeo TPV hacia una elaboración interna: no lo borran, no usan su precio ni su foto, y el artículo queda libre para enlazarse a una vendible. Las fichas de cocina siguen incluyendo ambas. Recetas TPV también limita el selector a vendibles y lee sus materias primas con `recipe_stock_requirements_v2_rows`. La importación legacy solo sobreescribe una receta directa: si ya contiene elaboraciones, no la toca. El Copilot lee esa misma expansión y el coste de `get_recipe_cost_v2`. [ADR-0018](../4-decisiones/ADR-0018-elaboraciones-intermedias.md).

---

## 5. Motores de cálculo

Un motor produce una magnitud de negocio. **Es el único autorizado a producirla.**

| Motor | Produce | Documento |
|---|---|---|
| Motor de horas | Horas ordinarias, extras, arrastre, liquidación | [ADR-0001](../4-decisiones/ADR-0001-hours-engine-productor-unico.md) |
| Motor de coste de extras | Importe de las horas extra | [dominio/COSTE-LABORAL](./dominio/COSTE-LABORAL.md) |
| Escritor de proyección | Persiste el resultado semanal y el diario hijo | [contratos/PROYECCION-v2](./contratos/PROYECCION-v2.md) |
| Orquestador de invalidación | Decide qué hay que recalcular ante un cambio | — |
| Coste de receta | Coste de un escandallo. El completo es `get_recipe_cost_v2`. La ficha interna, la vendible con subrecetas en ración completa, el ranking de margen y el Copilot lo usan. Un coste inválido, o sin materia prima, queda en blanco, nunca a cero. La vendible sin subrecetas sigue en `get_recipe_cost`. El listado de Recetas usa v2 cuando la receta tiene elaboraciones: si ese coste no vale, el indicador no se pinta como óptimo. La media ración con subrecetas no tiene coste | [dominio/PRECIOS-Y-COMPRAS](./dominio/PRECIOS-Y-COMPRAS.md), [ADR-0018](../4-decisiones/ADR-0018-elaboraciones-intermedias.md) |
| Expansión de stock | Materias primas de una elaboración. La autoridad es `get_recipe_stock_requirements_v2`. `recipe_stock_requirements_v2_rows` solo aplana ese JSON. La venta TPV lo usa de forma atómica. La merma de receta lo escribe con `record_waste_movements`. El consumo personal de ración completa también. Recetas TPV la muestra, con multiplicador 1, y no edita la composición desde esa proyección. El Copilot también la muestra y no guarda las hojas. La media ración con subrecetas no. No hay stock de elaboraciones intermedias | [MODELO-DE-DATOS](./MODELO-DE-DATOS.md), [ADR-0018](../4-decisiones/ADR-0018-elaboraciones-intermedias.md) |
| Sistema de sombra | Compara el motor nuevo con el cálculo heredado | [spikes](../6-investigacion/spikes/README.md) |

El dominio de horas concentra **52 ficheros y 16 de prueba**. Es la parte más protegida del sistema y la única con cobertura real, porque es la única cuyo error se traduce directamente en dinero mal pagado.

**El coste de receta se calcula en dos sitios**, cliente y base de datos, y deben coincidir. Es una duplicación consciente, con la obligación de mantener paridad.

**El sistema de sombra es andamio**, no producto: 42 ficheros que existen para validar una migración ya completada. Se retirará.

---

## 6. Cómo entra un dato

### Venta y sala

```
ERP del punto de venta → extractor → pasarela → estado de sala
   → disparador de base de datos → cálculo de diferencias → líneas de cocina
   → suscripción en vivo → pantalla de cocina y radar de sala
```

La cocina **no recibe órdenes, recibe diferencias**. Si el punto de venta deja de enviar un artículo, la línea se cancela. Si un ticket desaparece, sus líneas pendientes se cancelan sin cerrar la comanda: el cierre en cocina siempre es manual. Detalle en [integraciones/BDP-TPV](./integraciones/BDP-TPV.md).

### Coste de personal

```
correo de la gestoría → script de Google → webhook → huella de contenido
   → lectura del documento → validaciones → total mensual
   → prorrateo por días naturales → coste ordinario del día
```

Ver [integraciones/NOMINAS](./integraciones/NOMINAS.md) y [dominio/COSTE-LABORAL](./dominio/COSTE-LABORAL.md).

### Fichaje y horas

```
fichaje → registro de tiempo → motor de horas → motor de coste
   → escritor → proyección semanal → pantallas
```

**El motor se ejecuta en lectura**, no solo al escribir. Es deuda registrada como [D5](../5-estado/DEUDA.md).

### Precio de ingrediente

```
albarán (papel o correo) → captura autenticada → evidencia versionada
   → propuesta de mapeo → K4 automático o decisión humana única → precio y stock
```

Capturar, extraer o proponer no cambia una magnitud económica. `apply_receipt_line(...)` es la confirmación atómica única para `manager` y `admin`: valida primero y crea el `PURCHASE`, la conciliación y, si procede, el histórico de precio en una sola transacción. Solo una propuesta Mistral vigente y respaldada por todas las hojas puede entrar en K4.

### Mistral: evidencia, propuesta y recepción

La ruta interna `api/internal/albaranes/mistral-shadow` lee el archivo privado de un
albarán, comprueba su huella y llama a Mistral OCR desde el servidor. Conserva
la respuesta original y la observación canónica en
`document_shadow_extractions`, con versión de extractor, modelo, métricas y
errores. El mismo archivo y versión reutilizan la evidencia ya obtenida. Esta
ruta no crea propuestas K5, líneas económicas, recepciones, movimientos ni
precios; permite comparar Mistral con la evidencia histórica.

En el camino principal, el escáner guarda el documento y encola una intención
`mistral-*` sin esperar el OCR. No existe selección de otro extractor.
`pg_cron` despierta al procesador de Vercel cada dos minutos mediante una
credencial privada de Vault. El procesador verifica la huella, reutiliza
extracción por archivo y versión, persiste `document_extractions`, construye
propuestas versionadas y materializa líneas Mistral. Las líneas antiguas sin
recepción se conservan como historia y se apartan de la vista operativa; las
recibidas permanecen intactas. La observación canónica no conoce ingredientes. El matcher consulta
memoria histórica por proveedor; la presentación y la aritmética determinan
si la propuesta está lista o es excepción. Los alias nuevos se guardan como
versiones propuestas derivadas de una presentación confiable.
La revisión del perfil Mistral genera una propuesta sucesora al releer una
extracción persistida, conserva la evidencia OCR y respeta las revisiones
humanas ya existentes.
Si hay ingrediente candidato sin versión de presentación, K5 conserva el
candidato en `interpreted` y deja vacía la pareja económica de ingrediente y
versión; así la excepción se muestra sin violar la integridad de la propuesta.
Si no hay subtotal ni total verificable, la propuesta queda en revisión: la
aritmética de una línea aislada no descarta que falten otras líneas del papel.

La recepción automática, cuando se habilita, pasa por la vista previa y el
delegado de servicio de K4. Se bloquea ante duplicado, ambigüedad, conversión
no verificada, contradicción matemática, pedido pendiente o precio anómalo.
K4 conserva la única escritura de stock, confirmación y precio. La pantalla de
revisión muestra primero las excepciones. Una persona que resuelve un mapeo
puede guardarlo y aplicar la recepción en una sola acción; la vista previa
técnica y la revalidación permanecen en el servidor. El reintento de un
documento parcialmente recibido omite las líneas confirmadas y comprueba que
pertenecen a la misma materialización. El rollout y las decisiones están en
[ADR-0023](../4-decisiones/ADR-0023-mistral-unico-y-relectura-historica.md)
y [ADR-0025](../4-decisiones/ADR-0025-recepcion-autonoma-y-una-accion-humana.md).
El listado obtiene «completado» de `get_purchase_invoice_processing_states`,
que verifica las líneas activas contra el ledger; `mapped` por sí solo no
demuestra recepción económica.

El escáner declara `expected_pages` antes de encolar la primera hoja. Todas las
hojas Mistral de un albarán comparten un conjunto de propuestas; la recepción
automática espera a que existan y terminen los trabajos declarados. K4 admite
la huella de una hoja adicional solo si está vinculada al mismo albarán en
`purchase_invoice_attachments`. Una hoja fallida o ausente impide recibir solo
una parte como si el documento estuviera completo.
Al terminar cada trabajo, la cola sincroniza el estado OCR de su hoja y solo
deja el albarán pendiente de mapeo cuando han terminado todas las hojas
declaradas. Un fallo transitorio conserva su reintento automático; el reintento
explícito de un fallo sin evidencia reinicia el límite de intentos.
«Reprocesar» vuelve a las hojas originales conservadas. La cola
histórica verifica su hash, reutiliza una extracción correcta de la misma
versión y no invoca K4 ni reescribe el estado previo. La relectura masiva usa
el mismo modo histórico y puede reanudarse por archivo.

---

## 7. Tareas programadas

| Tarea | Cuándo | Qué hace |
|---|---|---|
| Recálculo de balances | Lunes, con dos franjas para absorber el cambio de hora | Regenera la proyección semanal de todo el personal |
| Limpieza de audio | Cada día de madrugada | Borra grabaciones de más de siete días |
| Limpieza de documentos de pedido | Cada día de madrugada | Borra PDFs de más de siete días |

El recálculo semanal está **duplicado a propósito**: se programa a las dos y a las tres, y cada ejecución comprueba si la hora local de Madrid le corresponde. Es la forma de tener una única ejecución real tanto en horario de verano como de invierno, cuando el programador solo entiende de tiempo universal.

Además, la base de datos lanza peticiones HTTP programadas hacia la aplicación para el mismo recálculo y para el aviso de reservas. **Esto significa que la base de datos conoce la dirección pública de la aplicación** y guarda su credencial. Es funcional y frágil a la vez: si la dirección cambia, la tarea falla en silencio.

---

## 8. Datos en vivo

Diez puntos del sistema usan suscripciones a cambios de la base de datos: cocina, notificaciones sin leer, reservas, ventas del día, radar de sala, proveedores y borradores de pedido.

Regla: **una suscripción en vivo es para datos que cambian mientras se mira la pantalla.** Para el resto, se lee al cargar. Una suscripción mal puesta multiplica conexiones y no mejora nada.

---

## 9. Documentos impresos

El sistema genera cuatro documentos: hoja de jornada, encargo, pedido a proveedor y simulaciones de plantilla. Tienen su propio sistema de diseño, descrito en [DOCUMENTOS-IMPRESOS](../2-diseno/DOCUMENTOS-IMPRESOS.md).

**El pedido a proveedor sigue en estilo heredado por decisión consciente**, tras haber intentado migrarlo.

---

## 10. Fronteras que no se cruzan

- **Una pantalla no calcula una magnitud de negocio.** La lee.
- **Un motor no consulta la base de datos.** Recibe hechos y devuelve resultados. Es lo que lo hace comprobable.
- **Una integración no es autoridad de una magnitud.** Aporta un dato de origen.
- **El punto de venta no se escribe.**
- **La clave de servicio no llega al navegador.** Nunca.

---

## 11. Lo que esta arquitectura no tiene

Declarado para que nadie lo busque:

- **No hay capa de repositorio.** Las consultas están repartidas entre páginas, componentes, acciones y rutas de API. Cambiar una consulta significa buscarla.
- **No hay separación formal entre dominio e infraestructura**, salvo en el motor de horas.
- **No hay observabilidad propia.** Los fallos se detectan porque alguien ve algo raro en pantalla.
- **No hay entorno de pruebas.** Se trabaja contra la base de datos real.

Estas cuatro ausencias son decisiones tomadas por omisión, no elecciones razonadas. **Se documentan aquí para que dejen de ser invisibles**, no porque haya un plan inmediato para resolverlas.

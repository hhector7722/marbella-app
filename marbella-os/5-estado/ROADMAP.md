---
documento: ROADMAP
clase: vivo
estado: vigente
capa: estado
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-07-29
caducidad: 3 meses
supersede: —
---

# ROADMAP — Qué viene y por qué

Intención, no compromiso de fecha. Cada línea dice **por qué** ahora y no antes: sin el porqué, una hoja de ruta es una lista de deseos.

El orden responde a dependencias reales, no a preferencias. Las que provienen de deuda enlazan su entrada en [DEUDA](DEUDA.md).

---

## Ahora

### Cerrar los cuatro agujeros de acceso

Retirar el permiso anónimo de `estado_sala`, `kds_orders` y `kds_order_lines`; retirar la ejecución sin sesión de las cinco funciones de venta; hacer privado el contenedor de fotos de caja; invertir la condición del secreto en las tareas programadas.

**Por qué ahora, antes que cualquier otra cosa**: hoy cualquiera con la clave pública —que viaja en el navegador— puede leer la facturación del negocio y escribir en las comandas de cocina. Son cuatro cambios pequeños, verificables y sin dependencias. Ver [D24](DEUDA.md#d24--tres-tablas-sin-políticas-y-con-escritura-anónima), [D25](DEUDA.md#d25--cinco-funciones-de-venta-ejecutables-sin-sesión), [D26](DEUDA.md#d26--contenedor-de-fotos-de-caja-público) y [D23](DEUDA.md#d23--las-tareas-programadas-fallan-abiertas).

### Arreglar el andamiaje de pruebas

Un guion que descubra los ficheros de prueba en lugar de enumerarlos, otro de comprobación de tipos, y ambos en integración continua.

**Por qué ahora**: hay tres pruebas escritas que no ejecuta nadie, y sin integración continua las demás son opcionales de hecho. Cuesta una tarde y cambia la naturaleza del proyecto: de «nada se comprueba solo» a «algo se comprueba siempre». Ver [D22](DEUDA.md#d22--el-andamiaje-de-pruebas-deja-pruebas-sin-ejecutar).

### Recuperar los tipos de la base de datos

Regenerarlos incluyendo las 15 tablas que faltan y empezar a tipar los clientes.

**Por qué ahora**: con 72 tablas y 107 funciones, el acceso sin tipos es la mayor fuente posible de defectos silenciosos, y hoy **ninguna** de las dos definiciones del esquema se importa en ningún fichero. Ver [D19](DEUDA.md#d19--los-tipos-de-la-base-de-datos-no-se-usan).

### Probar el código de integración

Las tres piezas que se ejecutan fuera de la aplicación ya son código y no documentos, pero siguen sin pruebas y con despliegue manual.

**Por qué ahora**: son el origen de datos de ventas, cocina y coste de personal. Un fallo silencioso ahí contamina todo lo que se calcula a partir de ellos. Ver [D6](DEUDA.md#d6--código-de-producción-desplegado-por-copia-manual) y [D16](DEUDA.md#d16--código-de-integración-sin-pruebas-ni-verificación-de-despliegue).

---

## Siguiente

### Propagar los tokens al código

Centralizar color, radio, sombra y espaciado, y unificar las dos escalas de grises.

**Por qué después de documentar**: el contrato ya existe en [TOKENS](../2-diseno/TOKENS.md). Propagarlo sin contrato habría sido repetir el problema con otra sintaxis. Ver [D1](DEUDA.md#d1--no-hay-tokens-de-diseño-centralizados).

### Construir los componentes base

Botón, campo, tarjeta, insignia, estado vacío y aviso embebido, según el contrato ya escrito.

**Por qué después de los tokens**: un componente construido sobre valores sin nombre nace con la deuda dentro. Ver [D2](DEUDA.md#d2--no-hay-componentes-base).

**Prioridad dentro del bloque**: el estado vacío va primero, porque su ausencia provoca hoy que un fallo de lectura se confunda sistemáticamente con la ausencia de datos, y eso viola el principio 2.

### Pruebas de los recorridos críticos

Empezando por fichar, cerrar caja y cerrar la semana de horas.

**Por qué ahora y no antes**: antes de intervenir en la interfaz hace falta una red que avise si se rompe el fichaje. Ver [D8](DEUDA.md#d8--ausencia-de-pruebas-de-interfaz).

### Cambio de lectura del dominio de horas

Pasar de ejecutar el motor en lectura a leer la proyección persistida.

**Por qué**: está previsto y declarado como deuda temporal en [ADR-0001](../4-decisiones/ADR-0001-hours-engine-productor-unico.md). Ver [D5](DEUDA.md#d5--motor-de-horas-ejecutado-en-lectura).

### Despliegue reproducible de las integraciones del terminal de venta

Sacar el puente y la pasarela del proceso de copiar y pegar.

**Por qué**: afectan a venta y a cierre de caja, que son núcleo operativo, y hoy no hay reversión posible. Ver [D6](DEUDA.md#d6--código-de-producción-desplegado-por-copia-manual).

### Quitar las condiciones laborales duplicadas del perfil

Dejar las tablas con vigencia como única autoridad y convertir las columnas del perfil en caché explícita o retirarlas.

**Por qué**: leerlas del sitio equivocado produce un resultado plausible y equivocado al calcular una semana pasada. No falla, miente. Ver [D20](DEUDA.md#d20--condiciones-laborales-duplicadas-entre-el-perfil-y-las-tablas-con-vigencia).

---

## Después

- **Especificar las capacidades una a una**, empezando por asistencia y jornada, que es la más sensible y la que está en movimiento.
- **Migrar el libro del responsable a los ayudantes de rol**, para que un cambio de permiso surta efecto sin renovar sesión. Ver [D11](DEUDA.md#d11--una-tabla-con-políticas-que-leen-el-rol-del-identificador-de-sesión).
- **Retirar los modelos de datos y de cocina superados**, una vez se decida qué hacer con su histórico. Ver [D17](DEUDA.md#d17--modelos-de-datos-duplicados-sin-retirar-el-anterior) y [D18](DEUDA.md#d18--cuatro-modelos-de-cocina-conviviendo).
- **Garantizar la paridad entre las reglas duplicadas en Postgres y en TypeScript**, con pruebas que la comprueben en lugar de confiar en la intención. Ver [D21](DEUDA.md#d21--reglas-de-negocio-implementadas-dos-veces-en-postgres-y-en-typescript).
- **Bajar la frontera de cliente a servidor** pantalla a pantalla, aprovechando cada intervención. Ver [D3](DEUDA.md#d3--mitad-del-código-innecesariamente-en-el-cliente).
- **Descomponer las pantallas por encima del límite de complejidad**, al intervenir en ellas. Ver [D4](DEUDA.md#d4--pantallas-por-encima-del-límite-de-complejidad).
- **Resolver la deuda de vocabulario**, dejando el renombrado de identificadores para el final porque afecta a datos históricos. Ver [D15](DEUDA.md#d15--deuda-de-vocabulario).
- **Enumerar el rol en la base de datos** y dar contenido propio al rol de supervisor, o retirarlo. Ver [D10](DEUDA.md#d10--rol-sin-enumeración-en-la-base-de-datos).
- **Decidir la identidad visual entre superficies**: un solo azul de marca o dos declarados para siempre. Requiere ADR. Ver [D13](DEUDA.md#d13--divergencia-visual-entre-pantalla-y-documento-impreso).

---

## Explícitamente no previsto

Para que nadie lo proponga como si fuera una omisión:

- **Modo oscuro.** No hay diseño y no se infiere. Ver [LENGUAJE-VISUAL §2](../2-diseno/LENGUAJE-VISUAL.md#2-color).
- **Migrar el documento de pedido a proveedor** al sistema de documentos impresos. Se evaluó y se rechazó.
- **Sustituir el terminal de venta.** Está fuera de la visión del producto.
- **Generalizar Marbella para otros negocios.** Está fuera de la visión del producto.

---

## Cómo se cambia esta hoja de ruta

Se reescribe. No acumula lo que ya se hizo: eso va a [CHANGELOG](CHANGELOG.md). Una entrada que lleva tres revisiones en «siguiente» sin moverse no es una prioridad; se baja a «después» o se retira con su motivo.

---
name: Creador de Habilidades
description: Generador de habilidades personalizadas en español para extender las capacidades de Antigravity
---

# Creador de Habilidades (Skill Creator)

Esta habilidad te permite crear nuevas habilidades personalizadas en español siguiendo el formato y las mejores prácticas de Antigravity.

## 🎯 Propósito

Facilitar la creación de habilidades (skills) bien estructuradas y documentadas que extiendan las capacidades del asistente AI para tareas especializadas.

## 📋 Proceso de Creación

### 1. **Análisis de Requisitos**

Cuando se te solicite crear una nueva habilidad, primero pregunta:

- **¿Cuál es el propósito principal de la habilidad?** (En 1-2 frases)
- **¿Qué tareas específicas debe realizar?** (Lista de acciones)
- **¿Necesita scripts de apoyo?** (Python, Shell, PowerShell, etc.)
- **¿Requiere ejemplos de referencia?** (Código, configuraciones, etc.)
- **¿Necesita recursos adicionales?** (Templates, archivos de datos, etc.)

### 2. **Estructura de Directorios**

Toda habilidad debe crearse en: `.agent/skills/[nombre-habilidad]/`

Estructura básica:
```
.agent/skills/[nombre-habilidad]/
├── SKILL.md              # (OBLIGATORIO) Archivo principal con instrucciones
├── scripts/              # (OPCIONAL) Scripts de utilidad
│   ├── script1.py
│   └── script2.ps1
├── examples/             # (OPCIONAL) Ejemplos de referencia
│   ├── ejemplo1.js
│   └── ejemplo2.sql
└── resources/            # (OPCIONAL) Recursos adicionales
    ├── templates/
    └── data/
```

### 3. **Formato del Archivo SKILL.md**

El archivo `SKILL.md` **DEBE** tener esta estructura:

```markdown
---
name: Nombre Descriptivo de la Habilidad
description: Breve descripción de lo que hace la habilidad (máximo 100 caracteres)
---

# Nombre de la Habilidad

Descripción detallada del propósito y alcance de la habilidad.

## 🎯 Propósito

[Explicación clara de para qué sirve esta habilidad]

## 📋 Instrucciones de Uso

### 1. [Paso Principal 1]

[Descripción detallada del paso]

#### Consideraciones:
- Punto importante 1
- Punto importante 2

### 2. [Paso Principal 2]

[Descripción detallada del paso]

## ✅ Checklist de Ejecución

Cuando uses esta habilidad, asegúrate de:

- [ ] Verificación 1
- [ ] Verificación 2
- [ ] Verificación 3

## 📝 Ejemplos

### Ejemplo 1: [Nombre del Caso de Uso]

\`\`\`[lenguaje]
[código de ejemplo]
\`\`\`

**Explicación:** [Por qué este ejemplo es importante]

## 🚨 Advertencias y Errores Comunes

- **Error común 1:** [Descripción]
  - **Solución:** [Cómo evitarlo o solucionarlo]

- **Error común 2:** [Descripción]
  - **Solución:** [Cómo evitarlo o solucionarlo]

## 🔧 Scripts y Recursos

[Si la habilidad incluye scripts o recursos, documentarlos aquí]

### Script: `scripts/nombre-script.py`

**Propósito:** [Qué hace el script]

**Uso:**
\`\`\`bash
python scripts/nombre-script.py [argumentos]
\`\`\`

## 📚 Referencias

- [Enlaces a documentación relevante]
- [Recursos externos útiles]
```

### 4. **Reglas de Nomenclatura**

- **Nombres de habilidades:** En minúsculas, separadas por guiones
  - ✅ `creador-habilidades`
  - ✅ `validador-sql`
  - ❌ `CreadorHabilidades`
  - ❌ `creador_habilidades`

- **Nombres en YAML frontmatter:** Capitalizados, descriptivos
  - ✅ `name: Creador de Habilidades`
  - ✅ `name: Validador de Esquemas SQL`

### 5. **Mejores Prácticas**

#### ✅ HACER:

1. **Ser específico y accionable:** Las instrucciones deben ser claras y ejecutables
2. **Usar emojis para mejorar legibilidad:** 🎯 para propósitos, 📋 para listas, ⚠️ para advertencias
3. **Incluir ejemplos concretos:** Código real, no pseudocódigo genérico
4. **Documentar errores comunes:** Basado en experiencia o conocimiento del dominio
5. **Mantener consistencia:** Usar el mismo formato en todas las habilidades
6. **Ser conciso pero completo:** No repetir información innecesaria
7. **Incluir contexto:** Explicar el "por qué", no solo el "cómo"

#### ❌ NO HACER:

1. **No crear instrucciones vagas:** Evitar "Haz lo necesario" o "Según la situación"
2. **No omitir el frontmatter YAML:** Es obligatorio
3. **No duplicar funcionalidad:** Verificar si ya existe una habilidad similar
4. **No crear habilidades demasiado generales:** Deben ser específicas a un dominio
5. **No incluir información sensible:** Contraseñas, tokens, datos privados

### 6. **Validación de la Habilidad**

Antes de finalizar, verifica:

- [ ] El archivo `SKILL.md` existe y tiene frontmatter YAML válido
- [ ] La descripción en el frontmatter tiene menos de 100 caracteres
- [ ] Las instrucciones son claras y accionables
- [ ] Incluye al menos un ejemplo concreto
- [ ] Los scripts (si existen) están documentados
- [ ] El nombre del directorio está en minúsculas con guiones
- [ ] No hay información sensible en los archivos

## 🎨 Plantilla Rápida

Para crear una habilidad básica rápidamente, usa esta plantilla mínima:

```markdown
---
name: [Nombre de la Habilidad]
description: [Descripción breve]
---

# [Nombre de la Habilidad]

## 🎯 Propósito

[Para qué sirve]

## 📋 Instrucciones

### Paso 1: [Nombre del Paso]

[Instrucciones detalladas]

## ✅ Verificación

- [ ] Criterio de éxito 1
- [ ] Criterio de éxito 2
```

## 📝 Flujo de Trabajo Recomendado

1. **Recibir solicitud** del usuario para crear una habilidad
2. **Hacer preguntas clarificadoras** (ver sección "Análisis de Requisitos")
3. **Crear estructura de directorios** en `.agent/skills/[nombre-habilidad]/`
4. **Generar `SKILL.md`** con toda la documentación
5. **Crear scripts/recursos** si son necesarios
6. **Validar** usando el checklist de validación
7. **Informar al usuario** de la ubicación y cómo invocar la habilidad

## 🚀 Activación de Habilidades

Para usar una habilidad creada:

1. El usuario puede mencionarla por nombre: *"Usa la habilidad [nombre]"*
2. Tú (como AI) primero debes leer el archivo `SKILL.md`:
   ```
   view_file: .agent/skills/[nombre-habilidad]/SKILL.md
   ```
3. Seguir exactamente las instrucciones documentadas

## 💡 Ejemplos de Habilidades Útiles

### Para Desarrollo Web:
- **generador-componentes-react:** Crear componentes React siguiendo convenciones establecidas
- **validador-accesibilidad:** Verificar cumplimiento de estándares WCAG
- **optimizador-rendimiento:** Analizar y sugerir mejoras de performance

### Para Backend:
- **generador-migraciones-db:** Crear migraciones SQL seguras
- **validador-seguridad-api:** Auditar endpoints REST/GraphQL
- **documentador-openapi:** Generar documentación OpenAPI/Swagger

### Para DevOps:
- **generador-docker-compose:** Crear configuraciones Docker optimizadas
- **auditador-dependencias:** Verificar vulnerabilidades en paquetes
- **generador-ci-cd:** Crear pipelines para diferentes plataformas

## 🔍 Troubleshooting

### Problema: "La habilidad no se encuentra"
**Solución:** Verifica que:
- El archivo está en `.agent/skills/[nombre]/SKILL.md`
- El nombre del directorio está en minúsculas con guiones
- El archivo `SKILL.md` existe (exactamente con ese nombre)

### Problema: "Error al leer el frontmatter YAML"
**Solución:** 
- Asegúrate de que los tres guiones (`---`) estén en líneas separadas
- No debe haber espacios antes de los guiones
- Los campos `name` y `description` son obligatorios

### Problema: "La habilidad es demasiado genérica"
**Solución:**
- Define un alcance más específico
- Enfócate en un caso de uso concreto
- Divide en múltiples habilidades si es necesario

---

## 📌 Recordatorios Finales

- **Las habilidades son extensiones permanentes:** Crea contenido de calidad duradera
- **Documenta asumiendo que otro desarrollador la usará:** No todos tendrán tu contexto
- **Mantén la coherencia con el proyecto:** Respeta convenciones existentes
- **Actualiza las habilidades cuando sea necesario:** Son documentos vivos

**¡Ahora estás listo para crear habilidades profesionales en español!** 🚀

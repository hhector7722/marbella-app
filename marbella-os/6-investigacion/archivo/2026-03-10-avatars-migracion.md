---
documento: ARCHIVO-AVATARS-MIGRACION
clase: inmutable
estado: archivado
capa: investigacion
normativo: false
precedencia: 0
responsable: propiedad del producto
fechado: 2026-03-10
caducidad: no aplica
supersede: —
---

# Ejecutar migración del bucket Avatars

> **MATERIAL NO NORMATIVO — ARCHIVO-AVATARS-MIGRACION**
>
> Esto es un documento histórico congelado el 2026-03-10, no una norma. **No autoriza ninguna decisión** y puede describir un sistema que ya no existe. Sus enlaces internos no resuelven: apuntan a rutas anteriores a la reorganización y no se corrigen.
>
> La norma vigente vive en `marbella-os/`; la jerarquía que la ordena, en `marbella-os/CANON.md`. Ante cualquier discrepancia gana el documento normativo, sin discusión.

Debido a conflictos en el historial de migraciones, ejecuta manualmente el SQL en el **Supabase Dashboard**:

1. Entra en [Supabase Dashboard](https://supabase.com/dashboard) → tu proyecto
2. Ve a **SQL Editor**
3. Pega y ejecuta el siguiente SQL:

```sql
-- BUCKET AVATARS: Imagen de perfil editable por cada usuario
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'avatars',
    'avatars',
    true,
    2097152,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_own_upload" ON storage.objects;
CREATE POLICY "avatars_own_upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "avatars_own_update" ON storage.objects;
CREATE POLICY "avatars_own_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "avatars_own_delete" ON storage.objects;
CREATE POLICY "avatars_own_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
);
```

4. Pulsa **Run** (o Ctrl+Enter)

---

> **Fin de ARCHIVO-AVATARS-MIGRACION · material no normativo del 2026-03-10.** Nada de lo anterior autoriza decisiones. La norma vigente está en `marbella-os/README.md`.

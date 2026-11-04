import { groupRecipeCategoryOptions, type RecipeCategoryOption } from '@/lib/recipe-menu-categories';

/**
 * En los formularios se seleccionan categorías finales, no agrupadores.
 * Los padres con subcategorías solo sirven como encabezados del desplegable.
 * Una receta previamente asignada a un padre conserva su valor hasta que se edite.
 */
export function RecipeCategorySelectOptions({
    options,
    selectedId = '',
    productionCategoryId = null,
    showProductionOption = false,
}: {
    options: RecipeCategoryOption[];
    selectedId?: string;
    productionCategoryId?: string | null;
    showProductionOption?: boolean;
}) {
    const menuOptions = options.filter((item) => item.id !== productionCategoryId);
    const groups = groupRecipeCategoryOptions(menuOptions);
    const selectedParent = groups.find(({ parent, children }) => children.length > 0 && parent.id === selectedId);

    return (
        <>
            {selectedParent ? (
                <option value={selectedParent.parent.id} hidden>
                    {selectedParent.parent.label}
                </option>
            ) : null}
            {productionCategoryId ? (
                <option value={productionCategoryId}>Producción</option>
            ) : showProductionOption ? (
                <option value="__production_loading" disabled>Producción (cargando…)</option>
            ) : null}
            {groups.map(({ parent, children }) => (
                children.length > 0 ? (
                    <optgroup key={parent.id} label={parent.label}>
                        {children.map((child) => (
                            <option key={child.id} value={child.id}>{child.label}</option>
                        ))}
                    </optgroup>
                ) : (
                    <option key={parent.id} value={parent.id}>{parent.label}</option>
                )
            ))}
        </>
    );
}

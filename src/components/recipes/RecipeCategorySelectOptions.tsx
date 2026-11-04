import { groupRecipeCategoryOptions, type RecipeCategoryOption } from '@/lib/recipe-menu-categories';

export function RecipeCategorySelectOptions({
    options,
    selectedId = '',
}: {
    options: RecipeCategoryOption[];
    selectedId?: string;
}) {
    return (
        <>
            {groupRecipeCategoryOptions(options).map(({ parent, children }) => (
                children.length > 0 ? (
                    <optgroup key={parent.id} label={parent.label}>
                        {selectedId === parent.id ? (
                            <option value={parent.id}>{parent.label} (categoría principal actual)</option>
                        ) : null}
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

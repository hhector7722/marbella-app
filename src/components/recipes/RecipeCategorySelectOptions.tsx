import { groupRecipeCategoryOptions, type RecipeCategoryOption } from '@/lib/recipe-menu-categories';

export function RecipeCategorySelectOptions({ options }: { options: RecipeCategoryOption[] }) {
    return (
        <>
            {groupRecipeCategoryOptions(options).map(({ parent, children }) => (
                children.length > 0 ? (
                    <optgroup key={parent.id} label={parent.label}>
                        <option value={parent.id}>general</option>
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

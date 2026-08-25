import { loadStudioSnapshot } from '@/lib/design-system/canon/io';
import { hydrateElements } from '@/lib/design-system/visual-studio/catalog';
import { DesignSystemStudio } from './_components/DesignSystemStudio';

export default function DesignSystemPage() {
    const snapshot = loadStudioSnapshot();
    const elements = hydrateElements(snapshot.registry.elements);
    return <DesignSystemStudio snapshot={snapshot} elements={elements} />;
}

const ROLES_THAT_OPEN_OTHERS_DOCUMENTS = new Set(['manager', 'admin']);

/** DNI y nóminas de otra persona: solo manager y admin. Supervisor y staff, las suyas. */
export function canOpenOthersPersonalDocuments(role: string | null | undefined): boolean {
    return Boolean(role && ROLES_THAT_OPEN_OTHERS_DOCUMENTS.has(role));
}

export function canOpenPersonalDocument(
    role: string | null | undefined,
    viewerId: string,
    ownerId: string,
): boolean {
    if (viewerId === ownerId) return true;
    return canOpenOthersPersonalDocuments(role);
}

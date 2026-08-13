export default function StudioLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-zinc-100 font-sans text-zinc-900">
            {children}
        </div>
    );
}

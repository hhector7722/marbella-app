export default function StudioLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="h-screen w-screen bg-black overflow-hidden flex flex-col font-sans text-white">
            {children}
        </div>
    );
}

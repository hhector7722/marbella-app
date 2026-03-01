const fs = require('fs');
let content = fs.readFileSync('src/app/staff/schedule/editor/page.tsx', 'utf8');

content = content.replace(
    /\{\/\* CONTENEDOR SUPERIOR \*\/\}\s*<div className="w-full bg-white rounded-\[1\.25rem\] shadow-xl overflow-hidden flex flex-col relative shrink-0">/g,
    \{/* CONTENEDOR PRINCIPAL */}
            <div className="w-full max-w-5xl mx-auto bg-white rounded-[1.25rem] shadow-2xl overflow-hidden flex flex-col relative">\
);

content = content.replace(
    /\{\/\* TABLA FLUIDA \(100% WIDTH\) \*\/\}\s*<div className="w-full flex-1 bg-white rounded-\[1\.25rem\] shadow-xl overflow-hidden flex flex-col relative border border-white\/20">/g,
    \{/* TABLA FLUIDA (100% WIDTH) */}
                <div className="w-full flex flex-col relative shrink-0 z-0">\
);

content = content.replace(
    /\{\/\* FILAS DE EMPLEADOS \*\/\}\s*<div className="flex-1 w-full bg-white flex flex-col relative pb-20">/g,
    \{/* FILAS DE EMPLEADOS */}
                <div className="w-full bg-white flex flex-col relative pb-2">\
);

content = content.replace(
    /className=\lex h-10 border-b border-gray-100 last:border-b-0 w-full transition-colors relative z-10 \$\{editingIndex === idx \? 'bg-blue-50\/40' : 'bg-transparent'\}\/g,
    \className=\\\lex h-8 md:h-10 border-b border-gray-100 last:border-b-0 w-full transition-colors relative z-10 \\\\\
);

content = content.replace(
    /<ShiftBar\\s+shift=\\{shift\\}\\s+onUpdate=\\{\\(newS\\) => handleUpdateShift\\(idx, newS\\)\\}\\s+barClass=\\{\\\\\$\\{editingIndex === idx \\? 'bg-\\[#36606F\\]\\/20' : 'bg-blue-100\\/40 hover:bg-blue-100\\/60'\\}\\\\\}\\s+\\/>/g,
    \<ShiftBar
                                        shift={shift}
                                        onUpdate={(newS) => handleUpdateShift(idx, newS)}
                                        barClass={\\\\\\}
                                        isCompact={true}
                                    />\
);

content = content.replace(
    /\{\/\* BARRA DE EDICIÓN FLOTANTE \*\/\}/g,
    \</div>
            {/* BARRA DE EDICIÓN FLOTANTE */}\
);

content = content.replace(
    /bg-white\/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200 p-2 flex items-center gap-2 max-w-lg mx-auto/g,
    \g-white/95 backdrop-blur-2xl rounded-3xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.3)] border border-gray-200/50 p-2 md:p-3 flex items-center gap-3 max-w-2xl mx-auto\
);

content = content.replace(
    /flex-1 h-\[2\.5rem\] relative bg-gray-50 rounded-xl overflow-hidden border border-gray-100 shadow-inner/g,
    \lex-1 h-14 md:h-16 relative bg-gray-50 rounded-2xl overflow-hidden border border-gray-100 shadow-inner\
);

content = content.replace(
    /barClass="bg-\[#36606F\]"/g,
    \arClass="bg-[#36606F] shadow-lg border border-white/10"
                                isCompact={false}\
);

content = content.replace(
    /fixed bottom-3 left-2 right-2 md:left-4 md:right-4 z-50 animate-in slide-in-from-bottom-5 duration-300/g,
    \ixed bottom-4 left-4 right-4 z-50 animate-in slide-in-from-bottom-10 duration-300 max-w-2xl mx-auto\
);

content = content.replace(
    /w-10 h-10 flex items-center justify-center bg-gray-900 hover:bg-black rounded-xl shadow-lg text-white transition-all active:scale-95 shrink-0/g,
    \w-14 h-14 md:w-16 md:h-16 flex items-center justify-center bg-gray-900 hover:bg-black rounded-2xl shadow-xl text-white transition-all active:scale-95 shrink-0\
);

content = content.replace(
    /<X size=\{18\} strokeWidth=\{4\} \/>/g,
    \<X size={24} strokeWidth={4} />\
);

fs.writeFileSync('src/app/staff/schedule/editor/page.tsx', content);
console.log('Script done');

'use client';

import Link from 'next/link';
import { ChefHat, BookOpen, Package, ArrowRight } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-full p-8">

      {/* Título Principal */}
      <div className="text-center text-white mb-16">
        <div className="inline-flex p-6 bg-white/10 rounded-full mb-6 backdrop-blur-sm border border-white/20 shadow-2xl">
          <ChefHat size={80} className="text-white drop-shadow-md" />
        </div>
        <h1 className="text-5xl font-black uppercase tracking-widest text-white drop-shadow-lg mb-2">Bar La Marbella</h1>
        <p className="text-blue-100 font-medium text-xl tracking-wide opacity-90">Panel de Control Central</p>
      </div>

      {/* Tarjetas de Navegación */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 w-full max-w-4xl">

        {/* TARJETA RECETAS */}
        <Link href="/recipes" className="group">
          <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl transition-all duration-500 hover:-translate-y-3 hover:shadow-[0_20px_50px_rgba(0,0,0,0.2)] flex flex-col items-center text-center h-full border-4 border-transparent hover:border-blue-300 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-150 duration-700 ease-in-out z-0"></div>

            <div className="w-28 h-28 bg-blue-50 rounded-3xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-300 shadow-inner z-10 relative">
              <BookOpen size={56} className="text-[#3F51B5]" />
            </div>

            <h2 className="text-3xl font-black text-gray-800 mb-3 uppercase tracking-wide z-10">Recetas</h2>
            <p className="text-gray-500 text-base mb-10 font-medium leading-relaxed max-w-xs z-10">Gestionar escandallos, precios y fichas técnicas detalladas.</p>

            <div className="mt-auto flex items-center gap-3 text-[#3F51B5] font-black text-sm bg-blue-50 px-8 py-4 rounded-full group-hover:bg-[#3F51B5] group-hover:text-white transition-all duration-300 shadow-md group-hover:shadow-lg z-10">
              ACCEDER <ArrowRight size={18} />
            </div>
          </div>
        </Link>

        {/* TARJETA INGREDIENTES */}
        <Link href="/ingredients" className="group">
          <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl transition-all duration-500 hover:-translate-y-3 hover:shadow-[0_20px_50px_rgba(0,0,0,0.2)] flex flex-col items-center text-center h-full border-4 border-transparent hover:border-purple-300 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-50 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-150 duration-700 ease-in-out z-0"></div>

            <div className="w-28 h-28 bg-purple-50 rounded-3xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-300 shadow-inner z-10 relative">
              <Package size={56} className="text-purple-600" />
            </div>

            <h2 className="text-3xl font-black text-gray-800 mb-3 uppercase tracking-wide z-10">Ingredientes</h2>
            <p className="text-gray-500 text-base mb-10 font-medium leading-relaxed max-w-xs z-10">Base de datos maestra de materia prima y proveedores.</p>

            <div className="mt-auto flex items-center gap-3 text-purple-600 font-black text-sm bg-purple-50 px-8 py-4 rounded-full group-hover:bg-purple-600 group-hover:text-white transition-all duration-300 shadow-md group-hover:shadow-lg z-10">
              ACCEDER <ArrowRight size={18} />
            </div>
          </div>
        </Link>

      </div>
    </div>
  );
}
'use client';

import Link from 'next/link';
import { ChefHat, Home, BookOpen, Package, TrendingUp, Settings, ArrowRight } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#5B8FB9' }}>

      {/* Sidebar */}
      <aside className="w-20 flex flex-col items-center py-8 space-y-8 shadow-2xl sticky top-0 h-screen overflow-y-auto" style={{ background: 'linear-gradient(to bottom, #4A7A9A, #36606F)' }}>
        <Link href="/" className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform">
          <ChefHat className="w-7 h-7 text-[#3F51B5]" />
        </Link>
        <nav className="flex flex-col gap-6">
          <SidebarIcon icon={<Home size={24} />} href="/" active />
          <SidebarIcon icon={<BookOpen size={24} />} href="/recipes" />
          <SidebarIcon icon={<Package size={24} />} href="/ingredients" />
          <SidebarIcon icon={<TrendingUp size={24} />} href="/dashboard" />
          <SidebarIcon icon={<Settings size={24} />} />
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-8">

        {/* Título Principal */}
        <div className="text-center text-white mb-12">
          <div className="inline-flex p-4 bg-white/10 rounded-full mb-4 backdrop-blur-sm border border-white/20">
            <ChefHat size={64} className="text-white" />
          </div>
          <h1 className="text-4xl font-bold uppercase tracking-widest text-white drop-shadow-md">Bar La Marbella</h1>
          <p className="text-blue-100 font-medium mt-2 text-lg">Panel de Control Central</p>
        </div>

        {/* Tarjetas de Navegación */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-3xl">

          {/* TARJETA RECETAS */}
          <Link href="/recipes" className="group">
            <div className="bg-white rounded-[2rem] p-8 shadow-xl transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl flex flex-col items-center text-center h-full border-4 border-transparent hover:border-blue-200">
              <div className="w-24 h-24 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-inner">
                <BookOpen size={48} className="text-[#3F51B5]" />
              </div>
              <h2 className="text-2xl font-black text-gray-800 mb-2 uppercase tracking-wide">Recetas</h2>
              <p className="text-gray-500 text-sm mb-8 font-medium">Gestionar escandallos, precios y fichas técnicas.</p>
              <div className="mt-auto flex items-center gap-2 text-[#3F51B5] font-black text-xs bg-blue-50 px-6 py-3 rounded-full group-hover:bg-[#3F51B5] group-hover:text-white transition-colors">
                ACCEDER <ArrowRight size={16} />
              </div>
            </div>
          </Link>

          {/* TARJETA INGREDIENTES */}
          <Link href="/ingredients" className="group">
            <div className="bg-white rounded-[2rem] p-8 shadow-xl transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl flex flex-col items-center text-center h-full border-4 border-transparent hover:border-purple-200">
              <div className="w-24 h-24 bg-purple-50 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-inner">
                <Package size={48} className="text-purple-600" />
              </div>
              <h2 className="text-2xl font-black text-gray-800 mb-2 uppercase tracking-wide">Ingredientes</h2>
              <p className="text-gray-500 text-sm mb-8 font-medium">Base de datos de materia prima y proveedores.</p>
              <div className="mt-auto flex items-center gap-2 text-purple-600 font-black text-xs bg-purple-50 px-6 py-3 rounded-full group-hover:bg-purple-600 group-hover:text-white transition-colors">
                ACCEDER <ArrowRight size={16} />
              </div>
            </div>
          </Link>

        </div>
      </main>

    </div>
  );
}

function SidebarIcon({ icon, active, href }: { icon: React.ReactNode; active?: boolean; href?: string }) {
  const className = `w-12 h-12 flex items-center justify-center rounded-xl transition-all ${active ? 'bg-white text-[#3F51B5] shadow-lg' : 'text-white/70 hover:text-white hover:bg-white/10'}`;
  return href ? <Link href={href} className={className}>{icon}</Link> : <div className={className}>{icon}</div>;
}
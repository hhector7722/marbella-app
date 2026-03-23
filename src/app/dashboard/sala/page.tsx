import RadarSala from '@/components/dashboards/RadarSala';

export default function DashboardPage() {
  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold mb-8">Centro de Mando La Marbella</h1>
      {/* Aquí inyectas el radar */}
      <RadarSala />
    </main>
  );
}
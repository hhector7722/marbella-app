import RadarSala from '@/components/dashboards/RadarSala';

export default function DashboardPage() {
  return (
    <main className="p-8">
      {/* Aquí inyectas el radar */}
      <RadarSala />
    </main>
  );
}
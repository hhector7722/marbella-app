import { redirect } from 'next/navigation';

/** KDS desactivado — no hay pantalla de cocina en uso. */
export default function KDSPage() {
  redirect('/dashboard');
}

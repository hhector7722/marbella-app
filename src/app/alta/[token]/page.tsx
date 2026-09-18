import { lookupIntakeByToken, publicStateOf } from '@/lib/alta-laboral/lookup.ts';
import { AltaPublicForm } from '@/components/alta/AltaPublicForm';

export const dynamic = 'force-dynamic';

export default async function AltaPublicPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let state: ReturnType<typeof publicStateOf> = 'invalid';
  try {
    const row = await lookupIntakeByToken(token);
    state = publicStateOf(row);
  } catch {
    state = 'invalid';
  }

  return <AltaPublicForm token={token} state={state} />;
}

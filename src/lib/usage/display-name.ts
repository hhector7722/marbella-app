/** Solo primer nombre / parte local del email — nunca nombre completo en UI de uso. */
export function firstNameOnly(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

function emailLocalPart(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return email;
  return email.slice(0, at);
}

type UsageProfileName = {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

export function usageDisplayName(
  profile: UsageProfileName | null,
  fallbackEmail = '?'
): string {
  if (!profile) {
    const fb = fallbackEmail.trim();
    if (!fb || fb === '?') return '?';
    return firstNameOnly(emailLocalPart(fb)) || '?';
  }

  const first = profile.first_name?.trim();
  if (first) return firstNameOnly(first);

  const email = profile.email?.trim();
  if (email) return firstNameOnly(emailLocalPart(email)) || '?';

  const fb = fallbackEmail.trim();
  if (fb && fb !== '?') return firstNameOnly(emailLocalPart(fb)) || '?';

  return '?';
}

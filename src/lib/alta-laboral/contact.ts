export function digitsPhoneEs(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('34') && digits.length === 11) {
    digits = digits.slice(2);
  }
  return digits.slice(0, 9);
}

export const DEFAULT_CANDIDATE_EMAIL = '@gmail.com';

export function appendGmailAddress(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_CANDIDATE_EMAIL;
  const at = trimmed.indexOf('@');
  if (at === -1) return `${trimmed}${DEFAULT_CANDIDATE_EMAIL}`;
  return `${trimmed.slice(0, at)}${DEFAULT_CANDIDATE_EMAIL}`;
}

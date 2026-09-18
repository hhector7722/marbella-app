export function digitsPhoneEs(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('34') && digits.length === 11) {
    digits = digits.slice(2);
  }
  return digits.slice(0, 9);
}

export function appendGmailAddress(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '@gmail.com';
  const at = trimmed.indexOf('@');
  if (at === -1) return `${trimmed}@gmail.com`;
  return `${trimmed.slice(0, at)}@gmail.com`;
}

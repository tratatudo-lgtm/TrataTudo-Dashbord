/**
 * Normalizes a phone number to E.164 format.
 * Default country is Portugal (PT).
 */
export function normalizeE164(input: string, defaultCountry = 'PT'): string {
  let cleaned = input.trim().replace(/\s+/g, '');

  // 1. If starts with "00", replace with "+"
  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.slice(2);
  }

  // 2. If starts with "+", keep it
  if (cleaned.startsWith('+')) {
    return cleaned;
  }

  // 3. If only digits and starts with "351"
  if (/^\d+$/.test(cleaned) && cleaned.startsWith('351')) {
    return '+' + cleaned;
  }

  // 4. If only digits, starts with "9" and length is 9 (Portugal specific)
  if (/^\d{9}$/.test(cleaned) && cleaned.startsWith('9') && defaultCountry === 'PT') {
    return '+351' + cleaned;
  }

  // 5. If it's just digits but doesn't match PT rules, we might need more logic or just return as is if it looks like a full number
  if (/^\d{10,}$/.test(cleaned)) {
    return '+' + cleaned;
  }

  // If we can't normalize, we'll let the caller handle the error or return as is
  // But the requirement says: if not possible, return error "Formato inválido"
  // Since this is a helper, maybe throw or return null. Let's return null to indicate failure.
  return '';
}

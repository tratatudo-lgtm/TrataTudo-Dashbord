function safeStr(v: any) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function looksLikePortugalTimeQuestion(text: string) {
  const t = safeStr(text).toLowerCase();
  const asksTime = /que horas|horas são|hora é|hora em/.test(t);
  const mentionsPortugal = /portugal|lisboa|lisbon/.test(t);
  return asksTime && (mentionsPortugal || t.includes('agora'));
}

export function maybeToolAnswer(text: string, lang = 'pt-PT') {
  // Hora em Portugal (Europe/Lisbon)
  if (looksLikePortugalTimeQuestion(text)) {
    const now = new Date();
    const time = new Intl.DateTimeFormat(lang, {
      timeZone: 'Europe/Lisbon',
      hour: '2-digit',
      minute: '2-digit',
    }).format(now);

    const date = new Intl.DateTimeFormat(lang, {
      timeZone: 'Europe/Lisbon',
      weekday: 'long',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);

    return {
      tool: 'time_europe_lisbon',
      reply: `Em Portugal agora são **${time}** (${date}).`,
    };
  }

  return null;
}
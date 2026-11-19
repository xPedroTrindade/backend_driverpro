// =============================================================================
// "Hoje" no fuso do Brasil. O servidor (Render) roda em UTC: entre 21h e 0h de
// Brasília o UTC já está no dia seguinte, e o dashboard mostraria o dia errado.
// =============================================================================
export const FUSO = 'America/Sao_Paulo';

const partes = (agora: Date) => {
  // en-CA formata como YYYY-MM-DD
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora);
  const [ano, mes, dia] = iso.split('-').map(Number);
  return { iso, ano, mes, dia };
};

// "YYYY-MM-DD" de hoje em Brasília.
export const hojeBrasil = (agora: Date = new Date()) => partes(agora).iso;

// Ano e mês (1-12) correntes em Brasília.
export const anoMesBrasil = (agora: Date = new Date()) => {
  const { ano, mes } = partes(agora);
  return { ano, mes };
};

const { CATS, TIPOS } = require('./config');

const stripAccents = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = s => stripAccents(s.toLowerCase());

function findKeyword(normText, entries, kwField) {
  for (const entry of entries) {
    for (const kw of entry[kwField]) {
      const re = new RegExp(`(^|[^a-z0-9])${kw}([^a-z0-9]|$)`, 'i');
      if (re.test(normText)) return { entry, kw };
    }
  }
  return null;
}

function findValor(text) {
  const matches = [...text.matchAll(/\d+(?:[.,]\d{1,2})?/g)].map(m => ({
    raw: m[0],
    hasDecimal: /[.,]/.test(m[0]),
  }));
  if (matches.length === 0) return null;
  const withDecimal = matches.find(m => m.hasDecimal);
  const picked = withDecimal || matches[0];
  return picked.raw.replace(',', '.');
}

// personNames: [nomePessoa0, nomePessoa1] — índice 0 = S.p0, índice 1 = S.p1
function parseExpense(rawText, personNames, ownerIndex) {
  const text = norm(rawText);

  const valor = findValor(rawText);
  if (!valor) return { ok: false, reason: 'sem_valor' };

  const catMatch = findKeyword(text, CATS, 'kw');
  const cat = catMatch ? catMatch.entry.id : 'outros';
  const catLabel = catMatch ? catMatch.entry.l : 'Outros';

  const tipoMatch = findKeyword(text, TIPOS, 'kw');
  const tipo = tipoMatch ? tipoMatch.entry.v : '';

  let quem = ownerIndex;
  const p0n = norm(personNames[0] || '');
  const p1n = norm(personNames[1] || '');
  if (p1n && text.includes(p1n)) quem = 1;
  else if (p0n && text.includes(p0n)) quem = 0;

  const STOPWORDS = new Set(['pra', 'para', 'de', 'do', 'da', 'no', 'na', 'em', 'com', 'o', 'a', 'e']);
  const allKw = new Set([
    ...CATS.flatMap(c => c.kw.map(norm)),
    ...TIPOS.flatMap(t => t.kw.map(norm)),
  ]);

  let nome = rawText;
  nome = nome.replace(new RegExp(valor.replace('.', '[.,]'), 'i'), ' ');
  if (p0n && quem === 0) nome = nome.replace(new RegExp(personNames[0], 'i'), ' ');
  if (p1n && quem === 1) nome = nome.replace(new RegExp(personNames[1], 'i'), ' ');
  nome = nome
    .split(/\s+/)
    .filter(w => w && !STOPWORDS.has(norm(w)) && !allKw.has(norm(w)))
    .join(' ')
    .trim();
  if (!nome) nome = catLabel;

  return {
    ok: true,
    nome,
    valor,
    cat,
    catLabel,
    tipo,
    quem,
    data: new Date().toISOString().slice(0, 10),
  };
}

module.exports = { parseExpense, findValor, norm };

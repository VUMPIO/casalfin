const { SUPABASE_URL, SUPABASE_ANON_KEY, DEFAULT_PERSON_NAMES } = require('./config');

const headers = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

async function getValue(key) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/casalfin_state?key=eq.${encodeURIComponent(key)}&select=value`,
    { headers },
  );
  if (!res.ok) throw new Error(`GET ${key} falhou: ${res.status}`);
  const rows = await res.json();
  return rows.length ? rows[0].value : null;
}

async function upsertValue(key, value) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/casalfin_state`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`UPSERT ${key} falhou: ${res.status} ${await res.text()}`);
}

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

async function getPersonNames() {
  const [p1, p2] = await Promise.all([getValue('cf_m_p1'), getValue('cf_m_p2')]);
  return [p1 || DEFAULT_PERSON_NAMES[0], p2 || DEFAULT_PERSON_NAMES[1]];
}

async function addExpense(personIndex, entry) {
  const key = `cf_${monthKey()}_p${personIndex}`;
  const current = (await getValue(key)) || [];
  current.push(entry);
  await upsertValue(key, current);
  return key;
}

// Gasto de casal: entra na lista de "Fixos" com resp=2, igual ao app faz
// quando você adiciona um gasto pela aba "Casal".
async function addCasalExpense(entry) {
  const key = `cf_${monthKey()}_fixos`;
  const current = (await getValue(key)) || [];
  current.push({ ...entry, pago: true, resp: 2 });
  await upsertValue(key, current);
  return key;
}

// Remove o ÚLTIMO lançamento que casa com os campos informados. Devolve o
// que foi removido, ou null se nada casou.
async function removeExpense(quem, { nome, valor, cat }) {
  const key = quem === 'casal' ? `cf_${monthKey()}_fixos` : `cf_${monthKey()}_p${quem}`;
  const lista = (await getValue(key)) || [];
  const alvo = String(valor).replace(',', '.');
  const idx = lista.map((r, i) => ({ r, i })).reverse().find(({ r }) =>
    String(r.valor).replace(',', '.') === alvo
    && (nome === undefined || r.nome === nome)
    && (cat === undefined || r.cat === cat));
  if (!idx) return null;
  const [removido] = lista.splice(idx.i, 1);
  await upsertValue(key, lista);
  return removido;
}

const pv = v => parseFloat(String(v || '').replace(',', '.')) || 0;
const sumBy = (arr, pred) => (arr || []).filter(pred).reduce((s, r) => s + pv(r.valor), 0);

// Espelha exatamente a fórmula usada no dashboard do app (renderDashboard):
// gasto de uma pessoa = variáveis dela + fixos pagos atribuídos a ela + parcelas dela.
// Gasto "casal" (resp=2) fica de fora do total individual, igual no app.
function computeTotals({ p0, p1, fixos, parc }) {
  const totalFor = idx =>
    sumBy(idx === 0 ? p0 : p1, () => true) +
    sumBy(fixos, r => (r.resp ?? 2) === idx && r.pago) +
    sumBy(parc, r => (r.resp ?? 2) === idx);
  const couple =
    sumBy(fixos, r => (r.resp ?? 2) === 2 && r.pago) +
    sumBy(parc, r => (r.resp ?? 2) === 2);
  const p0Total = totalFor(0);
  const p1Total = totalFor(1);
  return { p0: p0Total, p1: p1Total, couple, grandTotal: p0Total + p1Total + couple };
}

// Retrato completo do mês — é o que o brain.js entrega pro Claude como contexto.
async function getMonthSnapshot() {
  const mk = monthKey();
  const [p0, p1, fixos, parc, entradas] = await Promise.all([
    getValue(`cf_${mk}_p0`),
    getValue(`cf_${mk}_p1`),
    getValue(`cf_${mk}_fixos`),
    getValue(`cf_${mk}_parc`),
    getValue(`cf_${mk}_entradas`),
  ]);
  const data = {
    p0: p0 || [],
    p1: p1 || [],
    fixos: fixos || [],
    parc: parc || [],
    entradas: entradas || [],
  };
  return { ...data, totals: computeTotals(data) };
}

module.exports = {
  getValue,
  upsertValue,
  getPersonNames,
  addExpense,
  addCasalExpense,
  removeExpense,
  getMonthSnapshot,
  monthKey,
};

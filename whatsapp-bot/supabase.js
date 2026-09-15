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

module.exports = { getValue, upsertValue, getPersonNames, addExpense, monthKey };

const express = require('express');
const fetch   = require('node-fetch');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

const ADZUNA_APP_ID  = process.env.ADZUNA_APP_ID  || '586c69ed';
const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY || 'f5d7d2038dc1f8aabff0ebc1d4d8f7f5';

let ukRegisterCache   = null;
let ukRegisterFetched = 0;
const UK_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const UK_CSV_URLS = [
  'https://assets.publishing.service.gov.uk/media/6a3e482e30b491f55b3c4ac3/SP_-_Worker_and_Temporary_Worker_Web_Register_-_2026-06-26.csv',
  'https://assets.publishing.service.gov.uk/media/69f0dc3a4e01778358c191bd/2026-04-28_-_Worker_and_Temporary_Worker.csv',
];

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/jobs', async (req, res) => {
  const { country = 'de', what = 'product designer', where = '', page = 1 } = req.query;
  const ALLOWED = ['gb','de','nl','in','fr','es','au','ca','us','za'];
  if (!ALLOWED.includes(country)) return res.status(400).json({ error: 'Country not allowed' });
  const params = new URLSearchParams({ app_id: ADZUNA_APP_ID, app_key: ADZUNA_APP_KEY, results_per_page: 10, what, ...(where ? { where } : {}) });
  try {
    const url  = `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}?${params}`;
    const resp = await fetch(url, { timeout: 10000 });
    if (!resp.ok) return res.status(resp.status).json({ error: 'Adzuna error' });
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch jobs', detail: err.message });
  }
});

app.get('/api/uk-register', async (req, res) => {
  const now = Date.now();
  if (ukRegisterCache && (now - ukRegisterFetched) < UK_CACHE_TTL_MS) {
    return res.json({ source: 'cache', data: ukRegisterCache });
  }
  for (const url of UK_CSV_URLS) {
    try {
      const resp = await fetch(url, { timeout: 30000 });
      if (!resp.ok) continue;
      const text = await resp.text();
      const lines = text.split('\n');
      const sponsors = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = parseCSVLine(line);
        if (cols.length < 4) continue;
        const name   = cols[0].replace(/^"+|"+$/g, '').trim();
        const town   = cols[1] ? cols[1].replace(/^"+|"+$/g,'').trim() : '';
        const rating = cols[3] ? cols[3].replace(/^"+|"+$/g,'').trim() : '';
        const route  = cols[4] ? cols[4].replace(/^"+|"+$/g,'').trim() : '';
        if (!name) continue;
        sponsors.push({ name, town, rating, route });
      }
      ukRegisterCache   = sponsors;
      ukRegisterFetched = now;
      return res.json({ source: 'fresh', count: sponsors.length, data: sponsors });
    } catch (err) { console.warn('Register URL failed:', url, err.message); }
  }
  res.status(502).json({ error: 'Could not fetch UK sponsor register' });
});

function parseCSVLine(line) {
  const result = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
    else cur += c;
  }
  result.push(cur);
  return result;
}

app.get('/api/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`JobScout running on http://localhost:${PORT}`));

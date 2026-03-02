const { v4: uuid } = require('crypto');
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const DB_KEY = 'cryptoployed:jobs';

async function redisGet(key) {
  if (!REDIS_URL) return null;
  const r = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
  const d = await r.json();
  return d.result ? JSON.parse(d.result) : null;
}

async function redisSet(key, val) {
  if (!REDIS_URL) return;
  await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(JSON.stringify(val))}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const jobs = await redisGet(DB_KEY) || [];
    return res.json(jobs);
  }

  if (req.method === 'POST') {
    const { title, description, requirements, reward, currency, category, difficulty, poster, posterFull } = req.body;
    const jobs = await redisGet(DB_KEY) || [];
    const job = {
      id: Math.random().toString(36).slice(2),
      title, description, requirements,
      reward: parseFloat(reward), currency: currency || 'SOL',
      category, difficulty, poster, posterFull,
      status: 'open',
      postedAt: Date.now(),
      tags: [],
    };
    jobs.unshift(job);
    await redisSet(DB_KEY, jobs);
    return res.json(job);
  }

  if (req.method === 'PATCH') {
    const { id, status, worker } = req.body;
    const jobs = await redisGet(DB_KEY) || [];
    const idx = jobs.findIndex(j => j.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    jobs[idx] = { ...jobs[idx], status, worker };
    await redisSet(DB_KEY, jobs);
    return res.json(jobs[idx]);
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

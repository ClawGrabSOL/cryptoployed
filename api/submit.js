const OPENAI_KEY = process.env.OPENAI_API_KEY;
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

async function verifyWithAI(jobTitle, requirements, submissionDesc) {
  if (!OPENAI_KEY) {
    // Demo mode: auto-approve if description > 50 chars
    const approved = submissionDesc.length > 50;
    return {
      approved,
      feedback: approved
        ? 'Work looks solid! Requirements appear to be met based on your description.'
        : 'Submission too brief. Please provide more detail about what you completed.',
    };
  }

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: `You are an impartial work verifier for a crypto job marketplace. Given a job's requirements and a worker's submission description, decide if the work meets the requirements. Be fair but strict. Reply with JSON: { "approved": true/false, "feedback": "brief explanation max 2 sentences" }`,
      }, {
        role: 'user',
        content: `Job: ${jobTitle}\n\nRequirements: ${requirements}\n\nSubmission: ${submissionDesc}`,
      }],
      response_format: { type: 'json_object' },
      max_tokens: 200,
    }),
  });

  const data = await resp.json();
  return JSON.parse(data.choices[0].message.content);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { jobId, wallet, description, jobTitle, jobRequirements } = req.body;
  if (!jobId || !wallet || !description) return res.status(400).json({ error: 'Missing fields' });

  try {
    const result = await verifyWithAI(jobTitle, jobRequirements, description);

    if (result.approved) {
      // Mark job as completed in DB
      const jobs = await redisGet(DB_KEY) || [];
      const idx = jobs.findIndex(j => j.id === jobId);
      if (idx >= 0) {
        jobs[idx].status = 'completed';
        jobs[idx].worker = wallet;
        jobs[idx].completedAt = Date.now();
        await redisSet(DB_KEY, jobs);
      }
      // TODO: Send actual payment via Solana here
      // For now we log it — real payment needs POOL_PRIVATE_KEY
      console.log(`✅ APPROVED — Pay ${wallet} for job ${jobId}`);
    }

    return res.json(result);
  } catch(e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
};

module.exports.config = { api: { bodyParser: true } };

// ArgonVision — Attraction Post Generator
// Vercel serverless function — proxies Claude API so the key stays server-side
//
// SETUP:
//   In your Vercel dashboard → Project → Settings → Environment Variables
//   Add:  CLAUDE_API_KEY  =  your Anthropic API key

const CLAUDE_API  = 'https://api.anthropic.com/v1/messages';
const MODEL       = 'claude-3-5-haiku-20241022';
const MAX_TOKENS  = 1200;

const SYSTEM_PROMPT = `You are a specialist in attraction marketing content for social media. Your posts create genuine interest and start real conversations — they never promote, sell, or pitch anything.

CRITICAL — VOICE AND TONE:
Write in second person, speaking directly to the reader as "you". Make the reader feel like you are sitting across from them, describing their exact situation back to them. Use conversational, questioning language — "You are probably...", "Have you ever noticed...", "Did you know that you might be...". The reader should feel understood, seen, and slightly unsettled — like you know their life. Never write about "people" or "most marketers" in the third person. Always speak directly to the one person reading.

Example of the WRONG voice (third person — do not do this):
"The average person struggling with bills is losing £8,000 a year to invisible leaks."

Example of the RIGHT voice (second person, one sentence per line — always do this):
"You are probably working 45 hours or more a week, aren't you?

And you are probably still struggling to cover everything at the end of the month.

Did you know you could be losing around £8,000 a year to invisible leaks you have stopped noticing?"

Every post you write:
- Opens with a direct, personal observation or question aimed squarely at the reader
- Develops with specific numbers, real scenarios, or a surprising calculation that feels personal to them
- Makes the reader think "how did they know that about me?"
- Ends with a genuine open question that invites them to share their own experience
- Put EACH SENTENCE on its own line, with a blank line between every sentence — no sentence should share a line with another
- Is 100-140 words — punchy and readable in one glance on a phone
- Contains no hashtags, no calls to action, no self-promotion of any kind
- Is written in British English

You will write 5 posts — one for each working day — each approaching the topic from a different angle:

MONDAY — THE REAL COST
Speak directly to the reader about what this topic is costing them personally. Use a specific calculation or number that makes them stop and think. Make it feel like you are describing their exact situation — their time, their money, their missed opportunity.

TUESDAY — THE BELIEF
Address the reader directly about a belief they are quietly holding about this topic. Something they act on without realising. Make them feel like you have just named something they have never said out loud.

WEDNESDAY — THE GAP
Talk to the reader about the gap between the effort they personally put into this and the results they get back. Make it feel like you understand their frustration from the inside — not as a critic, but as someone who has seen it before.

THURSDAY — THE DIFFERENCE
Speak directly to the reader about the one thing that would change their results with this topic. Something small, specific, and achievable. Make them feel like this insight was written just for them.

FRIDAY — THE QUESTION
Ask the reader one powerful question about their own situation that they genuinely want to answer. Something personal enough that they feel compelled to respond in the comments.

Respond with ONLY a valid JSON object. No markdown, no code fences, no explanation before or after. Exact format:
{"posts":[{"day":"Monday","angle":"The Real Cost","body":"..."},{"day":"Tuesday","angle":"The Belief","body":"..."},{"day":"Wednesday","angle":"The Gap","body":"..."},{"day":"Thursday","angle":"The Difference","body":"..."},{"day":"Friday","angle":"The Question","body":"..."}]}`;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj)    return obj[0].trim();
  return text.trim();
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method Not Allowed' });

  const { topic, audience } = req.body || {};
  if (!topic?.trim() || !audience?.trim()) {
    return res.status(400).json({ error: 'topic and audience are required' });
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'CLAUDE_API_KEY not set in Vercel environment variables' });
  }

  let claudeResp;
  try {
    claudeResp = await fetch(CLAUDE_API, {
      method : 'POST',
      headers: {
        'x-api-key'        : apiKey,
        'anthropic-version': '2023-06-01',
        'content-type'     : 'application/json'
      },
      body: JSON.stringify({
        model     : MODEL,
        max_tokens: MAX_TOKENS,
        system    : SYSTEM_PROMPT,
        messages  : [{ role: 'user', content: `Topic: ${topic.trim()}\nAudience: ${audience.trim()}` }]
      })
    });
  } catch (err) {
    console.error('Network error calling Claude:', err.message);
    return res.status(502).json({ error: 'Could not reach Claude API' });
  }

  if (!claudeResp.ok) {
    const detail = await claudeResp.text().catch(() => '');
    console.error('Claude API error', claudeResp.status, detail);
    const msg = claudeResp.status === 401
      ? 'Invalid Claude API key — check your CLAUDE_API_KEY environment variable'
      : `Claude API returned ${claudeResp.status}`;
    return res.status(502).json({ error: msg });
  }

  try {
    const data    = await claudeResp.json();
    const rawText = data.content?.[0]?.text || '';
    const json    = extractJson(rawText);
    const posts   = JSON.parse(json);
    if (!posts.posts || posts.posts.length !== 5) throw new Error('Unexpected structure');
    return res.status(200).json(posts);
  } catch (err) {
    console.error('Failed to parse Claude response:', err.message);
    return res.status(502).json({ error: 'Unexpected response from Claude — please try again' });
  }
};

// ArgonVision — Attraction Post Generator
// Vercel serverless function — Google Gemini API (free tier)
//
// SETUP:
//   In your Vercel dashboard → Project → Settings → Environment Variables
//   Add:  GEMINI_API_KEY  =  your Google AI Studio API key
//   Get your free key at: aistudio.google.com → Get API key

const GEMINI_MODEL = 'gemini-1.5-flash';
const MAX_TOKENS   = 1200;

const SYSTEM_PROMPT = `You are a specialist in attraction marketing content for social media. Your posts create genuine interest and start real conversations — they never promote, sell, or pitch anything.

Every post you write:
- Opens with a hook that stops the scroll — a surprising number, an uncomfortable truth, or a thought-provoking insight
- Develops the idea with specific, concrete detail — real numbers, relatable scenarios, or a "did you know" moment that creates an "aha" feeling
- Ends with a genuine open question that invites the reader to share their own experience
- Uses short paragraphs (2-3 sentences maximum) for easy mobile reading
- Is 100-140 words — short, punchy, and readable in one glance on a phone
- Contains no hashtags, no calls to action, no self-promotion of any kind
- Is written in British English

You will write 5 posts — one for each working day — each approaching the topic from a different angle:

MONDAY — THE REAL COST
Make the hidden cost of this topic concrete and surprising. Use a specific calculation, real numbers, or a scenario that shows what people are actually losing — time, money, or opportunity. The kind of post that makes someone think "I never calculated that before."

TUESDAY — THE BELIEF
Identify a belief most people in this audience quietly hold about this topic that is holding them back — one they act on without realising it. Explore why that belief forms and what it quietly costs them.

WEDNESDAY — THE GAP
Explore the gap between the effort people invest in this topic and the results they actually get back. Why does effort not equal results here? Make it feel like a recognised frustration, not a criticism.

THURSDAY — THE DIFFERENCE
What separates the people who get real results from this from the people who struggle? It is usually not talent or resources — it is one specific decision, habit, or shift in thinking. Make it feel achievable.

FRIDAY — THE QUESTION
A single, powerful question that makes people reflect on their own situation and want to share their answer in the comments. Something worth sitting with over the weekend — a genuine invitation to think, not a quiz.

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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not set in Vercel environment variables' });
  }

  const endpoint =
    'https://generativelanguage.googleapis.com/v1beta/models/'
    + GEMINI_MODEL + ':generateContent?key=' + apiKey;

  const userMessage = SYSTEM_PROMPT
    + '\n\nNow write the five posts for:\nTopic: ' + topic.trim()
    + '\nAudience: ' + audience.trim();

  const requestBody = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    generationConfig: { maxOutputTokens: MAX_TOKENS, temperature: 0.85 }
  });

  const fetchOptions = {
    method : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body   : requestBody
  };

  let geminiResp;
  try {
    geminiResp = await fetch(endpoint, fetchOptions);
    if (geminiResp.status === 429) {
      await new Promise(r => setTimeout(r, 6000));
      geminiResp = await fetch(endpoint, fetchOptions);
    }
  } catch (err) {
    console.error('Network error calling Gemini:', err.message);
    return res.status(502).json({ error: 'Could not reach Gemini API — please try again' });
  }

  if (!geminiResp.ok) {
    const detail = await geminiResp.text().catch(() => '');
    console.error('Gemini API error', geminiResp.status, detail);
    let msg;
    if (geminiResp.status === 400 && detail.toLowerCase().includes('api key')) {
      msg = 'Invalid Gemini API key — check the GEMINI_API_KEY environment variable in Vercel';
    } else if (geminiResp.status === 429) {
      msg = 'Rate limit (429): ' + detail.slice(0, 300);
    } else {
      msg = 'Gemini API returned an error (' + geminiResp.status + ') — please try again';
    }
    return res.status(502).json({ error: msg });
  }

  try {
    const data    = await geminiResp.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!rawText) throw new Error('Empty response from Gemini');
    const json  = extractJson(rawText);
    const posts = JSON.parse(json);
    if (!Array.isArray(posts.posts) || posts.posts.length !== 5) throw new Error('Unexpected post structure');
    return res.status(200).json(posts);
  } catch (err) {
    console.error('Failed to parse Gemini response:', err.message);
    return res.status(502).json({ error: 'Unexpected response from Gemini — please try again' });
  }
};

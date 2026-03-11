module.exports = async function handler(req, res) {

  // ✅ CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const { referenceAnswer, studentAnswer, maxMarks } = req.body;

  if (!referenceAnswer || !studentAnswer || !maxMarks) {
    return res.status(400).json({ error: 'Missing referenceAnswer, studentAnswer, or maxMarks.' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GROQ_API_KEY not configured in environment variables.' });
  }

  const prompt = `You are an expert academic evaluator. Evaluate the student's answer against the reference answer.

REFERENCE ANSWER (Answer Key):
"""
${String(referenceAnswer).substring(0, 3000)}
"""

STUDENT ANSWER (Submission):
"""
${String(studentAnswer).substring(0, 3000)}
"""

MAXIMUM MARKS: ${maxMarks}

Respond ONLY with a valid JSON object — no markdown, no extra text, no code fences:
{
  "score": <number between 0 and ${maxMarks}>,
  "similarity_percentage": <number between 0 and 100>,
  "grade": "<A+ / A / B / C / D / F>",
  "strengths": ["<point 1>", "<point 2>", "<point 3>"],
  "missing_concepts": ["<concept 1>", "<concept 2>", "<concept 3>"],
  "suggestions": ["<suggestion 1>", "<suggestion 2>", "<suggestion 3>"],
  "overall_feedback": "<2-3 sentence overall assessment>"
}`;

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are an expert academic evaluator. Always respond with valid JSON only — no markdown, no extra text.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1000
      })
    });

    if (!groqRes.ok) {
      const errData = await groqRes.json().catch(() => ({}));
      return res.status(502).json({ error: 'Groq API error: ' + (errData?.error?.message || groqRes.status) });
    }

    const groqData = await groqRes.json();
    const rawText = groqData?.choices?.[0]?.message?.content || '';

    // Strip markdown fences if present
    const cleaned = rawText.replace(/```json|```/g, '').trim();

    let result;
    try {
      result = JSON.parse(cleaned);
    } catch {
      return res.status(500).json({ error: 'AI returned unexpected format. Please try again.' });
    }

    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
};

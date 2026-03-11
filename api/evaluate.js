module.exports = async function handler(req, res) {

  // ✅ CORS — allow requests from any frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request (browser sends this before POST)
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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured in environment variables.' });
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

Respond ONLY with a valid JSON object — no markdown, no extra text:
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
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1000 }
        })
      }
    );

    if (!geminiRes.ok) {
      const errData = await geminiRes.json().catch(() => ({}));
      return res.status(502).json({ error: 'Gemini API error: ' + (errData?.error?.message || geminiRes.status) });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

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

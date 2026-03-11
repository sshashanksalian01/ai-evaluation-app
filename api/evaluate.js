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

  const systemPrompt = `You are a strict, fair university professor. 
Evaluate the student's answer against the reference answer.
Return ONLY a valid JSON object. No markdown, no explanation, no extra text.`;

  const userPrompt = `REFERENCE ANSWER (Answer Key):
"""
${String(referenceAnswer).substring(0, 4000)}
"""

STUDENT ANSWER:
"""
${String(studentAnswer).substring(0, 4000)}
"""

MAXIMUM MARKS: ${maxMarks}

Respond with this exact JSON format:
{
  "score": <integer between 0 and ${maxMarks}>,
  "similarity_percentage": <integer 0-100>,
  "grade": "A+" or "A" or "B+" or "B" or "C" or "F",
  "strengths": ["point 1", "point 2", "point 3"],
  "missing_concepts": ["concept 1", "concept 2"],
  "suggestions": ["suggestion 1", "suggestion 2"],
  "overall_feedback": "2-3 sentence overall assessment"
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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 1200,
        response_format: { type: "json_object" }   // ← This forces clean JSON
      })
    });

    if (!groqRes.ok) {
      const errData = await groqRes.json().catch(() => ({}));
      return res.status(502).json({ 
        error: 'Groq API error: ' + (errData?.error?.message || groqRes.status) 
      });
    }

    const groqData = await groqRes.json();
    const rawText = groqData?.choices?.[0]?.message?.content || '';

    let result;
    try {
      result = JSON.parse(rawText.trim());
    } catch (parseErr) {
      return res.status(500).json({ error: 'AI returned unexpected format. Please try again.' });
    }

    // Safety clamp
    result.score = Math.min(Math.max(Math.floor(result.score || 0), 0), maxMarks);

    return res.status(200).json(result);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
};

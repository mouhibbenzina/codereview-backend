const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const reviewCode = async (code, language) => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `
You are an expert code reviewer. Analyze this ${language} code.
Respond ONLY with valid JSON, no markdown, no backticks:
{
  "summary": "2-3 sentence assessment",
  "score": <0-100>,
  "complexity": "low|medium|high",
  "bugs": [{"line": <number or null>, "description": "string", "severity": "critical|warning|info"}],
  "improvements": [{"description": "string"}],
  "bestPractices": [{"description": "string"}],
  "positives": [{"description": "string"}]
}

CODE:
${code}
`;
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('Gemini error:', err.message);
    return {
      summary: 'AI review temporarily unavailable.',
      score: null, complexity: 'unknown',
      bugs: [], improvements: [], bestPractices: [], positives: []
    };
  }
};

module.exports = { reviewCode };

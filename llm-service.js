class LLMService {
  constructor(config = {}) {
    this.endpoint = config.endpoint || 'http://localhost:11434/api/generate';
    this.model = config.model || 'mistral';
    this.apiKey = config.apiKey || '';
    this.isOllama = config.isOllama !== false;
  }

  async analyzePII(text) {
    const prompt = `Analyze the following text for any personally identifiable information (PII) or details that could be used to identify an anonymous internet user. Respond with a JSON object containing:
    1. "hasPII": boolean indicating if PII was found
    2. "confidence": number 0-1 indicating confidence in the assessment
    3. "details": brief explanation of what was found or why it's safe
    
    Text to analyze: ${text}`;

    try {
      if (this.isOllama) {
        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.model,
            prompt: prompt,
            stream: false
          })
        });
        const data = await response.json();
        return JSON.parse(data.response);
      } else {
        // OpenAI-compatible endpoint
        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model: this.model,
            messages: [{
              role: 'user',
              content: prompt
            }],
            temperature: 0.7
          })
        });
        const data = await response.json();
        return JSON.parse(data.choices[0].message.content);
      }
    } catch (error) {
      console.error('LLM analysis failed:', error);
      return {
        hasPII: false,
        confidence: 0,
        details: 'Analysis failed: ' + error.message,
        error: true
      };
    }
  }
}

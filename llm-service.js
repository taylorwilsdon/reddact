class LLMService {
  constructor(config = {}) {
    this.endpoint = config.endpoint || 'http://localhost:11434/api/generate';
    this.model = config.model || 'mistral';
    this.apiKey = config.apiKey || '';
    this.isOllama = config.isOllama !== false;
    this.batchSize = config.batchSize || 5;
    this.confidenceThreshold = config.confidenceThreshold || 0.7;
    this.customPrompt = config.customPrompt || '';
  }

  async analyzePII(text) {
    const basePrompt = this.customPrompt || `Analyze the following text for any personally identifiable information (PII) or details that could be used to identify an anonymous internet user. Consider:
    - Names, usernames, or nicknames
    - Locations (cities, schools, workplaces)
    - Ages, dates, or timeframes
    - Unique personal experiences or events
    - Contact information
    - References to relationships or connections
    - Unique characteristics or identifiers
    
    Respond with a JSON object containing:
    1. "hasPII": boolean indicating if PII was found
    2. "confidence": number 0-1 indicating confidence in the assessment
    3. "details": brief explanation of what was found or why it's safe
    4. "categories": array of found PII categories
    5. "suggestions": array of redaction suggestions`;

    const prompt = `${basePrompt}\n\nText to analyze: ${text}`;

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
  async analyzeBatch(texts) {
    const batches = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      batches.push(texts.slice(i, i + this.batchSize));
    }

    const results = [];
    for (const batch of batches) {
      const batchResults = await Promise.all(batch.map(text => this.analyzePII(text)));
      results.push(...batchResults);
    }

    return results;
  }

  meetsConfidenceThreshold(analysis) {
    return analysis.confidence >= this.confidenceThreshold;
  }

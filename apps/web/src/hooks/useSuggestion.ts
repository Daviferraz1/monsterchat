'use client';

import { useState, useCallback } from 'react';

export interface SuggestionResult {
  confidence: 'high' | 'medium' | 'low' | 'none';
  suggestion: string | null;
  category: string | null;
  alternatives: Array<{
    question_pattern: string;
    gold_response: string;
    frequency: number;
    similarity: number;
  }>;
}

export function useSuggestion() {
  const [result, setResult] = useState<SuggestionResult | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchSuggestion = useCallback(async (messageBody: string, brand?: string) => {
    if (!messageBody?.trim()) {
      setResult(null);
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/ia/suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageBody: messageBody.trim(), brand }),
      });
      const data = await res.json().catch(() => ({}));
      setResult({
        confidence: data.confidence ?? 'none',
        suggestion: data.suggestion ?? null,
        category: data.category ?? null,
        alternatives: data.alternatives ?? [],
      });
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => setResult(null), []);

  return { result, loading, fetchSuggestion, clear };
}

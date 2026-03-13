'use client';

import { useState, useEffect, useCallback } from 'react';

export function useAutopilot() {
  const [enabled, setEnabledState] = useState(false);
  const [suggestionEnabled, setSuggestionEnabledState] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/ia/autopilot');
      const data = await res.json().catch(() => ({}));
      setEnabledState(data.enabled === true);
      setSuggestionEnabledState(data.suggestionEnabled === true);
    } catch {
      setEnabledState(false);
      setSuggestionEnabledState(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { enabled, suggestionEnabled, loading, refresh: load };
}

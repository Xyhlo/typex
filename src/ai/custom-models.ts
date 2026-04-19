/**
 * Per-provider custom model IDs — user-typed identifiers that append to the
 * vendor's live model list. Useful for pre-release IDs, fine-tunes, and
 * OpenRouter/Together routing strings that don't show up in `/v1/models`.
 *
 * Stored in localStorage per provider; deliberately NOT in prefs to avoid
 * bundling a growing list into the session snapshot.
 */
import type { AIModel } from './provider';

const PREFIX = 'typex:ai:custom-models:';

export const getCustomModels = (providerId: string): AIModel[] => {
  try {
    const raw = localStorage.getItem(PREFIX + providerId);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      .map((id) => ({ id, label: id, note: 'custom' }));
  } catch {
    return [];
  }
};

export const addCustomModel = (providerId: string, modelId: string): void => {
  const cleaned = modelId.trim();
  if (!cleaned) return;
  const list = getCustomModels(providerId).map((m) => m.id);
  if (list.includes(cleaned)) return;
  list.push(cleaned);
  try {
    localStorage.setItem(PREFIX + providerId, JSON.stringify(list));
  } catch {
    /* ignore */
  }
};

export const removeCustomModel = (providerId: string, modelId: string): void => {
  const list = getCustomModels(providerId)
    .map((m) => m.id)
    .filter((id) => id !== modelId);
  try {
    if (list.length > 0) {
      localStorage.setItem(PREFIX + providerId, JSON.stringify(list));
    } else {
      localStorage.removeItem(PREFIX + providerId);
    }
  } catch {
    /* ignore */
  }
};

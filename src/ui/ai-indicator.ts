/**
 * Status-bar AI indicator — a small discreet pill that:
 *   - Shows just "AI" with a colored dot
 *   - Pulses accent while any request is in flight
 *   - Click cancels all in-flight requests
 *
 * The active model name is intentionally NOT shown here — it lives in the
 * right-click context menu header, the title attribute, and the Preferences
 * panel. The status bar should be quiet.
 */

import { subscribeAI, getInFlight, getActive, cancelAll } from '../ai/manager';
import { loadPrefs } from '../session';

export const initAIIndicator = (): void => {
  const pill = document.getElementById('status-ai') as HTMLButtonElement | null;
  const label = document.getElementById('status-ai-label');
  if (!pill || !label) return;

  pill.addEventListener('click', () => {
    if (getInFlight().length > 0) cancelAll();
  });

  subscribeAI(() => {
    const prefs = loadPrefs();
    if (!prefs.aiEnabled) {
      pill.hidden = true;
      return;
    }
    const active = getActive();
    const inFlight = getInFlight();
    pill.hidden = false;
    label.textContent = 'AI';
    if (inFlight.length > 0) {
      pill.dataset.state = 'busy';
      const f = inFlight[0];
      pill.title = `Streaming \u2014 ${f.providerId} / ${f.modelId}. Click to cancel.`;
    } else if (active) {
      pill.dataset.state = 'idle';
      pill.title = `${active.providerId} / ${active.modelId}`;
    } else {
      pill.dataset.state = 'unset';
      pill.title = 'Configure in Preferences \u2192 AI';
    }
  });
};

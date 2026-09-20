import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import { App } from './app';
import { applyLocale, detectLocale } from './i18n';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root is missing');

/**
 * Starts in the browser's language, loaded before anything is drawn so the first screen is not
 * English for a moment; an account's own choice replaces it once it is known (§8.4).
 */
async function start(root: HTMLElement): Promise<void> {
  await applyLocale(detectLocale());
  createRoot(root).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
}

void start(container);

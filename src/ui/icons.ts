// Small inline SVG icons drawn in the game's ink style.

export const REEL_SVG = `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="#f2b83b" stroke="#1d140f" stroke-width="3"/><circle cx="20" cy="20" r="4" fill="#1d140f"/>${[0, 1, 2, 3, 4, 5]
  .map((i) => {
    const a = (i / 6) * Math.PI * 2;
    return `<circle cx="${(20 + Math.cos(a) * 9.5).toFixed(1)}" cy="${(20 + Math.sin(a) * 9.5).toFixed(1)}" r="4" fill="#3a2e28"/>`;
  })
  .join('')}</svg>`;

export const COIN_SVG = `<svg class="coin" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="#f2b83b" stroke="#1d140f" stroke-width="3"/><circle cx="20" cy="20" r="12" fill="none" stroke="#b9801c" stroke-width="2.5"/><path d="M20 10l2.6 6.2 6.6.5-5 4.3 1.6 6.5L20 24l-5.8 3.5 1.6-6.5-5-4.3 6.6-.5z" fill="#ffd75e" stroke="#1d140f" stroke-width="1.8" stroke-linejoin="round"/></svg>`;

export const MAP_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M9 4v14M15 6v14" stroke="currentColor" stroke-width="2.4"/></svg>`;

export const PAUSE_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="5" height="16" rx="1.5" fill="currentColor"/><rect x="14" y="4" width="5" height="16" rx="1.5" fill="currentColor"/></svg>`;

export const HEART_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z" fill="#c8352b" stroke="#1d140f" stroke-width="2"/></svg>`;

import './ui/styles.css';
import { Game } from './game/Game';
import { loadProgress, saveProgress, type Progress } from './game/Save';

interface HotApi {
  snapshot?: (fn: () => unknown) => void;
  ready?: (start: (data: unknown) => void) => void;
  data?: unknown;
}
const hot = (window as unknown as { claude?: { hot?: HotApi } }).claude?.hot;

function start(data?: unknown) {
  // when the artifact viewer hot-swaps the page, carry the save across
  const carried = (data as { progress?: Progress } | undefined)?.progress;
  if (carried && carried.started && !loadProgress()?.started) saveProgress(carried);
  const app = document.getElementById('app') as HTMLElement;
  const game = new Game(app);
  hot?.snapshot?.(() => ({ progress: game.progress }));
  game.boot().catch((err) => {
    console.error(err);
    const ui = document.getElementById('ui');
    if (ui) {
      ui.innerHTML = `<div class="screen"><div class="panel card"><h2>The projector jammed!</h2><p class="lede">This game needs WebGL 2. Try a recent version of Chrome, Edge, Firefox or Safari.</p></div></div>`;
    }
  });
  (window as unknown as { __game: Game }).__game = game;
}

if (hot?.ready) hot.ready(start);
else start(hot?.data ?? {});

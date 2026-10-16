import { HEART_SVG } from './icons';

export class BossHUD {
  readonly root: HTMLElement;
  private hpCard: HTMLElement;
  private supers: HTMLElement;
  private fill: HTMLElement;
  private cards: HTMLElement[] = [];

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'bosshud';
    this.root.innerHTML = `
      <div class="bossbar"><div class="label">Baron Von Blackout</div><div class="track" role="progressbar" aria-label="Baron's health" aria-valuemin="0" aria-valuemax="100"><div class="fill"></div></div></div>
      <div class="hp"><div class="hpcard" aria-live="polite"></div><div class="supers" aria-label="Super meter"></div></div>`;
    parent.appendChild(this.root);
    this.hpCard = this.root.querySelector('.hpcard') as HTMLElement;
    this.supers = this.root.querySelector('.supers') as HTMLElement;
    this.fill = this.root.querySelector('.fill') as HTMLElement;
    for (let i = 0; i < 5; i++) {
      const c = document.createElement('i');
      c.innerHTML = '<b></b>';
      this.supers.appendChild(c);
      this.cards.push(c.firstElementChild as HTMLElement);
    }
    this.root.hidden = true;
  }

  show(v: boolean) {
    this.root.hidden = !v;
  }

  update(hearts: number, hpFrac: number, superCharge: number) {
    const txt = `HP ${Math.max(0, hearts)}`;
    if (this.hpCard.dataset.v !== txt) {
      this.hpCard.dataset.v = txt;
      this.hpCard.innerHTML = `${HEART_SVG.replace('<svg', '<svg style="width:20px;height:20px;vertical-align:-3px;margin-right:4px"')}${txt}`;
      this.hpCard.classList.toggle('low', hearts <= 1);
    }
    this.fill.style.width = `${(hpFrac * 100).toFixed(1)}%`;
    this.root.querySelector('.track')!.setAttribute('aria-valuenow', String(Math.round(hpFrac * 100)));
    this.cards.forEach((b, i) => (b.style.height = `${Math.max(0, Math.min(1, superCharge - i)) * 100}%`));
    this.supers.classList.toggle('full', superCharge >= 5);
  }
}

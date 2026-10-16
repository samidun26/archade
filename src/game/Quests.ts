import type { Indicator } from '../npc/NPC';
import type { Progress } from './Save';
import { REEL_ORDER } from '../ui/HUD';

// Everything the islanders say, keyed off the save state.

export interface QuestCtx {
  p: Progress;
  key: (a: 'interact' | 'jump' | 'dash' | 'fire' | 'super' | 'pause') => string;
  mapKey: string;
  lanternsLit: () => string[];
  kidsFound: () => string[];
  reelTaken: (id: string) => boolean;
  wallet: () => number;
}

export const REEL_NAMES: Record<string, string> = {
  lighthouse: 'Lighthouse',
  popcorn: 'Popcorn Cart',
  oak: 'Old Oak',
  ferris: 'Ferris Wheel',
  sky: 'Cloud Tops',
};

const LANTERN_HINTS: Record<string, string> = {
  'l-path': 'One stands right beside the path, toward town.',
  'l-stump': 'One sits atop the tall old stump to the south. Bounce off the orange mushroom.',
  'l-log': 'One waits at the far end of the long fallen log, north-east of me.',
  'l-cap': 'One is perched on the purple toadstool out west, near the shore.',
  'l-ring': 'One hides in the fairy ring of mushrooms, north of here.',
};

export const SHOP = [
  { id: 'heart', label: 'Extra Heart', price: 20, note: 'Take one more hit in the big fight.' },
  { id: 'twin', label: 'Twin Bolts', price: 35, note: 'Fire two bolts at once.' },
  { id: 'bowtie', label: 'Golden Bow Tie', price: 10, note: 'Purely for looking swell.' },
] as const;

export function reelCount(c: QuestCtx) {
  return REEL_ORDER.filter((r) => c.reelTaken(r)).length;
}

function nextHint(c: QuestCtx) {
  const has = (r: string) => c.reelTaken(r);
  if (!has('lighthouse')) return "Captain Bobber's lighthouse went dark. Try the *docks* to the south!";
  if (!has('popcorn')) return 'Madame Kettlecorn at the *carnival*, east of here, looked mighty frazzled.';
  if (!has('oak')) return '*Gloomwood* to the west is awful dark these days. Old Man Oak might know why.';
  if (!has('ferris')) return "Wheely the Ferris wheel's been grinning about something up at the *top*.";
  return 'Up north on *Lookout Bluff*, Gus swears a reel sailed into the clouds.';
}

export function indicatorFor(id: string, c: QuestCtx): Indicator {
  const talked = c.p.talked.includes(id);
  const n = reelCount(c);
  switch (id) {
    case 'mayor':
      if (!talked) return '!';
      return n === 5 && !c.p.bossBeaten ? '!' : null;
    case 'bobber':
      if (c.reelTaken('lighthouse')) return null;
      return talked ? '?' : '!';
    case 'kettlecorn':
      if (c.reelTaken('popcorn')) return null;
      if (!talked) return '!';
      if (c.kidsFound().length === 3 && !c.p.kidsDelivered) return '!';
      return c.p.kidsDelivered ? null : '?';
    case 'oak':
      if (c.reelTaken('oak')) return null;
      if (!talked) return '!';
      return c.lanternsLit().length === 5 ? '!' : '?';
    case 'wheely':
      return !talked && !c.reelTaken('ferris') ? '!' : null;
    case 'gus':
      return !talked && !c.reelTaken('sky') ? '!' : null;
    case 'penny':
      return '$';
    case 'mort':
      return talked ? null : '!';
    case 'tess':
      return n === 5 && !c.p.bossBeaten ? '!' : null;
  }
  return null;
}

export function objective(c: QuestCtx): { title: string; text: string; sub: string } {
  const n = reelCount(c);
  if (!c.p.talked.includes('mayor')) return { title: 'Objective', text: 'Talk to Mayor Gramophone', sub: 'He is by the fountain in Town Square.' };
  if (c.p.bossBeaten) return { title: 'The show goes on!', text: 'Explore Ballyhoo under the fireworks', sub: `Tokens found: ${c.p.tokens.length}` };
  if (n === 5) return { title: 'All reels found!', text: 'Bring the reels to the Big Top', sub: 'Talk to Tess at the ticket booth, north of the carnival.' };
  const subs: string[] = [];
  if (c.p.talked.includes('oak') && !c.reelTaken('oak')) subs.push(`Lanterns lit ${c.lanternsLit().length}/5`);
  if (c.p.talked.includes('kettlecorn') && !c.reelTaken('popcorn') && !c.p.kidsDelivered) subs.push(`Kernel Kids ${c.kidsFound().length}/3`);
  if (c.p.lighthouseLit && !c.reelTaken('lighthouse')) subs.push('Grab the reel on the lighthouse balcony');
  if (c.p.kidsDelivered && !c.reelTaken('popcorn')) subs.push('Grab the reel by the popcorn cart');
  if (c.lanternsLit().length === 5 && !c.reelTaken('oak')) subs.push("Climb Old Oak's crown");
  return {
    title: 'Objective',
    text: `Find the lost film reels (${n}/5)`,
    sub: subs.length ? subs.join(' · ') : `Press ${c.mapKey} for the map. Folks with a bubble want a word.`,
  };
}

export interface Talk {
  lines: string[];
  choices?: Array<{ label: string; note?: string; disabled?: boolean }>;
  /** Called with the chosen index (or -1) after the dialogue closes. */
  after?: (choice: number) => void;
}

export function talkFor(id: string, c: QuestCtx, actions: { deliverKids: () => void; enterBigTop: () => void; buy: (item: string) => boolean }): Talk {
  const p = c.p;
  const first = !p.talked.includes(id);
  const mark = () => {
    if (!p.talked.includes(id)) p.talked.push(id);
    p.started = true;
  };
  const n = reelCount(c);
  switch (id) {
    case 'mayor': {
      if (first)
        return {
          lines: [
            'Well, bless my brass horn! A visitor! Welcome to *Ballyhoo Island*, young sprout!',
            'Tonight is the Grand Picture Show at the Big Top... or it WAS, until that no-good *Baron Von Blackout* blew into town!',
            'That dastardly storm cloud scattered our *five film reels* clear across the island and padlocked the Big Top!',
            "You've got a bright head on your shoulders. Literally! Find those reels and the show goes on!",
            'Folks have spotted them. Ask *Captain Bobber* at the docks, *Madame Kettlecorn* at the carnival, and *Old Man Oak* in Gloomwood.',
            `And Gus the weathervane swears one blew up into the *Cumulus Isles*. Press *${c.mapKey}* if you get turned around!`,
          ],
          after: mark,
        };
      if (p.bossBeaten) return { lines: ["You saved the show, kid! The whole island's talking about it. Enjoy the fireworks!"] };
      if (n === 5)
        return { lines: ['All five reels! Hot diggity dog! Take them to *Tess* at the Big Top ticket booth, north of the carnival.', 'Give that Baron what for!'] };
      return { lines: [`You've found *${n} of 5* reels. Swell work!`, nextHint(c)] };
    }
    case 'bobber': {
      if (c.reelTaken('lighthouse'))
        return { lines: ["Old Blinky ain't shone this bright since '29! Ye've got a sailor's heart, kid.", 'Ever try fishin\' with a bobber for a head? Neither have I. Wait.'] };
      if (p.lighthouseLit) return { lines: ["Shiver me timbers, she's SHININ'! Now grab that reel off the balcony before the gulls do!"] };
      if (first)
        return {
          lines: [
            "Ahoy, matey! Cap'n Bobber's the name, and bobbin' is me game.",
            'That blasted Baron huffed and puffed and blew out *Old Blinky*, me lighthouse lamp!',
            'Worse, he knocked a film reel up there and smashed half me stairs. Climb up and give that lamp a spark of your own!',
            `Mind the gaps near the top. Tap *${c.key('jump')}* again in midair for a *double jump*!`,
          ],
          after: mark,
        };
      return { lines: ["Old Blinky's still dark, matey. Up the spiral stairs, west along the beach!"] };
    }
    case 'kettlecorn': {
      const k = c.kidsFound().length;
      if (c.reelTaken('popcorn')) return { lines: ["My kernels haven't stopped dancing since you brought them home. Neither have I!"] };
      if (p.kidsDelivered) return { lines: ["Go on, darling, the reel's right there by my wheels!"] };
      if (k === 3 && !first)
        return {
          lines: ['My babies! All three of them! Oh, I could just POP!', "Here, darling. I've been keeping this warm for you: a genuine *film reel*!"],
          after: () => actions.deliverKids(),
        };
      if (first)
        return {
          lines: [
            'Oh, darling, you simply MUST help me! My three little *Kernel Kids* popped clean out of the kettle when the Baron stormed by!',
            'One loves hiding behind the *tents*, one adores the *carousel*, and the third climbs anything *stacked*, the rascal!',
            "Bring my babies home and I'll give you the treasure I've been keeping warm: a *film reel*!",
          ],
          after: () => {
            mark();
            if (c.kidsFound().length === 3) actions.deliverKids();
          },
        };
      return { lines: [`*${k} of 3* kernels home. Keep looking, sugar! Tents, carousel, crates!`] };
    }
    case 'oak': {
      const lit = c.lanternsLit();
      if (c.reelTaken('oak')) return { lines: ['Thank you, little light. Come keep an old tree company sometime. Hrrrm.'] };
      if (lit.length === 5)
        return { lines: ['I can SEE again! Hrrrmmm-hah!', "Climb the shelf fungus up my trunk to the top of my crown. That reel's been tickling me for days."], after: mark };
      if (first)
        return {
          lines: [
            "Hrrrmmm... who goes there? Speak up, my eyes aren't what they once were...",
            "Ahh, a little lightbulb. How fitting. The Baron's gloom snuffed out *five lanterns* in my wood, and now I can't see a thing.",
            "Just touch each lantern and your glow will light it. When all five burn, I'll show you what's tangled in my branches.",
          ],
          after: mark,
        };
      const unlit = Object.keys(LANTERN_HINTS).find((id) => !lit.includes(id));
      return { lines: [`*${lit.length} of 5* lanterns lit. Hrrm. I can feel the warmth returning...`, unlit ? LANTERN_HINTS[unlit] : ''] };
    }
    case 'wheely': {
      if (c.reelTaken('ferris')) return { lines: ["Whee! You're a natural, kid. Come back and ride anytime!"] };
      return {
        lines: [
          "Step right up, step right up! Wheely's the name, round-and-round's the game!",
          'That bully Baron hung a *film reel* right on my tippy-top. Hop in a car at the bottom and ride on up!',
          "When you reach the top, jump up and grab it. Just don't look down! Hee-hee!",
        ],
        after: mark,
      };
    }
    case 'gus': {
      if (c.reelTaken('sky')) return { lines: ["Ya made it to the clouds and back! Bwaaawk! That's somethin' to crow about!"] };
      return {
        lines: [
          'Bwaaawk! Wind blew from the south, kid, and so did that reel! Right up into the *Cumulus Isles*.',
          'Bounce off the mushroom at the cliff edge, ride the clouds, and climb to the very top isle.',
          "Fall in the drink and you'll wash up on the last island you stood on. No harm done!",
          `There's a balloon up top to float you back down. And don't forget your *${c.key('dash')}* dash for the long gaps. Bwak!`,
        ],
        after: mark,
      };
    }
    case 'penny': {
      const w = c.wallet();
      const choices: Array<{ label: string; note?: string; disabled?: boolean }> = SHOP.map((it) => {
        const owned = p.shop[it.id];
        return {
          label: owned ? `${it.label} (owned)` : `${it.label} · ${it.price}¢`,
          note: it.note,
          disabled: owned || w < it.price,
        };
      });
      choices.push({ label: 'Just looking', note: '', disabled: false });
      return {
        lines: [first ? "Well hello, sugar! Penny Piggybank at your service. Got *tokens* jingling in those pockets?" : `You've got *${w}¢* to spend. What'll it be?`],
        choices,
        after: (i) => {
          mark();
          if (i >= 0 && i < SHOP.length) actions.buy(SHOP[i].id);
        },
      };
    }
    case 'mort': {
      const tips = [
        `Mail call! Hold *${c.key('jump')}* longer to jump higher, and tap it again in the air for a *double jump*.`,
        `Dash with *${c.key('dash')}*. You get one in midair too, swell for long gaps!`,
        'Mushrooms make swell springboards. Land on one and hold on to your hat!',
        "Tokens near you zip right into your pockets. Spend 'em at Penny's bank by the fountain.",
        `Lost? Press *${c.mapKey}* for the map. Folks with a bubble over their head want a word.`,
        'That strongman bell at the carnival? Bounce on the red pad and ring it. It pays out!',
      ];
      const i = (p.talked.filter((t) => t === 'mort').length + Math.floor(Math.random() * tips.length)) % tips.length;
      return { lines: [tips[i]], after: mark };
    }
    case 'tess': {
      if (p.bossBeaten) return { lines: ['Best show in the history of Ballyhoo! Enjoy the fireworks, star!'] };
      if (n < 5)
        return { lines: [`Sorry, hon. The Baron padlocked the Big Top, and no show starts without *all five reels*. You've got *${n}*.`], after: mark };
      return {
        lines: ["Five reels! Well, I'll be punched! The Baron's squatting on the roof, howling up a storm.", 'Ready to face *Baron Von Blackout*?'],
        choices: [
          { label: "Let's go!", note: 'Head up to the roof of the Big Top.' },
          { label: 'Not yet', note: 'Explore a little longer first.' },
        ],
        after: (i) => {
          mark();
          if (i === 0) actions.enterBigTop();
        },
      };
    }
  }
  return { lines: ['...'] };
}

export const KID_LINES = ['Pop! You found me!', "Whee! Take me home, I'm toasty!", 'Pop-pop! Mama Kettlecorn!'];

import { describe, expect, it } from 'vitest';
import { detectLanguage } from '../src/language';
import { fold } from '../src/normalize';
import { REFINE_THRESHOLD, classifyWithRules, maskTemplate } from '../src/rules';
import type { Review } from '../src/types';

const classify = (text: string, extra: Partial<Review> = {}) => classifyWithRules({ id: 't', text, ...extra });

describe('fold', () => {
  it('keeps every offset so evidence points at the original text', () => {
    const text = 'Está BUENÍSIMO, ñandú’s';
    expect(fold(text)).toHaveLength(text.length);
    expect(fold(text)).toBe("esta buenisimo, nandu's");
  });
});

describe('categories', () => {
  it('reports a crash as a high priority bug', () => {
    const r = classify('The game crashes every time I load my save. Unplayable.', { recommended: false });
    expect(r).toMatchObject({ category: 'bug', sentiment: 'negative', priority: 'high' });
  });

  it('reads "no bugs" as praise, not as a bug', () => {
    const r = classify('No bugs, runs great on my Steam Deck!', { recommended: true });
    expect(r).toMatchObject({ category: 'praise', sentiment: 'positive' });
  });

  it('gives more weight to what comes after "but"', () => {
    expect(classify('Great art, but it crashes every hour').category).toBe('bug');
    expect(classify('Not bad, but way too short').category).toBe('complaint');
  });

  it('treats praise in a wish as a suggestion', () => {
    expect(classify('Would be perfect with co-op').category).toBe('suggestion');
  });

  it('lets a request beat filler praise', () => {
    expect(classify('Love it! Please add a photo mode').category).toBe('suggestion');
  });

  it('finds questions with or without a question mark', () => {
    expect(classify('Is there controller support?')).toMatchObject({ category: 'question', priority: 'medium' });
    expect(classify('el juego tiene subtitulos en español?').category).toBe('question');
    expect(classify('how do i change the language').category).toBe('question');
  });

  it('does not take a rhetorical question for a real one', () => {
    expect(classify('They removed the photo mode?? Why would you do that').category).toBe('complaint');
  });

  it('keeps a concrete bug report even inside a positive review', () => {
    const r = classify('One of the best cozy games this year. The bird sometimes clips through the dock. Minor.');
    expect(r.category).toBe('bug');
    expect(r.priority).toBe('medium');
  });

  it('does not count vague, mitigated bugs as a bug report', () => {
    expect(classify('Fun game with a few minor bugs').category).toBe('praise');
  });

  it('flags insults and threats aimed at people', () => {
    expect(classify('the devs are clowns, uninstalling')).toMatchObject({ category: 'toxic', priority: 'medium' });
    expect(classify('I know where your studio is, kys')).toMatchObject({ category: 'toxic', priority: 'high' });
  });

  it('does not take swearing as toxic', () => {
    expect(classify('This game is fucking amazing').category).toBe('praise');
  });

  it('catches spam, including links written to dodge filters', () => {
    expect(classify('Free skins at www.freeskinz.ru check out my channel').category).toBe('spam');
    expect(classify('Great game! Grab it cheaper at keysbargain dot shop with code DRIFT70').category).toBe('spam');
    expect(classify('🔥 FREE SKINS 🔥 link in bio').sentiment).toBe('neutral');
  });

  it('reads price per hour of play', () => {
    expect(classify('$60 for 3 hours of content.').category).toBe('complaint');
  });

  it('only counts the ticked boxes of a template review', () => {
    const text = '---{ Graphics }--- ☐ Bad ☑ Beautiful ---{ Bugs }--- ☑ Never heard of ☐ Minor bugs ☐ The game is a big bug';
    const masked = maskTemplate(text);
    expect(masked).toHaveLength(text.length);
    expect(masked).not.toContain('Bad');
    expect(classify(text)).toMatchObject({ category: 'praise', sentiment: 'positive' });
  });
});

describe('Spanish and Chilean slang', () => {
  it('knows "la raja" and "buenísimo"', () => {
    const r = classify('Está buenísimo, la raja!!', { recommended: true });
    expect(r).toMatchObject({ category: 'praise', sentiment: 'positive', language: 'es' });
    expect(r.evidence.map((e) => e.text)).toContain('buenísimo');
  });

  it('knows that "se pega" is a freeze and "fome" is boring', () => {
    expect(classify('Se pega todo el rato en la pantalla de carga').category).toBe('bug');
    expect(classify('Muy fome y repetitivo, esperen una oferta')).toMatchObject({ category: 'complaint', sentiment: 'negative' });
  });

  it('handles negation: "sin bugs", "no me gustó"', () => {
    expect(classify('Corre fluido y sin bugs').category).toBe('praise');
    expect(classify('No me gustó para nada').sentiment).toBe('negative');
  });

  it('reads "¿cuándo sale…?" as a question', () => {
    expect(classify('¿Cuándo sale la versión para Switch?').category).toBe('question');
  });
});

describe('Steam thumbs', () => {
  it('ignores the thumb when the text gives no opinion', () => {
    expect(classify('Crab.', { recommended: true }).sentiment).toBe('neutral');
  });

  it('reads praise with a thumbs down as sarcasm', () => {
    const r = classify('Best game ever. Totally worth the $30 for 2 hours of content.', { recommended: false });
    expect(r).toMatchObject({ sentiment: 'negative', category: 'complaint' });
  });

  it('reads complaints with a thumbs up as a mixed review', () => {
    expect(classify('Recommended, but barely. Controls are floaty and the camera fights you.', { recommended: true }).sentiment).toBe('neutral');
  });

  it('flips the thumb when the player says it was a mistake', () => {
    expect(classify('Amazing game, I clicked no by mistake', { recommended: false }).sentiment).toBe('positive');
  });

  it('raises the priority of negative reviews many shoppers will see', () => {
    expect(classify('Boring and overpriced.', { recommended: false }).priority).toBe('medium');
    expect(classify('Boring and overpriced.', { recommended: false, helpfulVotes: 40 }).priority).toBe('high');
  });
});

describe('confidence and language', () => {
  it('is low when there is nothing to go on, so Claude gets a look', () => {
    expect(classify('Crab.').confidence).toBeLessThan(REFINE_THRESHOLD);
    expect(classify('Das Spiel ist wunderschön, aber viel zu kurz.')).toMatchObject({ language: 'und' });
    expect(classify('Das Spiel ist wunderschön, aber viel zu kurz.').confidence).toBeLessThan(REFINE_THRESHOLD);
  });

  it('is high when the evidence is clear', () => {
    expect(classify('Crashes on launch, black screen, unplayable').confidence).toBeGreaterThanOrEqual(REFINE_THRESHOLD);
  });

  it('tells English from Spanish', () => {
    expect(detectLanguage('This is the best game I have played this year')).toBe('en');
    expect(detectLanguage('Es el mejor juego que he jugado este año')).toBe('es');
    expect(detectLanguage('ゲームが面白い')).toBe('und');
  });
});

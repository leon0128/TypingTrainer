// @vitest-environment jsdom
import type { LanguageRating, MatchRating } from '@typing-trainer/contracts';
import { RANK_TIERS, rankSteps } from '@typing-trainer/typing-engine';
import { cleanup, render, screen, within } from '@testing-library/react';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { RatingResult } from '../src/features/rating/RatingResult';
import { LanguageRatings, RatingSummary } from '../src/features/rating/RatingSummary';
import { rankIconSrc, rankShift, standingOf, standingWith } from '../src/features/rating/standing';

afterEach(cleanup);

const language = (
  slug: LanguageRating['language'],
  rating: number,
  gamesPlayed = rating === 0 ? 0 : 10,
): LanguageRating => ({
  language: slug,
  displayName:
    slug === 'typescript' ? 'TypeScript' : (slug[0]?.toUpperCase() ?? '') + slug.slice(1),
  rating,
  gamesPlayed,
});

describe('standing', () => {
  it('works the overall rating and rank out of the language ratings', () => {
    const languages = [language('python', 2000), language('go', 0)];
    expect(standingOf(languages, 'code')).toMatchObject({
      total: 1000,
      rank: { tier: 'silver', division: 4 },
    });
  });

  it('swaps one language for another rating without touching the rest', () => {
    const languages = [language('python', 1000), language('go', 500)];
    const before = standingWith(languages, 'python', 200);
    expect(before.total).toBe(Math.round(500 * 0.5 + 200 * 0.4));
    expect(standingOf(languages, 'code').total).toBe(Math.round(1000 * 0.5 + 500 * 0.4));
  });

  it("counts only the asked track's languages, so another track's ratings never leak in", () => {
    const languages = [
      language('python', 2000),
      language('ja-word', 2000),
      language('en-line', 400),
    ];
    expect(standingOf(languages, 'code').total).toBe(1000);
    expect(standingOf(languages, 'natural-ja').total).toBe(1000);
    expect(standingOf(languages, 'natural-en').total).toBe(200);
    expect(standingOf([], 'natural-en').total).toBe(0);
  });

  it('rates the track of the language a match was played in', () => {
    const languages = [language('python', 2000), language('ja-word', 0)];
    expect(standingWith(languages, 'ja-word', 2000).total).toBe(1000);
    expect(standingWith(languages, 'python', 0).total).toBe(0);
  });

  it('orders ranks by tier, then division', () => {
    expect(rankShift({ tier: 'gold', division: 5 }, { tier: 'platinum', division: 1 })).toBe(1);
    expect(rankShift({ tier: 'gold', division: 2 }, { tier: 'gold', division: 1 })).toBe(-1);
    expect(rankShift({ tier: 'gold', division: 2 }, { tier: 'gold', division: 2 })).toBe(0);
    expect(rankShift({ tier: 'diamond', division: 5 }, { tier: 'master', division: null })).toBe(1);
  });

  it('has an icon file, placeholder or final, for every rank', () => {
    const steps = rankSteps(4);
    expect(steps).toHaveLength(31);
    for (const rank of steps) {
      for (const theme of ['light', 'dark'] as const) {
        const src = rankIconSrc(rank, theme);
        expect(existsSync(resolve(__dirname, '../public', src.slice(1))), src).toBe(true);
      }
    }
    expect(RANK_TIERS).toHaveLength(7);
  });
});

describe('RankIcon', () => {
  it('has a light and a dark icon for the rank, and the stylesheet shows one', () => {
    const { container } = render(<RatingSummary languages={[language('python', 0)]} />);
    const icons = [...container.querySelectorAll('img.rank-icon')].map((icon) =>
      icon.getAttribute('src'),
    );
    expect(icons).toEqual(['/ranks/light/rank-beginner-1.svg', '/ranks/dark/rank-beginner-1.svg']);
  });
});

describe('RatingSummary', () => {
  it('shows the rank, the overall rating, and the way to the next rank', () => {
    render(<RatingSummary languages={[language('python', 2000), language('go', 0)]} />);
    const summary = within(screen.getByRole('region', { name: 'Rating' }));
    expect(summary.getByText('Silver 4')).toBeTruthy();
    expect(summary.getByText('1000')).toBeTruthy();
    expect(summary.getByText('18 to Silver 5')).toBeTruthy();
    expect(summary.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('80');
  });

  it('starts a new player in Beginner 1 with nothing to show for any language', () => {
    render(<RatingSummary languages={[language('python', 0), language('go', 0)]} />);
    expect(screen.getByText('Beginner 1')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
  });

  it('has no next rank to ask for at Master', () => {
    const maxed = ['typescript', 'go', 'java', 'python'] as const;
    render(<RatingSummary languages={maxed.map((slug) => language(slug, 2000))} />);
    expect(screen.getByText('Master')).toBeTruthy();
    expect(screen.getByText('You have reached the top rank')).toBeTruthy();
  });
});

describe('LanguageRatings', () => {
  it('lists every language, saying unplayed for the ones with no match', () => {
    render(<LanguageRatings languages={[language('python', 812), language('go', 0)]} />);
    const list = within(screen.getByRole('list'));
    expect(list.getByText('Python')).toBeTruthy();
    expect(list.getByText('812')).toBeTruthy();
    expect(list.getByText('Go')).toBeTruthy();
    expect(list.getByText('Unplayed')).toBeTruthy();
    expect(
      list.getByRole('progressbar', { name: 'Python rating' }).getAttribute('aria-valuenow'),
    ).toBe('41');
  });
});

describe('RatingResult', () => {
  const match = (before: number, after: number, other = 0): MatchRating => ({
    language: 'python',
    before,
    after,
    languages: [language('python', after), language('go', other)],
  });

  it('shows the language and overall rating before and after, with the signs written', () => {
    render(<RatingResult rating={match(1000, 1019)} />);
    expect(screen.getByRole('heading', { name: 'Rating change' })).toBeTruthy();
    expect(screen.getByText('Python rating')).toBeTruthy();
    expect(screen.getByText('+19')).toBeTruthy();
    // The overall rating moves by half of that (the best language counts at 0.5).
    expect(screen.getByText('+10')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('announces a promotion and what the rank was', () => {
    // 560 → 612 crosses from Beginner 5 (280) into Bronze 1 (306).
    const { container } = render(<RatingResult rating={match(560, 612)} />);
    expect(screen.getByRole('status').textContent).toBe('Promoted! Bronze 1');
    expect(screen.getByText('(was Beginner 5)')).toBeTruthy();
    expect(container.querySelector('.rating-shift.is-up')).not.toBeNull();
  });

  it('announces a demotion, with a minus sign and not a hyphen', () => {
    render(<RatingResult rating={match(612, 560)} />);
    expect(screen.getByRole('status').textContent).toBe('Demoted… Beginner 5');
    expect(screen.getByText('−52')).toBeTruthy();
  });

  it('says ±0 when nothing moved, as at 0 after a loss', () => {
    render(<RatingResult rating={match(0, 0)} />);
    expect(screen.getAllByText('±0')).toHaveLength(2);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { APP_TITLE, ROUTE_NAMES, defaultScreens, resolveRoute, routeTitle } from './router';

describe('route titles', () => {
  it('every route has a non-empty title that names the app', () => {
    for (const name of ROUTE_NAMES) {
      const t = routeTitle(name);
      expect(t.length).toBeGreaterThan(0);
      expect(t).toContain(APP_TITLE);
    }
  });

  it('the main menu is just the app name and every sub-screen is "<screen> - <app>"', () => {
    expect(routeTitle('main')).toBe(APP_TITLE);
    for (const name of ROUTE_NAMES.filter((n) => n !== 'main')) expect(routeTitle(name).endsWith(` - ${APP_TITLE}`)).toBe(true);
  });

  it('titles are distinct so tabs and screen readers tell screens apart', () => {
    const titles = ROUTE_NAMES.map(routeTitle);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('titles never show the retired mode words to players', () => {
    for (const name of ROUTE_NAMES) expect(routeTitle(name)).not.toMatch(/classic|arcade|ruleset|capture/i);
  });

  it('every route a hash can resolve to has a screen factory', () => {
    const screens = defaultScreens();
    for (const name of ROUTE_NAMES) expect(typeof screens[name]).toBe('function');
    expect(typeof screens[resolveRoute('#help').name]).toBe('function');
  });
});

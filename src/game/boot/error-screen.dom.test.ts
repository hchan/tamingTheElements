// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { showErrorScreen, showWebglError } from './error-screen';

describe('showWebglError', () => {
  it('replaces the previous content with one alert that says WebGL is required', () => {
    const root = document.createElement('div');
    root.append(document.createElement('canvas'), document.createElement('span'));
    showWebglError(root);
    expect(root.children).toHaveLength(1);
    expect(root.querySelector('canvas')).toBeNull();
    const alert = root.firstElementChild as HTMLElement;
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.querySelector('h1')?.textContent).toBe('WebGL is required');
    expect(alert.querySelector('p')?.textContent).toMatch(/hardware acceleration/);
  });
});

describe('showErrorScreen', () => {
  it('shows the title and message as text and links back to the main menu by default', () => {
    const root = document.createElement('div');
    root.append(document.createElement('p'));
    showErrorScreen(root, 'The battle could not start', 'boom');
    expect(root.children).toHaveLength(1);
    expect(root.querySelector('[role="alert"] h1')?.textContent).toBe('The battle could not start');
    expect(root.querySelector('p')?.textContent).toBe('boom');
    expect(root.querySelector('a')?.getAttribute('href')).toBe('#main');
  });

  it('honours a custom back route', () => {
    const root = document.createElement('div');
    showErrorScreen(root, 't', 'm', '#garrison');
    expect(root.querySelector('a')?.getAttribute('href')).toBe('#garrison');
  });

  it('never interprets the message as HTML', () => {
    const root = document.createElement('div');
    showErrorScreen(root, '<b>x</b>', '<img src=x onerror=alert(1)>');
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('b')).toBeNull();
    expect(root.querySelector('p')?.textContent).toBe('<img src=x onerror=alert(1)>');
  });
});

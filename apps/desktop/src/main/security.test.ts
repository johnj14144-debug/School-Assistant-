import { describe, expect, it } from 'vitest';
import { isAllowedNavigation, isSafeExternalUrl } from './security';

describe('isSafeExternalUrl', () => {
  it('accepts web and mail links', () => {
    expect(isSafeExternalUrl('https://openstax.org/details/books/calculus-volume-1')).toBe(true);
    expect(isSafeExternalUrl('http://example.com')).toBe(true);
    expect(isSafeExternalUrl('mailto:someone@uh.edu')).toBe(true);
  });

  it('rejects local files, custom schemes and garbage', () => {
    expect(isSafeExternalUrl('file:///C:/Windows/System32/cmd.exe')).toBe(false);
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('ms-settings:')).toBe(false);
    expect(isSafeExternalUrl('not a url')).toBe(false);
    expect(isSafeExternalUrl('')).toBe(false);
  });
});

describe('isAllowedNavigation', () => {
  it('allows only the dev server origin while developing', () => {
    const policy = { devServerUrl: 'http://localhost:5173/' };
    expect(isAllowedNavigation('http://localhost:5173/index.html#/today', policy)).toBe(true);
    expect(isAllowedNavigation('http://localhost:5173/other', policy)).toBe(true);
    expect(isAllowedNavigation('http://localhost:5174/', policy)).toBe(false);
    expect(isAllowedNavigation('https://evil.example', policy)).toBe(false);
    expect(isAllowedNavigation('file:///C:/app/out/renderer/index.html', policy)).toBe(false);
  });

  it('allows only the bundled file:// pages in production', () => {
    const policy = {};
    expect(isAllowedNavigation('file:///C:/app/out/renderer/index.html#/grades', policy)).toBe(
      true,
    );
    expect(isAllowedNavigation('https://evil.example', policy)).toBe(false);
    expect(isAllowedNavigation('http://localhost:5173/', policy)).toBe(false);
  });

  it('rejects unparsable URLs', () => {
    expect(isAllowedNavigation('nope', {})).toBe(false);
    expect(isAllowedNavigation('https://ok.example', { devServerUrl: 'nope' })).toBe(false);
  });
});

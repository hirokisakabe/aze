import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTweaks } from '../../tweaks-panel';

const STORAGE_KEY = 'aze:tweaks';
const defaults = {
  vibe: 'editor',
  sidebar: 'compact',
  measure: 1200,
  fontSize: 17,
  accent: '#5b6b86',
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('useTweaks', () => {
  it('初期値は defaults を返す', () => {
    const { result } = renderHook(() => useTweaks(defaults));
    expect(result.current[0]).toEqual(defaults);
  });

  it('localStorage に保存済みの値があれば復元する', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...defaults, vibe: 'quiet', fontSize: 19 }));
    const { result } = renderHook(() => useTweaks(defaults));
    expect(result.current[0].vibe).toBe('quiet');
    expect(result.current[0].fontSize).toBe(19);
  });

  it('localStorage の JSON が壊れている場合は defaults にフォールバックする', () => {
    localStorage.setItem(STORAGE_KEY, 'not-valid-json{{{');
    const { result } = renderHook(() => useTweaks(defaults));
    expect(result.current[0]).toEqual(defaults);
  });

  it('localStorage に存在しないキーは defaults の値を使う', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ unknownKey: 'value' }));
    const { result } = renderHook(() => useTweaks(defaults));
    expect(result.current[0]).toEqual(defaults);
  });

  it('setTweak で値を変更すると localStorage に保存される', async () => {
    const { result } = renderHook(() => useTweaks(defaults));
    act(() => {
      result.current[1]('vibe', 'quiet');
    });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.vibe).toBe('quiet');
  });

  it('setTweak で複数の値を変更すると最新状態が localStorage に反映される', async () => {
    const { result } = renderHook(() => useTweaks(defaults));
    act(() => {
      result.current[1]('fontSize', 20);
    });
    act(() => {
      result.current[1]('measure', 900);
    });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.fontSize).toBe(20);
    expect(stored.measure).toBe(900);
  });
});

import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { useRepositorySubscription } from './use-repository-subscription';

describe('useRepositorySubscription', () => {
  it('購読前は undefined を返す', () => {
    const subscribe = vi.fn(() => vi.fn());
    const { result } = renderHook(() => useRepositorySubscription<number>(subscribe));
    expect(result.current).toBeUndefined();
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('listener へ流れてきた値を返す', () => {
    let emit: (value: number) => void = () => {};
    const subscribe = (listener: (value: number) => void) => {
      emit = listener;
      return vi.fn();
    };
    const { result } = renderHook(() => useRepositorySubscription<number>(subscribe));
    act(() => emit(42));
    expect(result.current).toBe(42);
    act(() => emit(7));
    expect(result.current).toBe(7);
  });

  it('アンマウント時に unsubscribe を呼ぶ', () => {
    const unsubscribe = vi.fn();
    const subscribe = vi.fn(() => unsubscribe);
    const { unmount } = renderHook(() => useRepositorySubscription<number>(subscribe));
    expect(unsubscribe).not.toHaveBeenCalled();
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('subscribe の参照が変わると再購読する', () => {
    const firstUnsub = vi.fn();
    const first = vi.fn(() => firstUnsub);
    const second = vi.fn(() => vi.fn());
    const { rerender } = renderHook(
      ({ subscribe }) => useRepositorySubscription<number>(subscribe),
      {
        initialProps: { subscribe: first },
      }
    );
    expect(first).toHaveBeenCalledTimes(1);
    rerender({ subscribe: second });
    expect(firstUnsub).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});

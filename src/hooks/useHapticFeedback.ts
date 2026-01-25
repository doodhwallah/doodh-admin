import { useCallback } from 'react';
import { triggerHaptic } from './useCapacitor';

type HapticType = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

/**
 * A simplified hook for triggering haptic feedback in components.
 * Use this for non-button interactions like form submissions, status changes, etc.
 */
export function useHapticFeedback() {
  const light = useCallback(() => triggerHaptic('light'), []);
  const medium = useCallback(() => triggerHaptic('medium'), []);
  const heavy = useCallback(() => triggerHaptic('heavy'), []);
  const success = useCallback(() => triggerHaptic('success'), []);
  const warning = useCallback(() => triggerHaptic('warning'), []);
  const error = useCallback(() => triggerHaptic('error'), []);

  /**
   * Trigger haptic feedback with a specific type
   */
  const trigger = useCallback((type: HapticType = 'light') => {
    triggerHaptic(type);
  }, []);

  /**
   * Wrap a callback with haptic feedback
   */
  const withHaptic = useCallback(
    <T extends (...args: unknown[]) => unknown>(
      callback: T,
      type: HapticType = 'light'
    ) => {
      return ((...args: Parameters<T>) => {
        triggerHaptic(type);
        return callback(...args);
      }) as T;
    },
    []
  );

  /**
   * Wrap an async callback with success/error haptic feedback
   */
  const withResultHaptic = useCallback(
    <T extends (...args: unknown[]) => Promise<unknown>>(callback: T) => {
      return (async (...args: Parameters<T>) => {
        try {
          const result = await callback(...args);
          triggerHaptic('success');
          return result;
        } catch (e) {
          triggerHaptic('error');
          throw e;
        }
      }) as T;
    },
    []
  );

  return {
    light,
    medium,
    heavy,
    success,
    warning,
    error,
    trigger,
    withHaptic,
    withResultHaptic,
  };
}

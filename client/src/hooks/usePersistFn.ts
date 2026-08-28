import { useRef } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
type noop = (...args: any[]) => any;

/**
 * usePersistFn instead of useCallback to reduce cognitive load
 */
export function usePersistFn<T extends noop>(fn: T) {
  const fnRef = useRef<T>(fn);
  fnRef.current = fn;

  const persistFn = useRef<T | null>(null);
  if (!persistFn.current) {
    persistFn.current = ((...args: any[]) => (fnRef.current as noop)(...args)) as T;
  }

  return persistFn.current;
}

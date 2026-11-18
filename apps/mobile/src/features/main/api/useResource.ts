import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { ApiError } from '../../auth/api/client';

// Only the focused, foreground screen polls. Abort and generation checks prevent stale account/route responses.
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>, intervalMs = 0) {
  const [state, setState] = useState<{ owner: typeof load; data?: T; error?: string; loading: boolean }>();
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const running = useRef(false);
  const refresh = useCallback(async () => {
    controller.current?.abort();
    const current = ++generation.current, request = new AbortController();
    controller.current = request;
    running.current = true;
    setState(previous => ({ owner: load, data: previous?.owner === load ? previous.data : undefined, loading: true }));
    try {
      const data = await load(request.signal);
      if (current === generation.current && !request.signal.aborted) setState({ owner: load, data, loading: false });
    } catch (error) {
      if (current === generation.current && !request.signal.aborted) setState(previous => ({ owner: load,
        data: error instanceof ApiError && [401, 403, 404].includes(error.status) ? undefined : previous?.owner === load ? previous.data : undefined, loading: false,
        error: error instanceof Error ? error.message : '読み込みに失敗しました。' }));
    } finally { if (controller.current === request) running.current = false; }
  }, [load]);
  useFocusEffect(useCallback(() => {
    void refresh();
    const subscription = AppState.addEventListener('change', status => {
      if (status === 'active') void refresh();
      else { generation.current++; controller.current?.abort(); }
    });
    const timer = intervalMs ? setInterval(() => {
      if (AppState.currentState === 'active' && !running.current) void refresh();
    }, intervalMs) : undefined;
    return () => { generation.current++; controller.current?.abort(); subscription.remove(); if (timer) clearInterval(timer); };
  }, [refresh, intervalMs]));
  const current = state?.owner === load ? state : undefined;
  return { data: current?.data, error: current?.error, loading: current?.loading ?? true, refresh };
}

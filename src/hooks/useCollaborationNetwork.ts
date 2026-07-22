import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type CollaborationNetworkQuality =
  | "checking"
  | "good"
  | "fair"
  | "poor"
  | "unstable"
  | "offline";

export interface CollaborationNetworkSample {
  timestamp: number;
  latencyMs: number | null;
  source: "websocket" | "http";
}

export interface CollaborationNetworkState {
  quality: CollaborationNetworkQuality;
  latencyMs: number | null;
  history: CollaborationNetworkSample[];
}

export interface CollaborationNetworkController extends CollaborationNetworkState {
  recordWebSocketLatency: (latencyMs: number) => void;
  recordWebSocketFailure: () => void;
}

export const COLLABORATION_NETWORK_GOOD_MAX_MS = 150;
export const COLLABORATION_NETWORK_FAIR_MAX_MS = 400;

// Render and similar free-tier hosts may need several seconds to wake up.
// A slow successful response should be reported as latency, not as a failure.
const HEALTH_TIMEOUT_MS = 12_000;
const HEALTHY_INTERVAL_MS: Record<"good" | "fair" | "poor", number> = {
  good: 30_000,
  fair: 20_000,
  poor: 15_000,
};
const FAILURE_RETRY_BASE_MS = 2_000;
const FAILURE_RETRY_MAX_MS = 30_000;
const EWMA_ALPHA = 0.3;
const FAILURES_BEFORE_UNSTABLE = 2;
const NETWORK_HISTORY_LIMIT = 30;
const WEBSOCKET_SAMPLE_FRESH_MS = 45_000;

function resolveHealthUrl(websocketUrl?: string, explicitHealthUrl?: string): string | null {
  const source = explicitHealthUrl || websocketUrl;
  if (!source) return null;

  try {
    const url = new URL(source);
    if (!explicitHealthUrl) {
      if (url.protocol === "ws:") url.protocol = "http:";
      else if (url.protocol === "wss:") url.protocol = "https:";
      else if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      url.pathname = "/health";
      url.search = "";
      url.hash = "";
    }
    return url.toString();
  } catch {
    return null;
  }
}

function classifyLatency(
  latencyMs: number,
  previous: CollaborationNetworkQuality,
): "good" | "fair" | "poor" {
  // Different enter/exit thresholds prevent the badge oscillating near a boundary.
  if (previous === "good") {
    if (latencyMs > 450) return "poor";
    return latencyMs > 180 ? "fair" : "good";
  }
  if (previous === "fair") {
    if (latencyMs < 130) return "good";
    return latencyMs > 450 ? "poor" : "fair";
  }
  if (previous === "poor") {
    if (latencyMs < 130) return "good";
    return latencyMs < 350 ? "fair" : "poor";
  }
  if (latencyMs < COLLABORATION_NETWORK_GOOD_MAX_MS) return "good";
  return latencyMs <= COLLABORATION_NETWORK_FAIR_MAX_MS ? "fair" : "poor";
}

function withJitter(delayMs: number): number {
  // Spread probes from multiple collaborators so they do not hit /health together.
  return Math.round(delayMs * (0.9 + Math.random() * 0.2));
}

export function useCollaborationNetwork(
  websocketUrl?: string,
  explicitHealthUrl?: string,
): CollaborationNetworkController {
  const healthUrl = useMemo(
    () => resolveHealthUrl(websocketUrl, explicitHealthUrl),
    [explicitHealthUrl, websocketUrl],
  );
  const [state, setState] = useState<CollaborationNetworkState>(() => ({
    quality: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "checking",
    latencyMs: null,
    history: [],
  }));
  const qualityRef = useRef(state.quality);
  const smoothedLatencyRef = useRef<number | null>(null);
  const sampleSourceRef = useRef<CollaborationNetworkSample["source"] | null>(null);
  const lastWebSocketSampleAtRef = useRef(0);
  const websocketFailureCountRef = useRef(0);
  const failureCountRef = useRef(0);

  const recordSuccessfulSample = useCallback((
    latencyMs: number,
    source: CollaborationNetworkSample["source"],
  ) => {
    if (
      source === "http"
      && Date.now() - lastWebSocketSampleAtRef.current < WEBSOCKET_SAMPLE_FRESH_MS
    ) return;

    if (source === "websocket") {
      lastWebSocketSampleAtRef.current = Date.now();
      websocketFailureCountRef.current = 0;
    }
    const sourceChanged = sampleSourceRef.current !== source;
    const smoothed = sourceChanged || smoothedLatencyRef.current === null
      ? latencyMs
      : EWMA_ALPHA * latencyMs + (1 - EWMA_ALPHA) * smoothedLatencyRef.current;
    sampleSourceRef.current = source;
    smoothedLatencyRef.current = smoothed;
    const quality = classifyLatency(smoothed, qualityRef.current);
    qualityRef.current = quality;
    const sample: CollaborationNetworkSample = {
      timestamp: Date.now(),
      latencyMs: Math.max(1, Math.round(latencyMs)),
      source,
    };
    setState((current) => ({
      quality,
      latencyMs: Math.max(1, Math.round(smoothed)),
      history: sourceChanged
        ? [sample]
        : [...current.history, sample].slice(-NETWORK_HISTORY_LIMIT),
    }));
  }, []);

  const recordWebSocketLatency = useCallback((latencyMs: number) => {
    if (!Number.isFinite(latencyMs) || latencyMs < 0) return;
    failureCountRef.current = 0;
    recordSuccessfulSample(latencyMs, "websocket");
  }, [recordSuccessfulSample]);

  const recordWebSocketFailure = useCallback(() => {
    // An older server may not support Pong yet. Do not treat that as packet loss
    // until this session has received at least one WebSocket sample.
    if (sampleSourceRef.current !== "websocket") return;
    websocketFailureCountRef.current += 1;
    const isUnstable = websocketFailureCountRef.current >= FAILURES_BEFORE_UNSTABLE;
    if (isUnstable) qualityRef.current = "unstable";
    const sample: CollaborationNetworkSample = {
      timestamp: Date.now(),
      latencyMs: null,
      source: "websocket",
    };
    setState((current) => ({
      quality: isUnstable ? "unstable" : current.quality,
      latencyMs: isUnstable ? null : current.latencyMs,
      history: [...current.history, sample].slice(-NETWORK_HISTORY_LIMIT),
    }));
  }, []);

  useEffect(() => {
    qualityRef.current = state.quality;
  }, [state.quality]);

  useEffect(() => {
    if (!healthUrl) return;

    let active = true;
    let timer: number | null = null;
    let controller: AbortController | null = null;
    let probeGeneration = 0;

    const clearTimer = () => {
      if (timer === null) return;
      window.clearTimeout(timer);
      timer = null;
    };

    const cancelProbe = () => {
      probeGeneration += 1;
      controller?.abort();
      controller = null;
    };

    const updateState = (
      next: Omit<CollaborationNetworkState, "history">,
      sampleLatencyMs?: number | null,
    ) => {
      qualityRef.current = next.quality;
      setState((current) => ({
        ...next,
        history: sampleLatencyMs === undefined
          ? current.history
          : [
              ...current.history,
              { timestamp: Date.now(), latencyMs: sampleLatencyMs, source: "http" as const },
            ].slice(-NETWORK_HISTORY_LIMIT),
      }));
    };

    const recordFailedSample = () => {
      setState((current) => ({
        ...current,
        history: [
          ...current.history,
          { timestamp: Date.now(), latencyMs: null, source: "http" as const },
        ].slice(-NETWORK_HISTORY_LIMIT),
      }));
    };

    const schedule = (callback: () => void, delayMs: number) => {
      clearTimer();
      if (!active || document.hidden) return;
      timer = window.setTimeout(callback, withJitter(delayMs));
    };

    const probe = async () => {
      clearTimer();
      if (!active || document.hidden) return;
      if (Date.now() - lastWebSocketSampleAtRef.current < WEBSOCKET_SAMPLE_FRESH_MS) {
        schedule(() => { void probe(); }, HEALTHY_INTERVAL_MS.good);
        return;
      }
      if (!navigator.onLine) {
        updateState({ quality: "offline", latencyMs: null });
        return;
      }

      const generation = ++probeGeneration;
      const nextController = new AbortController();
      controller = nextController;
      let timedOut = false;
      const timeout = window.setTimeout(() => {
        timedOut = true;
        nextController.abort();
      }, HEALTH_TIMEOUT_MS);
      const startedAt = performance.now();

      try {
        const response = await fetch(healthUrl, {
          cache: "no-store",
          // Health checks contain no private data. Opaque responses still let
          // older deployments without CORS provide an accurate round-trip time.
          mode: "no-cors",
          signal: nextController.signal,
        });
        if (response.type !== "opaque") {
          if (!response.ok) throw new Error(`Health check failed with ${response.status}`);
          const result = await response.json() as { ok?: boolean };
          if (result.ok !== true) throw new Error("Health check returned an invalid response");
        }
        if (!active || generation !== probeGeneration) return;

        const sample = performance.now() - startedAt;
        failureCountRef.current = 0;
        recordSuccessfulSample(sample, "http");
        schedule(() => { void probe(); }, HEALTHY_INTERVAL_MS[qualityRef.current === "checking" ? "good" : qualityRef.current === "unstable" || qualityRef.current === "offline" ? "poor" : qualityRef.current]);
      } catch {
        if (
          !active
          || generation !== probeGeneration
          || document.hidden
          || (!timedOut && nextController.signal.aborted)
        ) return;
        if (Date.now() - lastWebSocketSampleAtRef.current < WEBSOCKET_SAMPLE_FRESH_MS) {
          schedule(() => { void probe(); }, HEALTHY_INTERVAL_MS.good);
          return;
        }

        failureCountRef.current += 1;
        if (!navigator.onLine) {
          updateState({ quality: "offline", latencyMs: null }, null);
          return;
        }
        if (failureCountRef.current >= FAILURES_BEFORE_UNSTABLE) {
          updateState({ quality: "unstable", latencyMs: null }, null);
        } else {
          recordFailedSample();
        }
        const retryDelay = Math.min(
          FAILURE_RETRY_MAX_MS,
          FAILURE_RETRY_BASE_MS * 2 ** (failureCountRef.current - 1),
        );
        schedule(() => { void probe(); }, retryDelay);
      } finally {
        window.clearTimeout(timeout);
        if (generation === probeGeneration) controller = null;
      }
    };

    const handleOffline = () => {
      clearTimer();
      cancelProbe();
      failureCountRef.current = 0;
      updateState({ quality: "offline", latencyMs: null }, null);
    };
    const handleOnline = () => {
      clearTimer();
      cancelProbe();
      failureCountRef.current = 0;
      updateState({ quality: "checking", latencyMs: null });
      void probe();
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearTimer();
        cancelProbe();
      } else {
        void probe();
      }
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    void probe();

    return () => {
      active = false;
      clearTimer();
      cancelProbe();
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [healthUrl, recordSuccessfulSample]);

  return { ...state, recordWebSocketLatency, recordWebSocketFailure };
}

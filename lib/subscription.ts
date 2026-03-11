// lib/subscription.ts
// Central hook for subscription state + usage limits.
// Import `useSubscription` anywhere you need tier/usage info.

import { useEffect, useState, useCallback } from "react";
import { getSupabaseBrowser } from "./supabaseBrowser";
import { API_BASE } from "./env";

// ── Types ─────────────────────────────────────────────────────────

export type Tier = "free" | "pro";

export interface UsageCounter {
  used: number | null;
  limit: number | null;
  unlimited: boolean;
}

export interface UsageSummary {
  tier: Tier;
  classes: UsageCounter;
  uploads: UsageCounter;
  ai_generations: UsageCounter;
}

export interface SubscriptionInfo {
  tier: Tier;
  stripe_status: string | null;
  current_period_end: string | null;
}

export interface BillingStatus {
  subscription: SubscriptionInfo;
  usage: UsageSummary;
}

// ── Free-tier limits (must match backend constants) ───────────────

export const FREE_CLASS_LIMIT       = 3;
export const FREE_UPLOAD_LIMIT      = 10;
export const FREE_AI_MONTHLY_LIMIT  = 20;

// ── Hook ──────────────────────────────────────────────────────────

export function useSubscription() {
  const [status, setStatus]   = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const supabase = getSupabaseBrowser();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setStatus(null);
        return;
      }

      const res = await fetch(`${API_BASE}/billing/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Failed to load billing status");
      const json: BillingStatus = await res.json();
      setStatus(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const isPro      = status?.subscription.tier === "pro";
  const tier: Tier = status?.subscription.tier ?? "free";

  const uploadsUsed  = status?.usage.uploads.used  ?? 0;
  const uploadsLeft  = isPro ? Infinity : FREE_UPLOAD_LIMIT - uploadsUsed;
  const classesLeft  = isPro ? Infinity : FREE_CLASS_LIMIT;
  const aiUsed       = status?.usage.ai_generations.used ?? 0;
  const aiLeft       = isPro ? Infinity : FREE_AI_MONTHLY_LIMIT - aiUsed;

  const atClassLimit  = !isPro && classesLeft <= 0;
  const atUploadLimit = !isPro && uploadsLeft <= 0;
  const atAiLimit     = !isPro && aiLeft     <= 0;

  return {
    loading,
    error,
    status,
    tier,
    isPro,
    usage: status?.usage,
    uploadsUsed,
    uploadsLeft,
    aiUsed,
    aiLeft,
    atClassLimit,
    atUploadLimit,
    atAiLimit,
    refresh: fetchStatus,
  };
}

// ── Stripe redirect helpers ───────────────────────────────────────

export async function redirectToCheckout(): Promise<void> {
  const supabase = getSupabaseBrowser();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) { window.location.href = "/"; return; }

  const res = await fetch(`${API_BASE}/billing/create-checkout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to start checkout");
  }

  const { url } = await res.json();
  window.location.href = url;
}

export async function redirectToPortal(): Promise<void> {
  const supabase = getSupabaseBrowser();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) { window.location.href = "/"; return; }

  const res = await fetch(`${API_BASE}/billing/create-portal`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to open portal");
  }

  const { url } = await res.json();
  window.location.href = url;
}

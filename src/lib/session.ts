import { supabase } from "./supabase";

export interface Session {
  id: string;
  wallet: string;
  mac: string | null;
  ip: string;
  plan_id: string;
  paid_amount: number;
  duration_ms: number;
  expires_at: number;
  status: string;
}

export async function createSession(params: {
  wallet: string;
  ip: string;
  mac: string | null;
  planId: string;
  paidAmount: number;
  durationMs: number;
}): Promise<Session> {
  const expiresAt = Date.now() + params.durationMs;

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      wallet: params.wallet,
      ip: params.ip,
      mac: params.mac,
      plan_id: params.planId,
      paid_amount: params.paidAmount,
      duration_ms: params.durationMs,
      expires_at: expiresAt,
      status: "active",
    })
    .select()
    .single();

  if (error) throw new Error(`createSession failed: ${error.message}`);
  return data as Session;
}

export async function getActiveSession(ip: string): Promise<Session | null> {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("ip", ip)
    .eq("status", "active")
    .gt("expires_at", Date.now())
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`getActiveSession failed: ${error.message}`);
  return data as Session | null;
}

export async function getExpiredSessions(): Promise<Session[]> {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("status", "active")
    .lte("expires_at", Date.now());

  if (error) throw new Error(`getExpiredSessions failed: ${error.message}`);
  return (data ?? []) as Session[];
}

export async function markSessionExpired(id: string): Promise<void> {
  const { error } = await supabase
    .from("sessions")
    .update({ status: "expired" })
    .eq("id", id);

  if (error) throw new Error(`markSessionExpired failed: ${error.message}`);
}
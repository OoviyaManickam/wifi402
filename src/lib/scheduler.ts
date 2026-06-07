import { getExpiredSessions, markSessionExpired } from "./session";
import { blockIp } from "./firewall";

let schedulerStarted = false;

export function startScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  setInterval(async () => {
    try {
      const expired = await getExpiredSessions();
      for (const session of expired) {
        blockIp(session.ip);
        await markSessionExpired(session.id);
        console.log(`[scheduler] expired session ${session.id} for IP ${session.ip}`);
      }
    } catch (err) {
      console.error("[scheduler] error:", err);
    }
  }, 1000);

  console.log("[scheduler] started — checking every 1s");
}

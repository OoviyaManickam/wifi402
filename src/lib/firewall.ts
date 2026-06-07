import { execSync } from "child_process";

const ANCHOR = "wifi402";
const TABLE = "paid_users";

function pfctl(args: string): string {
  try {
    return execSync(`sudo pfctl ${args} 2>&1`, { encoding: "utf8" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[firewall] pfctl error: ${msg}`);
    return "";
  }
}

export function allowIp(ip: string): void {
  pfctl(`-a ${ANCHOR} -t ${TABLE} -T add ${ip}`);
  console.log(`[firewall] allowed ${ip}`);
}

export function blockIp(ip: string): void {
  pfctl(`-a ${ANCHOR} -t ${TABLE} -T delete ${ip}`);
  console.log(`[firewall] blocked ${ip}`);
}

export function listAllowedIps(): string[] {
  const output = pfctl(`-a ${ANCHOR} -t ${TABLE} -T show`);
  return output
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

// Returns the Mac's IP on the hotspot bridge interface (bridge100)
// Used by the captive portal so clients know where to redirect
export function getHotspotIp(): string {
  const iface = process.env.HOTSPOT_INTERFACE ?? "bridge100";
  try {
    const output = execSync(`ifconfig ${iface} 2>/dev/null`, { encoding: "utf8" });
    const match = output.match(/inet (\d+\.\d+\.\d+\.\d+)/);
    return match ? match[1] : "192.168.2.1";
  } catch {
    return "192.168.2.1";
  }
}

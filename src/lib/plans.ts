export interface Plan {
  id: string;
  label: string;
  durationMs: number;
  priceUsd: number;
  priceDisplay: string;
}

export const PLANS: Plan[] = [
  {
    id: "2min",
    label: "2 Minutes",
    durationMs: 2 * 60 * 1000,
    priceUsd: 0.01,
    priceDisplay: "$0.01",
  },
  {
    id: "30min",
    label: "30 Minutes",
    durationMs: 30 * 60 * 1000,
    priceUsd: 0.10,
    priceDisplay: "$0.10",
  },
  {
    id: "1hr",
    label: "1 Hour",
    durationMs: 60 * 60 * 1000,
    priceUsd: 0.25,
    priceDisplay: "$0.25",
  },
];

export function getPlan(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

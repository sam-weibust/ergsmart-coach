/**
 * Server-side plan catalogue — the single source of truth for what a plan
 * costs. The client sends a plan id and (for team plans) a size bracket; it
 * never sends an amount, so a tampered request cannot buy Elite for $1.
 *
 * Prices are the BETA prices shown on /pricing (20% off, locked for life for
 * anyone who subscribes during beta). Amounts are in cents, USD, per month.
 */

export type PlanId = "pro" | "elite" | "team_pro" | "elite_team" | "org";
export type TeamSize = "30" | "75" | "150" | "unlimited";

export interface PlanSpec {
  /** Stripe product name shown on the checkout page and the invoice. */
  name: string;
  /** Entitlement tier written to profiles.subscription_tier. */
  tier: "pro" | "elite";
  /** Monthly amount in cents. */
  amount: number;
  /** Team plans are bought by a coach on behalf of a team. */
  isTeam: boolean;
}

const TEAM_PRO: Record<TeamSize, number> = {
  "30": 15900,
  "75": 23900,
  "150": 31900,
  unlimited: 39900,
};

const ELITE_TEAM: Record<TeamSize, number> = {
  "30": 26300,
  "75": 35900,
  "150": 47900,
  unlimited: 59900,
};

const SIZE_LABEL: Record<TeamSize, string> = {
  "30": "up to 30 athletes",
  "75": "up to 75 athletes",
  "150": "up to 150 athletes",
  unlimited: "unlimited athletes",
};

export function isTeamSize(v: unknown): v is TeamSize {
  return v === "30" || v === "75" || v === "150" || v === "unlimited";
}

/**
 * Resolve a plan id (+ size for team plans) to its spec. Throws on anything
 * unrecognised rather than falling back to a default price.
 */
export function resolvePlan(planId: string, teamSize?: string | null): PlanSpec {
  switch (planId) {
    case "pro":
      return { name: "CrewSync Pro", tier: "pro", amount: 640, isTeam: false };
    case "elite":
      return { name: "CrewSync Elite", tier: "elite", amount: 1120, isTeam: false };
    case "team_pro": {
      if (!isTeamSize(teamSize)) throw new Error("team_size is required for team plans");
      return {
        name: `CrewSync Team Pro (${SIZE_LABEL[teamSize]})`,
        tier: "pro",
        amount: TEAM_PRO[teamSize],
        isTeam: true,
      };
    }
    case "elite_team": {
      if (!isTeamSize(teamSize)) throw new Error("team_size is required for team plans");
      return {
        name: `CrewSync Elite Team (${SIZE_LABEL[teamSize]})`,
        tier: "elite",
        amount: ELITE_TEAM[teamSize],
        isTeam: true,
      };
    }
    case "org":
      return {
        name: "CrewSync Organization (up to 5 teams, 500 athletes)",
        tier: "elite",
        amount: 71900,
        isTeam: true,
      };
    default:
      throw new Error(`Unknown plan: ${planId}`);
  }
}

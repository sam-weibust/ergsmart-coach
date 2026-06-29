/**
 * Shared prop contract for the 5 athlete/coxswain tab containers.
 *
 * This is the STABLE, DOCUMENTED contract that Subagents 2-6 build against.
 * Subagent 1 (FOUNDATION) wires every one of these props in Dashboard.tsx and
 * passes them down so the tab bodies never need to re-fetch user/team identity.
 *
 * DO NOT change the shape of this interface without coordinating — every tab
 * relies on it exactly as written.
 */
export interface AthleteTabProps {
  /** Authenticated user id (== profiles.id). Always present once the shell renders. */
  userId: string;
  /**
   * The full `profiles` row for the current user (select("*")), or null while
   * loading. Typed as `any` because the generated Supabase profile type is wide
   * and individual tabs read role/best_2k/etc. ad-hoc. Known useful fields:
   *   id, full_name, username, email, user_type, role, is_coxswain, is_admin,
   *   experience_level, goals, age, weight, height, best_2k_seconds, ...
   */
  profile: any;
  /** Active team id, or null when the athlete is not on a team. */
  teamId: string | null;
  /** Active team display name, or null when not on a team. */
  teamName: string | null;
  /**
   * Team primary color hex (e.g. "#0a1628"). Falls back to the CrewSync default
   * color when the athlete has no team. Use for active states / accents.
   */
  teamColor: string;
  /** True when this user is a coxswain (drives Team-tab "Log Practice" button etc). */
  isCoxswain: boolean;
  /**
   * Invalidate-everything refresh. Mirrors pull-to-refresh; await it after a
   * mutation that should refresh the whole shell (e.g. after joining a team).
   */
  onRefresh: () => Promise<void>;
}

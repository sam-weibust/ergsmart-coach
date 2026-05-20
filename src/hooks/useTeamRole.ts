export type TeamRole = "coach" | "coxswain" | "athlete";

export function useTeamRole(profile: any): {
  role: TeamRole;
  isCoach: boolean;
  isCox: boolean;
  isAthlete: boolean;
} {
  const userType = (profile?.user_type ?? profile?.role ?? "").toLowerCase();
  const isCoach = userType === "coach" || userType === "organizer";
  const isCox = userType === "coxswain" || profile?.is_coxswain === true;
  const isAthlete = !isCoach && !isCox;
  const role: TeamRole = isCoach ? "coach" : isCox ? "coxswain" : "athlete";
  return { role, isCoach, isCox, isAthlete };
}

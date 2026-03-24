/** Shared checks for “thin” candidate profiles (onboarding incomplete / placeholders). */

export type ProfileThinCheckInput = {
  id?: string | null;
  target_role?: string | null;
  skills?: string | null;
  city?: string | null;
} | null;

export function isCandidateProfileThin(profile: ProfileThinCheckInput): boolean {
  if (!profile?.id) return true;
  const role = (profile.target_role ?? "").trim();
  const skills = (profile.skills ?? "").trim();
  const city = (profile.city ?? "").trim();
  const weakRole = !role || role === "Por definir";
  const weakSkills =
    !skills ||
    skills.length < 4 ||
    skills === "Por completar en tu perfil" ||
    skills === "Por completar en tu perfil.";
  const weakCity = !city || city === "Por definir";
  return weakRole || weakSkills || weakCity;
}

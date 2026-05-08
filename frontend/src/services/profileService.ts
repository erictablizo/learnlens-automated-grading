import { api } from "@/lib/api";
import { Profile, ProfileCreatePayload, CollegesData } from "@/types/profile";
 
export const profileService = {
  getColleges: () => api.get<CollegesData>("/profile/colleges"),
  check: (token: string) => api.get<{ has_profile: boolean }>("/profile/check", token),
  get: (token: string) => api.get<Profile>("/profile/me", token),
  create: (payload: ProfileCreatePayload, token: string) =>
    api.post<Profile>("/profile/me", payload, token),
  update: (payload: Partial<ProfileCreatePayload>, token: string) =>
    api.put<Profile>("/profile/me", payload, token),
};
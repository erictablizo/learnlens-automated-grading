import { api } from "@/lib/api";
import { UserProfile } from "@/types/profile";
 
export const profileService = {
  get: (token: string) =>
    api.get<UserProfile>("/profile", token),
 
  save: (payload: Partial<UserProfile>, token: string) =>
    api.put<UserProfile>("/profile", payload, token),
 
  uploadAvatar: (file: File, token: string) => {
    const form = new FormData();
    form.append("file", file);
    return api.postForm<UserProfile>("/profile/avatar", form, token);
  },
};
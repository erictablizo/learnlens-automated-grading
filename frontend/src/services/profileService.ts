import { api } from "@/lib/api";
import { UserProfile } from "@/types/profile";
 
export interface ProfileSavePayload {
  first_name?: string;
  last_name?:  string;
  college?:    string;
  course?:     string;
  position?:   string;
}
 
export const profileService = {
  /** Fetch current user's profile */
  get: (token: string) =>
    api.get<UserProfile>("/profile", token),
 
  /** Save / update profile fields */
  save: (payload: ProfileSavePayload, token: string) =>
    api.put<UserProfile>("/profile", payload, token),
 
  /** Upload profile photo — returns updated profile with avatar_path set */
  uploadAvatar: (file: File, token: string) => {
    const form = new FormData();
    form.append("file", file);
    return api.postForm<UserProfile>("/profile/avatar", form, token);
  },
};
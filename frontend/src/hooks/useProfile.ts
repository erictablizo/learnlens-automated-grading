"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { profileService } from "@/services/profileService";
import { Profile, ProfileCreatePayload, CollegesData } from "@/types/profile";
import { getToken } from "@/lib/auth";
 
export function useProfile() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [colleges, setColleges] = useState<CollegesData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
 
  const fetchColleges = useCallback(async () => {
    try {
      const data = await profileService.getColleges();
      setColleges(data);
    } catch {
      // Fallback static data if backend unreachable
      setColleges({
        colleges: {
          CVMAS: ["Department of Veterinary Medicine", "Department of Agriculture", "Department of Animal Science", "Department of Crop Science"],
          CBMA: ["Department of Business Administration", "Department of Accountancy", "Department of Management", "Department of Marketing", "Department of Finance"],
          CoEd: ["Department of Teacher Education", "Department of Early Childhood Education", "Department of Special Education", "Department of Physical Education"],
          CAST: ["Department of Information Technology", "Department of Computer Science", "Department of Mathematics", "Department of Natural Sciences", "Department of Technology", "Department of Arts and Humanities"],
        },
        positions: ["Instructor", "Assistant Professor", "Associate Professor", "Professor", "Department Chair", "Dean"],
      });
    }
  }, []);
 
  const checkAndRedirect = useCallback(async () => {
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    try {
      const { has_profile } = await profileService.check(token);
      if (!has_profile) {
        router.replace("/profile-setup");
      } else {
        router.replace("/exams");
      }
    } catch {
      router.replace("/exams");
    }
  }, [router]);
 
  const saveProfile = useCallback(async (payload: ProfileCreatePayload): Promise<boolean> => {
    const token = getToken();
    if (!token) return false;
    setIsLoading(true);
    setError(null);
    try {
      const saved = await profileService.create(payload, token);
      setProfile(saved);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);
 
  return { profile, colleges, isLoading, error, setError, fetchColleges, checkAndRedirect, saveProfile };
}
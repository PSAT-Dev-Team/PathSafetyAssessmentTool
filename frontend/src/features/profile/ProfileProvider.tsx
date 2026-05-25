import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  createProfile as apiCreateProfile,
  fetchProfilesOverview,
  loginProfile as apiLoginProfile,
  logoutProfile as apiLogoutProfile,
  migrateLegacyProjects as apiMigrateLegacyProjects,
  type CreateProfileResult,
  type LoginProfileResult,
  type MigrateLegacyProjectsResult,
  type ProfileSummary,
  type ProfilesOverview,
} from "../../api";

type ProfileContextValue = {
  profiles: ProfileSummary[];
  activeProfile: ProfileSummary | null;
  legacyProjects: string[];
  loading: boolean;
  error: string | null;
  refreshOverview: () => Promise<ProfilesOverview | null>;
  createProfile: (name: string, pin: string, division: string) => Promise<CreateProfileResult>;
  login: (profileId: string, pin: string) => Promise<LoginProfileResult>;
  logout: () => Promise<void>;
  migrateLegacyProjects: (projectNames?: string[]) => Promise<MigrateLegacyProjectsResult>;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

function normalizeOverview(overview: ProfilesOverview | null | undefined): ProfilesOverview {
  return {
    profiles: overview?.profiles ?? [],
    active_profile: overview?.active_profile ?? null,
    legacy_projects: overview?.legacy_projects ?? [],
  };
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [overview, setOverview] = useState<ProfilesOverview>(normalizeOverview(null));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applyOverview = useCallback((nextOverview: ProfilesOverview | null | undefined) => {
    setOverview(normalizeOverview(nextOverview));
  }, []);

  const refreshOverview = useCallback(async () => {
    try {
      const nextOverview = await fetchProfilesOverview();
      applyOverview(nextOverview);
      setError(null);
      return normalizeOverview(nextOverview);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Failed to load profiles.";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [applyOverview]);

  useEffect(() => {
    void refreshOverview();
  }, [refreshOverview]);

  const createProfile = useCallback(async (name: string, pin: string, division: string) => {
    const result = await apiCreateProfile(name, pin, division);
    applyOverview(result.overview);
    setError(null);
    return result;
  }, [applyOverview]);

  const login = useCallback(async (profileId: string, pin: string) => {
    const result = await apiLoginProfile(profileId, pin);
    applyOverview(result.overview);
    setError(null);
    return result;
  }, [applyOverview]);

  const logout = useCallback(async () => {
    const result = await apiLogoutProfile();
    applyOverview(result.overview);
    setError(null);
  }, [applyOverview]);

  const migrateLegacyProjects = useCallback(async (projectNames?: string[]) => {
    const result = await apiMigrateLegacyProjects(projectNames);
    applyOverview(result.overview);
    setError(null);
    return result;
  }, [applyOverview]);

  const value = useMemo<ProfileContextValue>(() => ({
    profiles: overview.profiles,
    activeProfile: overview.active_profile,
    legacyProjects: overview.legacy_projects,
    loading,
    error,
    refreshOverview,
    createProfile,
    login,
    logout,
    migrateLegacyProjects,
  }), [overview, loading, error, refreshOverview, createProfile, login, logout, migrateLegacyProjects]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error("useProfile must be used within a ProfileProvider");
  }
  return context;
}
import { Spinner } from "@chakra-ui/react";
import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";

import { useProfile } from "./ProfileProvider";

export default function RequireProfile({ children }: { children: ReactNode }) {
  const { activeProfile, loading } = useProfile();

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
        }}
      >
        <Spinner size="sm" />
        <span>Loading profile...</span>
      </div>
    );
  }

  if (!activeProfile) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
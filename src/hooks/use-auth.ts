import { useConvexAuth } from "convex/react";
import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";

export function useAuth() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  
  // Defensive check for api.users to prevent crash if users.ts is not generated/loaded
  const currentUserQuery = api.users?.currentUser;

  const user = useQuery(
    currentUserQuery ?? "skip", 
    isAuthenticated ? {} : "skip"
  );
  const { signIn, signOut } = useAuthActions();

  if (isAuthenticated && !currentUserQuery) {
    console.error("Critical: api.users.currentUser is undefined. Check src/convex/users.ts");
  }

  return {
    isLoading: isLoading || (isAuthenticated && user === undefined),
    isAuthenticated,
    user: user ?? null,
    signIn,
    signOut,
  };
}
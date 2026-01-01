import { Navigate } from "react-router";

export default function Landing() {
  return <Navigate to="/auth" replace />;
}
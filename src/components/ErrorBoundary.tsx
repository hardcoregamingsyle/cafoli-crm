import { useRouteError, isRouteErrorResponse, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Home, ArrowLeft, RefreshCw, Bug } from "lucide-react";
import { useEffect, useState } from "react";

export default function ErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    console.error("ErrorBoundary caught error:", error);
  }, [error]);

  let errorMessage = "An unexpected error occurred.";
  let errorDetails = "";
  let errorType = "Unknown Error";
  let statusCode: number | null = null;

  if (isRouteErrorResponse(error)) {
    statusCode = error.status;
    errorType = `${error.status} ${error.statusText}`;
    errorMessage = error.data?.message || "Page not found or access denied.";
    errorDetails = JSON.stringify(error.data, null, 2);
  } else if (error instanceof Error) {
    errorType = error.name || "Runtime Error";
    errorMessage = error.message;
    errorDetails = error.stack || "";
  } else if (typeof error === "string") {
    errorMessage = error;
  }

  const getErrorIcon = () => {
    if (statusCode === 404) return "🔍";
    if (statusCode === 403) return "🔒";
    if (statusCode && statusCode >= 500) return "🔥";
    return "⚠️";
  };

  const getErrorColor = () => {
    if (statusCode === 404) return "text-blue-600";
    if (statusCode === 403) return "text-yellow-600";
    if (statusCode && statusCode >= 500) return "text-red-600";
    return "text-destructive";
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-background via-background to-muted">
      <Card className="max-w-2xl w-full shadow-lg">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <div className={`h-24 w-24 rounded-full bg-destructive/10 flex items-center justify-center ${getErrorColor()}`}>
              <span className="text-5xl">{getErrorIcon()}</span>
            </div>
          </div>
          
          <div className="space-y-2">
            <CardTitle className="text-3xl font-bold tracking-tight">
              Oops! Something went wrong
            </CardTitle>
            <p className="text-sm text-muted-foreground font-mono">
              {errorType}
            </p>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="bg-muted/50 p-4 rounded-lg border">
            <p className="text-sm font-medium text-foreground">
              {errorMessage}
            </p>
          </div>

          {errorDetails && (
            <div className="space-y-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDetails(!showDetails)}
                className="w-full justify-between"
              >
                <span className="flex items-center gap-2">
                  <Bug className="h-4 w-4" />
                  {showDetails ? "Hide" : "Show"} Technical Details
                </span>
                <span className="text-xs">{showDetails ? "▲" : "▼"}</span>
              </Button>
              
              {showDetails && (
                <div className="bg-muted/50 p-4 rounded-lg text-left overflow-auto max-h-64 text-xs font-mono border">
                  <pre className="text-muted-foreground whitespace-pre-wrap break-words">
                    {errorDetails}
                  </pre>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <Button 
              variant="outline" 
              onClick={() => navigate(-1)}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Go Back
            </Button>
            
            <Button 
              onClick={() => navigate("/")}
              className="flex items-center gap-2"
            >
              <Home className="h-4 w-4" />
              Back to Home
            </Button>
            
            <Button 
              variant="secondary" 
              onClick={() => window.location.reload()}
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Reload Page
            </Button>
          </div>

          <div className="text-center pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              If this problem persists, please contact support with the error details above.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
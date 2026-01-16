import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api"; // Use api, not internal
import { Button } from "@/components/ui/button";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { Id } from "@/convex/_generated/dataModel";

const VAPID_PUBLIC_KEY = "BD6Q8d5SFwDWj3Jd1cWzMtelFYsYXnOmYo_WhEttPPk6evm4jrbMwp_Y-iiSYNnVqIhFcIJ1ExECH_OQjV7i7Uk";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

interface PushNotificationManagerProps {
  userId: Id<"users">;
}

export function PushNotificationManager({ userId }: PushNotificationManagerProps) {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  
  // @ts-ignore - Fix "Type instantiation is excessively deep" error with complex Convex types
  const saveSubscription = useMutation(api.pushNotifications.subscribe); 

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window) {
      // Register service worker
      navigator.serviceWorker.register("/sw.js").then(
        (reg) => {
          console.log("Service Worker Registered", reg);
          setRegistration(reg);
          reg.pushManager.getSubscription().then((sub) => {
            if (sub) {
              setSubscription(sub);
              setIsSubscribed(true);
            }
          });
        },
        (err) => {
          console.error("Service Worker registration failed", err);
        }
      );
    }
  }, []);

  const subscribeToPush = async () => {
    if (!registration) return;

    try {
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      setSubscription(sub);
      setIsSubscribed(true);

      const keys = sub.toJSON().keys;
      if (keys && keys.p256dh && keys.auth) {
        await saveSubscription({
          userId,
          endpoint: sub.endpoint,
          keys: {
            p256dh: keys.p256dh,
            auth: keys.auth,
          },
          deviceType: /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "desktop",
        });
        toast.success("Notifications enabled!");
      }
    } catch (error) {
      console.error("Failed to subscribe", error);
      toast.error("Failed to enable notifications");
    }
  };

  const unsubscribeFromPush = async () => {
    if (!subscription) return;

    try {
      await subscription.unsubscribe();
      setSubscription(null);
      setIsSubscribed(false);
      toast.success("Notifications disabled");
      // Optionally notify backend to remove subscription
    } catch (error) {
      console.error("Failed to unsubscribe", error);
      toast.error("Failed to disable notifications");
    }
  };

  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return null; // Not supported
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={isSubscribed ? unsubscribeFromPush : subscribeToPush}
      title={isSubscribed ? "Disable Notifications" : "Enable Notifications"}
    >
      {isSubscribed ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
    </Button>
  );
}
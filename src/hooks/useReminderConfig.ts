import { AlertTriangle, TrendingUp } from "lucide-react";

export type ReminderMode = 'critical' | 'cold';

interface ReminderConfig {
  borderColor: string;
  bgColor: string;
  iconColor: string;
  textColor: string;
  Icon: typeof AlertTriangle | typeof TrendingUp;
  title: string;
  description: string;
  badgeColor: string;
  buttonVariant: "destructive" | "default";
}

export function useReminderConfig(mode: ReminderMode, leadCount: number): ReminderConfig {
  const isCritical = mode === 'critical';
  
  if (isCritical) {
    return {
      borderColor: "border-red-200",
      bgColor: "bg-red-50 dark:bg-red-950/20",
      iconColor: "text-red-600 dark:text-red-400",
      textColor: "text-red-700 dark:text-red-300",
      Icon: AlertTriangle,
      title: "Critical Follow-ups Required",
      description: "Your Matured Party (if mature) or Your almost Mature Lead (for Hot) is about to get wasted. Save it by following Up on time.",
      badgeColor: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
      buttonVariant: "destructive" as const,
    };
  }
  
  return {
    borderColor: "border-blue-200",
    bgColor: "bg-blue-50 dark:bg-blue-950/20",
    iconColor: "text-blue-600 dark:text-blue-400",
    textColor: "text-blue-700 dark:text-blue-300",
    Icon: TrendingUp,
    title: "Boost Your Sales",
    description: leadCount > 1 
      ? "These are good leads. Let's convert these leads to be good parties. Success is just one follow-up away!"
      : "This is a good lead. Let's convert this lead to be a good party. Success is just one follow-up away!",
    badgeColor: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    buttonVariant: "default" as const,
  };
}

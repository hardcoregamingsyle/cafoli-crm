import { Id } from "@/convex/_generated/dataModel";

export interface CampaignBlock {
  id: string;
  type: string;
  data: any;
  position: { x: number; y: number };
}

export interface CampaignConnection {
  from: string;
  to: string;
  label?: string;
}

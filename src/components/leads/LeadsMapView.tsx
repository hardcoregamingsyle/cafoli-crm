import { useEffect, useRef, useState, useMemo } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Layers, Flame, MapPin, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

interface Lead {
  _id: string;
  name: string;
  phone?: string;
  city?: string;
  state?: string;
  country?: string;
  status: string;
  source?: string;
  assignedTo?: string;
  lat?: number;
  lng?: number;
  company?: string;
  agencyName?: string;
  assignedUser?: { name?: string };
}

interface LeadsMapViewProps {
  leads: Lead[];
  onLeadSelect: (leadId: string) => void;
  selectedLeadId: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  cold: "#3b82f6",
  hot: "#f97316",
  mature: "#22c55e",
  default: "#6b7280",
};

function getStatusColor(status: string): string {
  return STATUS_COLORS[status?.toLowerCase()] ?? STATUS_COLORS.default;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function loadStyle(href: string): void {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = href;
  document.head.appendChild(l);
}

export function LeadsMapView({ leads, onLeadSelect, selectedLeadId }: LeadsMapViewProps) {
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const clusterGroupRef = useRef<any>(null);
  const heatLayerRef = useRef<any>(null);
  const [mapMode, setMapMode] = useState<"cluster" | "heatmap">("cluster");
  const [isLoading, setIsLoading] = useState(true);
  const [leafletReady, setLeafletReady] = useState(false);
  const geocodeLead = useAction(api.geocoding.geocodeLead);
  const [isGeocoding, setIsGeocoding] = useState(false);

  const mappableLeads = useMemo(
    () => leads.filter((l) => (l as any).lat != null && (l as any).lng != null),
    [leads]
  );

  const needsGeocode = useMemo(
    () => leads.filter((l) => !(l as any).lat && !(l as any).lng && (l.city || l.state || l.country)),
    [leads]
  );

  // Load leaflet and plugins from CDN
  useEffect(() => {
    loadStyle("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css");
    loadStyle("https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css");
    loadStyle("https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css");

    loadScript("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js")
      .then(() => loadScript("https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"))
      .then(() => loadScript("https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js"))
      .then(() => setLeafletReady(true))
      .catch((e) => console.error("Failed to load leaflet:", e));
  }, []);

  // Initialize map once leaflet is ready
  useEffect(() => {
    if (!leafletReady || !mapContainerRef.current || mapRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    // Fix default icon
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });

    mapRef.current = L.map(mapContainerRef.current, {
      center: [20.5937, 78.9629],
      zoom: 5,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapRef.current);

    setIsLoading(false);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [leafletReady]);

  // Update layers when leads or mode changes
  useEffect(() => {
    if (!mapRef.current || isLoading) return;
    const L = (window as any).L;
    if (!L) return;

    if (clusterGroupRef.current) {
      mapRef.current.removeLayer(clusterGroupRef.current);
      clusterGroupRef.current = null;
    }
    if (heatLayerRef.current) {
      mapRef.current.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }

    if (mappableLeads.length === 0) return;

    if (mapMode === "cluster") {
      const clusterGroup = L.markerClusterGroup({
        maxClusterRadius: 60,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
      });

      mappableLeads.forEach((lead) => {
        const l = lead as any;
        const color = getStatusColor(lead.status);
        const size = 32;
        const icon = L.divIcon({
          html: `<div style="background:${color};width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
          className: "",
          iconSize: [size, size],
          iconAnchor: [size / 2, size],
          popupAnchor: [0, -size],
        });
        const marker = L.marker([l.lat, l.lng], { icon });
        const location = [lead.city, lead.state, lead.country].filter(Boolean).join(", ");
        const company = lead.agencyName || (lead as any).company || "";
        marker.bindPopup(`
          <div style="min-width:180px;padding:4px">
            <div style="font-weight:600;font-size:14px;margin-bottom:4px">${lead.name}</div>
            ${company ? `<div style="font-size:12px;color:#6b7280;margin-bottom:2px">${company}</div>` : ""}
            <div style="font-size:12px;margin-bottom:4px">${location}</div>
            <div style="display:flex;gap:4px;flex-wrap:wrap">
              <span style="background:${color};color:white;padding:2px 8px;border-radius:9999px;font-size:11px">${lead.status}</span>
              ${lead.source ? `<span style="background:#e5e7eb;color:#374151;padding:2px 8px;border-radius:9999px;font-size:11px">${lead.source}</span>` : ""}
            </div>
            <button onclick="window.__selectLead('${lead._id}')" style="margin-top:8px;width:100%;background:#3b82f6;color:white;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:12px">View Details</button>
          </div>
        `);
        clusterGroup.addLayer(marker);
      });

      clusterGroupRef.current = clusterGroup;
      mapRef.current.addLayer(clusterGroup);
    } else {
      const heatPoints = mappableLeads.map((l) => [(l as any).lat, (l as any).lng, 1.0]);
      const heat = L.heatLayer(heatPoints, {
        radius: 25,
        blur: 15,
        maxZoom: 17,
        gradient: { 0.4: "#3b82f6", 0.65: "#f59e0b", 1: "#ef4444" },
      });
      heatLayerRef.current = heat;
      mapRef.current.addLayer(heat);
    }
  }, [mappableLeads, mapMode, isLoading]);

  useEffect(() => {
    (window as any).__selectLead = (id: string) => onLeadSelect(id);
    return () => { delete (window as any).__selectLead; };
  }, [onLeadSelect]);

  const handleGeocodeAll = async () => {
    if (needsGeocode.length === 0) return;
    setIsGeocoding(true);
    let done = 0;
    for (const lead of needsGeocode.slice(0, 20)) {
      try {
        await geocodeLead({
          leadId: lead._id as any,
          city: lead.city,
          state: lead.state,
          country: lead.country,
        });
        done++;
        await new Promise((r) => setTimeout(r, 1200));
      } catch {
        // skip
      }
    }
    setIsGeocoding(false);
    toast.success(`Geocoded ${done} leads`);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-full"
    >
      <div className="flex items-center gap-2 p-2 border-b border-border bg-background/95 backdrop-blur-sm flex-wrap">
        <div className="flex items-center gap-1 border border-border rounded-md overflow-hidden">
          <Button
            variant={mapMode === "cluster" ? "default" : "ghost"}
            size="sm"
            onClick={() => setMapMode("cluster")}
            className="h-8 rounded-none border-0 gap-1.5"
          >
            <MapPin className="h-3.5 w-3.5" />
            <span className="text-xs">Cluster</span>
          </Button>
          <Button
            variant={mapMode === "heatmap" ? "default" : "ghost"}
            size="sm"
            onClick={() => setMapMode("heatmap")}
            className="h-8 rounded-none border-0 gap-1.5"
          >
            <Flame className="h-3.5 w-3.5" />
            <span className="text-xs">Heatmap</span>
          </Button>
        </div>

        <Badge variant="outline" className="text-xs">
          {mappableLeads.length} mapped
        </Badge>

        {needsGeocode.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleGeocodeAll}
            disabled={isGeocoding}
            className="h-8 gap-1.5 text-xs"
          >
            {isGeocoding ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Layers className="h-3.5 w-3.5" />
            )}
            {isGeocoding ? "Geocoding..." : `Geocode ${Math.min(needsGeocode.length, 20)} leads`}
          </Button>
        )}

        <div className="flex items-center gap-1.5 ml-auto flex-wrap">
          {Object.entries(STATUS_COLORS)
            .filter(([k]) => k !== "default")
            .map(([status, color]) => (
              <div key={status} className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-xs text-muted-foreground capitalize">{status}</span>
              </div>
            ))}
        </div>
      </div>

      <div className="flex-1 relative">
        {(isLoading || !leafletReady) && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Loading map...</span>
            </div>
          </div>
        )}
        {mappableLeads.length === 0 && !isLoading && leafletReady && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="bg-background/90 border border-border rounded-lg p-6 text-center max-w-sm">
              <MapPin className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium mb-1">No leads with location data</p>
              <p className="text-xs text-muted-foreground">
                {needsGeocode.length > 0
                  ? `${needsGeocode.length} leads have city/state info. Click "Geocode" to map them.`
                  : "Add city, state, or country to leads to see them on the map."}
              </p>
            </div>
          </div>
        )}
        <div ref={mapContainerRef} className="w-full h-full" style={{ minHeight: 400 }} />
      </div>
    </motion.div>
  );
}
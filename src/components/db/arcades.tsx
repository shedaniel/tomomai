"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Navigation, X, DoorOpen, Cigarette, MapPin, Clock, CircleDollarSign, Edit } from "lucide-react";
import Script from "next/script";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { useMediaQuery } from "@/hooks/use-media-query";
import { trpc } from "@/lib/trpc-client";
import { StoreEditDrawer } from "@/components/db/store-edit-drawer";

import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { getGameName } from "@/lib/game-utils";
import { useTranslations } from "next-intl";

const DEBUG = true;

interface Store {
  id: bigint;
  country: string;
  area: string | null;
  name: string;
  address: string;
  location: { x: number; y: number } | null;
  chosenEdit?: {
    name?: string | null;
    address?: string | null;
    openingHours?: string | null;
    toilet?: boolean | null;
    smoke?: boolean | null;
    access?: string | null;
    status?: "open" | "closed" | "temporarily_closed" | null;
    currency?: string | null;
    games?: any;
    additionalInfo?: any;
  } | null;
}

interface StoreData {
  [region: string]: Store[];
}

function groupStoresByRegion(stores: Store[]): StoreData {
  const combined: StoreData = {};
  for (const store of stores) {
    const regionKey = store.area ? store.area : store.country;
    if (!combined[regionKey]) {
      combined[regionKey] = [];
    }
    combined[regionKey].push(store);
  }
  return combined;
}

function toTitleCase(str: string) {
  // Add space before opening bracket if it follows a non-space character
  const formatted = str.replace(/([^\s])\(/g, "$1 (");

  // Capitalize words
  return formatted.replace(
    /\w\S*/g,
    (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase()
  );
}

function getGeoJSONFeatures(data: StoreData) {
  return Object.entries(data).flatMap(([regionName, stores]) =>
    stores
      .filter((store) => store.location)
      .map((store) => ({
        type: "Feature" as const,
        properties: {
          id: store.id.toString(),
          name: store.chosenEdit?.name || toTitleCase(store.name),
          address: store.address,
          regionName,
        },
        geometry: {
          type: "Point" as const,
          coordinates: [store.location!.y, store.location!.x],
        },
      }))
  );
}

function getPrimaryColor() {
  if (typeof window === "undefined") return "#000000";

  const styles = window.getComputedStyle(document.documentElement);
  const raw = styles.getPropertyValue("--primary").trim();

  // If it's already rgb()/rgba()/hex, just return it
  if (raw.startsWith("rgb") || raw.startsWith("#")) {
    return raw;
  }

  // Handle oklch(...) → convert to sRGB
  if (raw.startsWith("oklch(")) {
    const match = raw.match(/oklch\\(([^)]+)\\)/);
    if (match) {
      const parts = match[1].split("/")[0].trim().split(/[\\s]+/);
      const L = parseFloat(parts[0]); // 0–1
      const C = parseFloat(parts[1]);
      let h = parts[2] ? parts[2] : "0";
      // Strip possible 'deg'
      if (typeof h === "string") {
        h = h.replace("deg", "");
      }
      const H = parseFloat(h as string) || 0;

      // OKLCH → OKLab
      const hr = (H * Math.PI) / 180;
      const a = C * Math.cos(hr);
      const b = C * Math.sin(hr);

      // OKLab → linear sRGB (from Björn Ottosson's reference implementation)
      const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
      const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
      const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

      const l = l_ * l_ * l_;
      const m = m_ * m_ * m_;
      const s = s_ * s_ * s_;

      let r =
        +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
      let g =
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
      let b2 =
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

      // Linear → sRGB
      const compand = (c: number) =>
        c <= 0.0031308
          ? 12.92 * c
          : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

      r = compand(r);
      g = compand(g);
      b2 = compand(b2);

      const clamp255 = (x: number) =>
        Math.max(0, Math.min(255, Math.round(x * 255)));

      const R = clamp255(r);
      const G = clamp255(g);
      const B = clamp255(b2);

      return `rgb(${R}, ${G}, ${B})`;
    }
  }

  // Fallback: just return black if we can't parse
  return "#000000";
}

// A simple helper to lighten a color slightly (naive implementation for RGB)
function getLighterColor(colorStr: string) {
  // Ensure we have an RGB string for the regex to work
  let rgbStr = colorStr;

  // If hex, convert to rgb (basic support)
  if (colorStr.startsWith("#")) {
    const hex = colorStr.substring(1);
    const bigint = parseInt(hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    rgbStr = `rgb(${r}, ${g}, ${b})`;
  }

  const match = rgbStr.match(/(\d+(\.\d+)?)/g);
  if (!match || match.length < 3) return colorStr;

  const [r, g, b] = match.slice(0, 3).map(Number);
  // Mix with white (255, 255, 255) by 20%
  const mix = (c: number) => Math.min(255, Math.round(c + (255 - c) * 0.3));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

declare global {
  interface Window {
    maplibregl?: any;
  }
}


function ArcadeDetailsContent({ store, onEditClick }: { store: Store | null; onEditClick: () => void }) {
  const t = useTranslations();
  if (!store) return null;

  const displayName = store.chosenEdit?.name || toTitleCase(store.name);
  const displayAddress = store.chosenEdit?.address || store.address;
  const hasChosenEdit = !!store.chosenEdit;

  return (
    <>
      <div className="mb-4">
        <h3 className="font-semibold leading-none tracking-tight">{displayName}</h3>
        <p className="text-sm text-muted-foreground mt-1.5">{displayAddress}</p>
      </div>

      {!hasChosenEdit ? (
        <div className="h-64 bg-muted rounded-lg flex flex-col items-center justify-center text-muted-foreground text-sm p-6 text-center">
          <p className="text-lg mb-2">:( No Data</p>
          <p>Add arcade data and contribute now!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {store.chosenEdit?.status && (
            <div className="flex items-center gap-2 text-sm">
              <DoorOpen className="h-4 w-4 text-muted-foreground" />
              <span className="capitalize">
                {store.chosenEdit.status === "temporarily_closed"
                  ? "Temporarily Closed"
                  : store.chosenEdit.status}
              </span>
            </div>
          )}

          {store.chosenEdit?.openingHours && (
            <div className="flex items-start gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
              <span className="whitespace-pre-wrap">{store.chosenEdit.openingHours}</span>
            </div>
          )}

          {store.chosenEdit?.toilet !== null && store.chosenEdit?.toilet !== undefined && (
            <div className="flex items-center gap-2 text-sm">
              <DoorOpen className="h-4 w-4 text-muted-foreground" />
              <span>Toilet: {store.chosenEdit.toilet ? "Available" : "Not Available"}</span>
            </div>
          )}

          {store.chosenEdit?.smoke !== null && store.chosenEdit?.smoke !== undefined && (
            <div className="flex items-center gap-2 text-sm">
              <Cigarette className="h-4 w-4 text-muted-foreground" />
              <span>Smoking: {store.chosenEdit.smoke ? "Allowed" : "Not Allowed"}</span>
            </div>
          )}

          {store.chosenEdit?.access && (
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
              <span className="whitespace-pre-wrap">{store.chosenEdit.access}</span>
            </div>
          )}

          {store.chosenEdit?.currency && (
            <div className="flex items-center gap-2 text-sm">
              <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
              <span>{store.chosenEdit.currency}</span>
            </div>
          )}

          {store.chosenEdit?.games && Object.keys(store.chosenEdit.games).length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium mb-2">Available Games</h4>
              <div className="space-y-1 text-sm">
                {Object.entries(store.chosenEdit.games).map(([game, data]: [string, any]) => (
                  <div key={game} className="flex justify-between">
                    <span>{getGameName((k: string) => t.has(k) ? t(k) : k, game as any)}</span>
                    {data.amount && <span>{data.amount} cabs</span>}
                    {data.price && <span>{data.price}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Button
        onClick={onEditClick}
        className="w-full mt-4"
        variant="outline"
      >
        <Edit className="h-4 w-4 mr-2" />
        Edit
      </Button>
    </>
  );
}

export function ArcadesMap() {
  const map = useRef<any>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [isMapLibreReady, setIsMapLibreReady] = useState(false);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showEditDrawer, setShowEditDrawer] = useState(false);

  const isMobile = useMediaQuery("(max-width: 768px)", {
    defaultValue: false,
    initializeWithValue: false,
  });

  // Fetch stores using tRPC
  const { data: storesResponse, isLoading: isLoadingStores } = trpc.store.getStores.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Process stores data for the map
  const storeData = storesResponse?.stores ? groupStoresByRegion(storesResponse.stores) : null;

  // Keep a ref to storeData for event handlers
  const storeDataRef = useRef(storeData);
  useEffect(() => {
    storeDataRef.current = storeData;
  }, [storeData]);

  // Update selectedStore when storeData changes (to reflect updated chosen edits)
  useEffect(() => {
    if (!selectedStore || !storeData) return;

    // Find the updated version of the selected store
    let updatedStore: Store | null = null;
    for (const stores of Object.values(storeData)) {
      const found = stores.find(s => s.id === selectedStore.id);
      if (found) {
        updatedStore = found;
        break;
      }
    }

    if (updatedStore) {
      if (DEBUG) console.log("[ArcadesMap] Updating selectedStore with fresh data");
      setSelectedStore(updatedStore);
    }
  }, [storeData]);

  // Check if user is logged in
  useEffect(() => {
    fetch("/api/auth/get-session")
      .then(res => res.json())
      .then(data => {
        setIsLoggedIn(!!data.user);
      })
      .catch(() => {
        setIsLoggedIn(false);
      });
  }, []);

  // If the script was already loaded in a previous mount, mark MapLibre as ready
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.maplibregl && !isMapLibreReady) {
      if (DEBUG) console.log(
        "[ArcadesMap] maplibre already present on window, marking ready",
      );
      setIsMapLibreReady(true);
    }
  }, [isMapLibreReady]);

  // Initialize map
  useEffect(() => {
    if (!isMapLibreReady || !window.maplibregl || map.current) return;

    if (DEBUG) console.log("[ArcadesMap] init map", {
      isMapLibreReady,
      hasMaplibre: !!window.maplibregl,
      hasMap: !!map.current,
    });

    const maplibregl = window.maplibregl;

    // Default center (roughly over East Asia, covering JP + INTL arcades)
    const defaultCenter: [number, number] = [135, 25];

    // Use the application's font stack for map labels (especially for CJK characters)
    const fontFamily = window.getComputedStyle(document.body).fontFamily;

    if (DEBUG) console.log("[ArcadesMap] font family =", fontFamily);

    map.current = new maplibregl.Map({
      container: "map",
      style: "https://tiles.openfreemap.org/styles/positron",
      center: defaultCenter,
      zoom: 3.5,
      attributionControl: false,
      fadeDuration: 0,
      localIdeographFontFamily: fontFamily,
    });
    if (DEBUG) console.log("[ArcadesMap] map created");

    // Add controls
    map.current.addControl(new maplibregl.NavigationControl(), "top-right");
    map.current.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-left"
    );

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [isMapLibreReady]);

  // Add clustered source & layers once when style is loaded
  useEffect(() => {
    if (!map.current || !window.maplibregl) return;

    if (DEBUG) console.log("[ArcadesMap] cluster setup", {
      hasMap: !!map.current,
      hasMaplibre: !!window.maplibregl,
    });

    const mapInstance = map.current;
    const primaryColor = getPrimaryColor();
    const brighterColor = getLighterColor(primaryColor);

    // Determine sizes based on screen width (checked at setup time)
    // Note: This only runs once when the map is initialized. To be truly responsive to resize,
    // we'd need to update the layers on resize events, but map resize usually doesn't happen much on mobile.
    // We can use window.innerWidth here as a simple check.
    const isSmallScreen = window.innerWidth <= 768;
    const unclusteredRadius = isSmallScreen ? 10 : 6;
    const clusterRadiusBase = isSmallScreen ? 18 : 14;
    const clusterRadiusStep = isSmallScreen ? 4 : 4; // Keep step same or adjust
    const textSize = isSmallScreen ? 13 : 11;
    const labelTextSize = isSmallScreen ? 14 : 12;
    const labelOffset = isSmallScreen ? 1.2 : 0.8;

    if (DEBUG) console.log("[ArcadesMap] primary color =", primaryColor);
    if (DEBUG) console.log("[ArcadesMap] brighter color =", brighterColor);

    const sourceId = "arcades";
    const handleLoad = () => {
      if (DEBUG) console.log("[ArcadesMap] map load event for clusters");
      if (mapInstance.getSource(sourceId)) {
        if (DEBUG) console.log("[ArcadesMap] source already exists, skipping addSource");
        return;
      }

      // Add empty clustered source; data will be filled when storeData arrives
      mapInstance.addSource(sourceId, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 14,
      });

      // Cluster circles
      mapInstance.addLayer({
        id: "arcade-clusters",
        type: "circle",
        source: sourceId,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": brighterColor,
          "circle-radius": [
            "step",
            ["get", "point_count"],
            clusterRadiusBase,
            10,
            clusterRadiusBase + clusterRadiusStep,
            50,
            clusterRadiusBase + clusterRadiusStep * 2,
          ],
          "circle-opacity": 0.9,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      // Cluster count labels
      mapInstance.addLayer({
        id: "arcade-cluster-count",
        type: "symbol",
        source: sourceId,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Regular"],
          "text-size": textSize,
        },
        paint: {
          "text-color": "#ffffff",
        },
      });

      // Unclustered points
      mapInstance.addLayer({
        id: "arcade-unclustered",
        type: "circle",
        source: sourceId,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": primaryColor,
          "circle-radius": unclusteredRadius,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      // Unclustered points labels
      mapInstance.addLayer({
        id: "arcade-unclustered-labels",
        type: "symbol",
        source: sourceId,
        minzoom: 9,
        filter: ["!", ["has", "point_count"]],
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-variable-anchor": ["top", "bottom", "left", "right"],
          "text-radial-offset": labelOffset,
          "text-justify": "auto",
          "text-size": labelTextSize,
        },
        paint: {
          "text-color": "#333333",
          "text-halo-color": "#ffffff",
          "text-halo-width": 2,
        },
      });

      // Click clusters to zoom in
      mapInstance.on("click", "arcade-clusters", (e: any) => {
        const features = mapInstance.queryRenderedFeatures(e.point, {
          layers: ["arcade-clusters"],
        });
        const cluster = features[0];

        if (!cluster) return;

        // Simply zoom in by 2 levels to break up the cluster
        mapInstance.easeTo({
          center: cluster.geometry.coordinates,
          zoom: mapInstance.getZoom() + 2,
        });
      });

      // Click unclustered points to show details and fly to
      mapInstance.on("click", "arcade-unclustered", (e: any) => {
        const feature = e.features[0];
        const coordinates = feature.geometry.coordinates.slice();
        const properties = feature.properties;

        // Find the full store object from storeData to get all details
        let fullStore: Store | null = null;
        const currentStoreData = storeDataRef.current;

        if (currentStoreData) {
          // First try to find by ID if available
          if (properties.id) {
            const searchId = BigInt(properties.id);
            for (const stores of Object.values(currentStoreData)) {
              const found = stores.find(s => s.id === searchId);
              if (found) {
                fullStore = found;
                break;
              }
            }
          }

          // Fallback to name/address matching if ID lookup failed
          if (!fullStore) {
            for (const stores of Object.values(currentStoreData)) {
              const found = stores.find(s =>
                s.name === properties.name && s.address === properties.address
              );
              if (found) {
                fullStore = found;
                break;
              }
            }
          }
        } else {
          if (DEBUG) console.log(`[ArcadesMap] No store data available`);
        }

        // Fallback if not found
        if (!fullStore) {
          console.log(`[ArcadesMap] No store found for name: ${properties.name}, id: ${properties.id}`);
          return;
        }

        // Set selected store
        setSelectedStore(fullStore);

        // Determine offset based on screen width (using window matchMedia to be fresh)
        const isSmallScreen = window.matchMedia("(max-width: 768px)").matches;

        // Fly to logic
        // Mobile: Shift center DOWN (offset y positive? No, if I want target to be HIGHER, I shift center coordinate UP?)
        // offset: "The center of the given bounds relative to the map's center".
        // If I want target to be at (center.x, center.y - 150), then offset should be [0, -150].
        // Wait, if offset is [0, 100], the center is at (w/2, h/2 + 100).
        // I want the target (the marker) to be visible in the remaining area.
        // Mobile: Drawer is at bottom. Visible area is Top.
        // Center of visible area is (w/2, (h - drawer)/2).
        // Map center is (w/2, h/2).
        // So visible center is y = h/2 - drawer/2.
        // So I want the marker to be at y = h/2 - drawer/2.
        // Relative to center, that is -drawer/2.
        // So offset should be [0, -drawerHeight/2].
        // Let's assume drawer is ~300px, so offset [0, -150].

        // Desktop: Card is at Left. Visible area is Right.
        // Center of visible area is ((w - card)/2 + card, h/2) = (w/2 + card/2, h/2).
        // So I want marker at x = w/2 + card/2.
        // Relative to center, that is +card/2.
        // So offset should be [cardWidth/2, 0].
        // Assume card is ~320px (w-80). Offset [160, 0].

        const offset: [number, number] = isSmallScreen ? [0, -150] : [160, 0];

        // If zoom is too low, zoom in. Otherwise keep current zoom.
        const currentZoom = mapInstance.getZoom();
        const targetZoom = currentZoom < 12 ? 12 : currentZoom;

        mapInstance.flyTo({
          center: coordinates,
          zoom: targetZoom,
          offset: offset,
          essential: true,
        });
      });

      // Change cursor on hover
      mapInstance.on("mouseenter", "arcade-clusters", () => {
        mapInstance.getCanvas().style.cursor = "pointer";
      });
      mapInstance.on("mouseleave", "arcade-clusters", () => {
        mapInstance.getCanvas().style.cursor = "";
      });

      mapInstance.on("mouseenter", "arcade-unclustered", () => {
        mapInstance.getCanvas().style.cursor = "pointer";
      });
      mapInstance.on("mouseleave", "arcade-unclustered", () => {
        mapInstance.getCanvas().style.cursor = "";
      });

      // If we already have store data at this point, populate the source immediately
      if (storeData) {
        if (DEBUG) console.log(
          "[ArcadesMap] setting initial cluster data from handleLoad, store data present"
        );
        const features = getGeoJSONFeatures(storeData);

        const geojson = {
          type: "FeatureCollection" as const,
          features,
        };

        const source = mapInstance.getSource(sourceId) as any | undefined;
        if (source) {
          if (DEBUG) console.log(
            "[ArcadesMap] handleLoad: setting source data, feature count =",
            features.length
          );
          source.setData(geojson);
        } else {
          if (DEBUG) console.log(
            "[ArcadesMap] handleLoad: source not found when trying to set initial data"
          );
        }
      } else {
        if (DEBUG) console.log(
          "[ArcadesMap] handleLoad: store data not available yet, waiting for update effect"
        );
      }

      if (DEBUG) console.log("[ArcadesMap] cluster layers added");
    };

    if (mapInstance.isStyleLoaded && mapInstance.isStyleLoaded()) {
      if (DEBUG) console.log("[ArcadesMap] style already loaded, calling handleLoad directly");
      handleLoad();
    } else {
      if (DEBUG) console.log("[ArcadesMap] style not loaded yet, attaching load listener");
      mapInstance.on("load", handleLoad);
    }

    return () => {
      if (!mapInstance) return;
      mapInstance.off("load", handleLoad);
    };
  }, [isMapLibreReady]);

  // Update source data when store data changes
  useEffect(() => {
    if (!map.current || !storeData) return;

    const mapInstance = map.current;
    const source = mapInstance.getSource("arcades") as any | undefined;
    if (!source) {
      if (DEBUG) console.log("[ArcadesMap] source 'arcades' not found yet");
      return;
    }

    // Build GeoJSON from store data
    const features = getGeoJSONFeatures(storeData);

    const geojson = {
      type: "FeatureCollection" as const,
      features,
    };

    if (DEBUG) console.log(
      "[ArcadesMap] setting source data, feature count =",
      features.length,
    );
    source.setData(geojson);
  }, [storeData]);

  // Handle GPS location
  const handleGeolocate = () => {
    if (!map.current || !window.maplibregl) return;

    const maplibregl = window.maplibregl;

    setIsLoadingLocation(true);

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;

          map.current?.flyTo({
            center: [longitude, latitude],
            zoom: 13,
            essential: true,
          });

          // Add user location marker
          const userMarker = new maplibregl.Marker({ color: "#ef4444" })
            .setLngLat([longitude, latitude])
            .addTo(map.current!);

          // Remove marker after 5 seconds
          setTimeout(() => {
            userMarker.remove();
          }, 5000);

          setIsLoadingLocation(false);
        },
        (error) => {
          console.error("Error getting location:", error);
          setIsLoadingLocation(false);
          alert("Unable to get your location. Please enable location services.");
        }
      );
    } else {
      setIsLoadingLocation(false);
      alert("Geolocation is not supported by your browser.");
    }
  };

  const closeSelection = () => {
    if (selectedStore && map.current) {
      // Recenter map on the selected store (without offset) when closing
      if (selectedStore.location) {
        const [lat, lng] = [selectedStore.location.y, selectedStore.location.x];
        map.current.flyTo({
          center: [lat, lng],
          offset: [0, 0],
          essential: true,
        });
      }
    }
    setSelectedStore(null);
  };

  const handleEditClick = () => {
    if (!isLoggedIn) {
      alert("Please log in to edit arcade data.");
      return;
    }
    setShowEditDrawer(true);
  };

  return (
    <>
      <Script
        src="https://unpkg.com/maplibre-gl/dist/maplibre-gl.js"
        strategy="afterInteractive"
        onLoad={() => {
          if (DEBUG) console.log("[ArcadesMap] maplibre-gl script loaded");
          setIsMapLibreReady(true);
        }}
      />

      <div className="relative w-full" style={{ height: "calc(100dvh - 170px)" }}>
        <div id="map" className="w-full h-full rounded-lg overflow-hidden bg-[#C2C8CA]" />

        {/* Floating GPS button */}
        <Button
          onClick={handleGeolocate}
          disabled={isLoadingLocation}
          className="absolute bottom-4 right-4 shadow-lg z-10 max-md:size-12"
          size="icon"
        >
          <Navigation className={`h-4 w-4 max-md:scale-130 ${isLoadingLocation ? "animate-spin" : ""}`} />
        </Button>

        {/* Desktop Card */}
        {!isMobile && selectedStore && (
          <Card className="absolute top-4 left-4 w-80 z-10 shadow-xl animate-in fade-in slide-in-from-left-5">
            <div className="absolute top-3 right-3 z-20">
              <Button variant="secondary" size="icon" className="h-8 w-8 rounded-full" onClick={closeSelection}>
                <X className="h-4 w-4 text-neutral-400 stroke-3" />
              </Button>
            </div>
            <CardContent>
              <ArcadeDetailsContent store={selectedStore} onEditClick={handleEditClick} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Mobile Drawer */}
      {isMobile && (
        <Drawer
          open={!!selectedStore}
          onOpenChange={(open) => !open && closeSelection()}
          modal={false}
        >
          <DrawerContent className="bg-card">
            <VisuallyHidden>
              <DrawerTitle>{selectedStore?.name || "Arcade Details"}</DrawerTitle>
              <DrawerDescription>{selectedStore?.address || "Address of the arcade"}</DrawerDescription>
            </VisuallyHidden>
            <div className="relative px-4 pt-4 pb-8"> {/* Adjusted padding to account for hidden header */}
              <div className="absolute -top-2 right-3 z-20">
                <Button variant="secondary" size="icon" className="h-8 w-8 rounded-full" onClick={closeSelection}>
                  <X className="h-4 w-4 text-neutral-400 stroke-3" />
                </Button>
              </div>
              <ArcadeDetailsContent store={selectedStore} onEditClick={handleEditClick} />
            </div>
          </DrawerContent>
        </Drawer>
      )}

      {/* Edit Drawer */}
      <StoreEditDrawer
        open={showEditDrawer}
        onOpenChange={setShowEditDrawer}
        store={selectedStore}
        isLoggedIn={isLoggedIn}
      />
    </>
  );
}

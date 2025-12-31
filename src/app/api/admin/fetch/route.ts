import { NextRequest, NextResponse } from "next/server";
import { load } from "cheerio";
import { isServerless } from "@/lib/utils";
import path from "path";
import fs from "fs/promises";
import { db } from "@/lib/db";
import { stores } from "@/lib/db/schema-pg";
import { sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    // Check for admin token authentication
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        { error: "Missing authorization token" },
        { status: 401 }
      );
    }

    // Validate token against environment variable
    const adminToken = process.env.ADMIN_UPDATE_TOKEN;
    if (!adminToken) {
      console.error("ADMIN_UPDATE_TOKEN environment variable not set");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    if (token !== adminToken) {
      console.warn("Invalid admin token attempt");
      return NextResponse.json(
        { error: "Invalid authorization token" },
        { status: 403 }
      );
    }

    return await fetchLocations();
  } catch (error) {
    console.error("Error in admin fetch route:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// Only allow GET requests
export async function POST() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405 }
  );
}

interface LocationEntry {
  name: string;
  address: string;
  coords: [number, number];
}

interface LocationData {
  [countryOrPrefecture: string]: LocationEntry[];
}

async function fetchLocations() {
  const regions = ["intl", "jp"] as const;
  const allLocationData: Record<string, LocationData> = {};
  let totalStores = 0;

  for (const region of regions) {
    console.log(`Admin fetch locations requested for region: ${region}`);

    try {
      // Determine base URL based on region
      const gm = region === "intl" ? "98" : "96";
      const baseUrl = `https://location.am-all.net/alm/location?gm=${gm}`;

      console.log(`Fetching initial page: ${baseUrl}`);

      // Fetch the initial page to get the list of countries/prefectures
      const initialResponse = await fetch(baseUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      });

      if (initialResponse.status !== 200) {
        throw new Error(`Failed to fetch initial page: HTTP ${initialResponse.status}`);
      }

      const initialHtml = await initialResponse.text();
      const $ = load(initialHtml);

      // Parse select options based on region
      const locationData: LocationData = {};
      const BATCH_SIZE = 8;

      if (region === "intl") {
        // For intl: find .country > select and parse options
        const countrySelect = $(".country > select[name='ct']");
        const options = countrySelect.find("option");

        console.log(`Found ${options.length} country options`);

        // Collect valid options
        const validOptions: Array<{ value: string; text: string }> = [];
        for (let i = 0; i < options.length; i++) {
          const option = options.eq(i);
          const value = option.attr("value");
          const text = option.text().trim();
          const isDisabled = option.attr("disabled") !== undefined;

          // Skip disabled options or Japan (no stores)
          if (isDisabled || !value) {
            console.log(`Skipping disabled/invalid option: ${text}`);
            continue;
          }

          validOptions.push({ value, text });
        }

        console.log(`Processing ${validOptions.length} valid countries in batches of ${BATCH_SIZE}`);

        // Process in batches
        for (let i = 0; i < validOptions.length; i += BATCH_SIZE) {
          const batch = validOptions.slice(i, i + BATCH_SIZE);
          console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(validOptions.length / BATCH_SIZE)} (${batch.length} countries)`);

          const batchPromises = batch.map(async ({ value, text }) => {
            console.log(`  Fetching stores for country: ${text} (ct=${value})`);
            try {
              const stores = await fetchStoresForLocation(gm, value, undefined);
              if (stores.length > 0) {
                console.log(`    Found ${stores.length} stores for ${text}`);
                return { text, stores };
              } else {
                console.log(`    No stores found for ${text}`);
                return null;
              }
            } catch (error) {
              console.error(`    Error fetching stores for ${text}:`, error);
              return null;
            }
          });

          const batchResults = await Promise.all(batchPromises);

          // Add results to locationData
          for (const result of batchResults) {
            if (result) {
              locationData[result.text] = result.stores;
            }
          }
        }
      } else {
        // For jp: find .pref > select and parse options
        const prefSelect = $(".pref > select[name='at']");
        const options = prefSelect.find("option");

        console.log(`Found ${options.length} prefecture options`);

        // Collect valid options
        const validOptions: Array<{ value: string; text: string }> = [];
        for (let i = 0; i < options.length; i++) {
          const option = options.eq(i);
          const value = option.attr("value");
          const text = option.text().trim();
          const isDisabled = option.attr("disabled") !== undefined;

          // Skip disabled options
          if (isDisabled || !value) {
            console.log(`Skipping disabled/invalid option: ${text}`);
            continue;
          }

          validOptions.push({ value, text });
        }

        console.log(`Processing ${validOptions.length} valid prefectures in batches of ${BATCH_SIZE}`);

        // Process in batches
        for (let i = 0; i < validOptions.length; i += BATCH_SIZE) {
          const batch = validOptions.slice(i, i + BATCH_SIZE);
          console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(validOptions.length / BATCH_SIZE)} (${batch.length} prefectures)`);

          const batchPromises = batch.map(async ({ value, text }) => {
            console.log(`  Fetching stores for prefecture: ${text} (at=${value})`);
            try {
              const stores = await fetchStoresForLocation(gm, "1000", value);
              if (stores.length > 0) {
                console.log(`    Found ${stores.length} stores for ${text}`);
                return { text, stores };
              } else {
                console.log(`    No stores found for ${text}`);
                return null;
              }
            } catch (error) {
              console.error(`    Error fetching stores for ${text}:`, error);
              return null;
            }
          });

          const batchResults = await Promise.all(batchPromises);

          // Add results to locationData
          for (const result of batchResults) {
            if (result) {
              locationData[result.text] = result.stores;
            }
          }
        }
      }

      allLocationData[region] = locationData;
      totalStores += Object.values(locationData).reduce((acc, curr) => acc + curr.length, 0);

      console.log(`Successfully fetched locations for region ${region}: ${Object.keys(locationData).length} areas`);

      // Save to JSON file if not in serverless environment
      if (!isServerless()) {
        try {
          const storesDir = path.join(process.cwd(), 'public', 'stores');
          await fs.mkdir(storesDir, { recursive: true });

          const filename = region === "intl" ? "intl.json" : "jp.json";
          const filePath = path.join(storesDir, filename);

          await fs.writeFile(filePath, JSON.stringify(locationData, null, 2), 'utf-8');
          console.log(`Successfully saved location data to ${filePath}`);
        } catch (error) {
          console.error("Error saving location data to file:", error);
          // Don't fail the request if file save fails
        }
      } else {
        console.log("Skipping file save in serverless environment");
      }
    } catch (error) {
      console.error(`Error fetching locations for region ${region}:`, error);
      // Continue to next region even if one fails
    }
  }

  // Update database
  console.log("Updating database with fetched stores...");
  try {
    let upsertCount = 0;

    for (const [region, locationData] of Object.entries(allLocationData)) {
      for (const [areaName, storesList] of Object.entries(locationData)) {
        const country = region === 'intl' ? areaName : 'Japan';
        const area = region === 'jp' ? areaName : null;

        for (const store of storesList) {
          const location = (store.coords[0] === 0 && store.coords[1] === 0)
            ? null
            : { x: store.coords[0], y: store.coords[1] };

          // Upsert store
          await db.insert(stores).values({
            country,
            area,
            name: store.name,
            address: store.address,
            location: location,
          }).onConflictDoUpdate({
            target: [stores.name, stores.address],
            set: {
              country: country,
              area: area,
              location: location,
              updatedAt: new Date(),
            }
          });
          upsertCount++;
        }
      }
    }
    console.log(`Successfully upserted ${upsertCount} stores to database`);
  } catch (error) {
    console.error("Error updating database:", error);
    return NextResponse.json(
      { error: "Failed to update database", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: allLocationData,
    totalStores,
  });
}

async function fetchStoresForLocation(
  gm: string,
  ct: string,
  at?: string
): Promise<LocationEntry[]> {
  // Build URL
  let url = `https://location.am-all.net/alm/location?gm=${gm}&ct=${ct}`;
  if (at) {
    url += `&at=${at}`;
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    },
  });

  if (response.status !== 200) {
    throw new Error(`Failed to fetch stores: HTTP ${response.status}`);
  }

  const html = await response.text();
  const $ = load(html);

  // Parse store list
  const stores: LocationEntry[] = [];
  const storeElements = $(".store_list > li");

  storeElements.each((index, element) => {
    try {
      const $store = $(element);

      // Extract name
      const name = $store.find(".store_name").text().trim();
      if (!name) return;

      // Extract address
      const address = $store.find(".store_address").text().trim();

      // Extract coordinates from onclick attribute
      const onclickAttr = $store.find(".store_bt_google_map").attr("onclick");
      if (!onclickAttr) return;

      // Parse coordinates from: window.open('//maps.google.com/maps?q=NAME@LAT,LNG&zoom=16','_blank')
      const coordMatch = onclickAttr.match(/@([-\d.]+),([-\d.]+)/);
      if (!coordMatch) return;

      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);

      stores.push({
        name,
        address,
        coords: [lat, lng],
      });
    } catch (error) {
      console.error(`Error parsing store element ${index}:`, error);
    }
  });

  return stores;
}

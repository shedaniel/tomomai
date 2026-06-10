import { NextRequest, NextResponse } from "next/server";
import { load } from "cheerio";
import { isServerless } from "@/lib/utils";
import { flushLogger } from "@/lib/logger";
import { requestLogger } from "@/lib/request-logger";
import path from "path";
import fs from "fs/promises";
import { db } from "@/lib/db";
import { stores } from "@/lib/db/schema-pg";
import type { Logger } from "pino";

export async function GET(request: NextRequest) {
  const { log, requestId } = requestLogger(request, "admin/fetch");
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
      log.error("ADMIN_UPDATE_TOKEN environment variable not set");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    if (token !== adminToken) {
      log.warn("Invalid admin token attempt");
      return NextResponse.json(
        { error: "Invalid authorization token" },
        { status: 403 }
      );
    }

    return await fetchLocations(log, requestId);
  } catch (error) {
    log.error({ err: error }, "Error in admin fetch route");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error", requestId },
      { status: 500 }
    );
  } finally {
    await flushLogger();
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

async function fetchLocations(log: Logger, requestId: string) {
  const regions = ["intl", "jp"] as const;
  const allLocationData: Record<string, LocationData> = {};
  let totalStores = 0;

  for (const region of regions) {
    log.info({ region }, "Admin fetch locations requested");

    try {
      // Determine base URL based on region
      const gm = region === "intl" ? "98" : "96";
      const baseUrl = `https://location.am-all.net/alm/location?gm=${gm}`;

      log.debug({ url: baseUrl }, "Fetching initial page");

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

        log.debug({ count: options.length }, "Found country options");

        // Collect valid options
        const validOptions: Array<{ value: string; text: string }> = [];
        for (let i = 0; i < options.length; i++) {
          const option = options.eq(i);
          const value = option.attr("value");
          const text = option.text().trim();
          const isDisabled = option.attr("disabled") !== undefined;

          // Skip disabled options or Japan (no stores)
          if (isDisabled || !value) {
            log.debug(`Skipping disabled/invalid option: ${text}`);
            continue;
          }

          validOptions.push({ value, text });
        }

        log.debug({ count: validOptions.length }, "Processing valid countries in batches");

        // Process in batches
        for (let i = 0; i < validOptions.length; i += BATCH_SIZE) {
          const batch = validOptions.slice(i, i + BATCH_SIZE);
          log.debug(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(validOptions.length / BATCH_SIZE)} (${batch.length} countries)`);

          const batchPromises = batch.map(async ({ value, text }) => {
            log.debug(`Fetching stores for country: ${text} (ct=${value})`);
            try {
              const stores = await fetchStoresForLocation(gm, value, undefined, log);
              if (stores.length > 0) {
                log.debug(`Found ${stores.length} stores for ${text}`);
                return { text, stores };
              } else {
                log.debug(`No stores found for ${text}`);
                return null;
              }
            } catch (error) {
              log.warn({ err: error }, `Error fetching stores for ${text}`);
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

        log.debug({ count: options.length }, "Found prefecture options");

        // Collect valid options
        const validOptions: Array<{ value: string; text: string }> = [];
        for (let i = 0; i < options.length; i++) {
          const option = options.eq(i);
          const value = option.attr("value");
          const text = option.text().trim();
          const isDisabled = option.attr("disabled") !== undefined;

          // Skip disabled options
          if (isDisabled || !value) {
            log.debug(`Skipping disabled/invalid option: ${text}`);
            continue;
          }

          validOptions.push({ value, text });
        }

        log.debug({ count: validOptions.length }, "Processing valid prefectures in batches");

        // Process in batches
        for (let i = 0; i < validOptions.length; i += BATCH_SIZE) {
          const batch = validOptions.slice(i, i + BATCH_SIZE);
          log.debug(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(validOptions.length / BATCH_SIZE)} (${batch.length} prefectures)`);

          const batchPromises = batch.map(async ({ value, text }) => {
            log.debug(`Fetching stores for prefecture: ${text} (at=${value})`);
            try {
              const stores = await fetchStoresForLocation(gm, "1000", value, log);
              if (stores.length > 0) {
                log.debug(`Found ${stores.length} stores for ${text}`);
                return { text, stores };
              } else {
                log.debug(`No stores found for ${text}`);
                return null;
              }
            } catch (error) {
              log.warn({ err: error }, `Error fetching stores for ${text}`);
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

      log.info({ region, count: Object.keys(locationData).length }, "Fetched locations for region");

      // Save to JSON file if not in serverless environment
      if (!isServerless()) {
        try {
          const storesDir = path.join(process.cwd(), 'public', 'stores');
          await fs.mkdir(storesDir, { recursive: true });

          const filename = region === "intl" ? "intl.json" : "jp.json";
          const filePath = path.join(storesDir, filename);

          await fs.writeFile(filePath, JSON.stringify(locationData, null, 2), 'utf-8');
          log.debug(`Saved location data to ${filePath}`);
        } catch (error) {
          log.warn({ err: error }, "Error saving location data to file");
          // Don't fail the request if file save fails
        }
      } else {
        log.debug("Skipping file save in serverless environment");
      }
    } catch (error) {
      log.error({ err: error, region }, "Error fetching locations for region");
      // Continue to next region even if one fails
    }
  }

  // Update database
  log.debug("Updating database with fetched stores");
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
    log.info({ count: upsertCount }, "Upserted stores to database");
  } catch (error) {
    log.error({ err: error }, "Error updating database");
    return NextResponse.json(
      { error: "Failed to update database", details: error instanceof Error ? error.message : String(error), requestId },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    requestId,
    data: allLocationData,
    totalStores,
  });
}

async function fetchStoresForLocation(
  gm: string,
  ct: string,
  at: string | undefined,
  log: Logger
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
      log.warn({ err: error, index }, "Error parsing store element");
    }
  });

  return stores;
}

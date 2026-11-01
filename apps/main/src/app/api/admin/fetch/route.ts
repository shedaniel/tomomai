import { NextResponse } from "next/server";
import { load } from "cheerio";
import { logger } from "@/lib/logger";
import { adminRoute } from "../admin-route";
import { isServerless } from "@/lib/utils";
import path from "path";
import fs from "fs/promises";
import { db } from "@/lib/db";
import { stores } from "@/lib/db/schema-pg";

export const GET = adminRoute("admin/fetch", ({ requestId }) => fetchLocations(requestId));

interface LocationEntry {
  name: string;
  address: string;
  coords: [number, number];
}

interface LocationData {
  [countryOrPrefecture: string]: LocationEntry[];
}

async function fetchLocations(requestId: string) {
  const regions = ["intl", "jp"] as const;
  const allLocationData: Record<string, LocationData> = {};
  let totalStores = 0;

  for (const region of regions) {
    logger.info({ region }, "Admin fetch locations requested");

    try {
      const gm = region === "intl" ? "98" : "96";
      const baseUrl = `https://location.am-all.net/alm/location?gm=${gm}`;

      logger.debug({ url: baseUrl }, "Fetching initial page");

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

      const locationData: LocationData = {};
      const BATCH_SIZE = 8;

      if (region === "intl") {
        const countrySelect = $(".country > select[name='ct']");
        const options = countrySelect.find("option");

        logger.debug({ count: options.length }, "Found country options");

        const validOptions: Array<{ value: string; text: string }> = [];
        for (let i = 0; i < options.length; i++) {
          const option = options.eq(i);
          const value = option.attr("value");
          const text = option.text().trim();
          const isDisabled = option.attr("disabled") !== undefined;

          // Skip disabled options or Japan (no stores)
          if (isDisabled || !value) {
            logger.debug(`Skipping disabled/invalid option: ${text}`);
            continue;
          }

          validOptions.push({ value, text });
        }

        logger.debug({ count: validOptions.length }, "Processing valid countries in batches");

        for (let i = 0; i < validOptions.length; i += BATCH_SIZE) {
          const batch = validOptions.slice(i, i + BATCH_SIZE);
          logger.debug(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(validOptions.length / BATCH_SIZE)} (${batch.length} countries)`);

          const batchPromises = batch.map(async ({ value, text }) => {
            logger.debug(`Fetching stores for country: ${text} (ct=${value})`);
            try {
              const stores = await fetchStoresForLocation(gm, value, undefined);
              if (stores.length > 0) {
                logger.debug(`Found ${stores.length} stores for ${text}`);
                return { text, stores };
              } else {
                logger.debug(`No stores found for ${text}`);
                return null;
              }
            } catch (error) {
              logger.warn({ err: error }, `Error fetching stores for ${text}`);
              return null;
            }
          });

          const batchResults = await Promise.all(batchPromises);

          for (const result of batchResults) {
            if (result) {
              locationData[result.text] = result.stores;
            }
          }
        }
      } else {
        const prefSelect = $(".pref > select[name='at']");
        const options = prefSelect.find("option");

        logger.debug({ count: options.length }, "Found prefecture options");

        const validOptions: Array<{ value: string; text: string }> = [];
        for (let i = 0; i < options.length; i++) {
          const option = options.eq(i);
          const value = option.attr("value");
          const text = option.text().trim();
          const isDisabled = option.attr("disabled") !== undefined;

          if (isDisabled || !value) {
            logger.debug(`Skipping disabled/invalid option: ${text}`);
            continue;
          }

          validOptions.push({ value, text });
        }

        logger.debug({ count: validOptions.length }, "Processing valid prefectures in batches");

        for (let i = 0; i < validOptions.length; i += BATCH_SIZE) {
          const batch = validOptions.slice(i, i + BATCH_SIZE);
          logger.debug(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(validOptions.length / BATCH_SIZE)} (${batch.length} prefectures)`);

          const batchPromises = batch.map(async ({ value, text }) => {
            logger.debug(`Fetching stores for prefecture: ${text} (at=${value})`);
            try {
              const stores = await fetchStoresForLocation(gm, "1000", value);
              if (stores.length > 0) {
                logger.debug(`Found ${stores.length} stores for ${text}`);
                return { text, stores };
              } else {
                logger.debug(`No stores found for ${text}`);
                return null;
              }
            } catch (error) {
              logger.warn({ err: error }, `Error fetching stores for ${text}`);
              return null;
            }
          });

          const batchResults = await Promise.all(batchPromises);

          for (const result of batchResults) {
            if (result) {
              locationData[result.text] = result.stores;
            }
          }
        }
      }

      allLocationData[region] = locationData;
      totalStores += Object.values(locationData).reduce((acc, curr) => acc + curr.length, 0);

      logger.info({ region, count: Object.keys(locationData).length }, "Fetched locations for region");

      if (!isServerless()) {
        try {
          const storesDir = path.join(process.cwd(), 'public', 'stores');
          await fs.mkdir(storesDir, { recursive: true });

          const filename = region === "intl" ? "intl.json" : "jp.json";
          const filePath = path.join(storesDir, filename);

          await fs.writeFile(filePath, JSON.stringify(locationData, null, 2), 'utf-8');
          logger.debug(`Saved location data to ${filePath}`);
        } catch (error) {
          logger.warn({ err: error }, "Error saving location data to file");
        }
      } else {
        logger.debug("Skipping file save in serverless environment");
      }
    } catch (error) {
      logger.error({ err: error, region }, "Error fetching locations for region");
    }
  }

  logger.debug("Updating database with fetched stores");
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
    logger.info({ count: upsertCount }, "Upserted stores to database");
  } catch (error) {
    logger.error({ err: error }, "Error updating database");
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
  at: string | undefined
): Promise<LocationEntry[]> {
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

  const stores: LocationEntry[] = [];
  const storeElements = $(".store_list > li");

  storeElements.each((index, element) => {
    try {
      const $store = $(element);

      const name = $store.find(".store_name").text().trim();
      if (!name) return;

      const address = $store.find(".store_address").text().trim();

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
      logger.warn({ err: error, index }, "Error parsing store element");
    }
  });

  return stores;
}

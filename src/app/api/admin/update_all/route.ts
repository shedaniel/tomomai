import { NextRequest, NextResponse } from "next/server";

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

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const maimaiToken = searchParams.get('token');

    if (!maimaiToken) {
      return NextResponse.json(
        { error: "Missing 'token' query parameter" },
        { status: 400 }
      );
    }

    console.log("Admin update_all requested: processing JP then INTL");

    // Step 1: Call /api/admin/update for JP
    console.log("Step 1: Fetching JP records from /api/admin/update...");
    const jpUpdateUrl = new URL(`${request.nextUrl.origin}/api/admin/update`);
    jpUpdateUrl.searchParams.set('region', 'jp');
    jpUpdateUrl.searchParams.set('token', maimaiToken);

    const jpUpdateResponse = await fetch(jpUpdateUrl.toString(), {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });

    if (!jpUpdateResponse.ok) {
      const errorText = await jpUpdateResponse.text();
      console.error(`Failed to fetch JP records: ${jpUpdateResponse.status} ${jpUpdateResponse.statusText}`);
      return NextResponse.json(
        { error: `Failed to fetch JP records: ${errorText}` },
        { status: jpUpdateResponse.status }
      );
    }

    const jpUpdateData = await jpUpdateResponse.json();
    if (!jpUpdateData.success || !jpUpdateData.records) {
      console.error("JP update response did not contain records");
      return NextResponse.json(
        { error: "JP update response did not contain records" },
        { status: 500 }
      );
    }

    const jpFallbackRecords = jpUpdateData.records;
    console.log(`Fetched ${jpFallbackRecords.length} JP records`);

    // Step 2: Call /api/admin/update_db for JP
    console.log("Step 2: Updating JP database with fallback records...");
    const jpUpdateDbUrl = new URL(`${request.nextUrl.origin}/api/admin/update_db`);
    jpUpdateDbUrl.searchParams.set('region', 'jp');

    const jpUpdateDbResponse = await fetch(jpUpdateDbUrl.toString(), {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fallbackRecords: jpFallbackRecords }),
    });

    if (!jpUpdateDbResponse.ok) {
      const errorText = await jpUpdateDbResponse.text();
      console.error(`Failed to update JP database: ${jpUpdateDbResponse.status} ${jpUpdateDbResponse.statusText}`);
      return NextResponse.json(
        { error: `Failed to update JP database: ${errorText}` },
        { status: jpUpdateDbResponse.status }
      );
    }

    const jpUpdateDbData = await jpUpdateDbResponse.json();
    console.log("JP database update completed:", jpUpdateDbData);

    // Step 3: Call /api/admin/update for INTL
    console.log("Step 3: Fetching INTL records from /api/admin/update...");
    const intlUpdateUrl = new URL(`${request.nextUrl.origin}/api/admin/update`);
    intlUpdateUrl.searchParams.set('region', 'intl');
    intlUpdateUrl.searchParams.set('token', maimaiToken);

    const intlUpdateResponse = await fetch(intlUpdateUrl.toString(), {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });

    if (!intlUpdateResponse.ok) {
      const errorText = await intlUpdateResponse.text();
      console.error(`Failed to fetch INTL records: ${intlUpdateResponse.status} ${intlUpdateResponse.statusText}`);
      return NextResponse.json(
        { error: `Failed to fetch INTL records: ${errorText}` },
        { status: intlUpdateResponse.status }
      );
    }

    const intlUpdateData = await intlUpdateResponse.json();
    if (!intlUpdateData.success || !intlUpdateData.records) {
      console.error("INTL update response did not contain records");
      return NextResponse.json(
        { error: "INTL update response did not contain records" },
        { status: 500 }
      );
    }

    const intlFallbackRecords = intlUpdateData.records;
    console.log(`Fetched ${intlFallbackRecords.length} INTL records`);

    // Step 4: Call /api/admin/update_db for INTL
    console.log("Step 4: Updating INTL database with fallback records...");
    const intlUpdateDbUrl = new URL(`${request.nextUrl.origin}/api/admin/update_db`);
    intlUpdateDbUrl.searchParams.set('region', 'intl');

    const intlUpdateDbResponse = await fetch(intlUpdateDbUrl.toString(), {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fallbackRecords: intlFallbackRecords }),
    });

    if (!intlUpdateDbResponse.ok) {
      const errorText = await intlUpdateDbResponse.text();
      console.error(`Failed to update INTL database: ${intlUpdateDbResponse.status} ${intlUpdateDbResponse.statusText}`);
      return NextResponse.json(
        { error: `Failed to update INTL database: ${errorText}` },
        { status: intlUpdateDbResponse.status }
      );
    }

    const intlUpdateDbData = await intlUpdateDbResponse.json();
    console.log("INTL database update completed:", intlUpdateDbData);

    return NextResponse.json({
      success: true,
      message: "All regions updated successfully",
      jp: jpUpdateDbData,
      intl: intlUpdateDbData,
    });

  } catch (error) {
    console.error("Error in admin update_all route:", error);
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


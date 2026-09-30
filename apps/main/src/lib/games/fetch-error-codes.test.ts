import { expect, it } from "vitest";
import { FETCH_START_ERROR_STATUS, fetchErrorDetail, formatFetchError, parseFetchErrorCode, type FetchErrorCode } from "./fetch-error-codes";

it("reads back every code it writes", () => {
  const codes: FetchErrorCode[] = [...Object.keys(FETCH_START_ERROR_STATUS) as FetchErrorCode[], "SUBSCRIPTION_REQUIRED"];
  for (const code of codes) {
    expect(parseFetchErrorCode(formatFetchError(code, "Detail: with a colon"))).toBe(code);
    expect(fetchErrorDetail(formatFetchError(code, "Detail: with a colon"))).toBe("Detail: with a colon");
  }
});

it("ignores messages without a known code prefix", () => {
  for (const message of ["Session expired or invalid. Please provide a new token.", "UNKNOWN_CODE: detail", "MAINTENANCE", " MAINTENANCE: detail"]) {
    expect(parseFetchErrorCode(message)).toBeNull();
    expect(fetchErrorDetail(message)).toBe(message);
  }
});

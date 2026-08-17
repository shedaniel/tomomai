import { getLocale } from "@tomomai/i18n/server";
import { getRequestConfig } from "next-intl/server";
import en from "../../messages/en.json";

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = (await requestLocale) ?? await getLocale();

  return { locale, messages: en };
});

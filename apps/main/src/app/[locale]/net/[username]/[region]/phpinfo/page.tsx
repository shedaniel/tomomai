import { PhpInfoBox, PhpInfoGrid, PhpInfoHeading, PhpInfoPage, PhpInfoRows, PhpInfoRule } from "@/components/net/hidden/net-phpinfo";
import { setStaticLocale } from "@/i18n/locale-server";
import { getNetTranslations } from "@/lib/net/messages";
import { loadNetPlayer, type NetPageParams } from "@/lib/net/player";

export const dynamic = "force-dynamic";

const SYSTEM_ROWS = [
  ["System", "system"], ["Build Date", "buildDate"], ["Server API", "serverApi"],
  ["Virtual Directory Support", "virtualDirectory"], ["Configuration File (php.ini) Path", "iniPath"],
  ["Loaded Configuration File", "iniLoaded"], ["PHP API", "phpApi"], ["Debug Build", "debugBuild"],
  ["Thread Safety", "threadSafety"], ["Registered PHP Streams", "streams"],
] as const;

const DIRECTIVES = [
  "display_errors", "error_reporting", "max_execution_time", "max_input_time", "memory_limit", "post_max_size",
  "session.auto_logout", "session.cookie_lifetime", "session.gc_maxlifetime", "short_open_tag",
  "upload_max_filesize", "date.timezone", "tomomai.uses_php",
] as const;

export default async function NetPhpInfoPage({ params }: NetPageParams) {
  const { locale, username, region } = await params;
  await setStaticLocale(locale);
  const [player, t] = await Promise.all([loadNetPlayer(username, region), getNetTranslations("home")]);
  const snapshot = player.snapshotData?.snapshot;
  const name = snapshot?.displayName ?? player.username;
  const rating = snapshot ? snapshot.rating.toLocaleString(locale) : t("hidden.phpinfo.playerRows.noRating");
  const p = (key: string, values?: Record<string, string | number>) => t(`hidden.phpinfo.${key}`, values);

  return (
    <PhpInfoPage version={p("version")} logo={p("logo")}>
      <PhpInfoRows rows={SYSTEM_ROWS.map(([label, key]) => [label, p(`system.${key}`)] as const)} />
      <PhpInfoBox>{p("zend")}</PhpInfoBox>
      <PhpInfoHeading>{p("configuration")}</PhpInfoHeading>
      <PhpInfoHeading>{p("core")}</PhpInfoHeading>
      <PhpInfoGrid
        heading={[p("directive"), p("localValue"), p("masterValue")]}
        rows={DIRECTIVES.map(key => {
          const id = key.replace(/\./g, "_");
          const local = p(`directives.${id}`);
          const masterKey = `hidden.phpinfo.masterOverrides.${id}`;
          return [key, local, t.has(masterKey) ? t(masterKey) : local];
        })}
      />
      <PhpInfoHeading>{p("player")}</PhpInfoHeading>
      <PhpInfoRows rows={[
        ["maimai support", p("playerRows.support")],
        [p("playerRows.name"), name],
        [p("playerRows.rating"), rating],
        [p("playerRows.region"), player.region],
        [p("playerRows.loggedIn"), p("playerRows.loggedInValue")],
      ]} />
      <PhpInfoHeading>{p("extensions")}</PhpInfoHeading>
      <PhpInfoBox>{p("extensionList")}</PhpInfoBox>
      <PhpInfoHeading>{p("variables")}</PhpInfoHeading>
      <PhpInfoGrid
        heading={[p("variable"), p("value")]}
        rows={[
          ["$_SESSION['logged_in']", p("variableRows.session")],
          ["$_COOKIE['remember_me']", p("variableRows.cookie")],
          ["$_SERVER['PHP_AUTH_USER']", p("variableRows.user", { name })],
          ["$_REQUEST['action']", p("variableRows.request")],
        ]}
      />
      <PhpInfoRule />
      <PhpInfoHeading>{p("license")}</PhpInfoHeading>
      <PhpInfoBox>{p("licenseBody")}</PhpInfoBox>
    </PhpInfoPage>
  );
}

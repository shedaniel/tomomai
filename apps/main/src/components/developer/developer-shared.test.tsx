import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { expect, it } from "vitest";
import { ScopeRoutesProvider, ScopeTreeNode } from "./developer-shared";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";

function renderReady(locale: string, messages: typeof en) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <ScopeRoutesProvider value={{ ready: ["GET /api/v1/ok", "GET /api/v1/me/scopes"] }}>
        <ScopeTreeNode
          node={{ key: "ready" }}
          selected={new Set()}
          expanded={new Set()}
          onToggle={() => {}}
          onToggleExpanded={() => {}}
          idPrefix="scope"
          scopeName={key => messages.settings.developer.scopes[key].name}
          scopeDescription={key => messages.settings.developer.scopes[key].description}
          badges={{}}
        />
      </ScopeRoutesProvider>
    </NextIntlClientProvider>,
  );
}

it("follows a scope's description with the routes it grants, in the reader's language", () => {
  expect(renderReady("en", en)).toContain("Basic access. Included by default. Grants GET /api/v1/ok and GET /api/v1/me/scopes.");
  expect(renderReady("ja", ja as typeof en)).toContain("GET /api/v1/ok、GET /api/v1/me/scopes を許可します。");
});

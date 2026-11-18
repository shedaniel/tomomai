// Generated from captured walkthroughs. Do not edit by hand.
import type { GuideFrame } from "@/components/guide-player";

export type DevtoolsFamily = "chromium" | "firefox" | "safari";

export const DEVTOOLS_GUIDES: Partial<Record<DevtoolsFamily, readonly GuideFrame[]>> = {
  "chromium": [
    {
      "src": "/guides/devtools/chromium/02-open-application-tab.webp",
      "viewport": {
        "width": 1280,
        "height": 800
      },
      "targets": [
        {
          "label": "applicationTab",
          "x": 506,
          "y": 331,
          "width": 86,
          "height": 26
        }
      ]
    },
    {
      "src": "/guides/devtools/chromium/03-expand-cookies.webp",
      "viewport": {
        "width": 1280,
        "height": 800
      },
      "targets": [
        {
          "label": "cookies",
          "x": 8,
          "y": 615,
          "width": 94,
          "height": 22
        }
      ]
    },
    {
      "src": "/guides/devtools/chromium/04-select-gateway-origin.webp",
      "viewport": {
        "width": 1280,
        "height": 800
      },
      "targets": [
        {
          "label": "gatewaySite",
          "x": 36,
          "y": 637,
          "width": 226,
          "height": 22
        }
      ]
    },
    {
      "src": "/guides/devtools/chromium/05-select-clal-row.webp",
      "viewport": {
        "width": 1280,
        "height": 800
      },
      "targets": [
        {
          "label": "clalRow",
          "x": 286,
          "y": 526,
          "width": 450,
          "height": 20
        }
      ]
    },
    {
      "src": "/guides/devtools/chromium/06-copy-clal-value.webp",
      "viewport": {
        "width": 1280,
        "height": 800
      },
      "targets": [
        {
          "label": "clalValue",
          "x": 286,
          "y": 627,
          "width": 444,
          "height": 22
        }
      ]
    }
  ],
  "firefox": [
    {
      "src": "/guides/devtools/firefox/02-open-storage-tab.webp",
      "viewport": {
        "width": 1280,
        "height": 800
      },
      "targets": [
        {
          "label": "storageTab",
          "x": 686,
          "y": 331,
          "width": 82,
          "height": 27
        }
      ]
    },
    {
      "src": "/guides/devtools/firefox/03-cookies-gateway-origin.webp",
      "viewport": {
        "width": 1280,
        "height": 800
      },
      "targets": [
        {
          "label": "cookies",
          "x": 2,
          "y": 385,
          "width": 86,
          "height": 22
        },
        {
          "label": "gatewaySite",
          "x": 1,
          "y": 408,
          "width": 267,
          "height": 24
        },
        {
          "label": "clalRow",
          "x": 271,
          "y": 527,
          "width": 349,
          "height": 20
        }
      ]
    },
    {
      "src": "/guides/devtools/firefox/06-copy-clal-value.webp",
      "viewport": {
        "width": 1280,
        "height": 800
      },
      "targets": [
        {
          "label": "clalValueDoubleClick",
          "x": 332,
          "y": 524,
          "width": 99,
          "height": 26
        }
      ]
    }
  ],
  "safari": [
    {
      "src": "/guides/devtools/safari/02-open-storage-tab.webp",
      "viewport": {
        "width": 1280,
        "height": 800
      },
      "targets": [
        {
          "label": "storageTab",
          "x": 766,
          "y": 301,
          "width": 117,
          "height": 27
        }
      ]
    },
    {
      "src": "/guides/devtools/safari/03-select-cookies.webp",
      "viewport": {
        "width": 1280,
        "height": 800
      },
      "targets": [
        {
          "label": "gatewayCookies",
          "x": 14,
          "y": 358,
          "width": 234,
          "height": 20
        }
      ]
    },
    {
      "src": "/guides/devtools/safari/04-select-clal-row.webp",
      "viewport": {
        "width": 1280,
        "height": 800
      },
      "targets": [
        {
          "label": "clalRow",
          "x": 302,
          "y": 467,
          "width": 330,
          "height": 20
        }
      ]
    },
    {
      "src": "/guides/devtools/safari/05-copy-clal-value.webp",
      "viewport": {
        "width": 1280,
        "height": 800
      },
      "targets": [
        {
          "label": "clalValueDoubleClick",
          "x": 290,
          "y": 368,
          "width": 184,
          "height": 26
        }
      ]
    }
  ]
};

/** The SEGA gateway's Not Found page, which is what opening it in the gateway step should show. */
export const GATEWAY_NOT_FOUND: Partial<Record<DevtoolsFamily, { src: string; width: number; height: number }>> = {
  "chromium": {
    "src": "/guides/devtools/chromium/not-found.webp",
    "width": 1280,
    "height": 345
  },
  "firefox": {
    "src": "/guides/devtools/firefox/not-found.webp",
    "width": 1280,
    "height": 345
  },
  "safari": {
    "src": "/guides/devtools/safari/not-found.webp",
    "width": 1280,
    "height": 345
  }
};

// Generated from captured walkthroughs. Do not edit by hand.
import type { GuideFrame } from "@/components/guide-player";
import type { BrowserId } from "./userscript-managers";

export type GuideManager = "tampermonkey-stable" | "tampermonkey-beta" | "violentmonkey" | "scriptcat";
export type GuidePhase = "script" | "cookies";

export const USERSCRIPT_GUIDES: Partial<Record<BrowserId, Partial<Record<GuideManager, Record<GuidePhase, readonly GuideFrame[]>>>>> = {
  "chrome": {
    "scriptcat": {
      "script": [
        {
          "src": "/guides/userscript/chromium/scriptcat/01-allow-user-scripts.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "allowUserScripts",
              "x": 972.3,
              "y": 639.3,
              "width": 26,
              "height": 16,
              "focus": {
                "x": 340,
                "y": 604,
                "width": 675,
                "height": 87
              }
            }
          ]
        },
        {
          "src": "/guides/userscript/chromium/scriptcat/02-install-script.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "installButton",
              "x": 866.9,
              "y": 101,
              "width": 136.6,
              "height": 40
            }
          ]
        }
      ],
      "cookies": [
        {
          "src": "/guides/userscript/chromium/scriptcat/03-cookie-prompt-permanent.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "permanentOption",
              "x": 704.5,
              "y": 633.4,
              "width": 136,
              "height": 30
            }
          ]
        },
        {
          "src": "/guides/userscript/chromium/scriptcat/04-cookie-prompt-allow.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "allowButton",
              "x": 421.5,
              "y": 690.4,
              "width": 204,
              "height": 40
            }
          ]
        }
      ]
    },
    "tampermonkey-beta": {
      "script": [
        {
          "src": "/guides/userscript/chromium/tampermonkey-beta/01-allow-user-scripts.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "allowUserScripts",
              "x": 972.3,
              "y": 599.3,
              "width": 26,
              "height": 16,
              "focus": {
                "x": 340,
                "y": 564,
                "width": 675,
                "height": 87
              }
            }
          ]
        },
        {
          "src": "/guides/userscript/chromium/tampermonkey-beta/02-install-script.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "installButton",
              "x": 162,
              "y": 249.9,
              "width": 51.9,
              "height": 26.7
            }
          ]
        }
      ],
      "cookies": []
    },
    "tampermonkey-stable": {
      "script": [
        {
          "src": "/guides/userscript/chromium/tampermonkey-stable/01-allow-user-scripts.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "allowUserScripts",
              "x": 972.3,
              "y": 599.3,
              "width": 26,
              "height": 16,
              "focus": {
                "x": 340,
                "y": 564,
                "width": 675,
                "height": 87
              }
            }
          ]
        },
        {
          "src": "/guides/userscript/chromium/tampermonkey-stable/02-install-script.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "installButton",
              "x": 162,
              "y": 249.9,
              "width": 51.9,
              "height": 26.7
            }
          ]
        }
      ],
      "cookies": [
        {
          "src": "/guides/userscript/chromium/tampermonkey-stable/03-open-settings-tab.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "settingsTab",
              "x": 1023.5,
              "y": 66.1,
              "width": 86.5,
              "height": 27.7
            }
          ]
        },
        {
          "src": "/guides/userscript/chromium/tampermonkey-stable/04-config-mode-advanced.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "configMode",
              "x": 506.4,
              "y": 120.1,
              "width": 81,
              "height": 20,
              "value": "Advanced",
              "focus": {
                "x": 4,
                "y": 104,
                "width": 623,
                "height": 79
              }
            }
          ]
        },
        {
          "src": "/guides/userscript/chromium/tampermonkey-stable/05-cookie-access-all.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "cookieAccess",
              "x": 506.4,
              "y": 434.9,
              "width": 233.5,
              "height": 20,
              "value": "All",
              "focus": {
                "x": 188,
                "y": 264,
                "width": 571,
                "height": 231
              }
            }
          ]
        },
        {
          "src": "/guides/userscript/chromium/tampermonkey-stable/06-security-save.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "securitySave",
              "x": 205.2,
              "y": 434.1,
              "width": 44.5,
              "height": 22
            }
          ]
        }
      ]
    },
    "violentmonkey": {
      "script": [
        {
          "src": "/guides/userscript/chromium/violentmonkey/01-allow-user-scripts.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "allowUserScripts",
              "x": 972.3,
              "y": 599.3,
              "width": 26,
              "height": 16,
              "focus": {
                "x": 340,
                "y": 564,
                "width": 675,
                "height": 87
              }
            }
          ]
        },
        {
          "src": "/guides/userscript/chromium/violentmonkey/02-install-script.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "installButton",
              "x": 72.5,
              "y": 236.1,
              "width": 119.4,
              "height": 23
            }
          ]
        }
      ],
      "cookies": [
        {
          "src": "/guides/userscript/chromium/violentmonkey/03-open-settings.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "settingsLink",
              "x": 65.7,
              "y": 261.8,
              "width": 115.3,
              "height": 32.8
            }
          ]
        },
        {
          "src": "/guides/userscript/chromium/violentmonkey/04-global-httponly-checkbox.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "httpOnlyGlobal",
              "x": 224,
              "y": 77.5,
              "width": 13,
              "height": 16.5,
              "focus": {
                "x": 208,
                "y": 60,
                "width": 723,
                "height": 67
              }
            }
          ]
        },
        {
          "src": "/guides/userscript/chromium/violentmonkey/05-open-script-editor.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "installedScriptsLink",
              "x": 54.2,
              "y": 229,
              "width": 126.8,
              "height": 32.8
            },
            {
              "label": "editScript",
              "x": 253,
              "y": 99,
              "width": 30,
              "height": 30,
              "focus": {
                "x": 100,
                "y": 52,
                "width": 327,
                "height": 103
              }
            }
          ]
        },
        {
          "src": "/guides/userscript/chromium/violentmonkey/06-editor-settings-tab.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "settingsTab",
              "x": 66.3,
              "y": 0,
              "width": 85.4,
              "height": 32.5
            }
          ]
        },
        {
          "src": "/guides/userscript/chromium/violentmonkey/07-script-httponly-checkbox.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "httpOnlyScript",
              "x": 28,
              "y": 149,
              "width": 13,
              "height": 13,
              "focus": {
                "x": 12,
                "y": 132,
                "width": 351,
                "height": 51
              }
            }
          ]
        },
        {
          "src": "/guides/userscript/chromium/violentmonkey/08-script-save.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "editorSave",
              "x": 1057.6,
              "y": 5.8,
              "width": 47.1,
              "height": 21
            }
          ]
        }
      ]
    }
  },
  "edge": {
    "scriptcat": {
      "script": [
        {
          "src": "/guides/userscript/edge/scriptcat/01-allow-user-scripts.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "allowUserScripts",
              "x": 1132,
              "y": 388,
              "width": 36,
              "height": 20,
              "focus": {
                "x": 388,
                "y": 372,
                "width": 796,
                "height": 91
              }
            }
          ]
        },
        {
          "src": "/guides/userscript/edge/scriptcat/02-install-script.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "installButton",
              "x": 866.9,
              "y": 101,
              "width": 136.6,
              "height": 40
            }
          ]
        }
      ],
      "cookies": [
        {
          "src": "/guides/userscript/edge/scriptcat/03-permission-permanent.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "permanentOption",
              "x": 704.5,
              "y": 633.4,
              "width": 136,
              "height": 30
            }
          ]
        },
        {
          "src": "/guides/userscript/edge/scriptcat/04-permission-allow.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "allowButton",
              "x": 421.5,
              "y": 690.4,
              "width": 204,
              "height": 40
            }
          ]
        }
      ]
    },
    "tampermonkey-stable": {
      "script": [
        {
          "src": "/guides/userscript/edge/tampermonkey-stable/01-allow-user-scripts.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "allowUserScripts",
              "x": 1132,
              "y": 388,
              "width": 36,
              "height": 20,
              "focus": {
                "x": 388,
                "y": 372,
                "width": 796,
                "height": 91
              }
            }
          ]
        },
        {
          "src": "/guides/userscript/edge/tampermonkey-stable/02-install-script.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "installButton",
              "x": 162,
              "y": 249.9,
              "width": 51.9,
              "height": 26.7
            }
          ]
        }
      ],
      "cookies": [
        {
          "src": "/guides/userscript/edge/tampermonkey-stable/03-config-mode.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "configMode",
              "x": 506.4,
              "y": 120.1,
              "width": 81,
              "height": 20,
              "value": "Advanced",
              "focus": {
                "x": 4,
                "y": 104,
                "width": 623,
                "height": 79
              }
            }
          ]
        },
        {
          "src": "/guides/userscript/edge/tampermonkey-stable/04-cookie-access.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "cookieAccess",
              "x": 506.4,
              "y": 434.9,
              "width": 233.5,
              "height": 20,
              "value": "All",
              "focus": {
                "x": 188,
                "y": 264,
                "width": 571,
                "height": 231
              }
            }
          ]
        },
        {
          "src": "/guides/userscript/edge/tampermonkey-stable/05-security-save.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "securitySave",
              "x": 205.2,
              "y": 434.1,
              "width": 44.5,
              "height": 22
            }
          ]
        }
      ]
    },
    "tampermonkey-beta": {
      "script": [
        {
          "src": "/guides/userscript/edge/tampermonkey-beta/01-allow-user-scripts.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "allowUserScripts",
              "x": 1132,
              "y": 388,
              "width": 36,
              "height": 20,
              "focus": {
                "x": 388,
                "y": 372,
                "width": 796,
                "height": 91
              }
            }
          ]
        },
        {
          "src": "/guides/userscript/edge/tampermonkey-beta/02-install-script.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "installButton",
              "x": 162,
              "y": 249.9,
              "width": 51.9,
              "height": 26.7
            }
          ]
        }
      ],
      "cookies": []
    },
    "violentmonkey": {
      "script": [
        {
          "src": "/guides/userscript/edge/violentmonkey/01-allow-user-scripts.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "allowUserScripts",
              "x": 1132,
              "y": 388,
              "width": 36,
              "height": 20,
              "focus": {
                "x": 388,
                "y": 372,
                "width": 796,
                "height": 91
              }
            }
          ]
        },
        {
          "src": "/guides/userscript/edge/violentmonkey/02-install-script.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "installButton",
              "x": 72.5,
              "y": 236.1,
              "width": 119.4,
              "height": 23
            }
          ]
        }
      ],
      "cookies": [
        {
          "src": "/guides/userscript/edge/violentmonkey/03-global-httponly.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "httpOnlyGlobal",
              "x": 224,
              "y": 77.5,
              "width": 691.6,
              "height": 16.5,
              "focus": {
                "x": 208,
                "y": 60,
                "width": 724,
                "height": 67
              }
            }
          ]
        },
        {
          "src": "/guides/userscript/edge/violentmonkey/04-open-script.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "editScript",
              "x": 253,
              "y": 99,
              "width": 30,
              "height": 30,
              "focus": {
                "x": 100,
                "y": 52,
                "width": 327,
                "height": 103
              }
            }
          ]
        },
        {
          "src": "/guides/userscript/edge/violentmonkey/05-editor-settings-tab.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "settingsTab",
              "x": 66.3,
              "y": 0,
              "width": 85.4,
              "height": 32.5
            }
          ]
        },
        {
          "src": "/guides/userscript/edge/violentmonkey/06-script-httponly.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "httpOnlyGlobal",
              "x": 28,
              "y": 148.5,
              "width": 319.4,
              "height": 16.5
            }
          ]
        },
        {
          "src": "/guides/userscript/edge/violentmonkey/07-save-close.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "saveAndClose",
              "x": 1104.7,
              "y": 5.8,
              "width": 100.9,
              "height": 21
            }
          ]
        }
      ]
    }
  },
  "firefox": {
    "scriptcat": {
      "script": [
        {
          "src": "/guides/userscript/firefox/scriptcat/01-request-userscripts-permission.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "requestPermission",
              "x": 16,
              "y": 59.5,
              "width": 156.2,
              "height": 28
            }
          ]
        },
        {
          "src": "/guides/userscript/firefox/scriptcat/03-install-userscript.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "installButton",
              "x": 868.3,
              "y": 101,
              "width": 136.7,
              "height": 40
            }
          ]
        }
      ],
      "cookies": [
        {
          "src": "/guides/userscript/firefox/scriptcat/04-cookie-permission-prompt.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "permanentOption",
              "x": 706,
              "y": 633.4,
              "width": 136,
              "height": 30
            },
            {
              "label": "allowButton",
              "x": 423,
              "y": 690.4,
              "width": 204,
              "height": 40
            }
          ]
        }
      ]
    },
    "tampermonkey-stable": {
      "script": [
        {
          "src": "/guides/userscript/firefox/tampermonkey-stable/01-install-userscript.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "installButton",
              "x": 162,
              "y": 252.9,
              "width": 47.9,
              "height": 26.7
            }
          ]
        }
      ],
      "cookies": [
        {
          "src": "/guides/userscript/firefox/tampermonkey-stable/02-open-extensions-menu.webp",
          "viewport": {
            "width": 1280,
            "height": 884
          },
          "targets": [
            {
              "label": "extensionsButton",
              "x": 1202,
              "y": 44,
              "width": 36,
              "height": 40,
              "focus": {
                "x": 1160,
                "y": 28,
                "width": 119,
                "height": 72
              }
            }
          ]
        },
        {
          "src": "/guides/userscript/firefox/tampermonkey-stable/03-dashboard-settings-tab.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "settingsTab",
              "x": 1023.3,
              "y": 66.1,
              "width": 86.5,
              "height": 27.8
            }
          ]
        },
        {
          "src": "/guides/userscript/firefox/tampermonkey-stable/04-config-mode-advanced.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "configMode",
              "x": 506.4,
              "y": 120.1,
              "width": 88.8,
              "height": 22,
              "value": "Advanced",
              "focus": {
                "x": 5,
                "y": 104,
                "width": 630,
                "height": 83
              }
            }
          ]
        },
        {
          "src": "/guides/userscript/firefox/tampermonkey-stable/05-cookie-access-all.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "cookieAccess",
              "x": 506.4,
              "y": 433.6,
              "width": 241.4,
              "height": 22,
              "value": "All",
              "focus": {
                "x": 188,
                "y": 276,
                "width": 576,
                "height": 335
              }
            }
          ]
        },
        {
          "src": "/guides/userscript/firefox/tampermonkey-stable/06-security-save.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "securitySave",
              "x": 205.2,
              "y": 433.8,
              "width": 40.5,
              "height": 22,
              "focus": {
                "x": 188,
                "y": 292,
                "width": 531,
                "height": 180
              }
            }
          ]
        }
      ]
    },
    "tampermonkey-beta": {
      "script": [
        {
          "src": "/guides/userscript/firefox/tampermonkey-beta/01-install-userscript.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "installButton",
              "x": 162,
              "y": 252.9,
              "width": 47.9,
              "height": 26.7
            }
          ]
        }
      ],
      "cookies": [
        {
          "src": "/guides/userscript/firefox/tampermonkey-beta/02-cookie-access-default-all.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": []
        }
      ]
    },
    "violentmonkey": {
      "script": [
        {
          "src": "/guides/userscript/firefox/violentmonkey/01-install-userscript.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "installButton",
              "x": 72.5,
              "y": 237.1,
              "width": 119.4,
              "height": 23
            }
          ]
        }
      ],
      "cookies": [
        {
          "src": "/guides/userscript/firefox/violentmonkey/02-open-extensions-menu.webp",
          "viewport": {
            "width": 1280,
            "height": 884
          },
          "targets": [
            {
              "label": "extensionsButton",
              "x": 1202,
              "y": 44,
              "width": 36,
              "height": 40,
              "focus": {
                "x": 1160,
                "y": 28,
                "width": 119,
                "height": 72
              }
            }
          ]
        },
        {
          "src": "/guides/userscript/firefox/violentmonkey/03-dashboard-settings.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "settingsLink",
              "x": 65.4,
              "y": 261.8,
              "width": 115.6,
              "height": 32.8
            }
          ]
        },
        {
          "src": "/guides/userscript/firefox/violentmonkey/04-global-httponly.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "httpOnlyGlobal",
              "x": 224,
              "y": 77.5,
              "width": 14,
              "height": 17,
              "focus": {
                "x": 208,
                "y": 60,
                "width": 727,
                "height": 71
              }
            }
          ]
        },
        {
          "src": "/guides/userscript/firefox/violentmonkey/05-open-script-editor.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "installedScriptsLink",
              "x": 54.1,
              "y": 229,
              "width": 126.9,
              "height": 32.8
            },
            {
              "label": "editScript",
              "x": 253,
              "y": 99,
              "width": 30,
              "height": 30,
              "focus": {
                "x": 100,
                "y": 52,
                "width": 595,
                "height": 163
              }
            }
          ]
        },
        {
          "src": "/guides/userscript/firefox/violentmonkey/06-editor-settings-tab.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "settingsTab",
              "x": 66.3,
              "y": 0,
              "width": 85.4,
              "height": 33
            }
          ]
        },
        {
          "src": "/guides/userscript/firefox/violentmonkey/07-script-httponly.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "httpOnlyScript",
              "x": 28,
              "y": 180,
              "width": 14,
              "height": 14,
              "focus": {
                "x": 12,
                "y": 164,
                "width": 355,
                "height": 47
              }
            }
          ]
        },
        {
          "src": "/guides/userscript/firefox/violentmonkey/08-script-save.webp",
          "viewport": {
            "width": 1280,
            "height": 800
          },
          "targets": [
            {
              "label": "editorSave",
              "x": 1057.3,
              "y": 6,
              "width": 47.1,
              "height": 21
            }
          ]
        }
      ]
    }
  }
};

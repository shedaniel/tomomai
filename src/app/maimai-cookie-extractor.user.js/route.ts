import { NextResponse } from 'next/server';

export async function GET() {
  const userscript = `// ==UserScript==
// @name         maimai Cookie Extractor
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Extract clal cookie from maimai authentication page
// @author       shedaniel
// @match        https://lng-tgk-aime-gw.am-all.net/common_auth*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Create the copy button
    function createCopyButton() {
        const button = document.createElement('button');
        button.innerHTML = '📋 Copy maimai cookie';
        button.style.cssText = \`
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            padding: 12px 16px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
            transition: all 0.3s ease;
            font-family: Arial, sans-serif;
        \`;

        // Hover effects
        button.addEventListener('mouseenter', () => {
            button.style.background = '#45a049';
            button.style.transform = 'translateY(-2px)';
            button.style.boxShadow = '0 6px 12px rgba(0,0,0,0.3)';
        });

        button.addEventListener('mouseleave', () => {
            button.style.background = '#4CAF50';
            button.style.transform = 'translateY(0)';
            button.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
        });

        return button;
    }

    // Extract and copy cookie function
    function extractAndCopyCookie() {
        try {
            // Get all cookies and split them
            const cookies = document.cookie.split(';');

            // Filter for cookies starting with 'clal='
            const clalCookies = cookies
                .map(cookie => cookie.trim())
                .filter(cookie => cookie.startsWith('clal='));

            let result;
            if (clalCookies.length > 0) {
                result = clalCookies[0];

                // Copy to clipboard
                navigator.clipboard.writeText(result).then(() => {
                    // Success notification
                    showNotification('✅ Cookie copied to clipboard!', '#4CAF50');
                    console.log('Copied cookie:', result);
                }).catch(err => {
                    // Fallback for older browsers
                    const textArea = document.createElement('textarea');
                    textArea.value = result;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);

                    showNotification('✅ Cookie copied to clipboard!', '#4CAF50');
                    console.log('Copied cookie (fallback):', result);
                });

                // Also show the cookie in alert for verification
                alert(\`Cookie found and copied:\\n\\n\${result}\`);
            } else {
                result = 'Cookie not found! Are you on the correct page? Have you logged in?';
                showNotification('❌ ' + result, '#f44336');
                alert(result);
            }
        } catch (error) {
            const errorMsg = 'Error extracting cookie: ' + error.message;
            showNotification('❌ ' + errorMsg, '#f44336');
            alert(errorMsg);
            console.error('Cookie extraction error:', error);
        }
    }

    // Show notification function
    function showNotification(message, color) {
        const notification = document.createElement('div');
        notification.innerHTML = message;
        notification.style.cssText = \`
            position: fixed;
            top: 80px;
            right: 20px;
            z-index: 10001;
            padding: 12px 16px;
            background: \${color};
            color: white;
            border-radius: 8px;
            font-size: 14px;
            font-weight: bold;
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
            font-family: Arial, sans-serif;
            max-width: 300px;
            word-wrap: break-word;
        \`;

        document.body.appendChild(notification);

        // Remove notification after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }

    // Initialize the script
    function init() {
        // Wait for page to load
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
            return;
        }

        // Create and add the button
        const copyButton = createCopyButton();
        copyButton.addEventListener('click', extractAndCopyCookie);
        document.body.appendChild(copyButton);

        console.log('maimai cookie extractor loaded successfully');
    }

    // Start the script
    init();
})();`;

  return new NextResponse(userscript, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Content-Disposition': 'attachment; filename="maimai-cookie-extractor.user.js"',
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
    },
  });
}

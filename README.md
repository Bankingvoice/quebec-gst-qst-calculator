# Québec GST + QST calculator

A small bilingual (English/French) ChatGPT Apps SDK app for the recurring invoice task: enter a pre-tax amount and get the GST/QST (TPS/TVQ), total tax, and final invoice total immediately.

The standalone widget starts in English. Use the **FR** button to switch to French; the choice is remembered in the browser. You can also open the page with `#fr` at the end of the URL to start in French.

## App shape and tool plan

This is a `vanilla-widget` app. It uses one read-only, idempotent MCP tool:

- `calculate_gst_qst` — accepts a non-negative pre-tax subtotal in CAD and applies 5% GST plus 9.975% QST to that same subtotal. Each tax is rounded to the nearest cent before the total is calculated.

The widget uses the MCP Apps bridge (`ui/initialize`, `ui/notifications/tool-result`, and `tools/call`) first. It also supports `window.openai` as an additive ChatGPT compatibility path and has a browser-only local fallback for quick visual checks.

## Run locally

Install dependencies and start the MCP server:

```powershell
npm install
npm start
```

The server listens on `http://localhost:8787/mcp` by default. `GET /` is a small health check, and `GET /calculator` serves the same widget as a standalone browser calculator. Set `PORT` to use another port.

Run the calculation tests with:

```powershell
npm test
```

## Connect to ChatGPT Developer Mode

1. Run the server locally.
2. Expose it through an HTTPS tunnel, for example `ngrok http 8787`.
3. In ChatGPT, enable Developer mode in Settings and add a new app/connector using the public tunnel URL plus `/mcp`.
4. Start a chat with the app enabled and ask: `Calculate GST and QST on $1,250 before tax.`
5. Refresh the app connection after changing tool metadata or the widget template.

## Use it on an iPhone

There are two different ways to use the app:

### Standalone iPhone calculator

This is the practical option for the current ChatGPT mobile limitation.

1. Start the server on the desktop with `npm start`.
2. Keep the desktop and iPhone on the same Wi-Fi network.
3. On Windows, run `ipconfig` and find the desktop's IPv4 address, for example `192.168.1.25`.
4. On the iPhone, open `http://192.168.1.25:8787/calculator` in Safari. If Windows Firewall prompts you, allow Node.js on Private networks.
5. In Safari, tap Share → Add to Home Screen.

If the desktop and iPhone are not on the same network, run `ngrok http 8787` and open the HTTPS URL plus `/calculator` on the iPhone. Keep the desktop server and tunnel running while you use it.

### ChatGPT app on iPhone

Custom MCP apps are currently supported through ChatGPT web, not the ChatGPT iPhone app. Use the desktop/browser Developer Mode flow with the public HTTPS `/mcp` URL. For an iPhone Home Screen experience, use the standalone `/calculator` route above.

## Share a no-install link with GitHub Pages

The repository includes a root `index.html` entry page, so GitHub Pages can host the calculator without Node.js. After uploading the repository to GitHub:

1. Open the repository on GitHub and select **Settings**.
2. Open **Pages** under **Code and automation**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Choose the `main` branch and the `/ (root)` folder, then click **Save**.
5. Share the published address, usually `https://YOUR-USERNAME.github.io/quebec-gst-qst-calculator/`. Add `#fr` to open the French version by default.

This static link runs the calculator in the browser. It does not provide the `/mcp` endpoint for ChatGPT; the MCP server still needs a Node-compatible host or a running desktop tunnel.

## Tax assumption

The app is intended for ordinary taxable supplies where the entered amount is before tax. GST and QST are calculated separately on the same selling price, matching the two-step Québec calculation described by [Revenu Québec](https://www.revenuquebec.ca/en/businesses/consumption-taxes/gsthst-and-qst/collecting-gst-and-qst/calculating-the-taxes/). Confirm special cases such as exempt, zero-rated, tax-included, or industry-specific supplies before issuing an invoice.

## Files

- `server.js` — Streamable HTTP MCP server and tool/resource registration.
- `src/calculator.js` — pure calculation logic.
- `public/gst-qst-widget.html` — self-contained widget UI.
- `test/calculator.test.js` — calculation tests.


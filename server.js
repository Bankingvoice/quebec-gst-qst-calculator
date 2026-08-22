import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { calculateGstQst, GST_RATE, QST_RATE } from "./src/calculator.js";

const APP_VERSION = "0.1.0";
const MCP_PATH = "/mcp";
const CALCULATOR_PATH = "/calculator";
const port = Number(process.env.PORT ?? 8787);
const here = dirname(fileURLToPath(import.meta.url));
const widgetHtml = readFileSync(join(here, "public", "gst-qst-widget.html"), "utf8");
const WIDGET_URI = "ui://widget/gst-qst/v1.html";

const calculateInputSchema = {
  subtotal: z
    .number()
    .finite()
    .min(0)
    .max(1_000_000_000)
    .describe("Pre-tax invoice subtotal in Canadian dollars."),
};

const calculationOutputSchema = {
  subtotal: z.number(),
  gstRate: z.number(),
  gstAmount: z.number(),
  qstRate: z.number(),
  qstAmount: z.number(),
  totalTax: z.number(),
  total: z.number(),
};

function createCalculatorServer() {
  const server = new McpServer({
    name: "quebec-gst-qst-calculator",
    version: APP_VERSION,
  });

  registerAppResource(
    server,
    "gst-qst-widget",
    WIDGET_URI,
    {},
    async () => ({
      contents: [
        {
          uri: WIDGET_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: widgetHtml,
          _meta: {
            ui: {
              prefersBorder: false,
              csp: {
                connectDomains: [],
                resourceDomains: [],
              },
            },
            "openai/widgetDescription":
              "A compact Québec invoice calculator showing the subtotal, GST, QST, total tax, and final total.",
          },
        },
      ],
    }),
  );

  registerAppTool(
    server,
    "calculate_gst_qst",
    {
      title: "Calculate GST + QST",
      description:
        "Use this when the user wants to calculate Québec GST and QST on a pre-tax invoice subtotal. Applies 5% GST and 9.975% QST separately to the same subtotal, rounds each tax to the nearest cent, and returns the invoice total.",
      inputSchema: calculateInputSchema,
      outputSchema: calculationOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
      _meta: {
        ui: {
          resourceUri: WIDGET_URI,
        },
        "openai/outputTemplate": WIDGET_URI,
        "openai/widgetDescription":
          "Shows a clear Québec GST/QST invoice breakdown for the amount provided.",
        "openai/toolInvocation/invoking": "Calculating GST + QST…",
        "openai/toolInvocation/invoked": "Tax breakdown ready",
      },
    },
    async ({ subtotal }) => {
      const result = calculateGstQst(subtotal);

      return {
        structuredContent: result,
        content: [
          {
            type: "text",
            text: `GST: $${result.gstAmount.toFixed(2)}; QST: $${result.qstAmount.toFixed(2)}; total: $${result.total.toFixed(2)}.`,
          },
        ],
      };
    },
  );

  return server;
}

const httpServer = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end("Missing URL");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "OPTIONS" && url.pathname === MCP_PATH) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-session-id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end(`Québec GST/QST calculator MCP server (${GST_RATE * 100}% GST, ${QST_RATE * 100}% QST)`);
    return;
  }

  if (req.method === "GET" && (url.pathname === CALCULATOR_PATH || url.pathname === `${CALCULATOR_PATH}/`)) {
    res.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    });
    res.end(widgetHtml);
    return;
  }

  const mcpMethods = new Set(["POST", "GET", "DELETE"]);
  if (url.pathname === MCP_PATH && req.method && mcpMethods.has(req.method)) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    const server = createCalculatorServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on("close", () => {
      transport.close();
      server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.writeHead(500).end("Internal server error");
      }
    }
    return;
  }

  res.writeHead(404).end("Not Found");
});

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Québec GST/QST calculator listening on http://localhost:${port}${MCP_PATH}`);
});

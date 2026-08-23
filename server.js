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
import { SPEECH_MAX_CHARACTERS, SPEECH_MIME_TYPE, SPEECH_VOICES, synthesizeSpeech } from "./src/speech.js";

const APP_VERSION = "0.1.0";
const MCP_PATH = "/mcp";
const CALCULATOR_PATH = "/calculator";
const SPEECH_PATH = "/speech";
const API_SPEECH_PATH = "/api/speech";
const port = Number(process.env.PORT ?? 8787);
const here = dirname(fileURLToPath(import.meta.url));
const widgetHtml = readFileSync(join(here, "public", "gst-qst-widget.html"), "utf8");
const speechWidgetHtml = readFileSync(join(here, "public", "speech-widget.html"), "utf8");
const WIDGET_URI = "ui://widget/gst-qst/v1.html";
const SPEECH_WIDGET_URI = "ui://widget/gst-qst-voice/v1.html";

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

const speechInputSchema = {
  text: z
    .string()
    .trim()
    .min(1)
    .max(SPEECH_MAX_CHARACTERS)
    .describe("The English or French passage to turn into spoken audio."),
  language: z.enum(["en", "fr"]).default("en").describe("The language of the passage: en for English or fr for French."),
  voice: z.enum(SPEECH_VOICES).default("marin").describe("The built-in voice to use."),
  speed: z.number().min(0.7).max(1.3).default(0.95).describe("Speaking speed from 0.7 (slower) to 1.3 (faster)."),
};

const speechOutputSchema = {
  text: z.string(),
  language: z.enum(["en", "fr"]),
  voice: z.string(),
  speed: z.number(),
  model: z.string(),
  mimeType: z.literal(SPEECH_MIME_TYPE),
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

  registerAppResource(
    server,
    "gst-qst-voice-widget",
    SPEECH_WIDGET_URI,
    {},
    async () => ({
      contents: [
        {
          uri: SPEECH_WIDGET_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: speechWidgetHtml,
          _meta: {
            ui: {
              prefersBorder: false,
              csp: {
                connectDomains: [],
                resourceDomains: [],
              },
            },
            "openai/widgetDescription":
              "A bilingual English and French text-to-speech practice player with speed control, transcript hiding, and audio download.",
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

  registerAppTool(
    server,
    "generate_speech",
    {
      title: "Generate English or French speech",
      description:
        "Use this when the user wants an English or French passage converted into natural spoken audio for listening, read-along, pronunciation, or dictation practice. The generated voice is AI-generated.",
      inputSchema: speechInputSchema,
      outputSchema: speechOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
        idempotentHint: true,
      },
      _meta: {
        ui: {
          resourceUri: SPEECH_WIDGET_URI,
        },
        "openai/outputTemplate": SPEECH_WIDGET_URI,
        "openai/widgetDescription":
          "Plays an AI-generated English or French passage and provides a transcript for language practice.",
        "openai/toolInvocation/invoking": "Generating speech…",
        "openai/toolInvocation/invoked": "Speech ready",
      },
    },
    async (input) => {
      const result = await synthesizeSpeech(input);
      return {
        structuredContent: {
          text: result.text,
          language: result.language,
          voice: result.voice,
          speed: result.speed,
          model: result.model,
          mimeType: result.mimeType,
        },
        content: [
          {
            type: "text",
            text: `Audio generated in ${result.language === "fr" ? "French" : "English"} using the ${result.voice} voice.`,
          },
          {
            type: "audio",
            data: result.audioData,
            mimeType: result.mimeType,
          },
        ],
        _meta: {
          audioData: result.audioData,
          mimeType: result.mimeType,
          text: result.text,
          language: result.language,
          voice: result.voice,
          speed: result.speed,
        },
      };
    },
  );

  return server;
}

function readJsonBody(req, maxBytes = 100_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("Request body is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  res.end(payload);
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

  if (req.method === "OPTIONS" && url.pathname === API_SPEECH_PATH) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
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

  if (req.method === "GET" && (url.pathname === SPEECH_PATH || url.pathname === `${SPEECH_PATH}/`)) {
    res.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    });
    res.end(speechWidgetHtml);
    return;
  }

  if (req.method === "POST" && url.pathname === API_SPEECH_PATH) {
    try {
      const request = await readJsonBody(req);
      const result = await synthesizeSpeech(request);
      const audioBuffer = Buffer.from(result.audioData, "base64");
      res.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "cache-control": "no-store",
        "content-length": audioBuffer.length,
        "content-type": result.mimeType,
      });
      res.end(audioBuffer);
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : "Speech generation failed." });
    }
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

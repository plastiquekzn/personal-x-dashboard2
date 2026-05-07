import { z } from "zod";

import { getAppEnv } from "@/lib/env";

const geminiExtractionSchema = z.object({
  post_lines: z.array(z.string().trim()).default([]),
  post_text: z.string().trim().default(""),
  summary: z.string().trim().default(""),
  posted_at_iso: z.string().trim().nullable().default(null),
  replies_count: z.number().int().nonnegative().nullable().default(null),
  reposts_count: z.number().int().nonnegative().nullable().default(null),
  likes_count: z.number().int().nonnegative().nullable().default(null),
  views_count: z.number().int().nonnegative().nullable().default(null),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
  ignored_content: z.string().trim().default("")
});

type GeminiExtraction = z.infer<typeof geminiExtractionSchema>;

const geminiMetricsSchema = z.object({
  replies_count: z.number().int().nonnegative().nullable().default(null),
  reposts_count: z.number().int().nonnegative().nullable().default(null),
  likes_count: z.number().int().nonnegative().nullable().default(null),
  views_count: z.number().int().nonnegative().nullable().default(null),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
  notes: z.string().trim().default("")
});

type GeminiMetrics = z.infer<typeof geminiMetricsSchema>;

class ProviderRequestError extends Error {
  status: number;
  responseText: string;
  provider: string;

  constructor(message: string, status: number, responseText: string, provider: string) {
    super(message);
    this.name = "ProviderRequestError";
    this.status = status;
    this.responseText = responseText;
    this.provider = provider;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPrompt(nowIsoDate: string) {
  return [
    "You extract structured data from screenshots of X/Twitter posts.",
    "Return only JSON matching the provided schema.",
    "Focus only on the top-level visible tweet/post authored in the screenshot.",
    "Ignore repost banners such as 'You reposted'.",
    "Ignore quoted tweets, nested tweet cards, link preview cards, text inside attached images, text inside embedded screenshots, and text inside videos.",
    "Ignore UI chrome such as profile names outside the main tweet body, side icons, bookmarks, menu buttons, and unrelated counters.",
    "Extract the main post text only.",
    "Return post_lines as an ordered array of the main post's visible lines or logical paragraph lines.",
    "Never concatenate multiple visible lines into one item.",
    "If the tweet contains separate paragraphs, keep them as separate items in post_lines.",
    "If the tweet contains list items, keep each list item as its own item in post_lines.",
    "Return post_text too, and it must include newline characters between those same lines.",
    "The value should look clean when pasted into a textarea.",
    "Return summary as one short plain-English line about what the post is saying or signaling.",
    "Keep summary under 16 words, with no hashtags, no emoji, and no quotation marks.",
    "For posted_at_iso:",
    `- Today's date is ${nowIsoDate}.`,
    "- If only month and day are visible, infer the year from today's date.",
    "- If no time is visible, use 00:00:00Z.",
    "- If the date cannot be determined, return null.",
    "For metrics:",
    "- replies_count, reposts_count, likes_count, and views_count must refer to the top-level post only.",
    "- Convert abbreviations like 1.5K into full integers like 1500.",
    "- If a metric is not visible or not reliable, return null.",
    "If the screenshot contains a large attached image with text, do not mix that text into post_text.",
    "If the screenshot contains a quoted tweet below, do not mix that quoted tweet text into post_text.",
    "Set confidence to high only if the main text and visible metrics/date are clearly extracted."
  ].join("\n");
}

function buildMetricsPrompt() {
  return [
    "You extract only engagement metrics from a screenshot of an X/Twitter post.",
    "Return only JSON matching the provided schema.",
    "The first image is the full screenshot for context.",
    "If a second image is provided, it is a focused crop around the lower interaction row of that same top-level tweet.",
    "Focus only on the top-level tweet/post metrics.",
    "Use the top-most complete interaction row that belongs to the main tweet.",
    "Ignore metrics from quoted tweets, embedded posts, attached media, or lower tweets in the screenshot.",
    "Read the interaction row from left to right in this order: replies, reposts, likes, views.",
    "Do not confuse reposts with replies.",
    "If the row shows 4 under the reply icon and 1 under the repost icon, then replies_count is 4 and reposts_count is 1.",
    "Convert abbreviations like 1.5K into full integers like 1500.",
    "If a metric is truly not visible, return null.",
    "If there are multiple tweet cards visible, use only the top-most main tweet.",
    "If views appear inline near the timestamp, still return them as views_count."
  ].join("\n");
}

function normalizePostedAt(postedAtIso: string | null) {
  if (!postedAtIso) {
    return "";
  }

  const parsed = new Date(postedAtIso);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function normalizePostText(extraction: GeminiExtraction) {
  const lines = extraction.post_lines
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length > 0) {
    return lines.join("\n");
  }

  return extraction.post_text;
}

function shouldTryFallbackModel(error: unknown) {
  if (!(error instanceof ProviderRequestError)) {
    return false;
  }

  if (error.status === 503) {
    return true;
  }

  return error.status === 429 && /quota|resource_exhausted|rate limit/i.test(`${error.message}\n${error.responseText}`);
}

function shouldTryNextGeminiKey(error: unknown) {
  if (!(error instanceof ProviderRequestError)) {
    return false;
  }

  if ([429, 500, 503].includes(error.status)) {
    return true;
  }

  return /quota|resource_exhausted|rate limit|high demand|unavailable/i.test(`${error.message}\n${error.responseText}`);
}

async function requestGeminiJson<T>({
  apiKey,
  model,
  images,
  prompt,
  schema
}: {
  apiKey: string;
  model: string;
  images: Array<{
    imageBase64: string;
    mimeType: string;
  }>;
  prompt: string;
  schema: object;
}) {
  const requestBody = {
    contents: [
      {
        parts: [
          { text: prompt },
          ...images.map(({ imageBase64, mimeType }) => ({
            inline_data: {
              mime_type: mimeType || "image/png",
              data: imageBase64
            }
          }))
        ]
      }
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseJsonSchema: schema
    }
  };

  let responseText = "";
  let lastStatus = 500;

  for (const delayMs of [0, 1200, 2500]) {
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody),
        cache: "no-store"
      }
    );

    responseText = await response.text();
    lastStatus = response.status;

    if (response.ok) {
      const parsedResponse = z
        .object({
          candidates: z
            .array(
              z.object({
                content: z.object({
                  parts: z.array(
                    z.object({
                      text: z.string().optional()
                    })
                  )
                })
              })
            )
            .min(1)
        })
        .safeParse(JSON.parse(responseText));

      if (!parsedResponse.success) {
        throw new Error("Gemini returned an unexpected response shape.");
      }

      const jsonText = parsedResponse.data.candidates[0]?.content.parts.find((part) => part.text)?.text;

      if (!jsonText) {
        throw new Error("Gemini did not return extraction text.");
      }

      return JSON.parse(jsonText) as T;
    }

    if (![429, 500, 503].includes(response.status)) {
      throw new ProviderRequestError(
        `Gemini request failed: ${response.status} ${responseText}`,
        response.status,
        responseText,
        "gemini"
      );
    }
  }

  throw new ProviderRequestError(
    `Gemini request failed after retries: ${lastStatus} ${responseText}`,
    lastStatus,
    responseText,
    "gemini"
  );
}

async function requestOpenRouterJson<T>({
  apiKey,
  model,
  images,
  prompt,
  schema
}: {
  apiKey: string;
  model: string;
  images: Array<{
    imageBase64: string;
    mimeType: string;
  }>;
  prompt: string;
  schema: object;
}) {
  const requestBody = {
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          ...images.map(({ imageBase64, mimeType }) => ({
            type: "image_url",
            image_url: {
              url: `data:${mimeType || "image/png"};base64,${imageBase64}`
            }
          }))
        ]
      }
    ],
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "tweet_extraction",
        strict: true,
        schema
      }
    }
  };

  let responseText = "";
  let lastStatus = 500;

  for (const delayMs of [0, 1200, 2500]) {
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://localhost:3000",
        "X-Title": "Personal X Dashboard"
      },
      body: JSON.stringify(requestBody),
      cache: "no-store"
    });

    responseText = await response.text();
    lastStatus = response.status;

    if (response.ok) {
      const parsedResponse = z
        .object({
          choices: z
            .array(
              z.object({
                message: z.object({
                  content: z.union([
                    z.string(),
                    z.array(
                      z.object({
                        type: z.string().optional(),
                        text: z.string().optional()
                      })
                    )
                  ])
                })
              })
            )
            .min(1)
        })
        .safeParse(JSON.parse(responseText));

      if (!parsedResponse.success) {
        throw new Error("OpenRouter returned an unexpected response shape.");
      }

      const content = parsedResponse.data.choices[0]?.message.content;
      const jsonText =
        typeof content === "string" ? content : content.map((part) => part.text ?? "").join("").trim();

      if (!jsonText) {
        throw new Error("OpenRouter did not return extraction text.");
      }

      return JSON.parse(jsonText) as T;
    }

    if (![429, 500, 503].includes(response.status)) {
      throw new ProviderRequestError(
        `OpenRouter request failed: ${response.status} ${responseText}`,
        response.status,
        responseText,
        "openrouter"
      );
    }
  }

  throw new ProviderRequestError(
    `OpenRouter request failed after retries: ${lastStatus} ${responseText}`,
    lastStatus,
    responseText,
    "openrouter"
  );
}

async function requestGeminiJsonWithKeyRotation<T>({
  apiKeys,
  model,
  images,
  prompt,
  schema
}: {
  apiKeys: string[];
  model: string;
  images: Array<{
    imageBase64: string;
    mimeType: string;
  }>;
  prompt: string;
  schema: object;
}) {
  let lastError: unknown = null;
  const triedKeyIndexes: number[] = [];

  for (let index = 0; index < apiKeys.length; index += 1) {
    triedKeyIndexes.push(index + 1);

    try {
      const data = await requestGeminiJson<T>({
        apiKey: apiKeys[index],
        model,
        images,
        prompt,
        schema
      });

      return {
        data,
        keyIndex: index + 1
      };
    } catch (error) {
      lastError = error;

      if (!shouldTryNextGeminiKey(error) || index === apiKeys.length - 1) {
        if (error instanceof ProviderRequestError) {
          throw new ProviderRequestError(
            `${error.message}\nTried Gemini keys: ${triedKeyIndexes.join(", ")}`,
            error.status,
            error.responseText,
            error.provider
          );
        }

        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Gemini request failed.");
}

export async function extractTweetFromScreenshot(options: {
  fileName: string;
  mimeType: string;
  imageBase64: string;
  metricsCropBase64?: string | null;
  metricsCropMimeType?: string | null;
}) {
  const env = getAppEnv();

  const provider = env.aiProvider === "openrouter" ? "openrouter" : "gemini";
  const apiKey = provider === "openrouter" ? env.openRouterApiKey : env.geminiApiKey;
  const geminiApiKeys = env.geminiApiKeys;
  const primaryModel = provider === "openrouter" ? env.openRouterModel : env.geminiModel;
  const fallbackModel = provider === "openrouter" ? env.openRouterFallbackModel : env.geminiFallbackModel;
  const metricsModel = provider === "openrouter" ? env.openRouterMetricsModel : env.geminiMetricsModel;
  const requestJson = provider === "openrouter" ? requestOpenRouterJson : requestGeminiJson;

  if (provider === "gemini" && geminiApiKeys.length === 0) {
    throw new Error("Gemini API key is missing.");
  }

  if (provider === "openrouter" && !apiKey) {
    throw new Error("OpenRouter API key is missing.");
  }

  const extractionSchema = {
    type: "object",
    properties: {
      post_lines: {
        type: "array",
        items: { type: "string" },
        description: "Ordered visible lines or logical paragraph lines from the top-level tweet only."
      },
      post_text: {
        type: "string",
        description:
          "Top-level tweet text only, excluding quoted tweets and embedded media text, with newline characters between lines."
      },
      summary: {
        type: "string",
        description: "Short plain-English summary of the top-level tweet in one line."
      },
      posted_at_iso: {
        type: ["string", "null"],
        description: "ISO 8601 timestamp for the top-level tweet. Use inferred current year when only month/day is visible."
      },
      replies_count: {
        type: ["integer", "null"],
        description: "Top-level tweet reply count as a full integer."
      },
      reposts_count: {
        type: ["integer", "null"],
        description: "Top-level tweet repost count as a full integer."
      },
      likes_count: {
        type: ["integer", "null"],
        description: "Top-level tweet like count as a full integer."
      },
      views_count: {
        type: ["integer", "null"],
        description: "Top-level tweet view count as a full integer."
      },
      confidence: {
        type: "string",
        enum: ["low", "medium", "high"],
        description: "Overall extraction confidence."
      },
      ignored_content: {
        type: "string",
        description: "Short note about nested or embedded content that was ignored."
      }
    },
    required: [
      "post_lines",
      "post_text",
      "summary",
      "posted_at_iso",
      "replies_count",
      "reposts_count",
      "likes_count",
      "views_count",
      "confidence",
      "ignored_content"
    ],
    additionalProperties: false
  } satisfies object;

  const metricsSchema = {
    type: "object",
    properties: {
      replies_count: {
        type: ["integer", "null"]
      },
      reposts_count: {
        type: ["integer", "null"]
      },
      likes_count: {
        type: ["integer", "null"]
      },
      views_count: {
        type: ["integer", "null"]
      },
      confidence: {
        type: "string",
        enum: ["low", "medium", "high"]
      },
      notes: {
        type: "string"
      }
    },
    required: ["replies_count", "reposts_count", "likes_count", "views_count", "confidence", "notes"],
    additionalProperties: false
  } satisfies object;

  async function runMainExtraction(model: string) {
    const images = [
      {
        imageBase64: options.imageBase64,
        mimeType: options.mimeType
      }
    ];

    if (provider === "gemini") {
      const result = await requestGeminiJsonWithKeyRotation<GeminiExtraction>({
        apiKeys: geminiApiKeys,
        model,
        images,
        prompt: buildPrompt(new Date().toISOString().slice(0, 10)),
        schema: extractionSchema
      });

      return {
        extraction: geminiExtractionSchema.parse(result.data) satisfies GeminiExtraction,
        keyIndex: result.keyIndex
      };
    }

    return {
      extraction:
        geminiExtractionSchema.parse(
          await requestJson<GeminiExtraction>({
            apiKey,
            model,
            images,
            prompt: buildPrompt(new Date().toISOString().slice(0, 10)),
            schema: extractionSchema
          })
        ) satisfies GeminiExtraction,
      keyIndex: null as number | null
    };
  }

  let extractionModelUsed = primaryModel;
  let extractionKeyIndex: number | null = null;
  let extraction = null as GeminiExtraction | null;

  try {
    const result = await runMainExtraction(primaryModel);
    extraction = result.extraction;
    extractionKeyIndex = result.keyIndex;
  } catch (error) {
    if (!shouldTryFallbackModel(error) || fallbackModel === primaryModel) {
      throw error;
    }

    extractionModelUsed = fallbackModel;
    const result = await runMainExtraction(fallbackModel);
    extraction = result.extraction;
    extractionKeyIndex = result.keyIndex;
  }

  let metricsRepair: GeminiMetrics | null = null;
  let metricsModelUsed = metricsModel;
  let metricsKeyIndex: number | null = null;

  try {
    const images = [
      {
        imageBase64: options.imageBase64,
        mimeType: options.mimeType
      },
      ...(options.metricsCropBase64
        ? [
            {
              imageBase64: options.metricsCropBase64,
              mimeType: options.metricsCropMimeType || "image/png"
            }
          ]
        : [])
    ];

    if (provider === "gemini") {
      const result = await requestGeminiJsonWithKeyRotation<GeminiMetrics>({
        apiKeys: geminiApiKeys,
        model: metricsModel,
        images,
        prompt: buildMetricsPrompt(),
        schema: metricsSchema
      });

      metricsRepair = geminiMetricsSchema.parse(result.data);
      metricsKeyIndex = result.keyIndex;
    } else {
      metricsRepair = geminiMetricsSchema.parse(
        await requestJson<GeminiMetrics>({
          apiKey,
          model: metricsModel,
          images,
          prompt: buildMetricsPrompt(),
          schema: metricsSchema
        })
      );
    }
  } catch (error) {
    if (shouldTryFallbackModel(error) && fallbackModel !== metricsModel) {
      try {
        metricsModelUsed = fallbackModel;
        const images = [
          {
            imageBase64: options.imageBase64,
            mimeType: options.mimeType
          },
          ...(options.metricsCropBase64
            ? [
                {
                  imageBase64: options.metricsCropBase64,
                  mimeType: options.metricsCropMimeType || "image/png"
                }
              ]
            : [])
        ];

        if (provider === "gemini") {
          const result = await requestGeminiJsonWithKeyRotation<GeminiMetrics>({
            apiKeys: geminiApiKeys,
            model: fallbackModel,
            images,
            prompt: buildMetricsPrompt(),
            schema: metricsSchema
          });

          metricsRepair = geminiMetricsSchema.parse(result.data);
          metricsKeyIndex = result.keyIndex;
        } else {
          metricsRepair = geminiMetricsSchema.parse(
            await requestJson<GeminiMetrics>({
              apiKey,
              model: fallbackModel,
              images,
              prompt: buildMetricsPrompt(),
              schema: metricsSchema
            })
          );
        }
      } catch (fallbackError) {
        console.warn(`${provider} metrics repair fallback pass failed.`, fallbackError);
      }
    } else {
      console.warn(`${provider} metrics repair pass failed.`, error);
    }
  }

  const preferMetricsRepair = metricsRepair?.confidence !== "low";
  const repairedExtraction = {
    ...extraction,
    replies_count:
      preferMetricsRepair && metricsRepair?.replies_count !== null && metricsRepair?.replies_count !== undefined
        ? metricsRepair.replies_count
        : extraction.replies_count,
    reposts_count:
      preferMetricsRepair && metricsRepair?.reposts_count !== null && metricsRepair?.reposts_count !== undefined
        ? metricsRepair.reposts_count
        : extraction.reposts_count,
    likes_count:
      preferMetricsRepair && metricsRepair?.likes_count !== null && metricsRepair?.likes_count !== undefined
        ? metricsRepair.likes_count
        : extraction.likes_count,
    views_count:
      preferMetricsRepair && metricsRepair?.views_count !== null && metricsRepair?.views_count !== undefined
        ? metricsRepair.views_count
        : extraction.views_count
  };

  return {
    postText: normalizePostText(repairedExtraction),
    summary: repairedExtraction.summary,
    postedAt: normalizePostedAt(repairedExtraction.posted_at_iso),
    repliesCount: repairedExtraction.replies_count === null ? "" : String(repairedExtraction.replies_count),
    repostsCount: repairedExtraction.reposts_count === null ? "" : String(repairedExtraction.reposts_count),
    likesCount: repairedExtraction.likes_count === null ? "" : String(repairedExtraction.likes_count),
    viewsCount: repairedExtraction.views_count === null ? "" : String(repairedExtraction.views_count),
    confidence: repairedExtraction.confidence,
    modelLabel: `${provider === "openrouter" ? "OpenRouter" : "Gemini"} · ${extractionModelUsed}`,
    rawText: JSON.stringify(
      {
        provider,
        model: extractionModelUsed,
        metrics_model: metricsModelUsed,
        fileName: options.fileName,
        model_key_index: extractionKeyIndex,
        metrics_key_index: metricsKeyIndex,
        extraction: repairedExtraction,
        metrics_repair: metricsRepair
      },
      null,
      2
    )
  };
}

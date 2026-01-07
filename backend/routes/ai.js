import express from "express";
import prisma from "../prisma/client.js";
import { authenticate, requireFullAccess, hasFullAccess, userHasPermission } from "../middleware/auth.js";
import logger from "../utils/logger.js";
import encryptionService from "../modules/mautic/services/encryption.js";

const router = express.Router();

const LLM_MODELS = {
  openai: [
    { id: "gpt-4o-mini", name: "GPT-4o Mini (Fast & Affordable)" },
    { id: "gpt-4o", name: "GPT-4o (Powerful)" },
    { id: "gpt-4-turbo", name: "GPT-4 Turbo" },
    { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo (Budget)" },
  ],
  anthropic: [
    { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
    { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku (Fast)" },
  ],
};

router.get("/settings", authenticate, requireFullAccess, async (req, res) => {
  try {
    let settings = await prisma.aISettings.findFirst();

    if (!settings) {
      settings = await prisma.aISettings.create({
        data: {
          llmProvider: "openai",
          llmModel: "gpt-4o-mini",
          voiceProvider: "elevenlabs",
          assistantName: "Bevy",
          isEnabled: false,
        },
      });
    }

    const safeSettings = {
      ...settings,
      llmApiKey: settings.llmApiKey ? "●●●●●●●●" : null,
      voiceApiKey: settings.voiceApiKey ? "●●●●●●●●" : null,
    };

    res.json({ success: true, settings: safeSettings, models: LLM_MODELS });
  } catch (error) {
    logger.error("Error fetching AI settings", { error: error.message });
    res.status(500).json({ success: false, message: "Failed to fetch AI settings" });
  }
});

router.put("/settings", authenticate, requireFullAccess, async (req, res) => {
  try {
    const { llmProvider, llmApiKey, llmModel, voiceProvider, voiceApiKey, voiceId, assistantName, isEnabled } = req.body;

    let existing = await prisma.aISettings.findFirst();

    const updateData = {
      llmProvider: llmProvider || "openai",
      llmModel: llmModel || "gpt-4o-mini",
      voiceProvider: voiceProvider || "elevenlabs",
      voiceId: voiceId || null,
      assistantName: assistantName || "Bevy",
      isEnabled: isEnabled ?? false,
    };

    if (llmApiKey && llmApiKey !== "●●●●●●●●") {
      updateData.llmApiKey = encryptionService.encrypt(llmApiKey);
    }
    if (voiceApiKey && voiceApiKey !== "●●●●●●●●") {
      updateData.voiceApiKey = encryptionService.encrypt(voiceApiKey);
    }

    let settings;
    if (existing) {
      settings = await prisma.aISettings.update({
        where: { id: existing.id },
        data: updateData,
      });
    } else {
      settings = await prisma.aISettings.create({ data: updateData });
    }

    const safeSettings = {
      ...settings,
      llmApiKey: settings.llmApiKey ? "●●●●●●●●" : null,
      voiceApiKey: settings.voiceApiKey ? "●●●●●●●●" : null,
    };

    res.json({ success: true, settings: safeSettings });
  } catch (error) {
    logger.error("Error updating AI settings", { error: error.message });
    res.status(500).json({ success: false, message: "Failed to update AI settings" });
  }
});

router.get("/voices", authenticate, async (req, res) => {
  try {
    const settings = await prisma.aISettings.findFirst();
    if (!settings?.voiceApiKey) {
      return res.json({ success: true, voices: [] });
    }

    const apiKey = encryptionService.decrypt(settings.voiceApiKey);
    const response = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": apiKey },
    });

    if (!response.ok) {
      return res.json({ success: false, message: "Failed to fetch voices" });
    }

    const data = await response.json();
    const voices = data.voices?.map((v) => ({ id: v.voice_id, name: v.name, preview: v.preview_url })) || [];

    res.json({ success: true, voices });
  } catch (error) {
    logger.error("Error fetching ElevenLabs voices", { error: error.message });
    res.status(500).json({ success: false, message: "Failed to fetch voices" });
  }
});

async function getClientStats(userId, clientId) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      assignments: { include: { user: { select: { id: true, name: true } } } },
      mauticClient: true,
    },
  });

  if (!client) return null;

  const mauticData = client.mauticClient
    ? {
        totalEmails: client.mauticClient.totalEmails || 0,
        totalCampaigns: client.mauticClient.totalCampaigns || 0,
        totalSegments: client.mauticClient.totalSegments || 0,
        totalContacts: client.mauticClient.totalContacts || 0,
        activeContacts30d: client.mauticClient.activeContacts30d || 0,
        lastSync: client.mauticClient.lastSyncAt,
      }
    : null;

  return {
    id: client.id,
    name: client.name,
    type: client.clientType,
    isActive: client.isActive,
    assignedUsers: client.assignments.map((a) => a.user.name),
    mautic: mauticData,
  };
}

async function getAllAccessibleClients(user) {
  const fullAccess = hasFullAccess(user);

  let whereClause = {};

  if (fullAccess) {
    whereClause = {};
  } else if (userHasPermission(user, 'Clients', 'Read') || userHasPermission(user, 'Clients', 'Create')) {
    whereClause = {
      OR: [
        { createdById: user.id },
        { assignments: { some: { userId: user.id } } },
      ],
    };
  } else {
    whereClause = {
      assignments: { some: { userId: user.id } },
    };
  }

  return prisma.client.findMany({
    where: whereClause,
    include: {
      mauticClient: true,
      assignments: { include: { user: { select: { id: true, name: true } } } },
    },
  });
}

function buildSystemPrompt(assistantName, clientsContext) {
  return `You are ${assistantName}, an AI assistant for DigitalBevy - a business management platform.
You help users understand their client data, marketing campaigns, and business metrics.

Available client data:
${clientsContext}

Guidelines:
- Be concise and helpful
- Provide specific numbers when asked about statistics
- If asked about a client you don't have data for, say so politely
- Format responses for readability
- When comparing clients, use clear comparisons
- Always be professional and supportive`;
}

async function callOpenAI(apiKey, model, messages) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 1000,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "OpenAI API error");
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function callAnthropic(apiKey, model, messages) {
  const systemMsg = messages.find((m) => m.role === "system")?.content || "";
  const userMsgs = messages.filter((m) => m.role !== "system");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1000,
      system: systemMsg,
      messages: userMsgs,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Anthropic API error");
  }

  const data = await response.json();
  return data.content[0].text;
}

router.post("/chat", authenticate, async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, message: "Message is required" });
    }

    const settings = await prisma.aISettings.findFirst();
    
    let apiKey = null;
    let provider = settings?.llmProvider || 'openai';
    
    if (settings?.llmApiKey) {
      apiKey = encryptionService.decrypt(settings.llmApiKey);
    } else if (provider === 'openai' && process.env.OPENAI_API_KEY) {
      apiKey = process.env.OPENAI_API_KEY;
    } else if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
      apiKey = process.env.ANTHROPIC_API_KEY;
    }

    if (!settings?.isEnabled || !apiKey) {
      return res.status(400).json({
        success: false,
        message: "AI assistant is not configured. Please contact your administrator.",
      });
    }

    const clients = await getAllAccessibleClients(req.user);
    const clientsContext = clients
      .map((c) => {
        const mautic = c.mauticClient;
        return `- ${c.name} (${c.clientType}): ${c.isActive ? "Active" : "Inactive"}${
          mautic
            ? `, Emails: ${mautic.totalEmails || 0}, Campaigns: ${mautic.totalCampaigns || 0}, Contacts: ${mautic.totalContacts || 0}, Active(30d): ${mautic.activeContacts30d || 0}`
            : ""
        }`;
      })
      .join("\n");

    const systemPrompt = buildSystemPrompt(settings?.assistantName || 'Bevy', clientsContext);

    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.slice(-10),
      { role: "user", content: message },
    ];

    let response;
    const model = settings?.llmModel || (provider === 'openai' ? 'gpt-4o-mini' : 'claude-3-5-sonnet-20241022');
    
    if (provider === "anthropic") {
      response = await callAnthropic(apiKey, model, messages);
    } else {
      response = await callOpenAI(apiKey, model, messages);
    }

    res.json({
      success: true,
      response,
      assistantName: settings?.assistantName || 'Bevy',
    });
  } catch (error) {
    logger.error("AI chat error", { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get AI response",
    });
  }
});

router.post("/speak", authenticate, async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ success: false, message: "Text is required" });
    }

    const settings = await prisma.aISettings.findFirst();

    if (!settings?.voiceApiKey || !settings?.voiceId) {
      return res.status(400).json({ success: false, message: "Voice not configured" });
    }

    const apiKey = encryptionService.decrypt(settings.voiceApiKey);

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${settings.voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!response.ok) {
      throw new Error("ElevenLabs API error");
    }

    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString("base64");

    res.json({ success: true, audio: base64Audio });
  } catch (error) {
    logger.error("Text-to-speech error", { error: error.message });
    res.status(500).json({ success: false, message: "Failed to generate audio" });
  }
});

router.get("/status", authenticate, async (req, res) => {
  try {
    const settings = await prisma.aISettings.findFirst();
    const hasEnvKey = !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
    const hasDbKey = !!(settings?.llmApiKey);

    res.json({
      success: true,
      enabled: settings?.isEnabled ?? false,
      configured: hasDbKey || hasEnvKey,
      voiceEnabled: !!(settings?.voiceApiKey && settings?.voiceId),
      assistantName: settings?.assistantName || "Bevy",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to get AI status" });
  }
});

export default router;

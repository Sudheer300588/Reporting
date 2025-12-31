// backend/cron/sync.cron.js
import cron from "node-cron";
import { callVicidial } from "../services/vicidial.service.js";
import { parsePipeData } from "../utils/formatter.js";  // your universal parser
import { syncAgentsCampaignsToDb } from "../services/prisma.service.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Use centralized data directory
const VICI_DIR = path.join(__dirname, "..", "..", "..", "data", "vicidial");

if (!fs.existsSync(VICI_DIR)) fs.mkdirSync(VICI_DIR, { recursive: true });

// Helper: given a campaign ID, fetch full campaign info and return name
async function fetchCampaignName(cid) {
    try {
        const raw = await callVicidial({
            function: "campaigns_list",
            campaign_id: cid,
            stage: "pipe",
            header: "YES"
        });
        const parsed = parsePipeData(raw);
        const row = Array.isArray(parsed) ? parsed[0] : parsed;
        const name =
            row.campaign_name ||
            row["Campaign Name"] ||
            row["Outbound Process"] ||
            Object.values(row)[1] ||
            cid;
        return String(name).trim();
    } catch (e) {
        return cid;
    }
}

async function syncAllAgents() {
    console.log("🔄 Running full agents → campaigns sync...");

    try {
        // 1) fetch all agents
        const now = new Date();
        const past = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
        const fmt = d => {
            const YYYY = d.getFullYear();
            const MM = String(d.getMonth() + 1).padStart(2, '0');
            const DD = String(d.getDate()).padStart(2, '0');
            const hh = String(d.getHours()).padStart(2, '0');
            const mm = String(d.getMinutes()).padStart(2, '0');
            const ss = String(d.getSeconds()).padStart(2, '0');
            return `${YYYY}-${MM}-${DD}+${hh}:${mm}:${ss}`;
        };

        const rawAgents = await callVicidial({
            function: "agent_stats_export",
            source: "node-api",
            DB: "0",
            stage: "pipe",
            header: "YES",
            time_format: "HF",
            datetime_start: fmt(past),
            datetime_end: fmt(now),
        });

        const parsedAgents = parsePipeData(rawAgents);
        const agents = Array.isArray(parsedAgents) ? parsedAgents : [parsedAgents];

        const allResults = {};
        let processed = 0;

        // 2) for each agent get their campaigns
        for (const agent of agents) {
            const agent_user = agent.user || agent.agent_user || agent.user_id;
            if (!agent_user) continue;

            try {
                const campRaw = await callVicidial({
                    function: "agent_campaigns",
                    source: "node-api",
                    agent_user,
                    ignore_agentdirect: "N",
                    stage: "pipe",
                    header: "YES"
                });

                const rawTrim = String(campRaw || "").trim();
                if (!rawTrim || rawTrim.toUpperCase().startsWith("ERROR")) {
                    allResults[agent_user] = {
                        agent_user,
                        campaigns: [],
                        count_campaigns: 0
                    };
                    continue;
                }

                const lines = rawTrim.split(/\r?\n/).filter(Boolean);
                const dataLine = lines.length > 1 ? lines[1] : lines[0];

                let codes = [];
                if (dataLine.includes("|")) {
                    const parts = dataLine.split("|").map(s => s.trim());
                    if (parts[1]) {
                        codes = parts[1].split("-").map(s => s.trim()).filter(Boolean);
                    }
                } else {
                    codes = dataLine.split("-").map(s => s.trim()).filter(Boolean);
                }

                codes = Array.from(new Set(codes));

                // 3) For each campaign id — fetch real name
                const campaigns = [];
                for (const cid of codes) {
                    const name = await fetchCampaignName(cid);
                    campaigns.push({ id: cid, name });
                }

                const formatted = {
                    agent_user,
                    agent_name: agent.full_name || agent.fullname || agent.name || null,
                    campaigns,
                    count_campaigns: campaigns.length,
                    last_synced: new Date().toISOString()
                };

                const safeAgent = String(agent_user).replace(/[^a-zA-Z0-9_-]/g, "_");
                const filePathAgent = path.join(VICI_DIR, `agent_campaigns_${safeAgent}.json`);
                fs.writeFileSync(filePathAgent, JSON.stringify(formatted, null, 2));

                allResults[agent_user] = formatted;
                processed++;

                // small delay to avoid overwhelming API
                if (processed % 5 === 0) {
                    await new Promise(r => setTimeout(r, 150));
                }

            } catch (agentErr) {
                console.error(`⚠️ Error syncing agent ${agent.user}:`, agentErr.message);
            }
        }

        // 4) write consolidated file
        const consolidatedPath = path.join(VICI_DIR, 'all_agents_campaigns.json');
        fs.writeFileSync(consolidatedPath, JSON.stringify(allResults, null, 2));

        const totalCampaigns = Object.values(allResults).reduce((sum, r) => sum + (r.count_campaigns||0), 0);
        console.log(`✅ Synced ${processed}/${agents.length} agents. Total campaigns: ${totalCampaigns}`);

        // 5) Sync to database
        console.log('📦 Syncing to database...');
        const dbSync = await syncAgentsCampaignsToDb(allResults);
        
        if (dbSync.success) {
            console.log(`✅ Database sync complete:`, dbSync.stats);
        } else {
            console.error('❌ Database sync failed:', dbSync.error);
        }

    } catch (err) {
        console.error("❌ Error in syncAllAgents:", err);
    }
}

cron.schedule(
    "0 0,15 * * *",
    async () => {
        console.log("⏰ Cron triggered: 12:00 AM or 3:00 PM (LA Time)");
        await syncAllAgents();
    },
    { timezone: "America/Los_Angeles" }
);

console.log("✅ Cron scheduled: everyday at 12 AM & 3 PM (LA timezone)");

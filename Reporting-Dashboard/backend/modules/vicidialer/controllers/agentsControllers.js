import { callVicidial } from "../services/vicidial.service.js";
import { fixDateFormat } from "../utils/date.js";
import { parsePipeData } from "../utils/formatter.js";
import { syncAgentsCampaignsToDb, getAgentCampaignsPaginated, getAgentsWithCampaigns } from "../services/prisma.service.js";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use absolute path from project root to avoid path confusion
const VICI_DIR = path.join(__dirname, "..", "..", "..", "data", "vicidial");
if (!fs.existsSync(VICI_DIR)) fs.mkdirSync(VICI_DIR, { recursive: true });

function ensureDirExists(dirPath) {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

// simple in-memory cache for campaign names to avoid repeated remote calls during runtime
// persisted to disk at `vicidial/campaign_name_cache.json` so names survive restarts
const campaignNameCache = new Map();
const CAMPAIGN_CACHE_FILE = path.join(VICI_DIR, 'campaign_name_cache.json');
// load persisted cache if present
try {
    if (fs.existsSync(CAMPAIGN_CACHE_FILE)) {
        const raw = fs.readFileSync(CAMPAIGN_CACHE_FILE, 'utf8');
        const obj = JSON.parse(raw || '{}');
        Object.keys(obj || {}).forEach(k => campaignNameCache.set(String(k), String(obj[k])));
    }
} catch (e) {
    // ignore corrupted cache file — we'll rebuild it
}

// helper: chunked runner to limit concurrency
async function runChunked(items, fn, limit = 6) {
    const results = [];
    let i = 0;
    while (i < items.length) {
        const slice = items.slice(i, i + limit);
        const promises = slice.map(x => fn(x));
        const out = await Promise.all(promises);
        results.push(...out);
        i += limit;
    }
    return results;
}

async function fetchCampaignNameRemote(cid, opts = {}) {
    if (!cid) return { id: cid, name: cid };
    if (campaignNameCache.has(cid)) return { id: cid, name: campaignNameCache.get(cid) };
    try {
        // ask for pipe-delimited output and parse via central parser to avoid csv comma issues
        const params = { function: 'campaigns_list', campaign_id: cid, stage: 'pipe', header: 'YES', source: 'node-api' };
        if (opts.user) params.user = opts.user;
        if (opts.pass) params.pass = opts.pass;
        const raw = await callVicidial(params);
        const text = String(raw || '').trim();
        if (!text) return { id: cid, name: cid };
        const parsed = parsePipeData(text);
        let name = null;
        if (Array.isArray(parsed) && parsed.length > 0) {
            const row = parsed[0];
            name = row.campaign_name || row['Campaign Name'] || row['Outbound Process'] || row.CALLER_NAME || Object.values(row)[1];
        } else if (parsed && typeof parsed === 'object') {
            name = parsed.campaign_name || parsed['Campaign Name'] || parsed['Outbound Process'] || parsed.CALLER_NAME || Object.values(parsed)[1];
        }
        name = name ? String(name).trim() : cid;
        campaignNameCache.set(cid, name);
        // persist cache asynchronously (best-effort)
        try {
            const obj = Object.fromEntries(Array.from(campaignNameCache.entries()));
            fs.writeFile(CAMPAIGN_CACHE_FILE, JSON.stringify(obj, null, 2), () => { /* ignore async errors */ });
        } catch (e) { /* ignore */ }
        return { id: cid, name };
    } catch (e) {
        return { id: cid, name: cid };
    }
}

/* -------- SINGLE AGENT ---------- */
export const getSingleAgentStats = async (req, res) => {
    try {
        const { start, end, agent_user } = req.query;

        if (!start || !end || !agent_user) {
            return res.status(400).json({
                success: false,
                error: "start, end, and agent_user are required"
            });
        }

        const payload = {
            function: "agent_stats_export",
            source: "node-api",
            DB: "0",
            stage: "pipe",
            time_format: "M",
            header: "YES",
            datetime_start: fixDateFormat(start),
            datetime_end: fixDateFormat(end),
            agent_user,
            // ...(campaign_id ? { campaign_id } : {})
        };

        const raw = await callVicidial(payload);
        const formatted = parsePipeData(raw);

        const safeStart = String(start).replace(/[: ]/g, "_");
        const safeEnd = String(end).replace(/[: ]/g, "_");
        const fileName = `single_agent_${agent_user}_${safeStart}_${safeEnd}.json`;
        ensureDirExists(VICI_DIR);
        fs.writeFileSync(path.join(VICI_DIR, fileName), JSON.stringify(formatted, null, 2));

        return res.json({ success: true, data: formatted });

    } catch (err) {
        console.error("ERROR in getSingleAgentStats:", err);
        // If no records found, return empty data instead of error
        if (err.message && err.message.includes('NO RECORDS FOUND')) {
            return res.json({ success: true, data: [], message: 'No stats found for the selected date range' });
        }
        return res.status(500).json({ success: false, error: err.toString() });
    }
};

/* -------- ALL AGENTS ---------- */
export const getAllAgentStats = async (req, res) => {
    try {
        const { start, end, campaign_id } = req.query;

        if (!start || !end) {
            return res.status(400).json({
                success: false,
                error: "start and end are required"
            });
        }

        const payload = {
            function: "agent_stats_export",
            source: "node-api",
            DB: "0",
            stage: "pipe",
            header: "YES",
            time_format: "HF",
            datetime_start: fixDateFormat(start),
            datetime_end: fixDateFormat(end),
            ...(campaign_id ? { campaign_id } : {})
        };

        const raw = await callVicidial(payload);
        const formatted = parsePipeData(raw);

        const safeStart = String(start).replace(/[: ]/g, "_");
        const safeEnd = String(end).replace(/[: ]/g, "_");
        const fileName = `all_agents_${safeStart}_${safeEnd}.json`;
        ensureDirExists(VICI_DIR);
        fs.writeFileSync(path.join(VICI_DIR, fileName), JSON.stringify(formatted, null, 2));

        return res.json({ success: true, data: formatted });

    } catch (err) {
        console.error("ERROR in getAllAgentStats:", err);
        return res.status(500).json({ success: false, error: err.toString() });
    }
};



export const getAgentCampaigns = async (req, res) => {
    try {
        const { agent_user, ignore_agentdirect = "N", user, pass, stage = "pipe", header = "YES" } = req.query;

        if (!agent_user) {
            return res.status(400).json({ success: false, error: "agent_user required" });
        }

        const params = {
            source: "node-api",
            ...(user ? { user } : {}),
            ...(pass ? { pass } : {}),
            agent_user,
            ignore_agentdirect,
            stage,
            header
        };

        const raw = await callVicidial("agent_campaigns", params);
        const rawTrim = String(raw || "").trim();

        if (!rawTrim) return res.json({ success: true, data: { agent_user, agent_name: null, campaigns: [], count_campaigns: 0, raw: rawTrim } });
        if (rawTrim.toUpperCase().startsWith("ERROR:")) return res.status(200).json({ success: false, error: rawTrim });

        // Prefer data line when header present
        const lines = rawTrim.split(/\r?\n/).filter(Boolean);
        const dataLine = lines.length > 1 ? lines[1] : lines[0];

        // Parse allowed campaigns and ingroups
        let codes = [];
        let ingroups = [];
        if (dataLine.includes("|")) {
            const parts = dataLine.split("|").map(p => p.trim());
            if (parts[1]) codes = parts[1].split("-").map(c => c.trim()).filter(Boolean);
            if (parts[2]) ingroups = parts[2].split("-").map(c => c.trim()).filter(Boolean);
        } else if (dataLine.includes(",")) {
            codes = dataLine.split(",").map(c => c.trim()).filter(Boolean);
        } else if (dataLine.includes("-")) {
            codes = dataLine.split("-").map(c => c.trim()).filter(Boolean);
        } else {
            codes = [dataLine.trim()].filter(Boolean);
        }

        codes = Array.from(new Set(codes)).map(s => s.replace(/[\s\|,]/g, "")).filter(Boolean);

        // Load local campaign map (support multiple possible key names)
        const campaignMap = {};
        const triedPaths = [
            path.join(VICI_DIR, 'campaigns.json'),
            path.join(__dirname, 'campaigns.json')
        ];
        for (const mapPath of triedPaths) {
            try {
                if (!fs.existsSync(mapPath)) continue;
                const mRaw = fs.readFileSync(mapPath, 'utf8');
                const mJson = JSON.parse(mRaw);
                if (Array.isArray(mJson)) {
                    mJson.forEach(item => {
                        if (!item) return;
                        if (item.campaign_id && item.campaign_name) {
                            campaignMap[String(item.campaign_id).trim()] = String(item.campaign_name).trim();
                        } else if (item['Outbound'] && item['Outbound Process']) {
                            campaignMap[String(item['Outbound']).trim()] = String(item['Outbound Process']).trim();
                        } else if (item['Campaign'] && item['Campaign Name']) {
                            campaignMap[String(item['Campaign']).trim()] = String(item['Campaign Name']).trim();
                        }
                    });
                } else if (typeof mJson === 'object') {
                    // if file is an object map
                    Object.keys(mJson).forEach(k => { campaignMap[k] = mJson[k]; });
                }
                break;
            } catch (e) {
                // ignore parse errors and continue
            }
        }

        // If any codes missing names, fetch campaigns_list live and add names
        const missing = codes.filter(c => !campaignMap[c]);
        if (missing.length > 0) {
            try {
                const campRaw = await callVicidial('campaigns_list', { source: 'node-api', stage: 'pipe', header: 'YES', function: 'campaigns_list' });
                const parsed = parsePipeData(String(campRaw || ''));
                if (Array.isArray(parsed)) {
                    parsed.forEach(row => {
                        const id = row.campaign_id || row.Outbound || row.CAMPAIGN_ID || row.campaign || row.Campaign || row['Campaign ID'];
                        const name = row.campaign_name || row['Campaign Name'] || row['Outbound Process'] || row['Campaign_Name'] || row.CALLER_NAME || row.campaign_name;
                        if (id) campaignMap[String(id).trim()] = String(name || id).trim();
                    });
                } else if (parsed && typeof parsed === 'object') {
                    const id = parsed.campaign_id || parsed.Outbound;
                    const name = parsed.campaign_name || parsed['Outbound Process'] || parsed['Campaign Name'];
                    if (id) campaignMap[String(id).trim()] = String(name || id).trim();
                }
            } catch (e) {
                // ignore failure to fetch campaign list
            }
        }

        // Try to fetch agent name from agent_info (best-effort)
        let agent_name = null;
        try {
            const infoRaw = await callVicidial('agent_info', { source: 'node-api', agent_user, ...(user ? { user } : {}), ...(pass ? { pass } : {}), function: 'agent_info' });
            const infoParsed = parsePipeData(String(infoRaw || ''));
            let row = null;
            if (Array.isArray(infoParsed) && infoParsed.length > 0) row = infoParsed[0];
            else if (infoParsed && typeof infoParsed === 'object') row = infoParsed;

            if (row) {
                const keys = Object.keys(row || {});
                // Prefer keys containing name/full
                const nameKey = keys.find(k => /name|full|fullname|agent_name/i.test(k));
                if (nameKey) {
                    agent_name = row[nameKey];
                } else {
                    // fallback to second column value if present, else first
                    const vals = Object.values(row).filter(v => v !== undefined && v !== null && String(v).trim() !== '');
                    if (vals.length >= 2) agent_name = vals[1];
                    else if (vals.length === 1) agent_name = vals[0];
                }
            }

            if (agent_name) agent_name = String(agent_name).trim();
        } catch (e) {
            // ignore agent_info errors (best-effort only)
        }

            // Fallback: if agent_name still null, try agent_stats_export (last 30 days) to get the full_name
            if (!agent_name) {
                try {
                    const now = new Date();
                    const past = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
                    const fmt = d => {
                        const YYYY = d.getFullYear();
                        const MM = String(d.getMonth() + 1).padStart(2, '0');
                        const DD = String(d.getDate()).padStart(2, '0');
                        const hh = String(d.getHours()).padStart(2, '0');
                        const mm = String(d.getMinutes()).padStart(2, '0');
                        const ss = String(d.getSeconds()).padStart(2, '0');
                        return `${YYYY}-${MM}-${DD}+${hh}:${mm}:${ss}`;
                    };

                    const statsPayload = {
                        function: 'agent_stats_export',
                        source: 'node-api',
                        DB: '0',
                        stage: 'pipe',
                        time_format: 'M',
                        header: 'YES',
                        datetime_start: fmt(past),
                        datetime_end: fmt(now),
                        agent_user,
                    };
                    if (user) statsPayload.user = user;
                    if (pass) statsPayload.pass = pass;

                    const statsRaw = await callVicidial(statsPayload);
                    const statsParsed = parsePipeData(String(statsRaw || ''));
                    if (statsParsed) {
                        if (Array.isArray(statsParsed) && statsParsed.length > 0) {
                            const row = statsParsed[0];
                            agent_name = row.full_name || row.fullname || row.agent_name || row.name || Object.values(row)[1];
                        } else if (typeof statsParsed === 'object') {
                            agent_name = statsParsed.full_name || statsParsed.fullname || statsParsed.agent_name || statsParsed.name || Object.values(statsParsed)[1];
                        }
                        if (agent_name) agent_name = String(agent_name).trim();
                    }
                } catch (e) {
                    // ignore errors from stats fallback
                }
            }

        // Build campaigns array of { id, name }
        const campaigns = codes.map(id => ({ id, name: campaignMap[id] || id }));

        const formatted = {
            agent_user,
            agent_name,
            campaigns,
            ingroups,
            count_campaigns: campaigns.length,
            count_ingroups: ingroups.length,
            raw: rawTrim
        };

        // Save both per-agent snapshot and a canonical 'agent_campaigns.json'
        ensureDirExists(VICI_DIR);
        const safeAgent = String(agent_user).replace(/[^a-zA-Z0-9_-]/g, "_");
        const filePathAgent = path.join(VICI_DIR, `agent_campaigns_${safeAgent}.json`);
        fs.writeFileSync(filePathAgent, JSON.stringify(formatted, null, 2));
        // also save an overall file named agent_campaigns.json
        const filePathMain = path.join(VICI_DIR, `agent_campaigns.json`);
        fs.writeFileSync(filePathMain, JSON.stringify(formatted, null, 2));

        return res.json({ success: true, data: formatted });

    } catch (err) {
        console.error("ERROR in getAgentCampaigns:", err);
        res.status(500).json({ success: false, error: err.toString() });
    }
};

// Return campaign details (id + name) for multiple campaign ids or for an agent's campaigns.
// Query params:
// - campaign_ids: comma-separated list of campaign ids (preferred)
// - agent_user: if provided, will fetch agent_campaigns and extract campaign ids
// - concurrency: optional number to control parallel remote calls (default 6)
export const getCampaignsDetailsBatch = async (req, res) => {
    try {
        const { campaign_ids, agent_user, concurrency = 6 } = req.query;

        let ids = [];
        if (campaign_ids) {
            ids = String(campaign_ids).split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
        }

        if (agent_user && ids.length === 0) {
            // reuse agent_campaigns to extract codes
            try {
                const raw = await callVicidial('agent_campaigns', { agent_user, stage: 'pipe', header: 'YES' });
                const rawTrim = String(raw || '').trim();
                if (rawTrim) {
                    const lines = rawTrim.split(/\r?\n/).filter(Boolean);
                    const dataLine = lines.length > 1 ? lines[1] : lines[0];
                    // extract codes tolerant to separators
                    let codes = [];
                    if (dataLine.includes('|')) {
                        const parts = dataLine.split('|');
                        if (parts[1]) codes = parts[1].split(/[^A-Za-z0-9_]+/).map(s => s.trim()).filter(Boolean);
                    } else {
                        codes = dataLine.split(/[^A-Za-z0-9_]+/).map(s => s.trim()).filter(Boolean);
                        if (codes.length && String(codes[0]) === String(agent_user)) codes.shift();
                    }
                    ids = Array.from(new Set(codes));
                }
            } catch (e) {
                // ignore and proceed with empty ids
            }
        }

        ids = ids.map(String).filter(Boolean);

        if (ids.length === 0) return res.json({ success: true, data: [] });

        // resolve names using cache and remote calls only for missing ids
        const missing = ids.filter(id => !campaignNameCache.has(id));
        if (missing.length > 0) {
            await runChunked(missing, fetchCampaignNameRemote, Number(concurrency || 6));
        }

        const result = ids.map(id => ({ id, name: campaignNameCache.get(id) || id }));
        return res.json({ success: true, data: result });

    } catch (err) {
        console.error('ERROR in getCampaignsDetailsBatch:', err);
        return res.status(500).json({ success: false, error: err.toString() });
    }
};

// Fetch and store campaigns for ALL agents at once
export const syncAllAgentsCampaigns = async (req, res) => {
    try {
        const { user, pass } = req.query;
        // Note: start/end date params are NOT needed for campaign sync
        // Campaigns represent current assignments, not historical data

        // Send initial response to prevent timeout
        res.setTimeout(0); // Disable timeout for this long-running operation

        console.log('🔄 Starting sync all agents campaigns...');

        // Get all agents first
        const now = new Date();
        const past = new Date(now.getTime() - (90* 24 * 60 * 60 * 1000));
        const fmt = d => {
            const YYYY = d.getFullYear();
            const MM = String(d.getMonth() + 1).padStart(2, '0');
            const DD = String(d.getDate()).padStart(2, '0');
            const hh = String(d.getHours()).padStart(2, '0');
            const mm = String(d.getMinutes()).padStart(2, '0');
            const ss = String(d.getSeconds()).padStart(2, '0');
            return `${YYYY}-${MM}-${DD}+${hh}:${mm}:${ss}`;
        };

        const payload = {
            function: "agent_stats_export",
            source: "node-api",
            DB: "0",
            stage: "pipe",
            header: "YES",
            time_format: "HF",
            datetime_start:fmt(past),
            datetime_end: fmt(now),
        };

        let raw, agentsList, agents;
        try {
            console.log('📞 Calling VICIdial agent_stats_export...');
            raw = await callVicidial(payload);
            agentsList = parsePipeData(raw);
            agents = Array.isArray(agentsList) ? agentsList : [agentsList];
            console.log(`✅ Received ${agents.length} agents from VICIdial`);
        } catch (viciErr) {
            console.error('❌ Failed to fetch agents from VICIdial:', viciErr.message);
            return res.status(500).json({ 
                success: false, 
                error: `VICIdial API error: ${viciErr.message}` 
            });
        }

        console.log(`Syncing campaigns for ${agents.length} agents...`);

        // Load local campaign map once for all agents (support multiple possible key names)
        const campaignMap = {};
        const triedPaths = [
            path.join(VICI_DIR, 'campaigns.json'),
            path.join(__dirname, 'campaigns.json')
        ];
        
        let campaignMapLoaded = false;
        for (const mapPath of triedPaths) {
            try {
                if (!fs.existsSync(mapPath)) continue;
                const mRaw = fs.readFileSync(mapPath, 'utf8');
                const mJson = JSON.parse(mRaw);
                if (Array.isArray(mJson)) {
                    mJson.forEach(item => {
                        if (!item) return;
                        if (item.campaign_id && item.campaign_name) {
                            campaignMap[String(item.campaign_id).trim()] = String(item.campaign_name).trim();
                        } else if (item['Outbound'] && item['Outbound Process']) {
                            campaignMap[String(item['Outbound']).trim()] = String(item['Outbound Process']).trim();
                        } else if (item['Campaign'] && item['Campaign Name']) {
                            campaignMap[String(item['Campaign']).trim()] = String(item['Campaign Name']).trim();
                        }
                    });
                } else if (typeof mJson === 'object') {
                    // if file is an object map
                    Object.keys(mJson).forEach(k => { campaignMap[k] = mJson[k]; });
                }
                console.log(`📋 Loaded ${Object.keys(campaignMap).length} campaign names from local map: ${mapPath}`);
                campaignMapLoaded = true;
                break;
            } catch (e) {
                console.warn(`⚠️ Could not load campaign map from ${mapPath}:`, e.message);
            }
        }

        if (!campaignMapLoaded) {
            console.log('⚠️ No local campaign map found - will fetch names from VICIdial API');
        }

        // Pre-populate campaignNameCache with local map entries (if not already cached)
        Object.keys(campaignMap).forEach(id => {
            if (!campaignNameCache.has(id)) {
                campaignNameCache.set(id, campaignMap[id]);
            }
        });

        // Fetch ALL campaign names from VICIdial in one call to populate cache
        if (!campaignMapLoaded) {
            try {
                console.log('📞 Fetching all campaign names from VICIdial campaigns_list...');
                const campRaw = await callVicidial({
                    function: 'campaigns_list',
                    source: 'node-api',
                    stage: 'pipe',
                    header: 'YES'
                });
                const parsed = parsePipeData(String(campRaw || ''));
                let fetchedCount = 0;
                if (Array.isArray(parsed)) {
                    parsed.forEach(row => {
                        const id = row.campaign_id || row.Outbound || row.CAMPAIGN_ID || row.campaign || row.Campaign;
                        const name = row.campaign_name || row['Campaign Name'] || row['Outbound Process'] || row.CALLER_NAME;
                        if (id && name && !campaignNameCache.has(String(id).trim())) {
                            campaignNameCache.set(String(id).trim(), String(name).trim());
                            fetchedCount++;
                        }
                    });
                    console.log(`✅ Fetched ${fetchedCount} campaign names from VICIdial`);
                } else if (parsed && typeof parsed === 'object') {
                    const id = parsed.campaign_id || parsed.Outbound;
                    const name = parsed.campaign_name || parsed['Outbound Process'] || parsed['Campaign Name'];
                    if (id && name) {
                        campaignNameCache.set(String(id).trim(), String(name).trim());
                        console.log(`✅ Fetched 1 campaign name from VICIdial`);
                    }
                }
            } catch (bulkErr) {
                console.warn('⚠️ Could not fetch bulk campaign names from VICIdial:', bulkErr.message);
                console.log('   Will use campaign IDs as fallback names');
            }
        }

        // Fetch campaigns for each agent with concurrency limit
        const results = {};
        let processed = 0;

        for (const agent of agents) {
            const agent_user = agent.user || agent.agent_user || agent.user_id;
            if (!agent_user) continue;

            try {
                const params = {
                    source: "node-api",
                    agent_user,
                    ignore_agentdirect: "N",
                    stage: "pipe",
                    header: "YES",
                    ...(user ? { user } : {}),
                    ...(pass ? { pass } : {})
                };

                const campRaw = await callVicidial("agent_campaigns", params);
                const rawTrim = String(campRaw || "").trim();

                if (!rawTrim || rawTrim.toUpperCase().startsWith("ERROR:")) {
                    results[agent_user] = { agent_user, campaigns: [], count_campaigns: 0 };
                    continue;
                }

                // Parse campaigns
                const lines = rawTrim.split(/\r?\n/).filter(Boolean);
                const dataLine = lines.length > 1 ? lines[1] : lines[0];

                let codes = [];
                if (dataLine.includes("|")) {
                    const parts = dataLine.split("|").map(p => p.trim());
                    if (parts[1]) codes = parts[1].split("-").map(c => c.trim()).filter(Boolean);
                } else if (dataLine.includes("-")) {
                    codes = dataLine.split("-").map(c => c.trim()).filter(Boolean);
                } else {
                    codes = [dataLine.trim()].filter(Boolean);
                }

                codes = Array.from(new Set(codes)).map(s => s.replace(/[\s\|,]/g, "")).filter(Boolean);

                // Build campaigns array using cached names (already pre-populated from local map or previous fetches)
                // Skip individual remote fetches during bulk sync to avoid overwhelming the API
                const campaigns = codes.map(id => ({ id, name: campaignNameCache.get(id) || id }));

                const formatted = {
                    agent_user,
                    agent_name: agent.full_name || agent.fullname || agent.name || agent.full || null,
                    user_group: agent.user_group || agent.userGroup || null,
                    campaigns,
                    count_campaigns: campaigns.length,
                };

                // Save individual agent file
                ensureDirExists(VICI_DIR);
                const safeAgent = String(agent_user).replace(/[^a-zA-Z0-9_-]/g, "_");
                const filePathAgent = path.join(VICI_DIR, `agent_campaigns_${safeAgent}.json`);
                fs.writeFileSync(filePathAgent, JSON.stringify(formatted, null, 2));

                results[agent_user] = formatted;
                processed++;

                // Rate limiting - small delay every 5 agents
                if (processed % 5 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

            } catch (err) {
                console.error(`Error syncing campaigns for agent ${agent_user}:`, err.message);
                results[agent_user] = { agent_user, campaigns: [], count_campaigns: 0, error: err.message };
            }
        }

        // Save consolidated file
        const consolidatedPath = path.join(VICI_DIR, 'all_agents_campaigns.json');
        fs.writeFileSync(consolidatedPath, JSON.stringify(results, null, 2));

        const totalCampaigns = Object.values(results).reduce((sum, r) => sum + (r.count_campaigns || 0), 0);

        console.log(`✓ Synced campaigns for ${processed}/${agents.length} agents. Total campaigns: ${totalCampaigns}`);

        // Sync to database
        console.log('📦 Syncing to database...');
        const dbSync = await syncAgentsCampaignsToDb(results);
        
        if (dbSync.success) {
            console.log(`✅ Database sync complete:`, dbSync.stats);
        } else {
            console.error('❌ Database sync failed:', dbSync.error);
        }

        return res.json({
            success: true,
            data: {
                agents_processed: processed,
                total_agents: agents.length,
                total_campaigns: totalCampaigns,
                db_sync: dbSync,
                results
            }
        });

    } catch (err) {
        console.error("ERROR in syncAllAgentsCampaigns:", err);
        return res.status(500).json({ success: false, error: err.toString() });
    }
};

// Return campaign counts for all agents using local snapshots in VICI_DIR
export const getAgentsCampaignCounts = async (req, res) => {
    try {
        // First try to load from consolidated file
        const consolidatedPath = path.join(VICI_DIR, 'all_agents_campaigns.json');
        if (fs.existsSync(consolidatedPath)) {
            const raw = fs.readFileSync(consolidatedPath, 'utf8');
            const allData = JSON.parse(raw || '{}');
            const map = {};
            Object.keys(allData).forEach(agent => {
                const data = allData[agent];
                map[agent] = data.count_campaigns || 0;
            });
            return res.json({ success: true, data: map, source: 'consolidated' });
        }

        // Fallback: read individual files
        if (!fs.existsSync(VICI_DIR)) return res.json({ success: true, data: {} });
        const files = fs.readdirSync(VICI_DIR).filter(f => f.startsWith('agent_campaigns_') && f.endsWith('.json'));
        const map = {};
        for (const file of files) {
            try {
                const raw = fs.readFileSync(path.join(VICI_DIR, file), 'utf8');
                const obj = JSON.parse(raw || '{}');
                const agent = obj.agent_user || obj.agent || file.replace(/^agent_campaigns_/, '').replace(/\.json$/, '');
                const count = Array.isArray(obj.campaigns) ? obj.campaigns.length : (typeof obj.count_campaigns === 'number' ? obj.count_campaigns : 0);
                map[String(agent)] = Number(count || 0);
            } catch (e) {
                // ignore per-file parse errors
            }
        }
        return res.json({ success: true, data: map, source: 'individual_files' });
    } catch (err) {
        console.error('ERROR in getAgentsCampaignCounts:', err);
        return res.status(500).json({ success: false, error: err.toString() });
    }
};

// Return paginated agents (with campaigns) from DB
export const getAgentsPaginated = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || 8;
        const search = req.query.search || '';

        // Fetch active agents from VICIdial
        let activeAgents = [];
        try {
            const payload = {
                function: "logged_in_agents",
                source: "node-api",
                stage: "csv",
                header: "YES"
            };
            const raw = await callVicidial(payload);
            const formatted = parsePipeData(raw);
            activeAgents = Array.isArray(formatted) 
                ? formatted.map(a => String(a.user || a.agent_user || a.agent || a.User || a.USER || '').trim()).filter(Boolean)
                : (formatted?.user || formatted?.User ? [String(formatted.user || formatted.User).trim()] : []);
            
            console.log('📊 Active agents in getAgentsPaginated:', activeAgents.length, activeAgents);
        } catch (err) {
            // Silently handle "no logged in agents" - just means no one is active
            if (!err.message || !err.message.includes('NO LOGGED IN AGENTS')) {
                console.warn('⚠️ Failed to fetch active agents:', err.message);
            }
        }
        
        const result = await getAgentsWithCampaigns({ page, perPage, search, activeAgents });
        
        console.log('📈 Result stats:', result.stats);

        return res.json({ success: true, data: result });
    } catch (err) {
        console.error('❌ ERROR in getAgentsPaginated:', err);
        return res.status(500).json({ success: false, error: err.toString() });
    }
};

// Get logged-in agents (active agents) - Direct API call
export const getLoggedInAgents = async (req, res) => {
    try {
        const payload = {
            function: "logged_in_agents",
            source: "node-api",
            stage: "csv",
            header: "YES"
        };

        const raw = await callVicidial(payload);
        const formatted = parsePipeData(raw);

        console.log('🔍 Logged-in agents raw response:', raw);
        console.log('📊 Formatted logged-in agents:', formatted);

        // Return list of active agent users
        const activeAgents = Array.isArray(formatted) 
            ? formatted.map(a => String(a.user || a.agent_user || a.agent || a.User || a.USER || '').trim()).filter(Boolean)
            : (formatted?.user || formatted?.User ? [String(formatted.user || formatted.User).trim()] : []);

        console.log('✅ Active agents count:', activeAgents.length, 'Users:', activeAgents);

        return res.json({ 
            success: true, 
            data: { 
                active_agents: activeAgents, 
                count: activeAgents.length,
                details: formatted // Include full details for debugging
            } 
        });

    } catch (err) {
        // If no logged in agents, return empty array instead of error
        if (err.message && err.message.includes('NO LOGGED IN AGENTS')) {
            console.log('ℹ️ No agents currently logged in');
            return res.json({ success: true, data: { active_agents: [], count: 0 }, message: 'No agents currently logged in' });
        }
        console.error('❌ ERROR in getLoggedInAgents:', err);
        return res.status(500).json({ success: false, error: err.toString() });
    }
};

// Get agent campaigns with pagination (from database)
export const getAgentCampaignsPagination = async (req, res) => {
    try {
        const { agent_user } = req.query;
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || 8;

        if (!agent_user) {
            return res.status(400).json({ success: false, error: 'agent_user required' });
        }

        const result = await getAgentCampaignsPaginated(agent_user, { page, perPage });

        if (!result) {
            return res.status(404).json({ success: false, error: 'Agent not found' });
        }

        return res.json({ success: true, data: result });
    } catch (err) {
        console.error('ERROR in getAgentCampaignsPagination:', err);
        return res.status(500).json({ success: false, error: err.toString() });
    }
};

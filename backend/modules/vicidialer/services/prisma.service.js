import logger from '../../../utils/logger.js';
import prisma from '../../../prisma/client.js';

export default prisma;

export async function syncAgentsCampaignsToDb(agentsData) {
    const stats = {
        agentsCreated: 0,
        agentsUpdated: 0,
        campaignsCreated: 0,
        campaignsUpdated: 0,
        relationsCreated: 0,
        relationsRemoved: 0,
        errors: []
    };

    try {
        for (const [agentUser, data] of Object.entries(agentsData)) {
            try {
                const agentUserStr = String(agentUser);

                // -------------------------
                // 1. UPSERT AGENT
                // -------------------------
                const agentBefore = await prisma.agent.findUnique({
                    where: { user: agentUserStr }
                });

                const agent = await prisma.agent.upsert({
                    where: { user: agentUserStr },
                    update: {
                        fullName: data.agent_name || null,
                        userGroup: data.user_group || null
                    },
                    create: {
                        user: agentUserStr,
                        fullName: data.agent_name || null,
                        userGroup: data.user_group || null
                    }
                });

                if (!agentBefore) stats.agentsCreated++;
                else stats.agentsUpdated++;

                // -------------------------
                // 2. UPSERT VICIDIAL CAMPAIGNS
                // -------------------------
                const newCampaignIds = [];

                if (Array.isArray(data.campaigns)) {
                    for (const camp of data.campaigns) {
                        if (!camp.id) continue;

                        const campId = String(camp.id);
                        newCampaignIds.push(campId);

                        const existing = await prisma.viciDialCampaign.findUnique({
                            where: { campaignId: campId }
                        });

                        await prisma.viciDialCampaign.upsert({
                            where: { campaignId: campId },
                            update: { campaignName: camp.name || existing?.campaignName || campId },
                            create: {
                                campaignId: campId,
                                campaignName: camp.name || campId
                            }
                        });

                        if (!existing) stats.campaignsCreated++;
                        else stats.campaignsUpdated++;
                    }
                }

                // -------------------------
                // 3. MANAGE RELATIONS CLEANLY
                // -------------------------
                const existingRelations = await prisma.agentCampaign.findMany({
                    where: { agentId: agent.id },
                    include: { viciDialCampaign: true }
                });

                const existingIds = existingRelations.map(r => r.viciDialCampaign.campaignId);

                // ADD NEW RELATIONS
                for (const newCid of newCampaignIds) {
                    if (!existingIds.includes(newCid)) {
                        const camp = await prisma.viciDialCampaign.findUnique({
                            where: { campaignId: newCid }
                        });

                        if (camp) {
                            await prisma.agentCampaign.create({
                                data: {
                                    agentId: agent.id,
                                    viciDialCampaignId: camp.id
                                }
                            });
                            stats.relationsCreated++;
                        }
                    }
                }

                // REMOVE OLD RELATIONS  
                for (const existingCid of existingIds) {
                    if (!newCampaignIds.includes(existingCid)) {
                        await prisma.agentCampaign.deleteMany({
                            where: {
                                agentId: agent.id,
                                viciDialCampaign: {
                                    campaignId: existingCid
                                }
                            }
                        });
                        stats.relationsRemoved++;
                    }
                }

            } catch (err) {
                stats.errors.push({ agent: agentUser, error: err.message });
            }
        }

        return { success: true, stats };

    } catch (err) {
        logger.error("❌ Error syncing to database:", err);
        return { success: false, error: err.message };
    }
}


// -------------------------------
// GET AGENTS WITH CAMPAIGNS
// -------------------------------
export async function getAgentsWithCampaigns({
    page = 1,
    perPage = 10,
    search = "",
    activeAgents = []
}) {
    const skip = (page - 1) * perPage;

    const where = search
        ? {
              OR: [
                  { user: { contains: search } },
                  { fullName: { contains: search } }
              ]
          }
        : {};

    const [agents, total] = await Promise.all([
        prisma.agent.findMany({
            where,
            include: {
                campaigns: {
                    include: { viciDialCampaign: true }
                }
            },
            skip,
            take: perPage,
            orderBy: { user: "asc" }
        }),
        prisma.agent.count({ where })
    ]);

    // Get all agent users to calculate total active count
    const allAgents = await prisma.agent.findMany({
        where,
        select: { user: true }
    });
    
    logger.debug('Total agents in DB:', total);
    logger.debug('All agent users:', allAgents.map(a => a.user));
    logger.debug('Active agents list:', activeAgents);
    
    const totalActive = allAgents.filter(a => activeAgents.includes(a.user)).length;
    const totalInactive = total - totalActive;
    
    logger.debug('Calculated totalActive:', totalActive, 'totalInactive:', totalInactive);

    return {
        data: agents.map(agent => ({
            user: agent.user,
            fullName: agent.fullName,
            full_name: agent.fullName,
            userGroup: agent.userGroup,
            isActive: activeAgents.includes(agent.user),
            campaigns: agent.campaigns.map(ac => ({
                id: ac.viciDialCampaign.campaignId,
                name: ac.viciDialCampaign.campaignName || ac.viciDialCampaign.campaignId
            }))
        })),
        pagination: {
            page,
            perPage,
            total,
            totalPages: Math.ceil(total / perPage)
        },
        stats: {
            totalActive,
            totalInactive
        }
    };
}


// -------------------------------
// GET AGENT CAMPAIGNS PAGINATED
// -------------------------------
export async function getAgentCampaignsPaginated(agentUser, { page = 1, perPage = 8 }) {
    const skip = (page - 1) * perPage;

    const agent = await prisma.agent.findUnique({
        where: { user: String(agentUser) },
        include: {
            campaigns: {
                include: { viciDialCampaign: true },
                skip,
                take: perPage,
                orderBy: { viciDialCampaign: { campaignName: "asc" } }
            },
            _count: { select: { campaigns: true } }
        }
    });

    if (!agent) return null;

    return {
        agent_user: agent.user,
        agent_name: agent.fullName,
        user_group: agent.userGroup,
        campaigns: agent.campaigns.map(ac => ({
            id: ac.viciDialCampaign.campaignId,
            name: ac.viciDialCampaign.campaignName || ac.viciDialCampaign.campaignId
        })),
        pagination: {
            page,
            perPage,
            total: agent._count.campaigns,
            totalPages: Math.ceil(agent._count.campaigns / perPage)
        }
    };
}

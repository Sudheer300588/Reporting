import prisma from '../../../prisma/client.js';
import logger from '../../../utils/logger.js';

class SmsService {
  /**
   * Categorize SMS campaigns based on Mautic client name prefixes
   * @param {Array} smsCampaigns - Array of SMS campaigns from Mautic
   * @param {Array} mauticClients - Array of all Mautic clients
   * @returns {Object} Categorized SMS campaigns
   */
  categorizeSms(smsCampaigns, mauticClients) {
    const categorized = {
      matched: [], // SMS with client prefix match
      unmatched: [] // SMS without client prefix match
    };

    const clientNameMap = new Map(
      mauticClients.map(client => [client.name.toLowerCase(), client.id])
    );

    for (const sms of smsCampaigns) {
      const smsName = sms.name.toLowerCase();
      let matched = false;

      // Check if SMS name starts with any client name prefix
      for (const [clientName, clientId] of clientNameMap) {
        if (smsName.startsWith(clientName.toLowerCase())) {
          categorized.matched.push({
            ...sms,
            clientId,
            clientName
          });
          matched = true;
          break;
        }
      }

      if (!matched) {
        categorized.unmatched.push(sms);
      }
    }

    return categorized;
  }

  /**
   * Store SMS campaigns from an SMS client with automatic Mautic client creation
   * Matched SMS go to existing Mautic clients, unmatched SMS auto-create a new Mautic client
   * @param {Object} smsClient - SMS Client object (needs name, mauticUrl, username, password)
   * @param {Array} smsCampaigns - Array of SMS campaigns
   * @param {Array} mauticClients - Array of Mautic clients for prefix matching
   * @returns {Promise<Object>} Store results
   */
  async storeSmsWithAutoClient(smsClient, smsCampaigns, mauticClients = []) {
    try {
      logger.info(`Storing ${smsCampaigns.length} SMS campaigns for SMS client ${smsClient.name}`);
      
      const categorized = this.categorizeSms(smsCampaigns, mauticClients);
      let created = 0, updated = 0;
      let autoCreatedClient = null;

      // If there are unmatched SMS, create/find a Mautic client for them
      if (categorized.unmatched.length > 0) {
        logger.info(`Found ${categorized.unmatched.length} unmatched SMS, creating/finding Mautic client...`);
        
        // Check if Mautic client with SMS client name already exists
        autoCreatedClient = await prisma.mauticClient.findFirst({
          where: { 
            name: smsClient.name 
          }
        });

        // Create new Mautic client if it doesn't exist
        if (!autoCreatedClient) {
          autoCreatedClient = await prisma.mauticClient.create({
            data: {
              name: smsClient.name,
              mauticUrl: smsClient.mauticUrl,
              username: smsClient.username,
              password: smsClient.password,
              reportId: 'sms-only', // Default report ID for SMS-only clients
              isActive: true
            }
          });
          logger.info(`✅ Created new Mautic client "${smsClient.name}" (ID: ${autoCreatedClient.id}) for unmatched SMS`);
        } else {
          logger.info(`✅ Using existing Mautic client "${smsClient.name}" (ID: ${autoCreatedClient.id}) for unmatched SMS`);
        }

        // Assign auto-created client to unmatched SMS
        categorized.unmatched = categorized.unmatched.map(sms => ({
          ...sms,
          clientId: autoCreatedClient.id,
          clientName: autoCreatedClient.name
        }));
      }

      // Store ALL SMS as matched (now that unmatched have been assigned to auto-created client)
      const allSms = [...categorized.matched, ...categorized.unmatched];
      
      for (const sms of allSms) {
        const existing = await prisma.mauticSms.findUnique({
          where: { mauticId: sms.id }
        });

        if (existing) {
          await prisma.mauticSms.update({
            where: { id: existing.id },
            data: {
              name: sms.name,
              category: sms.category,
              sentCount: sms.sentCount || 0,
              clientId: sms.clientId,
              smsClientId: null,
              updatedAt: new Date()
            }
          });
          updated++;
        } else {
          await prisma.mauticSms.create({
            data: {
              mauticId: sms.id,
              name: sms.name,
              category: sms.category,
              sentCount: sms.sentCount || 0,
              clientId: sms.clientId,
              smsClientId: null
            }
          });
          created++;
        }
      }

      logger.info(`SMS storage complete: ${created} created, ${updated} updated`);
      logger.info(`  - Matched to existing Mautic clients: ${categorized.matched.length}`);
      logger.info(`  - Auto-assigned to "${smsClient.name}": ${categorized.unmatched.length}`);

      return { 
        created, 
        updated, 
        total: created + updated,
        matched: categorized.matched.length,
        unmatched: categorized.unmatched.length,
        autoCreatedClientId: autoCreatedClient?.id
      };
    } catch (error) {
      const errorMsg = error?.message || error?.code || 'SMS storage failed';
      logger.error('Failed to store SMS campaigns with auto-client:', { error: errorMsg.substring(0, 200) });
      throw new Error(errorMsg.substring(0, 200));
    }
  }

  /**
   * Store SMS campaigns from a Mautic client
   * All SMS are stored under the originating Mautic client by default
   * @param {Int} mauticClientId - Mautic Client ID
   * @param {Array} smsCampaigns - Array of SMS campaigns
   * @returns {Promise<Object>} Store results
   */
  async storeSmsForMauticClient(mauticClientId, smsCampaigns) {
    try {
      logger.info(`Storing ${smsCampaigns.length} SMS campaigns for Mautic client ${mauticClientId}`);
      
      let created = 0, updated = 0;

      // Store all SMS under the originating Mautic client
      for (const sms of smsCampaigns) {
        const existing = await prisma.mauticSms.findUnique({
          where: { mauticId: sms.id }
        });

        if (existing) {
          // Update existing SMS - keep under originating client
          await prisma.mauticSms.update({
            where: { id: existing.id },
            data: {
              name: sms.name,
              category: sms.category,
              sentCount: sms.sentCount || 0,
              clientId: mauticClientId,
              smsClientId: null,
              updatedAt: new Date()
            }
          });
          updated++;
        } else {
          // Create new SMS under originating Mautic client
          await prisma.mauticSms.create({
            data: {
              mauticId: sms.id,
              name: sms.name,
              category: sms.category,
              sentCount: sms.sentCount || 0,
              clientId: mauticClientId,
              smsClientId: null
            }
          });
          created++;
        }
      }

      logger.info(`✅ SMS storage complete for Mautic client ${mauticClientId}: ${created} created, ${updated} updated`);

      return { 
        created, 
        updated, 
        total: created + updated,
        matchedCount: smsCampaigns.length,
        unmatchedCount: 0
      };
    } catch (error) {
      logger.error('Failed to store SMS campaigns for Mautic client:', { error: error.message });
      throw error;
    }
  }

  /**
   * Store SMS campaigns in database with proper categorization
   * @param {Int} smsClientId - SMS Client ID
   * @param {Array} smsCampaigns - Array of SMS campaigns
   * @param {Array} mauticClients - Array of Mautic clients for prefix matching
   * @returns {Promise<Object>} Store results
   */
  async storeSms(smsClientId, smsCampaigns, mauticClients = []) {
    try {
      logger.info(`Storing ${smsCampaigns.length} SMS campaigns for SMS client ${smsClientId}`);
      
      const categorized = this.categorizeSms(smsCampaigns, mauticClients);
      let created = 0, updated = 0;

      // Store matched SMS (linked to Mautic clients)
      for (const sms of categorized.matched) {
        const existing = await prisma.mauticSms.findUnique({
          where: { mauticId: sms.id }
        });

        if (existing) {
          // Check if client assignment changed
          if (existing.clientId !== sms.clientId) {
            await prisma.mauticSms.update({
              where: { id: existing.id },
              data: {
                name: sms.name,
                category: sms.category,
                sentCount: sms.sentCount || 0,
                clientId: sms.clientId,
                smsClientId: null,
                updatedAt: new Date()
              }
            });
            logger.info(`Reassigned SMS "${sms.name}" to Mautic client ${sms.clientId}`);
          } else {
            await prisma.mauticSms.update({
              where: { id: existing.id },
              data: {
                name: sms.name,
                category: sms.category,
                sentCount: sms.sentCount || 0,
                updatedAt: new Date()
              }
            });
          }
          updated++;
        } else {
          await prisma.mauticSms.create({
            data: {
              mauticId: sms.id,
              name: sms.name,
              category: sms.category,
              sentCount: sms.sentCount || 0,
              clientId: sms.clientId,
              smsClientId: null
            }
          });
          created++;
        }
      }

      // Store unmatched SMS (linked to SMS client)
      for (const sms of categorized.unmatched) {
        const existing = await prisma.mauticSms.findUnique({
          where: { mauticId: sms.id }
        });

        if (existing) {
          // Only update if not already assigned to a Mautic client
          if (!existing.clientId) {
            await prisma.mauticSms.update({
              where: { id: existing.id },
              data: {
                name: sms.name,
                category: sms.category,
                sentCount: sms.sentCount || 0,
                smsClientId,
                updatedAt: new Date()
              }
            });
            updated++;
          }
        } else {
          await prisma.mauticSms.create({
            data: {
              mauticId: sms.id,
              name: sms.name,
              category: sms.category,
              sentCount: sms.sentCount || 0,
              clientId: null,
              smsClientId
            }
          });
          created++;
        }
      }

      logger.info(`SMS storage complete: ${created} created, ${updated} updated`);
      logger.info(`  - Matched to Mautic clients: ${categorized.matched.length}`);
      logger.info(`  - Unmatched (SMS client): ${categorized.unmatched.length}`);

      return { 
        created, 
        updated, 
        total: created + updated,
        matched: categorized.matched.length,
        unmatched: categorized.unmatched.length
      };
    } catch (error) {
      logger.error('Failed to store SMS campaigns:', { error: error.message });
      throw error;
    }
  }

  /**
   * Store SMS statistics
   * @param {Int} smsId - Local SMS ID (from MauticSms table)
   * @param {Int} mauticSmsId - Original Mautic SMS campaign ID
   * @param {Array} stats - Array of SMS statistics
   * @returns {Promise<Object>} Store results
   */
  async storeSmsStats(smsId, mauticSmsId, stats) {
    try {
      logger.info(`Storing ${stats.length} SMS stats for SMS ${smsId}`);
      let created = 0, skipped = 0;

      for (const stat of stats) {
        const existing = await prisma.mauticSmsStat.findUnique({
          where: {
            mauticSmsId_leadId: {
              mauticSmsId: mauticSmsId,
              leadId: stat.lead_id
            }
          }
        });

        if (!existing) {
          await prisma.mauticSmsStat.create({
            data: {
              smsId,
              mauticSmsId,
              leadId: stat.lead_id,
              dateSent: stat.date_sent ? new Date(stat.date_sent) : null,
              isFailed: stat.is_failed || '0'
            }
          });
          created++;
        } else {
          skipped++;
        }
      }

      logger.info(`SMS stats stored: ${created} created, ${skipped} skipped`);
      return { created, skipped, total: created + skipped };
    } catch (error) {
      logger.error('Failed to store SMS stats:', { error: error.message });
      throw error;
    }
  }

  /**
   * Get SMS campaigns for a specific client (Mautic or SMS client)
   * @param {Int} clientId - Client ID
   * @param {String} clientType - 'mautic' or 'sms'
   * @returns {Promise<Array>} SMS campaigns
   */
  async getClientSmsCampaigns(clientId, clientType = 'mautic') {
    try {
      const where = clientType === 'mautic' 
        ? { clientId } 
        : { smsClientId: clientId };

      const campaigns = await prisma.mauticSms.findMany({
        where,
        orderBy: { name: 'asc' }
      });

      return campaigns;
    } catch (error) {
      logger.error('Failed to get client SMS campaigns:', { error: error.message });
      throw error;
    }
  }

  /**
   * Get SMS campaign statistics with pagination
   * @param {Int} smsId - Local SMS ID
   * @param {Object} options - Pagination options
   * @returns {Promise<Object>} SMS statistics
   */
  async getCampaignStats(smsId, options = {}) {
    try {
      const { page = 1, limit = 100 } = options;
      const skip = (page - 1) * limit;

      const [stats, totalRecords] = await Promise.all([
        prisma.mauticSmsStat.findMany({
          where: { smsId },
          orderBy: { dateSent: 'desc' },
          skip,
          take: limit
        }),
        prisma.mauticSmsStat.count({
          where: { smsId }
        })
      ]);

      const totalSuccessful = await prisma.mauticSmsStat.count({
        where: { smsId, isFailed: '0' }
      });

      const totalFailed = await prisma.mauticSmsStat.count({
        where: { smsId, isFailed: '1' }
      });

      return {
        stats,
        totalRecords,
        totalSuccessful,
        totalFailed,
        page,
        limit,
        totalPages: Math.ceil(totalRecords / limit)
      };
    } catch (error) {
      logger.error('Failed to get campaign stats:', { error: error.message });
      throw error;
    }
  }

  /**
   * Reassign orphaned SMS to matching Mautic clients
   * This runs after a new Mautic client is added
   * @param {Int} mauticClientId - Newly added Mautic client ID
   * @returns {Promise<Int>} Number of SMS reassigned
   */
  async reassignOrphanedSms(mauticClientId) {
    try {
      const mauticClient = await prisma.mauticClient.findUnique({
        where: { id: mauticClientId }
      });

      if (!mauticClient) {
        throw new Error(`Mautic client ${mauticClientId} not found`);
      }

      const clientNameLower = mauticClient.name.toLowerCase();

      // Find orphaned SMS that match this client's prefix
      const orphanedSms = await prisma.mauticSms.findMany({
        where: {
          clientId: null,
          smsClientId: { not: null }
        }
      });

      let reassigned = 0;
      for (const sms of orphanedSms) {
        if (sms.name.toLowerCase().startsWith(clientNameLower)) {
          await prisma.mauticSms.update({
            where: { id: sms.id },
            data: {
              clientId: mauticClientId,
              smsClientId: null,
              updatedAt: new Date()
            }
          });
          reassigned++;
          logger.info(`Reassigned SMS "${sms.name}" to Mautic client "${mauticClient.name}"`);
        }
      }

      return reassigned;
    } catch (error) {
      logger.error('Failed to reassign orphaned SMS:', { error: error.message });
      throw error;
    }
  }

  /**
   * Get all SMS campaigns (for Services page)
   * @param {Array} accessibleClientIds - Optional array of accessible Mautic client IDs
   * @returns {Promise<Array>} All SMS campaigns
   */
  async getAllSmsCampaigns(accessibleClientIds = null) {
    try {
      const where = {};
      
      if (accessibleClientIds && accessibleClientIds.length > 0) {
        where.OR = [
          { clientId: { in: accessibleClientIds } },
          { smsClientId: { not: null } } // Include SMS client campaigns
        ];
      }

      const campaigns = await prisma.mauticSms.findMany({
        where,
        include: {
          client: {
            select: { id: true, name: true }
          },
          smsClient: {
            select: { id: true, name: true }
          }
        },
        orderBy: { name: 'asc' }
      });

      return campaigns.map(c => ({
        id: c.id,
        mauticId: c.mauticId,
        name: c.name,
        category: c.category,
        sentCount: c.sentCount,
        clientId: c.clientId,
        clientName: c.client?.name || c.smsClient?.name || 'Unknown',
        clientType: c.clientId ? 'mautic' : 'sms'
      }));
    } catch (error) {
      logger.error('Failed to get all SMS campaigns:', { error: error.message });
      throw error;
    }
  }
}

export default new SmsService();

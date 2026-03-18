import prisma from '../../../../prisma/client.js';
import logger from '../../../../utils/logger.js';
import campaignGrouping from './campaignGrouping.js';

class SmsService {
  _findBestClientMatch(regularClients, campaignName) {
    let bestClient = null;
    let bestPriority = Infinity;

    for (const client of regularClients) {
      const result = campaignGrouping.isClientMatch(client.name, campaignName);
      if (result.match && typeof result.priority === 'number' && result.priority < bestPriority) {
        bestClient = client;
        bestPriority = result.priority;
      }
    }

    return bestClient;
  }

  /**
   * 🔐 SAFE SMSCLID RESOLVER: Validates and resolves smsClientId to prevent foreign key violations
   * This helper ensures we never try to set a smsClientId that doesn't exist
   * @param {string} mauticUrl - Mautic URL to lookup SMS client
   * @param {string} username - Username to lookup SMS client
   * @param {number|null} fallbackId - Optional fallback ID to validate
   * @returns {Promise<number|null>} Valid SmsClient.id or null
   */
  async resolveSmsClientId(mauticUrl, username, fallbackId = null) {
    try {
      // Normalize credentials for matching
      const trimmedUrl = mauticUrl.trim().replace(/\/$/, '');
      const normalizedUrl = trimmedUrl.toLowerCase();
      const normalizedUsername = username.trim();

      // First: Try to find SMS client by credentials (most reliable)
      const smsClient = await prisma.smsClient.findFirst({
        where: {
          mauticUrl: { in: [normalizedUrl, trimmedUrl] },
          username: normalizedUsername
        },
        select: { id: true }
      });

      if (smsClient) {
        logger.info(`   🔗 Resolved smsClientId: ${smsClient.id} via credentials`);
        return smsClient.id;
      }

      // Second: If fallbackId provided, validate it exists
      if (fallbackId) {
        const exists = await prisma.smsClient.findUnique({
          where: { id: fallbackId },
          select: { id: true }
        });

        if (exists) {
          logger.info(`   🔗 Validated fallback smsClientId: ${fallbackId}`);
          return fallbackId;
        } else {
          logger.warn(`   ⚠️  Fallback smsClientId ${fallbackId} doesn't exist (orphaned reference)`);
        }
      }

      // No valid smsClientId found
      logger.info(`   🔗 No valid smsClientId found for ${normalizedUrl}`);
      return null;
    } catch (error) {
      logger.error(`❌ Error resolving smsClientId:`, error.message);
      return null;
    }
  }

  /**
   * 🧹 CLEANUP ORPHANED REFERENCES: Fix campaigns with invalid smsClientId before sync
   * This prevents foreign key violations from old/deleted client references
   * @returns {Promise<number>} Number of orphaned references cleaned
   */
  async cleanupOrphanedReferences() {
    try {
      logger.info(`🧹 Checking for orphaned smsClientId references...`);

      // Find all campaigns with smsClientId set
      const campaignsWithSmsClient = await prisma.mauticSms.findMany({
        where: {
          smsClientId: { not: null }
        },
        select: {
          id: true,
          mauticId: true,
          name: true,
          smsClientId: true,
          originMauticUrl: true,
          originUsername: true
        }
      });

      if (campaignsWithSmsClient.length === 0) {
        logger.info(`   ✅ No campaigns with smsClientId found`);
        return 0;
      }

      logger.info(`   📊 Found ${campaignsWithSmsClient.length} campaigns with smsClientId`);

      // Get all valid SMS client IDs
      const validSmsClients = await prisma.smsClient.findMany({
        select: { id: true }
      });
      const validIds = new Set(validSmsClients.map(c => c.id));

      // Find orphaned references
      const orphaned = campaignsWithSmsClient.filter(c => !validIds.has(c.smsClientId));

      if (orphaned.length === 0) {
        logger.info(`   ✅ All smsClientId references are valid`);
        return 0;
      }

      logger.warn(`   ⚠️  Found ${orphaned.length} orphaned smsClientId references`);

      // Fix each orphaned reference
      let fixed = 0;
      for (const campaign of orphaned) {
        try {
          // Try to resolve correct smsClientId using origin credentials
          let resolvedId = null;
          if (campaign.originMauticUrl && campaign.originUsername) {
            resolvedId = await this.resolveSmsClientId(
              campaign.originMauticUrl,
              campaign.originUsername,
              null
            );
          }

          // Update the campaign
          await prisma.mauticSms.update({
            where: { id: campaign.id },
            data: { smsClientId: resolvedId }
          });

          if (resolvedId) {
            logger.info(`   ✅ Fixed campaign "${campaign.name}": ${campaign.smsClientId} → ${resolvedId}`);
          } else {
            logger.info(`   ✅ Cleaned campaign "${campaign.name}": ${campaign.smsClientId} → null`);
          }
          fixed++;
        } catch (fixError) {
          logger.error(`   ❌ Failed to fix campaign "${campaign.name}":`, fixError.message);
        }
      }

      logger.info(`🧹 Cleanup complete: ${fixed}/${orphaned.length} orphaned references fixed`);
      return fixed;
    } catch (error) {
      logger.error(`❌ Failed to cleanup orphaned references:`, error.message);
      return 0;
    }
  }

  /**
   * ✅ DETERMINISTIC GROUPING: Only group NEW campaigns, preserve REAL client assignments
   * ⚠️  RE-EVALUATES campaigns assigned to SMS-only clients (IPS, BPC) for better matching
   * Checks database for existing SMS campaign assignments and reuses them selectively
   * This ensures consistent grouping while allowing improvements from better matching
   * @param {Array} smsCampaigns - Array of SMS campaigns from Mautic
   * @param {Array} mauticClients - Array of all Mautic clients (EXCLUDING sms-only clients)
   * @returns {Promise<Object>} Categorized SMS campaigns with preserved assignments
   */
  async categorizeSmsWithPersistence(smsCampaigns, mauticClients, originMauticUrl = null) {
    const categorized = {
      matched: [],   // SMS matched to Mautic clients
      unmatched: []  // SMS that couldn't be matched (will create/use SMS-only client)
    };

    // Filter out sms-only clients from matching to avoid conflicts
    const regularClients = mauticClients.filter(client => client.reportId !== 'sms-only');

    if (regularClients.length === 0 || smsCampaigns.length === 0) {
      logger.warn('⚠️  No regular Mautic clients or SMS campaigns to categorize');
      categorized.unmatched = smsCampaigns;
      return categorized;
    }

    logger.info(`🔄 Categorizing ${smsCampaigns.length} SMS campaigns with persistence...`);

    // STEP 1: Check which campaigns already exist in database + their client assignments
    const originFilter = originMauticUrl
      ? { OR: [{ originMauticUrl }, { originMauticUrl: null }, { originMauticUrl: '' }] }
      : undefined;

    const existingCampaigns = await prisma.mauticSms.findMany({
      where: {
        mauticId: { in: smsCampaigns.map(s => s.id) },
        ...(originFilter ? originFilter : {})
      },
      select: {
        mauticId: true,
        clientId: true,
        name: true,
        client: {
          select: { reportId: true, name: true }  // Check if client is sms-only
        }
      }
    });

    // STEP 2: Separate existing campaigns into preserved and re-evaluate groups
    const preservedMap = new Map();      // Real Mautic client assignments (keep stable)
    const reevaluateMap = new Map();     // SMS-only assignments (allow re-grouping) + invalid assignments

    for (const existing of existingCampaigns) {
      if (existing.client?.reportId === 'sms-only') {
        // Previously assigned to SMS-only client - can be re-evaluated
        reevaluateMap.set(existing.mauticId, { clientId: existing.clientId, name: existing.name, clientName: existing.client.name });
        logger.info(`   🔄 Will re-evaluate "${existing.name}" (currently assigned to SMS-only "${existing.client.name}")`);
      } else if (existing.clientId && existing.client) {
        // Assigned to real Mautic client - preserve only if it STILL matches, otherwise re-evaluate.
        const campaign = smsCampaigns.find(c => c.id === existing.mauticId);
        if (!campaign) continue;

        const bestMatch = this._findBestClientMatch(regularClients, campaign.name);
        const stillMatchesCurrent = campaignGrouping.isClientMatch(existing.client.name, campaign.name).match;

        if (bestMatch && bestMatch.id !== existing.clientId) {
          reevaluateMap.set(existing.mauticId, {
            clientId: existing.clientId,
            name: existing.name,
            clientName: existing.client.name,
            betterMatch: bestMatch.name
          });
          logger.info(`   🔄 Will re-evaluate "${existing.name}" (better match: "${bestMatch.name}" vs current "${existing.client.name}")`);
        } else if (!stillMatchesCurrent && !bestMatch) {
          // No match at all anymore -> do NOT preserve a bad assignment.
          reevaluateMap.set(existing.mauticId, {
            clientId: existing.clientId,
            name: existing.name,
            clientName: existing.client.name,
            betterMatch: null
          });
          logger.info(`   🔄 Will re-evaluate "${existing.name}" (no longer matches "${existing.client.name}")`);
        } else {
          preservedMap.set(existing.mauticId, { clientId: existing.clientId, name: existing.name, clientName: existing.client.name });
          logger.info(`   ♻️  Will preserve "${existing.name}" (still best match for "${existing.client.name}")`);
        }
      }
    }

    logger.info(`   📊 Found: ${preservedMap.size} to preserve, ${reevaluateMap.size} to re-evaluate, ${smsCampaigns.length - preservedMap.size - reevaluateMap.size} new`);

    // STEP 3: Split campaigns into evaluation groups
    const newCampaigns = smsCampaigns.filter(s => !preservedMap.has(s.id) && !reevaluateMap.has(s.id));
    const reevaluateCampaigns = smsCampaigns.filter(s => reevaluateMap.has(s.id));

    logger.info(`   ✨ New: ${newCampaigns.length}, Re-evaluate: ${reevaluateCampaigns.length}, Preserved: ${preservedMap.size}`);

    // STEP 4: Apply grouping to NEW campaigns + RE-EVALUATE campaigns
    let groupMap = new Map();
    const campaignsToEvaluate = [...newCampaigns, ...reevaluateCampaigns];
    if (campaignsToEvaluate.length > 0) {
      groupMap = campaignGrouping.groupCampaigns(regularClients, campaignsToEvaluate);
      logger.info(`   🎯 Grouping applied to ${campaignsToEvaluate.length} campaigns (${newCampaigns.length} new + ${reevaluateCampaigns.length} re-evaluated)`);
    }

    // STEP 5: Build assignment map combining new grouping + preserved assignments
    const assignmentMap = new Map();

    // Add new campaign assignments (fresh grouping)
    for (const [clientId, campaignIds] of groupMap.entries()) {
      campaignIds.forEach(campaignId => {
        assignmentMap.set(campaignId, clientId);
      });
    }

    // Add preserved campaign assignments (STABLE - no changes)
    for (const [mauticId, { clientId }] of preservedMap.entries()) {
      assignmentMap.set(mauticId, clientId);
    }

    // STEP 6: Categorize all SMS based on assignments
    let newlyMatched = 0;
    for (const sms of smsCampaigns) {
      const assignedClientId = assignmentMap.get(sms.id);

      if (assignedClientId) {
        // Find matching client
        const client = regularClients.find(c => c.id === assignedClientId);
        categorized.matched.push({
          ...sms,
          clientId: assignedClientId,
          clientName: client?.name
        });

        // Log assignment status
        if (preservedMap.has(sms.id)) {
          logger.info(`   ♻️  SMS "${sms.name}" → Client "${client?.name}" (PRESERVED)`);
        } else if (reevaluateMap.has(sms.id)) {
          const oldClient = reevaluateMap.get(sms.id).clientName;
          if (assignedClientId === reevaluateMap.get(sms.id).clientId) {
            logger.info(`   ↩️  SMS "${sms.name}" → Client "${client?.name}" (unchanged on re-eval)`);
          } else {
            logger.info(`   ✅ SMS "${sms.name}" → Client "${client?.name}" (re-grouped from "${oldClient}")`);
            newlyMatched++;
          }
        } else {
          logger.info(`   ✨ SMS "${sms.name}" → Client "${client?.name}" (NEW)`);
        }
      } else {
        // No match found - will be SMS-only
        categorized.unmatched.push(sms);
        if (reevaluateMap.has(sms.id)) {
          const oldClient = reevaluateMap.get(sms.id).clientName;
          logger.info(`   ❌ SMS "${sms.name}" → SMS-only (moved from "${oldClient}")`);
        } else {
          logger.info(`   ❌ SMS "${sms.name}" → SMS-only (no match)`);
        }
      }
    }

    logger.info(`✅ Categorization complete: matched=${categorized.matched.length}, unmatched=${categorized.unmatched.length}, regrouped=${newlyMatched}`);

    return categorized;
  }

  /**
   * Keep legacy method for backwards compatibility
   */
  categorizeSms(smsCampaigns, mauticClients) {
    const categorized = {
      matched: [],   // SMS matched to Mautic clients
      unmatched: []  // SMS that couldn't be matched (will create/use SMS-only client)
    };

    // Filter out sms-only clients from matching to avoid conflicts
    const regularClients = mauticClients.filter(client => client.reportId !== 'sms-only');

    if (regularClients.length === 0 || smsCampaigns.length === 0) {
      logger.warn('⚠️  No regular Mautic clients or SMS campaigns to categorize');
      categorized.unmatched = smsCampaigns;
      return categorized;
    }

    logger.info(`🔄 Categorizing ${smsCampaigns.length} SMS campaigns...`);

    // Use campaignGrouping service to get intelligent grouping
    const groupMap = campaignGrouping.groupCampaigns(regularClients, smsCampaigns);

    // Build assignment map for easy lookup
    const assignmentMap = new Map();
    for (const [clientId, campaignIds] of groupMap.entries()) {
      campaignIds.forEach(campaignId => {
        assignmentMap.set(campaignId, clientId);
      });
    }

    // Categorize SMS based on assignments
    for (const sms of smsCampaigns) {
      const assignedClientId = assignmentMap.get(sms.id);

      if (assignedClientId) {
        // Find matching client
        const client = regularClients.find(c => c.id === assignedClientId);
        categorized.matched.push({
          ...sms,
          clientId: assignedClientId,
          clientName: client?.name
        });
        logger.info(`✅ SMS "${sms.name}" → Client "${client?.name}"`);
      } else {
        // No match found
        categorized.unmatched.push(sms);
        logger.info(`❌ SMS "${sms.name}" → SMS-only (no match)`);
      }
    }

    logger.info(`✅ Categorization complete: ${categorized.matched.length} matched, ${categorized.unmatched.length} unmatched`);

    return categorized;
  }

  /**
   * Store SMS campaigns from an SMS client with automatic Mautic client creation
   * Matched SMS go to existing Mautic clients, unmatched SMS auto-create a new Mautic client
   * ✅ USES PERSISTENCE: Re-evaluates existing campaigns to catch new matches
   * ✅ TRACKS ORIGIN: Sets originMauticUrl and originUsername to track which credentials fetched each campaign
   * @param {Object} smsClient - SMS Client object (needs name, mauticUrl, username, password)
   * @param {Array} smsCampaigns - Array of SMS campaigns
   * @param {Array} mauticClients - Array of Mautic clients for prefix matching
   * @returns {Promise<Object>} Store results
   */
  async storeSmsWithAutoClient(smsClient, smsCampaigns, mauticClients = []) {
    try {
      logger.info(`🔄 Storing ${smsCampaigns.length} SMS campaigns for SMS client ${smsClient.name}`);

      // ✅ Use persistence-aware categorization so fresh matches are detected
      // This allows campaigns to be re-grouped if matching logic improves or Mautic clients are added
      const categorized = mauticClients.length > 0
        ? await this.categorizeSmsWithPersistence(smsCampaigns, mauticClients)
        : this.categorizeSms(smsCampaigns, mauticClients);  // Fallback if no Mautic clients provided

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

      // ✅ ORIGIN TRACKING: Normalize URL for consistent matching
      const normalizedOriginUrl = smsClient.mauticUrl.trim().replace(/\/$/, '').toLowerCase();
      const originUsername = smsClient.username.trim();

      // ✅ SAFE smsClientId RESOLUTION: Use helper to validate and resolve correct ID
      const resolvedSmsClientId = await this.resolveSmsClientId(
        smsClient.mauticUrl,
        smsClient.username,
        null
      );

      logger.info(`   🔗 Using smsClientId: ${resolvedSmsClientId} for ${allSms.length} campaigns`);

      for (const sms of allSms) {
        // ✅ Keep BOTH links when we know the source SMS client.
        // clientId = business grouping; smsClientId = source credentials for stats.
        const finalClientId = sms.clientId ?? null;
        const finalSmsClientId = resolvedSmsClientId;

        const uniqueWhere = {
          mauticId_origin_unique: {
            mauticId: sms.id,
            originMauticUrl: normalizedOriginUrl
          }
        };

        const updateData = {
          name: sms.name,
          category: sms.category,
          sentCount: sms.sentCount || 0,
          clientId: finalClientId,
          smsClientId: finalSmsClientId,
          originMauticUrl: normalizedOriginUrl,
          originUsername: originUsername,
          updatedAt: new Date()
        };

        // Prefer the composite-unique row for this origin.
        const existing = await prisma.mauticSms.findUnique({ where: uniqueWhere });
        if (existing) {
          await prisma.mauticSms.update({ where: uniqueWhere, data: updateData });
          updated++;
          continue;
        }

        // Legacy fallback: older rows may exist with originMauticUrl null/empty.
        const legacy = await prisma.mauticSms.findFirst({
          where: {
            mauticId: sms.id,
            OR: [{ originMauticUrl: null }, { originMauticUrl: '' }]
          },
          select: { id: true }
        });

        if (legacy?.id) {
          await prisma.mauticSms.update({ where: { id: legacy.id }, data: updateData });
          updated++;
        } else {
          await prisma.mauticSms.create({
            data: {
              mauticId: sms.id,
              ...updateData,
              // createdAt uses DB default
            }
          });
          created++;
        }
      }

      logger.info(`SMS storage complete: ${created} created, ${updated} updated`);
      logger.info(`  - Matched to existing Mautic clients: ${categorized.matched.length}`);
      logger.info(`  - Auto-assigned to "${smsClient.name}": ${categorized.unmatched.length}`);
      logger.info(`  - Origin tracked: ${normalizedOriginUrl} / ${originUsername}`);

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
   * Respects existing categorization from SMS sync to avoid overwriting clientId
   * Also performs smart categorization based on campaign name prefixes
   * ✅ TRACKS ORIGIN: Sets originMauticUrl and originUsername to track which credentials fetched each campaign
   * @param {Int} mauticClientId - Mautic Client ID
   * @param {Array} smsCampaigns - Array of SMS campaigns
   * @param {Array} mauticClients - Optional array of all Mautic clients for categorization
   * @returns {Promise<Object>} Store results
   */
  async storeSmsForMauticClient(mauticClientId, smsCampaigns, mauticClients = []) {
    try {
      logger.info(`Storing ${smsCampaigns.length} SMS campaigns for Mautic client ${mauticClientId}`);

      // ✅ Get the Mautic client to extract origin credentials
      const mauticClient = await prisma.mauticClient.findUnique({
        where: { id: mauticClientId },
        select: { name: true, mauticUrl: true, username: true, password: true, reportId: true }
      });

      if (!mauticClient) {
        throw new Error(`Mautic client ${mauticClientId} not found`);
      }

      // ✅ ORIGIN TRACKING: Normalize URL for consistent matching
      const normalizedOriginUrl = mauticClient.mauticUrl.trim().replace(/\/$/, '').toLowerCase();
      const originUsername = mauticClient.username.trim();

      // ✅ SAFE smsClientId RESOLUTION: Use helper to validate and resolve correct ID
      let smsClientIdToUse = await this.resolveSmsClientId(
        mauticClient.mauticUrl,
        mauticClient.username,
        null
      );

      let created = 0, updated = 0;
      let preserved = 0;
      let categorized = 0;

      // ✅ Use persistence-aware categorization to ensure consistent grouping across syncs
      const categorizedSms = await this.categorizeSmsWithPersistence(smsCampaigns, mauticClients, normalizedOriginUrl);

      logger.info(`✅ Categorization complete: ${categorizedSms.matched.length} matched, ${categorizedSms.unmatched.length} unmatched`);

      // If this Mautic client produced unmatched campaigns and we don't have an SmsClient
      // for these credentials, auto-create an inactive bucket so unmatched campaigns are
      // still queryable via smsClientId (and never bleed into other Mautic clients).
      if (!smsClientIdToUse && categorizedSms.unmatched.length > 0) {
        const autoName = `unmatched - ${mauticClient.name}`;

        const existingAuto = await prisma.smsClient.findFirst({
          where: {
            mauticUrl: normalizedOriginUrl,
            username: originUsername
          },
          select: { id: true, name: true, isActive: true }
        });

        if (existingAuto?.id) {
          smsClientIdToUse = existingAuto.id;
          logger.info(`   🔗 Using existing SmsClient bucket ${existingAuto.id} (${existingAuto.name}) for unmatched campaigns`);
        } else {
          try {
            const createdSmsClient = await prisma.smsClient.create({
              data: {
                name: autoName,
                mauticUrl: normalizedOriginUrl,
                username: originUsername,
                password: mauticClient.password,
                isActive: false,
                lastSyncAt: null
              },
              select: { id: true, name: true }
            });
            smsClientIdToUse = createdSmsClient.id;
            logger.info(`   ✨ Auto-created SmsClient bucket ${createdSmsClient.id} (${createdSmsClient.name}) for unmatched campaigns`);
          } catch (createErr) {
            logger.warn(`   ⚠️  Failed to auto-create SmsClient bucket for unmatched campaigns: ${createErr.message}`);
            // Keep smsClientIdToUse as null; campaigns will remain unmatched with smsClientId null.
          }
        }
      }

      // Process matched campaigns (assign to Mautic clients)
      for (const sms of categorizedSms.matched) {
        const uniqueWhere = {
          mauticId_origin_unique: {
            mauticId: sms.id,
            originMauticUrl: normalizedOriginUrl
          }
        };

        let existing = await prisma.mauticSms.findUnique({ where: uniqueWhere });
        if (!existing) {
          existing = await prisma.mauticSms.findFirst({
            where: { mauticId: sms.id, OR: [{ originMauticUrl: null }, { originMauticUrl: '' }] }
          });
        }

        const finalSmsClientId = (existing?.smsClientId != null)
          ? existing.smsClientId
          : smsClientIdToUse;

        const updateData = {
          name: sms.name,
          category: sms.category,
          sentCount: sms.sentCount || 0,
          clientId: sms.clientId,  // ✅ Use categorized client assignment
          smsClientId: finalSmsClientId,
          originMauticUrl: normalizedOriginUrl,
          originUsername: originUsername,
          updatedAt: new Date()
        };

        if (existing) {
          // Check if assignment is being preserved (no change needed)
          if (existing.clientId === sms.clientId) {
            preserved++;
            logger.info(`♻️  Preserving SMS "${sms.name}" under client "${sms.clientName}"`);
          } else {
            // Assignment changed (rare case)
            logger.info(`🔄 Reassigning SMS "${sms.name}" from clientId ${existing.clientId} to "${sms.clientName}"`);
            categorized++;
          }

          const whereClause = (existing.originMauticUrl && String(existing.originMauticUrl).trim().toLowerCase() === normalizedOriginUrl)
            ? uniqueWhere
            : { id: existing.id };

          await prisma.mauticSms.update({ where: whereClause, data: updateData });
          updated++;
        } else {
          // New SMS campaign
          await prisma.mauticSms.create({
            data: {
              mauticId: sms.id,
              ...updateData
            }
          });
          created++;
          categorized++;
          logger.info(`✨ Created SMS "${sms.name}" under client "${sms.clientName}"`);
        }
      }

      // Process unmatched campaigns (SMS-only)
      for (const sms of categorizedSms.unmatched) {
        const uniqueWhere = {
          mauticId_origin_unique: {
            mauticId: sms.id,
            originMauticUrl: normalizedOriginUrl
          }
        };

        let existing = await prisma.mauticSms.findUnique({ where: uniqueWhere });
        if (!existing) {
          existing = await prisma.mauticSms.findFirst({
            where: { mauticId: sms.id, OR: [{ originMauticUrl: null }, { originMauticUrl: '' }] }
          });
        }

        const finalSmsClientId = (existing?.smsClientId != null)
          ? existing.smsClientId
          : smsClientIdToUse;

        const updateData = {
          name: sms.name,
          category: sms.category,
          sentCount: sms.sentCount || 0,
          clientId: null,  // ✅ No Mautic client match
          smsClientId: finalSmsClientId,
          originMauticUrl: normalizedOriginUrl,
          originUsername: originUsername,
          updatedAt: new Date()
        };

        if (existing) {
          if (!existing.clientId && existing.smsClientId === smsClientIdToUse) {
            preserved++;
            logger.info(`♻️  Preserving SMS "${sms.name}" as SMS-only under original SMS client`);
          } else {
            logger.info(`🔄 Reassigning SMS "${sms.name}" to SMS-only (no Mautic match)`);
          }

          const whereClause = (existing.originMauticUrl && String(existing.originMauticUrl).trim().toLowerCase() === normalizedOriginUrl)
            ? uniqueWhere
            : { id: existing.id };

          await prisma.mauticSms.update({ where: whereClause, data: updateData });
          updated++;
        } else {
          // New unmatched SMS
          await prisma.mauticSms.create({
            data: {
              mauticId: sms.id,
              ...updateData
            }
          });
          created++;
          logger.info(`✨ Created SMS "${sms.name}" as SMS-only (no Mautic match)`);
        }
      }

      logger.info(`✅ SMS storage complete: ${created} created, ${updated} updated`);
      logger.info(`   Preserved: ${preserved}, Categorized: ${categorized}`);
      logger.info(`   Origin: ${normalizedOriginUrl} / ${originUsername}`);

      return {
        created,
        updated,
        total: created + updated,
        preserved: preserved,
        categorized: categorized,
        matchedCount: categorizedSms.matched.length,
        unmatchedCount: categorizedSms.unmatched.length
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

      // 🔐 VALIDATE smsClientId exists to prevent foreign key violations
      const validatedSmsClientId = await prisma.smsClient.findUnique({
        where: { id: smsClientId },
        select: { id: true }
      });

      if (!validatedSmsClientId) {
        throw new Error(`SMS Client ID ${smsClientId} does not exist (deleted or invalid)`);
      }

      // ✅ ORIGIN TRACKING: attach origin to keep composite-unique consistent
      const smsClient = await prisma.smsClient.findUnique({
        where: { id: smsClientId },
        select: { mauticUrl: true, username: true }
      });
      const normalizedOriginUrl = smsClient?.mauticUrl
        ? smsClient.mauticUrl.trim().replace(/\/$/, '').toLowerCase()
        : null;
      const originUsername = smsClient?.username ? smsClient.username.trim() : null;

      logger.info(`   ✅ Validated smsClientId: ${smsClientId}`);

      const categorized = this.categorizeSms(smsCampaigns, mauticClients);
      let created = 0, updated = 0;

      // Store matched SMS (linked to Mautic clients)
      for (const sms of categorized.matched) {
        const uniqueWhere = normalizedOriginUrl
          ? { mauticId_origin_unique: { mauticId: sms.id, originMauticUrl: normalizedOriginUrl } }
          : null;

        const updateData = {
          name: sms.name,
          category: sms.category,
          sentCount: sms.sentCount || 0,
          clientId: sms.clientId,
          smsClientId: null,
          originMauticUrl: normalizedOriginUrl,
          originUsername: originUsername,
          updatedAt: new Date()
        };

        let existing = null;
        if (uniqueWhere) {
          existing = await prisma.mauticSms.findUnique({ where: uniqueWhere });
        }

        if (existing) {
          await prisma.mauticSms.update({ where: uniqueWhere, data: updateData });
          updated++;
        } else {
          await prisma.mauticSms.create({
            data: {
              mauticId: sms.id,
              ...updateData
            }
          });
          created++;
        }
      }

      // Store unmatched SMS (linked to SMS client)
      for (const sms of categorized.unmatched) {
        // Check if already exists with a clientId (don't overwrite)
        const uniqueWhere = normalizedOriginUrl
          ? { mauticId_origin_unique: { mauticId: sms.id, originMauticUrl: normalizedOriginUrl } }
          : null;

        const existing = uniqueWhere
          ? await prisma.mauticSms.findUnique({ where: uniqueWhere })
          : await prisma.mauticSms.findFirst({ where: { mauticId: sms.id } });

        if (existing && existing.clientId) {
          // Skip if already assigned to a Mautic client
          continue;
        }

        const updateData = {
          name: sms.name,
          category: sms.category,
          sentCount: sms.sentCount || 0,
          clientId: null,
          smsClientId: smsClientId,
          originMauticUrl: normalizedOriginUrl,
          originUsername: originUsername,
          updatedAt: new Date()
        };

        if (existing && uniqueWhere) {
          await prisma.mauticSms.update({ where: uniqueWhere, data: updateData });
          updated++;
        } else if (existing && !uniqueWhere) {
          await prisma.mauticSms.update({ where: { id: existing.id }, data: updateData });
          updated++;
        } else {
          await prisma.mauticSms.create({
            data: {
              mauticId: sms.id,
              ...updateData
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
   * Store pre-transformed SMS statistics directly
   * This method expects data already in DB format with mobile/replies included
   * @param {Array} transformedStats - Array of pre-transformed stats ready for DB insertion
   * @returns {Promise<Object>} Store results
   */
  async storeTransformedSmsStats(transformedStats) {
    try {
      if (!Array.isArray(transformedStats) || transformedStats.length === 0) {
        logger.warn(`⚠️  No transformed stats to store`);
        return { created: 0, skipped: 0, total: 0 };
      }

      logger.info(`📥 Storing ${transformedStats.length} pre-transformed SMS stats...`);

      let created = 0;
      let skipped = 0;

      // Group by campaign for efficient existence checks
      const byCampaign = new Map();
      for (const stat of transformedStats) {
        const mauticSmsId = stat?.mauticSmsId;
        if (!mauticSmsId) continue;
        if (!byCampaign.has(mauticSmsId)) byCampaign.set(mauticSmsId, []);
        byCampaign.get(mauticSmsId).push(stat);
      }

      for (const [mauticSmsId, stats] of byCampaign.entries()) {
        const leadIds = [...new Set(stats.map((s) => s.leadId).filter((id) => Number.isInteger(id) && id > 0))];

        const existingRows = leadIds.length > 0
          ? await prisma.mauticSmsStat.findMany({
            where: {
              mauticSmsId,
              leadId: { in: leadIds }
            },
            select: {
              id: true,
              leadId: true,
              mobile: true,
              messageText: true,
              replyText: true
            }
          })
          : [];

        const existingByLead = new Map(existingRows.map((r) => [r.leadId, r]));

        const toCreate = stats.filter((s) => !existingByLead.has(s.leadId));
        if (toCreate.length > 0) {
          const result = await prisma.mauticSmsStat.createMany({
            data: toCreate,
            skipDuplicates: true
          });
          created += result.count || 0;
        }

        // Update existing rows only if we have new enrichment fields
        for (const stat of stats) {
          const existing = existingByLead.get(stat.leadId);
          if (!existing) continue;

          const updateData = {};
          if (stat.mobile && !existing.mobile) updateData.mobile = stat.mobile;
          if (stat.messageText && !existing.messageText) updateData.messageText = stat.messageText;
          if (stat.replyText && !existing.replyText) {
            updateData.replyText = stat.replyText;
            updateData.replyCategory = stat.replyCategory;
            updateData.repliedAt = stat.repliedAt;
          }

          if (Object.keys(updateData).length > 0) {
            try {
              await prisma.mauticSmsStat.update({
                where: { id: existing.id },
                data: updateData
              });
            } catch (e) {
              logger.error(`   ❌ Error updating stat (${mauticSmsId}/${stat.leadId}):`, e.message);
            }
          }
        }

        skipped += Math.max(0, stats.length - (toCreate.length || 0));
      }

      logger.info(`✅ Stored: ${created} created, ${skipped} skipped`);
      return { created, skipped, total: created + skipped };

    } catch (error) {
      logger.error('❌ Failed to store transformed SMS stats:', error.message);
      return { created: 0, skipped: 0, total: 0, error: error.message };
    }
  }

  /**
   * Store SMS statistics
   * @param {Int} smsId - Local SMS ID (from MauticSms table)
   * @param {Int} mauticSmsId - Original Mautic SMS campaign ID
   * @param {Array} stats - Array of SMS statistics
   * @returns {Promise<Object>} Store results
   */
  async storeSmsStats(smsId, mauticSmsId, stats, fetchMessages = true) {
    try {
      logger.info(`📥 Storing ${stats.length} SMS stats for SMS ${smsId} (Mautic ID: ${mauticSmsId})`);
      if (fetchMessages) {
        logger.info(`   📨 Fetching message and reply data for all contacts...`);
      }

      if (!Array.isArray(stats) || stats.length === 0) {
        logger.warn(`⚠️  No stats to store (received ${typeof stats})`);
        return { created: 0, skipped: 0, total: 0 };
      }

      let created = 0, skipped = 0, errors = 0;
      let createdWithReplies = 0;  // Track how many have replies
      let createdWithoutReplies = 0;

      // Log sample stat for debugging
      logger.info(`   Sample stat: ${JSON.stringify(stats[0])}`);

      // Get unique lead IDs for mobile number fetching
      const leadIds = [...new Set(stats.map(stat => {
        return stat.lead_id || stat.leadId || stat.contact_id || stat.contactId;
      }).filter(Boolean))];

      logger.info(`   📝 Processing ${stats.length} stats for ${leadIds.length} unique leads`);
      logger.info(`   � Processing ${stats.length} stats for ${leadIds.length} unique leads`);
      logger.info(`   📱 Fetching mobile numbers in BULK (parallel)...`);

      // Get client credentials for fetching mobile numbers and messages
      let mobileMap = new Map();
      let repliesMap = new Map();
      let client = null;

      try {
        const smsRecord = await prisma.mauticSms.findUnique({
          where: { id: smsId },
          include: { client: true }
        });

        if (smsRecord?.client) {
          client = smsRecord.client;
          const mauticAPI = (await import('../../mauticAPI.js')).default;

          // ✅ Use NEW BULK fetch for mobiles (parallel - 50 concurrent)
          try {
            mobileMap = await mauticAPI.fetchMobileNumbersBulk(client, leadIds);
            logger.info(`   ✅ Bulk fetched mobiles: ${mobileMap.size} found / ${leadIds.length} leads`);
          } catch (mobileErr) {
            logger.warn(`   ⚠️  Failed to fetch mobiles: ${mobileErr.message}`);
            mobileMap = new Map();
          }

          // ✅ Use NEW BULK fetch for replies (parallel - 50 concurrent)
          try {
            repliesMap = await mauticAPI.fetchSmsRepliesBulk(client, leadIds);
            logger.info(`   ✅ Bulk fetched replies: ${repliesMap.size} found / ${leadIds.length} leads`);

            // DEBUG: Log if repliesMap is empty
            if (repliesMap.size === 0 && leadIds.length > 0) {
              logger.warn(`   ⚠️  WARNING: No replies found for any of the ${leadIds.length} leads!`);
              logger.info(`   ℹ️  Sample lead IDs: ${leadIds.slice(0, 5).join(', ')}`);
            }
          } catch (repliesErr) {
            logger.warn(`   ⚠️  Failed to fetch replies: ${repliesErr.message}`);
            repliesMap = new Map();
          }
        } else {
          logger.warn(`   ⚠️  Could not fetch data - client not found`);
        }
      } catch (mobileError) {
        logger.warn(`   ⚠️  Failed to initialize bulk fetch: ${mobileError.message}`);
        // Continue without mobiles/replies - they can be fetched later
      }

      // ✅ Message data already included in repliesMap from bulk fetch above
      let messageDataMap = new Map();

      // Convert replies into message data format
      if (repliesMap.size > 0) {
        for (const [leadId, replyData] of repliesMap.entries()) {
          // ✅ FIX: Categorize reply as "Stop" or "Other"
          const replyText = replyData.reply || '';
          const replyCategory = replyText.toUpperCase().includes('STOP') ? 'Stop' : 'Other';

          messageDataMap.set(leadId, {
            messageText: null,  // Not available from bulk fetch
            replyText: replyText,
            replyCategory: replyCategory,  // ✅ Now categorized!
            repliedAt: new Date(replyData.dateAdded)
          });
        }
        logger.info(`   ✅ Using bulk-fetched replies: ${messageDataMap.size} with reply data (categorized as Stop/Other)`);
      } else {
        logger.warn(`   ⚠️  IMPORTANT: No replies fetched - replies will be null in database!`);
        logger.warn(`   ℹ️  This could happen if:`);
        logger.warn(`       1. Bulk fetch for replies failed (check network errors above)`);
        logger.warn(`       2. Mautic has no SMS replies yet`);
        logger.warn(`       3. Lead event log endpoint is not accessible`);
      }

      for (const stat of stats) {
        try {
          // Handle different field name formats from Mautic API
          // Some APIs use lead_id, others use leadId, etc.
          const leadId = stat.lead_id || stat.leadId || stat.contact_id || stat.contactId;
          const dateSent = stat.date_sent || stat.dateSent || stat.sent_date || stat.sentDate;
          const isFailed = stat.is_failed || stat.isFailed || stat.failed || '0';

          if (!leadId) {
            logger.warn(`   ⚠️  Skipping stat with no lead ID: ${JSON.stringify(stat)}`);
            errors++;
            continue;
          }

          // Get mobile number from map
          const mobile = mobileMap.get(parseInt(leadId)) || null;

          // Get message data from map (if fetched)
          const messageData = messageDataMap.get(parseInt(leadId)) || {};

          // Check if already exists
          const existing = await prisma.mauticSmsStat.findUnique({
            where: {
              mauticSmsId_leadId: {
                mauticSmsId: mauticSmsId,
                leadId: parseInt(leadId)
              }
            }
          });

          if (!existing) {
            await prisma.mauticSmsStat.create({
              data: {
                smsId,
                mauticSmsId,
                leadId: parseInt(leadId),
                dateSent: dateSent ? new Date(dateSent) : null,
                isFailed: String(isFailed),
                mobile: mobile,
                messageText: messageData.messageText || null,
                replyText: messageData.replyText || null,
                replyCategory: messageData.replyCategory || null,
                repliedAt: messageData.repliedAt || null
              }
            });
            created++;

            // Track if created with replies
            if (messageData.replyText) {
              createdWithReplies++;
            } else {
              createdWithoutReplies++;
            }

            // Log first few creates for verification
            if (created <= 3) {
              logger.info(`   ✅ Created stat: leadId=${leadId}, mobile=${mobile || 'N/A'}, reply=${messageData.replyText ? `"${messageData.replyText.substring(0, 30)}..."` : 'N/A'}, category=${messageData.replyCategory || 'N/A'}`);
            }
          } else {
            // Update existing record with new data if available
            const updateData = {};
            if (mobile && !existing.mobile) updateData.mobile = mobile;

            // ✅ Update message/reply data if we fetched it
            // IMPORTANT: Also update records with NULL replies to fill in missing data
            if (messageData.messageText) updateData.messageText = messageData.messageText;

            if (messageData.replyText) {
              // Existing has no reply, but we found one → update it!
              if (!existing.replyText || existing.replyText === null) {
                logger.info(`   🔄 Found reply for record with NULL reply: leadId=${parseInt(leadId)} → "${messageData.replyText.substring(0, 50)}..."`);
              }
              updateData.replyText = messageData.replyText;
              updateData.replyCategory = messageData.replyCategory;
              updateData.repliedAt = messageData.repliedAt;
            } else if (!existing.replyText && messageData.replyText === null) {
              // ✅ NEW: Update NULL fields with explicit NULL values for consistency
              // This ensures that records checked for replies get marked as checked
              if (!existing.lastSyncedAt) {
                updateData.lastSyncedAt = new Date();  // Mark as checked during this sync
              }
            }

            if (Object.keys(updateData).length > 0) {
              await prisma.mauticSmsStat.update({
                where: { id: existing.id },
                data: updateData
              });
              logger.info(`   🔄 Updated stat: leadId=${leadId}, fields=${Object.keys(updateData).join(', ')}`);
            }
            skipped++;
          }
        } catch (statError) {
          logger.error(`   ❌ Error storing individual stat:`, {
            error: statError.message,
            stat: JSON.stringify(stat)
          });
          errors++;
        }
      }

      logger.info(`✅ SMS stats stored: ${created} created, ${skipped} skipped, ${errors} errors`);

      // DEBUG: Show reply breakdown
      if (created > 0) {
        logger.info(`   📊 Created breakdown: ${createdWithReplies} with replies, ${createdWithoutReplies} without replies`);
        if (createdWithoutReplies > 0) {
          logger.warn(`   ⚠️  ${createdWithoutReplies} records have NO replies - check if bulk fetch succeeded`);
        }
      }

      return { created, skipped, errors, total: created + skipped };
    } catch (error) {
      logger.error('❌ Failed to store SMS stats:', { error: error.message, stack: error.stack });
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
        },
        select: { id: true, name: true }
      });

      // Filter matching SMS in memory (faster than individual updates)
      const matchingIds = orphanedSms
        .filter(sms => sms.name.toLowerCase().startsWith(clientNameLower))
        .map(sms => sms.id);

      if (matchingIds.length === 0) {
        return 0;
      }

      // Bulk update all matching SMS at once
      const result = await prisma.mauticSms.updateMany({
        where: { id: { in: matchingIds } },
        data: {
          clientId: mauticClientId,
          smsClientId: null,
          updatedAt: new Date()
        }
      });

      logger.info(`Reassigned ${result.count} SMS campaigns to Mautic client "${mauticClient.name}"`);
      return result.count;
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
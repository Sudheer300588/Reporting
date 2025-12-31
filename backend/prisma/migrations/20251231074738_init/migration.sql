-- CreateTable
CREATE TABLE `Role` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `fullAccess` BOOLEAN NOT NULL DEFAULT false,
    `isTeamManager` BOOLEAN NOT NULL DEFAULT false,
    `permissions` JSON NOT NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Role_name_key`(`name`),
    INDEX `Role_name_idx`(`name`),
    INDEX `Role_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `role` ENUM('superadmin', 'admin', 'manager', 'employee', 'telecaller') NOT NULL DEFAULT 'employee',
    `customRoleId` INTEGER NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `tokenVersion` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` INTEGER NULL,
    `superAdminId` INTEGER NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_email_idx`(`email`),
    INDEX `User_role_idx`(`role`),
    INDEX `User_customRoleId_idx`(`customRoleId`),
    INDEX `User_isActive_idx`(`isActive`),
    INDEX `User_role_isActive_idx`(`role`, `isActive`),
    INDEX `User_createdById_idx`(`createdById`),
    INDEX `User_email_isActive_idx`(`email`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActivityLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `action` ENUM('user_created', 'user_updated', 'user_deleted', 'client_created', 'client_updated', 'client_deleted', 'client_assigned', 'client_unassigned', 'login', 'logout') NOT NULL,
    `description` VARCHAR(191) NULL,
    `entityType` VARCHAR(191) NULL,
    `entityId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ActivityLog_userId_idx`(`userId`),
    INDEX `ActivityLog_action_idx`(`action`),
    INDEX `ActivityLog_userId_createdAt_idx`(`userId`, `createdAt` DESC),
    INDEX `ActivityLog_action_createdAt_idx`(`action`, `createdAt` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Client` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `clientType` ENUM('mautic', 'dropcowboy', 'vicidial', 'general') NOT NULL DEFAULT 'general',
    `email` VARCHAR(255) NULL,
    `phone` VARCHAR(50) NULL,
    `company` VARCHAR(255) NULL,
    `address` TEXT NULL,
    `website` VARCHAR(500) NULL,
    `description` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` INTEGER NOT NULL,

    INDEX `Client_name_idx`(`name`),
    INDEX `Client_clientType_idx`(`clientType`),
    INDEX `Client_createdById_idx`(`createdById`),
    INDEX `Client_isActive_idx`(`isActive`),
    INDEX `Client_clientType_isActive_idx`(`clientType`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientAssignment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `clientId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `assignedById` INTEGER NOT NULL,

    INDEX `ClientAssignment_clientId_idx`(`clientId`),
    INDEX `ClientAssignment_userId_idx`(`userId`),
    INDEX `ClientAssignment_assignedById_idx`(`assignedById`),
    INDEX `ClientAssignment_userId_assignedAt_idx`(`userId`, `assignedAt`),
    UNIQUE INDEX `ClientAssignment_clientId_userId_key`(`clientId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Campaign` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('email', 'voicemail', 'call') NOT NULL,
    `status` ENUM('active', 'paused', 'completed', 'failed') NOT NULL DEFAULT 'active',
    `description` VARCHAR(191) NULL,
    `startDate` DATETIME(3) NULL,
    `endDate` DATETIME(3) NULL,
    `totalSent` INTEGER NOT NULL DEFAULT 0,
    `totalRead` INTEGER NOT NULL DEFAULT 0,
    `totalFailed` INTEGER NOT NULL DEFAULT 0,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `clientId` INTEGER NOT NULL,
    `createdById` INTEGER NOT NULL,

    INDEX `Campaign_clientId_idx`(`clientId`),
    INDEX `Campaign_status_idx`(`status`),
    INDEX `Campaign_createdById_idx`(`createdById`),
    INDEX `Campaign_type_status_idx`(`type`, `status`),
    INDEX `Campaign_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DropCowboyCampaign` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `clientId` INTEGER NULL,
    `campaignName` VARCHAR(255) NOT NULL,
    `campaignId` VARCHAR(100) NOT NULL,
    `isValid` BOOLEAN NOT NULL DEFAULT true,
    `recordCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DropCowboyCampaign_campaignId_key`(`campaignId`),
    INDEX `DropCowboyCampaign_campaignName_idx`(`campaignName`),
    INDEX `DropCowboyCampaign_clientId_idx`(`clientId`),
    INDEX `DropCowboyCampaign_isValid_idx`(`isValid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DropCowboyCampaignRecord` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `campaignId` VARCHAR(100) NOT NULL,
    `campaignName` VARCHAR(255) NOT NULL DEFAULT '',
    `phoneNumber` VARCHAR(20) NOT NULL,
    `carrier` VARCHAR(100) NOT NULL DEFAULT '',
    `lineType` VARCHAR(50) NOT NULL DEFAULT '',
    `status` VARCHAR(50) NOT NULL DEFAULT 'unknown',
    `statusCode` INTEGER NOT NULL DEFAULT 0,
    `statusReason` TEXT NULL,
    `date` DATETIME(3) NULL,
    `callbacks` INTEGER NOT NULL DEFAULT 0,
    `smsCount` INTEGER NOT NULL DEFAULT 0,
    `cost` DECIMAL(14, 6) NOT NULL DEFAULT 0.0,
    `complianceFee` DECIMAL(14, 6) NOT NULL DEFAULT 0.0,
    `ttsFee` DECIMAL(14, 6) NOT NULL DEFAULT 0.0,
    `firstName` VARCHAR(100) NOT NULL DEFAULT '',
    `lastName` VARCHAR(100) NOT NULL DEFAULT '',
    `company` VARCHAR(255) NOT NULL DEFAULT '',
    `email` VARCHAR(255) NOT NULL DEFAULT '',
    `recordId` VARCHAR(100) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `importedFileId` INTEGER NULL,

    INDEX `DropCowboyCampaignRecord_campaignId_idx`(`campaignId`),
    INDEX `DropCowboyCampaignRecord_campaignName_idx`(`campaignName`),
    INDEX `DropCowboyCampaignRecord_status_idx`(`status`),
    INDEX `DropCowboyCampaignRecord_date_idx`(`date`),
    INDEX `DropCowboyCampaignRecord_phoneNumber_idx`(`phoneNumber`),
    INDEX `DropCowboyCampaignRecord_campaignId_date_idx`(`campaignId`, `date`),
    INDEX `DropCowboyCampaignRecord_campaignName_date_idx`(`campaignName`, `date`),
    UNIQUE INDEX `DropCowboyCampaignRecord_campaignId_phoneNumber_date_key`(`campaignId`, `phoneNumber`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ImportedFile` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `filename` VARCHAR(191) NOT NULL,
    `processed` BOOLEAN NOT NULL DEFAULT false,
    `importedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ImportedFile_filename_key`(`filename`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SyncLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `source` VARCHAR(191) NOT NULL DEFAULT 'dropcowboy',
    `syncType` ENUM('manual', 'scheduled') NOT NULL,
    `status` ENUM('success', 'failed', 'partial') NOT NULL,
    `filesDownloaded` INTEGER NOT NULL DEFAULT 0,
    `campaignsProcessed` INTEGER NOT NULL DEFAULT 0,
    `totalRecords` INTEGER NOT NULL DEFAULT 0,
    `errorCount` INTEGER NOT NULL DEFAULT 0,
    `errorMessage` VARCHAR(191) NULL,
    `syncStartedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `syncCompletedAt` DATETIME(3) NULL,
    `durationSeconds` INTEGER NULL,
    `triggeredBy` VARCHAR(191) NULL,

    INDEX `SyncLog_status_idx`(`status`),
    INDEX `SyncLog_syncStartedAt_idx`(`syncStartedAt`),
    INDEX `SyncLog_source_idx`(`source`),
    INDEX `SyncLog_syncType_idx`(`syncType`),
    INDEX `SyncLog_source_status_idx`(`source`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MauticClient` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `mauticUrl` VARCHAR(500) NOT NULL,
    `username` VARCHAR(255) NOT NULL,
    `password` TEXT NOT NULL,
    `reportId` VARCHAR(100) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastSyncAt` DATETIME(3) NULL,
    `syncVersion` INTEGER NOT NULL DEFAULT 1,
    `totalContacts` INTEGER NOT NULL DEFAULT 0,
    `activeContacts30d` INTEGER NOT NULL DEFAULT 0,
    `totalEmails` INTEGER NOT NULL DEFAULT 0,
    `totalCampaigns` INTEGER NOT NULL DEFAULT 0,
    `totalSegments` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `clientId` INTEGER NULL,

    UNIQUE INDEX `MauticClient_clientId_key`(`clientId`),
    INDEX `MauticClient_isActive_idx`(`isActive`),
    INDEX `MauticClient_lastSyncAt_idx`(`lastSyncAt`),
    INDEX `MauticClient_clientId_idx`(`clientId`),
    INDEX `MauticClient_isActive_lastSyncAt_idx`(`isActive`, `lastSyncAt`),
    UNIQUE INDEX `MauticClient_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MauticEmail` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mauticEmailId` VARCHAR(255) NOT NULL,
    `name` VARCHAR(500) NOT NULL,
    `subject` VARCHAR(500) NULL,
    `emailType` VARCHAR(100) NULL,
    `dateAdded` DATETIME(3) NULL,
    `sentCount` INTEGER NOT NULL DEFAULT 0,
    `readCount` INTEGER NOT NULL DEFAULT 0,
    `clickedCount` INTEGER NOT NULL DEFAULT 0,
    `unsubscribed` INTEGER NOT NULL DEFAULT 0,
    `bounced` INTEGER NOT NULL DEFAULT 0,
    `readRate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `clickRate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `unsubscribeRate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `isPublished` BOOLEAN NOT NULL DEFAULT false,
    `publishUp` DATETIME(3) NULL,
    `publishDown` DATETIME(3) NULL,
    `importedAt` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `clientId` INTEGER NOT NULL,

    INDEX `MauticEmail_clientId_idx`(`clientId`),
    INDEX `MauticEmail_isPublished_idx`(`isPublished`),
    INDEX `MauticEmail_sentCount_idx`(`sentCount`),
    UNIQUE INDEX `MauticEmail_clientId_mauticEmailId_key`(`clientId`, `mauticEmailId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MauticEmailReport` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `eId` INTEGER NOT NULL,
    `dateSent` DATETIME(3) NOT NULL,
    `dateRead` DATETIME(3) NULL,
    `subject` VARCHAR(500) NOT NULL,
    `emailAddress` VARCHAR(255) NOT NULL,
    `clientId` INTEGER NOT NULL,
    `importedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MauticEmailReport_eId_idx`(`eId`),
    INDEX `MauticEmailReport_clientId_idx`(`clientId`),
    INDEX `MauticEmailReport_dateSent_idx`(`dateSent`),
    UNIQUE INDEX `MauticEmailReport_clientId_eId_emailAddress_dateSent_key`(`clientId`, `eId`, `emailAddress`, `dateSent`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MauticSegment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mauticSegmentId` VARCHAR(255) NOT NULL,
    `name` VARCHAR(500) NOT NULL,
    `alias` VARCHAR(255) NULL,
    `description` TEXT NULL,
    `dateAdded` DATETIME(3) NULL,
    `isPublished` BOOLEAN NOT NULL DEFAULT false,
    `filters` JSON NULL,
    `contactCount` INTEGER NOT NULL DEFAULT 0,
    `importedAt` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `clientId` INTEGER NOT NULL,

    INDEX `MauticSegment_clientId_idx`(`clientId`),
    INDEX `MauticSegment_isPublished_idx`(`isPublished`),
    UNIQUE INDEX `MauticSegment_clientId_mauticSegmentId_key`(`clientId`, `mauticSegmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MauticCampaign` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mauticCampaignId` VARCHAR(255) NOT NULL,
    `name` VARCHAR(500) NOT NULL,
    `description` TEXT NULL,
    `category` VARCHAR(255) NULL,
    `isPublished` BOOLEAN NOT NULL DEFAULT false,
    `publishUp` DATETIME(3) NULL,
    `publishDown` DATETIME(3) NULL,
    `dateAdded` DATETIME(3) NULL,
    `createdBy` VARCHAR(100) NULL,
    `allowRestart` BOOLEAN NOT NULL DEFAULT false,
    `importedAt` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `clientId` INTEGER NOT NULL,

    INDEX `MauticCampaign_clientId_idx`(`clientId`),
    INDEX `MauticCampaign_isPublished_idx`(`isPublished`),
    UNIQUE INDEX `MauticCampaign_clientId_mauticCampaignId_key`(`clientId`, `mauticCampaignId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MauticSyncLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mauticClientId` INTEGER NOT NULL,
    `status` ENUM('success', 'failed', 'partial') NOT NULL,
    `syncType` VARCHAR(191) NOT NULL DEFAULT 'scheduled',
    `totalFetched` INTEGER NOT NULL DEFAULT 0,
    `totalUpdated` INTEGER NOT NULL DEFAULT 0,
    `totalInserted` INTEGER NOT NULL DEFAULT 0,
    `errorCount` INTEGER NOT NULL DEFAULT 0,
    `errorMessage` VARCHAR(191) NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,
    `durationSeconds` INTEGER NULL,
    `triggeredBy` VARCHAR(191) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MauticSyncLog_status_idx`(`status`),
    INDEX `MauticSyncLog_mauticClientId_idx`(`mauticClientId`),
    INDEX `MauticSyncLog_startedAt_idx`(`startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MauticFetchedMonth` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `clientId` INTEGER NOT NULL,
    `yearMonth` VARCHAR(7) NOT NULL,
    `from` DATETIME(3) NULL,
    `to` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MauticFetchedMonth_clientId_idx`(`clientId`),
    UNIQUE INDEX `client_year_month_unique`(`clientId`, `yearMonth`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SFTPCredential` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `host` VARCHAR(191) NOT NULL,
    `port` INTEGER NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `remotePath` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SMTPCredential` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `host` VARCHAR(191) NOT NULL,
    `port` INTEGER NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `fromAddress` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VicidialCredential` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `url` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NotificationTemplate` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `action` VARCHAR(191) NOT NULL,
    `template` TEXT NOT NULL,
    `subject` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `NotificationTemplate_action_key`(`action`),
    INDEX `NotificationTemplate_action_idx`(`action`),
    INDEX `NotificationTemplate_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmailLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `action` VARCHAR(191) NOT NULL,
    `recipientEmail` VARCHAR(191) NOT NULL,
    `recipientName` VARCHAR(191) NULL,
    `subject` VARCHAR(191) NULL,
    `success` BOOLEAN NOT NULL DEFAULT false,
    `errorMessage` TEXT NULL,
    `messageId` VARCHAR(191) NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EmailLog_action_idx`(`action`),
    INDEX `EmailLog_recipientEmail_idx`(`recipientEmail`),
    INDEX `EmailLog_success_idx`(`success`),
    INDEX `EmailLog_sentAt_idx`(`sentAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `notifEmailNotifications` BOOLEAN NOT NULL DEFAULT true,
    `notifTaskDeadlineReminder` BOOLEAN NOT NULL DEFAULT true,
    `notifOverdueTasks` BOOLEAN NOT NULL DEFAULT true,
    `notifProjectStatusUpdates` BOOLEAN NOT NULL DEFAULT true,
    `notifWeeklyReports` BOOLEAN NOT NULL DEFAULT true,
    `notifWeeklyReportDay` VARCHAR(191) NULL DEFAULT 'friday',
    `notifWeeklyReportTime` VARCHAR(191) NULL DEFAULT '09:00',
    `notifActivityEmails` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SiteSettings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `siteTitle` VARCHAR(191) NULL,
    `faviconPath` VARCHAR(191) NULL,
    `logoPath` VARCHAR(191) NULL,
    `loginBgType` ENUM('image', 'color', 'gradient') NOT NULL DEFAULT 'image',
    `loginBgImagePath` VARCHAR(191) NULL,
    `loginBgColor` VARCHAR(191) NULL,
    `loginBgGradientFrom` VARCHAR(191) NULL,
    `loginBgGradientTo` VARCHAR(191) NULL,
    `createdById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OTP` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `userId` INTEGER NULL,
    `email` VARCHAR(191) NOT NULL,
    `purpose` ENUM('login', 'password_reset', 'account_verification') NOT NULL,
    `status` ENUM('pending', 'verified', 'expired', 'failed') NOT NULL DEFAULT 'pending',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `maxAttempts` INTEGER NOT NULL DEFAULT 3,
    `expiresAt` DATETIME(3) NOT NULL,
    `verifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OTP_email_purpose_status_idx`(`email`, `purpose`, `status`),
    INDEX `OTP_userId_idx`(`userId`),
    INDEX `OTP_expiresAt_idx`(`expiresAt`),
    INDEX `OTP_code_idx`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `agent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user` VARCHAR(50) NOT NULL,
    `fullName` VARCHAR(200) NULL,
    `userGroup` VARCHAR(50) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `agent_user_key`(`user`),
    INDEX `agent_user_idx`(`user`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vicidial_campaign` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `campaignId` VARCHAR(50) NOT NULL,
    `campaignName` VARCHAR(200) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `vicidial_campaign_campaignId_key`(`campaignId`),
    INDEX `vicidial_campaign_campaignId_idx`(`campaignId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `agentcampaign` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `agentId` INTEGER NOT NULL,
    `viciDialCampaignId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `agentcampaign_agentId_idx`(`agentId`),
    INDEX `agentcampaign_viciDialCampaignId_idx`(`viciDialCampaignId`),
    UNIQUE INDEX `agentcampaign_agentId_viciDialCampaignId_key`(`agentId`, `viciDialCampaignId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_settings_permission` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `adminId` INTEGER NOT NULL,
    `setting` VARCHAR(50) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `admin_settings_permission_adminId_idx`(`adminId`),
    UNIQUE INDEX `admin_settings_permission_adminId_setting_key`(`adminId`, `setting`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `llmProvider` VARCHAR(50) NOT NULL DEFAULT 'openai',
    `llmApiKey` TEXT NULL,
    `llmModel` VARCHAR(100) NOT NULL DEFAULT 'gpt-4o-mini',
    `voiceProvider` VARCHAR(50) NULL DEFAULT 'elevenlabs',
    `voiceApiKey` TEXT NULL,
    `voiceId` VARCHAR(100) NULL,
    `assistantName` VARCHAR(50) NOT NULL DEFAULT 'Bevy',
    `isEnabled` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_ManagerEmployee` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_ManagerEmployee_AB_unique`(`A`, `B`),
    INDEX `_ManagerEmployee_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_customRoleId_fkey` FOREIGN KEY (`customRoleId`) REFERENCES `Role`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_superAdminId_fkey` FOREIGN KEY (`superAdminId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityLog` ADD CONSTRAINT `ActivityLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Client` ADD CONSTRAINT `Client_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientAssignment` ADD CONSTRAINT `ClientAssignment_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientAssignment` ADD CONSTRAINT `ClientAssignment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientAssignment` ADD CONSTRAINT `ClientAssignment_assignedById_fkey` FOREIGN KEY (`assignedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Campaign` ADD CONSTRAINT `Campaign_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Campaign` ADD CONSTRAINT `Campaign_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DropCowboyCampaign` ADD CONSTRAINT `DropCowboyCampaign_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DropCowboyCampaignRecord` ADD CONSTRAINT `DropCowboyCampaignRecord_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `DropCowboyCampaign`(`campaignId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DropCowboyCampaignRecord` ADD CONSTRAINT `DropCowboyCampaignRecord_importedFileId_fkey` FOREIGN KEY (`importedFileId`) REFERENCES `ImportedFile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MauticClient` ADD CONSTRAINT `MauticClient_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MauticEmail` ADD CONSTRAINT `MauticEmail_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `MauticClient`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MauticEmailReport` ADD CONSTRAINT `MauticEmailReport_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `MauticClient`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MauticSegment` ADD CONSTRAINT `MauticSegment_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `MauticClient`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MauticCampaign` ADD CONSTRAINT `MauticCampaign_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `MauticClient`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MauticSyncLog` ADD CONSTRAINT `MauticSyncLog_mauticClientId_fkey` FOREIGN KEY (`mauticClientId`) REFERENCES `MauticClient`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MauticFetchedMonth` ADD CONSTRAINT `MauticFetchedMonth_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `MauticClient`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SFTPCredential` ADD CONSTRAINT `SFTPCredential_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SMTPCredential` ADD CONSTRAINT `SMTPCredential_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VicidialCredential` ADD CONSTRAINT `VicidialCredential_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteSettings` ADD CONSTRAINT `SiteSettings_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OTP` ADD CONSTRAINT `OTP_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agentcampaign` ADD CONSTRAINT `agentcampaign_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `agent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agentcampaign` ADD CONSTRAINT `agentcampaign_viciDialCampaignId_fkey` FOREIGN KEY (`viciDialCampaignId`) REFERENCES `vicidial_campaign`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_settings_permission` ADD CONSTRAINT `admin_settings_permission_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_ManagerEmployee` ADD CONSTRAINT `_ManagerEmployee_A_fkey` FOREIGN KEY (`A`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_ManagerEmployee` ADD CONSTRAINT `_ManagerEmployee_B_fkey` FOREIGN KEY (`B`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE `MauticSmsMessage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `contactId` INTEGER NOT NULL,
    `mauticSmsId` INTEGER NULL,
    `type` VARCHAR(50) NOT NULL,
    `message` LONGTEXT NOT NULL,
    `dateSent` DATETIME(3) NOT NULL,
    `isFailed` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MauticSmsMessage_contactId_idx`(`contactId`),
    INDEX `MauticSmsMessage_mauticSmsId_idx`(`mauticSmsId`),
    INDEX `MauticSmsMessage_type_idx`(`type`),
    INDEX `MauticSmsMessage_dateSent_idx`(`dateSent`),
    UNIQUE INDEX `MauticSmsMessage_contactId_mauticSmsId_type_dateSent_key`(`contactId`, `mauticSmsId`, `type`, `dateSent`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MauticSmsMessage` ADD CONSTRAINT `MauticSmsMessage_mauticSmsId_fkey` FOREIGN KEY (`mauticSmsId`) REFERENCES `MauticSms`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

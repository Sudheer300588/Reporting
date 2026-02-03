/*
  Warnings:

  - You are about to drop the column `uniqueClicks` on the `MauticEmail` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `MauticClickTrackable` MODIFY `url` TEXT NULL;

-- AlterTable
ALTER TABLE `MauticEmail` DROP COLUMN `uniqueClicks`;

-- CreateIndex
CREATE INDEX `MauticClickTrackable_redirectId_idx` ON `MauticClickTrackable`(`redirectId`);

-- RenameIndex
ALTER TABLE `MauticClickTrackable` RENAME INDEX `mautic_click_redirect_unique` TO `MauticClickTrackable_clientId_redirectId_key`;

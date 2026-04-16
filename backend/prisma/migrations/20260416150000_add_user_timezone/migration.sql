-- AlterTable: Add timezone field to User
ALTER TABLE `User` ADD COLUMN `timezone` VARCHAR(100) NULL DEFAULT 'America/Los_Angeles';

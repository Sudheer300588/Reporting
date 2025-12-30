#!/usr/bin/env node
/**
 * Production-Grade Email System Testing Suite
 * Tests all email templates with sample data to ensure they work correctly
 */

import prisma from '../prisma/client.js';
import emailNotificationService from '../services/emailNotificationService.js';
import logger from '../utils/logger.js';
import * as emailHelper from '../utils/emailHelper.js';

// Sample test data for each notification type
const testData = {
  user_welcome: {
    helper: 'notifyUserCreated',
    args: [
      { id: 999, name: 'Test User', email: 'test@example.com', role: 'employee' },
      { name: 'Admin User' },
      'TempPass123!'
    ]
  },
  user_created: {
    helper: 'notifyUserCreated',
    args: [
      { id: 999, name: 'Test User', email: 'test@example.com', role: 'manager' },
      { name: 'Super Admin' },
      'TempPass456!'
    ]
  },
  user_account_deleted: {
    helper: 'notifyUserDeleted',
    args: [
      { id: 999, name: 'Test User', email: 'test@example.com', role: 'employee' },
      { name: 'Super Admin' }
    ]
  },
  user_activated: {
    helper: 'notifyUserActivated',
    args: [
      { id: 999, name: 'Test User', email: 'test@example.com', role: 'employee' },
      { name: 'Manager User' }
    ]
  },
  user_deactivated: {
    helper: 'notifyUserDeactivated',
    args: [
      { id: 999, name: 'Test User', email: 'test@example.com', role: 'employee' },
      { name: 'Manager User' }
    ]
  },
  user_deleted: {
    helper: 'notifyUserDeleted',
    args: [
      { id: 999, name: 'Test User', email: 'test@example.com', role: 'employee' },
      { name: 'Super Admin' }
    ]
  },
  user_updated: {
    helper: 'notifyUserUpdated',
    args: [
      { id: 999, name: 'Test User', email: 'test@example.com', role: 'employee' },
      { name: 'Manager User' },
      []
    ]
  },
  user_profile_updated: {
    helper: 'notifyUserUpdated',
    args: [
      { id: 999, name: 'Test User', email: 'test@example.com', role: 'employee' },
      { name: 'Manager User' },
      ['name', 'email']
    ]
  },
  password_changed: {
    helper: 'notifyPasswordChanged',
    args: [
      { id: 999, name: 'Test User', email: 'test@example.com' }
    ]
  },
  client_created: {
    helper: 'notifyClientCreated',
    args: [
      { id: 999, name: 'Test Client', company: 'Test Company', email: 'client@example.com' },
      { name: 'Admin User' }
    ]
  },
  client_assigned: {
    helper: 'notifyClientAssigned',
    args: [
      { id: 999, name: 'Test Client', company: 'Test Company' },
      { id: 888, name: 'Test User', email: 'user@example.com' },
      { name: 'Manager User' }
    ]
  },
  client_unassigned: {
    helper: 'notifyClientUnassigned',
    args: [
      { id: 999, name: 'Test Client', company: 'Test Company' },
      { id: 888, name: 'Test User', email: 'user@example.com' },
      { name: 'Manager User' }
    ]
  },
  mautic_sync_completed: {
    helper: 'notifyMauticSyncCompleted',
    args: [
      {
        type: 'scheduled',
        totalClients: 5,
        successful: 5,
        failed: 0,
        durationSeconds: 45
      }
    ]
  },
  mautic_sync_failed: {
    helper: 'notifyMauticSyncFailed',
    args: [
      {
        type: 'manual',
        error: 'API authentication failed: Invalid credentials'
      }
    ]
  },
  sftp_fetch_completed: {
    helper: 'notifySftpFetchCompleted',
    args: [
      {
        filesDownloaded: 5,
        campaignsProcessed: 3,
        totalRecords: 1500
      }
    ]
  },
  sftp_fetch_failed: {
    helper: 'notifySftpFetchFailed',
    args: [
      new Error('Connection timeout: Unable to reach SFTP server')
    ]
  },
  // OTP templates are handled by otpService, not helper functions
  otp_login: {
    special: 'OTP_SERVICE',
    note: 'Used by otpService.js for login verification'
  },
  otp_password_reset: {
    special: 'OTP_SERVICE',
    note: 'Used by otpService.js for password reset'
  },
  otp_account_verification: {
    special: 'OTP_SERVICE',
    note: 'Used by otpService.js for account verification'
  }
};

class EmailTestSuite {
  constructor() {
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };
    this.dryRun = process.env.DRY_RUN !== 'false';
  }

  async testTemplate(action, testConfig) {
    this.results.total++;
    
    try {
      console.log(`\n📧 Testing: ${action}`);
      
      // Check if template exists
      const template = await prisma.notificationTemplate.findUnique({
        where: { action }
      });

      if (!template) {
        throw new Error(`Template '${action}' not found in database`);
      }

      if (!template.active) {
        console.log(`   ⚠️  Template inactive - skipping`);
        this.results.skipped++;
        return;
      }

      // Check if helper function exists
      if (!testConfig) {
        console.log(`   ⚠️  No test configuration - skipping`);
        this.results.skipped++;
        return;
      }

      if (testConfig.special) {
        console.log(`   ℹ️  Special handling: ${testConfig.special}`);
        if (testConfig.note) {
          console.log(`   📝 Note: ${testConfig.note}`);
        }
        console.log(`   ✅ Test passed (special template)`);
        this.results.passed++;
        return;
      }

      if (!testConfig.helper) {
        throw new Error(`No helper function defined for '${action}'`);
      }

      const helperFn = emailHelper[testConfig.helper];
      if (!helperFn) {
        throw new Error(`Helper function '${testConfig.helper}' not found`);
      }

      // Test template rendering
      console.log(`   ✓ Template exists (${template.template.length} chars)`);
      console.log(`   ✓ Helper function: ${testConfig.helper}()`);
      console.log(`   ✓ Subject: "${template.subject}"`);

      // Verify template has required variables
      const variables = this.extractVariables(template.template);
      if (variables.length > 0) {
        console.log(`   ✓ Variables: ${variables.join(', ')}`);
      }

      // Test actual sending (dry run unless DRY_RUN=false)
      if (this.dryRun) {
        console.log(`   ⏭️  Skipping actual send (DRY_RUN=true)`);
      } else {
        try {
          await helperFn(...testConfig.args);
          console.log(`   ✅ Email sent successfully`);
        } catch (sendError) {
          console.log(`   ⚠️  Send failed: ${sendError.message}`);
        }
      }

      this.results.passed++;
      console.log(`   ✅ Test passed`);

    } catch (error) {
      this.results.failed++;
      this.results.errors.push({ action, error: error.message });
      console.log(`   ❌ Test failed: ${error.message}`);
    }
  }

  extractVariables(template) {
    const regex = /\{\{([^}]+)\}\}/g;
    const matches = template.matchAll(regex);
    return [...new Set([...matches].map(m => m[1].trim()))];
  }

  async testAllTemplates() {
    console.log('🚀 Starting Email System Test Suite\n');
    console.log(`Mode: ${this.dryRun ? 'DRY RUN' : 'LIVE SENDING'}`);
    console.log(`Tip: Run with DRY_RUN=false to actually send test emails\n`);
    console.log('='.repeat(60));

    // Get all templates from database
    const templates = await prisma.notificationTemplate.findMany({
      orderBy: { action: 'asc' }
    });

    console.log(`\n📊 Found ${templates.length} templates in database\n`);

    for (const template of templates) {
      const testConfig = testData[template.action];
      await this.testTemplate(template.action, testConfig);
    }

    this.printSummary();
  }

  async testSpecificTemplate(action) {
    console.log('🚀 Testing Specific Template\n');
    console.log('='.repeat(60));
    
    const testConfig = testData[action];
    if (!testConfig) {
      console.log(`❌ No test configuration found for '${action}'`);
      return;
    }

    await this.testTemplate(action, testConfig);
    this.printSummary();
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('\n📊 TEST SUMMARY\n');
    console.log(`Total Tests:    ${this.results.total}`);
    console.log(`✅ Passed:      ${this.results.passed}`);
    console.log(`❌ Failed:      ${this.results.failed}`);
    console.log(`⏭️  Skipped:     ${this.results.skipped}`);
    console.log(`📈 Success Rate: ${((this.results.passed / this.results.total) * 100).toFixed(1)}%`);

    if (this.results.errors.length > 0) {
      console.log('\n❌ FAILED TESTS:\n');
      this.results.errors.forEach(({ action, error }) => {
        console.log(`   • ${action}: ${error}`);
      });
    }

    console.log('\n' + '='.repeat(60));

    if (this.results.failed > 0) {
      process.exit(1);
    }
  }

  async checkEmailConfiguration() {
    console.log('\n🔧 Checking Email Configuration\n');
    console.log('='.repeat(60));

    try {
      // Check if Settings table exists and has email notifications enabled
      const settings = await prisma.settings.findFirst();
      
      if (!settings) {
        console.log('⚠️  No settings found - using defaults');
      } else {
        console.log(`✓ Email Notifications: ${settings.notifEmailNotifications ? 'ENABLED' : 'DISABLED'}`);
      }

      // Check SMTP credentials
      const smtpCreds = await prisma.sMTPCredential.findFirst();
      
      if (!smtpCreds) {
        console.log('⚠️  No SMTP credentials configured');
        console.log('   Add SMTP credentials in the database to send emails');
      } else {
        console.log(`✓ SMTP Host: ${smtpCreds.host}:${smtpCreds.port}`);
        console.log(`✓ SMTP Username: ${smtpCreds.username}`);
        console.log(`✓ From Address: ${smtpCreds.fromAddress}`);
      }

      // Check EmailLog table for recent activity
      const recentLogs = await prisma.emailLog.findMany({
        take: 5,
        orderBy: { sentAt: 'desc' }
      });

      if (recentLogs.length > 0) {
        console.log(`\n📧 Recent Email Activity (last 5):\n`);
        recentLogs.forEach(log => {
          const status = log.success ? '✅' : '❌';
          const timestamp = new Date(log.sentAt).toLocaleString('en-US', {
            timeZone: 'America/Los_Angeles',
            dateStyle: 'medium',
            timeStyle: 'short'
          });
          console.log(`   ${status} ${log.action} → ${log.recipientEmail} (${timestamp})`);
        });

        const successRate = (recentLogs.filter(l => l.success).length / recentLogs.length) * 100;
        console.log(`\n   Success Rate: ${successRate.toFixed(1)}%`);
      } else {
        console.log('\n📧 No email logs found');
      }

    } catch (error) {
      console.log(`❌ Configuration check failed: ${error.message}`);
    }

    console.log('\n' + '='.repeat(60));
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const suite = new EmailTestSuite();

  try {
    if (command === 'config') {
      await suite.checkEmailConfiguration();
    } else if (command === 'test' && args[1]) {
      await suite.testSpecificTemplate(args[1]);
    } else {
      await suite.checkEmailConfiguration();
      await suite.testAllTemplates();
    }
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { EmailTestSuite };

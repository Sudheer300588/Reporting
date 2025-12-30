import prisma from '../prisma/client.js';

const defaultNotificationTemplates = [
  {
    action: 'user_welcome',
    subject: 'Welcome to DigitalBevy - Your Account Credentials',
    template: `<p>Hello <strong>{{user_name}}</strong>,</p>

<p>Welcome to DigitalBevy! Your account has been created by <strong>{{created_by}}</strong>.</p>

<h3>Your Login Credentials</h3>
<p>
  <strong>Email:</strong> {{user_email}}<br>
  <strong>Temporary Password:</strong> {{temporary_password}}<br>
  <strong>Role:</strong> {{user_role}}
</p>

<h3>Important Security Notice</h3>
<p>For your security, please change this temporary password immediately after your first login. Go to your profile settings to update your password.</p>

<h3>Next Steps</h3>
<ol>
  <li>Log in to your account using the credentials above</li>
  <li>Change your temporary password immediately</li>
  <li>Complete your profile information</li>
  <li>Explore the platform features</li>
</ol>

<p><small>Account Created: {{timestamp}}<br>Created By: {{created_by}}</small></p>

<p>If you have any questions or need assistance, please contact your administrator or support team.</p>`,
    active: true
  },
  {
    action: 'user_created',
    subject: 'New User Account Created',
    template: `<p>Hello <strong>{{recipient_name}}</strong>,</p>

<p>A new user account has been successfully created in the system.</p>

<h3>User Details</h3>
<p>
  <strong>Name:</strong> {{user_name}}<br>
  <strong>Email:</strong> {{user_email}}<br>
  <strong>Role:</strong> {{user_role}}
</p>

<p><small>Created by: {{action_by}}<br>Date & Time: {{timestamp}}</small></p>

<p>If you have any questions, please contact our support team.</p>`,
    active: true
  },
  {
    action: 'user_updated',
    subject: 'User Account Updated',
    template: `<p>Hello <strong>{{recipient_name}}</strong>,</p>

<p>A user account has been updated in the system.</p>

<h3>Updated User Details</h3>
<p>
  <strong>Name:</strong> {{user_name}}<br>
  <strong>Email:</strong> {{user_email}}<br>
  <strong>Role:</strong> {{user_role}}
</p>

<p><small>Updated by: {{action_by}}<br>Date & Time: {{timestamp}}</small></p>`,
    active: true
  },
  {
    action: 'client_created',
    subject: 'New Client Added',
    template: `<p>Hello <strong>{{recipient_name}}</strong>,</p>

<p>A new client has been added to the system.</p>

<h3>Client Details</h3>
<p>
  <strong>Company:</strong> {{client_company}}<br>
  <strong>Contact:</strong> {{client_name}}<br>
  <strong>Email:</strong> {{client_email}}
</p>

<p><small>Created by: {{action_by}}<br>Date & Time: {{timestamp}}</small></p>`,
    active: true
  },
  {
    action: 'client_assigned',
    subject: 'Client Assigned to You',
    template: `<p>Hello <strong>{{recipient_name}}</strong>,</p>

<p>Great news! A client has been assigned to <strong>{{user_name}}</strong>.</p>

<h3>{{client_company}}</h3>

<p>You now have access to this client's data and campaigns in your dashboard.</p>

<p><small>Assigned on: {{timestamp}}</small></p>`,
    active: true
  },
  {
    action: 'client_unassigned',
    subject: 'Client Unassigned from You',
    template: `<p>Hello <strong>{{recipient_name}}</strong>,</p>

<p>A client has been unassigned from <strong>{{user_name}}</strong>.</p>

<h3>{{client_company}}</h3>

<p><strong>Notice:</strong> You will no longer have access to this client's data.</p>

<p><small>Unassigned by: {{action_by}}<br>Date & Time: {{timestamp}}</small></p>`,
    active: true
  },
  {
    action: 'mautic_sync_completed',
    subject: 'Mautic Sync Completed Successfully',
    template: `<p>Hello <strong>{{recipient_name}}</strong>,</p>

<p>The Mautic synchronization has completed successfully.</p>

<p><strong>Sync Summary:</strong><br>
Type: {{sync_type}}<br>
Total Clients: {{total_clients}}<br>
Successful: {{successful_clients}}<br>
Failed: {{failed_clients}}<br>
Duration: {{duration_seconds}} seconds</p>

<p><small>Completed: {{timestamp}}</small></p>`,
    active: true
  },
  {
    action: 'mautic_sync_failed',
    subject: 'Mautic Sync Failed',
    template: `<p>Hello <strong>{{recipient_name}}</strong>,</p>

<p>The Mautic synchronization has failed.</p>

<p><strong>Details:</strong><br>
Type: {{sync_type}}<br>
Error: {{error_message}}</p>

<p>Please check the system logs for more details or contact support.</p>

<p><small>Failed at: {{timestamp}}</small></p>`,
    active: true
  },
  {
    action: 'sftp_fetch_completed',
    subject: 'SFTP Fetch Completed',
    template: `<p>Hello <strong>{{recipient_name}}</strong>,</p>

<p>The SFTP fetch operation completed successfully.</p>

<p><strong>Summary:</strong><br>
Files Downloaded: {{files_count}}<br>
Campaigns Processed: {{campaigns_processed}}<br>
Total Records: {{total_records}}</p>

<p>All voicemail campaign data has been imported successfully.</p>

<p><small>Completed: {{timestamp}}</small></p>`,
    active: true
  },
  {
    action: 'sftp_fetch_failed',
    subject: 'SFTP Fetch Failed',
    template: `<p>Hello <strong>{{recipient_name}}</strong>,</p>

<p>The SFTP fetch operation has failed.</p>

<p><strong>Error Details:</strong><br>
{{error_message}}</p>

<p>Please verify your SFTP credentials and connection settings.</p>

<p><small>Failed at: {{timestamp}}</small></p>`,
    active: true
  },
  {
    action: 'high_bounce_rate',
    subject: 'High Bounce Rate Alert',
    template: `<p>Hello <strong>{{recipient_name}}</strong>,</p>

<p>Campaign "{{campaign_name}}" for client {{client_name}} has exceeded the acceptable bounce rate threshold.</p>

<p><strong>Metrics:</strong><br>
Bounce Rate: {{bounce_rate}}%<br>
Campaign: {{campaign_name}}<br>
Client: {{client_name}}</p>

<p><strong>Action Required:</strong><br>
Please review the email list quality and campaign settings immediately.</p>

<p><small>Alert generated: {{timestamp}}</small></p>`,
    active: true
  },
  {
    action: 'quota_exceeded',
    subject: 'Quota Exceeded Alert',
    template: `<p>Hello <strong>{{recipient_name}}</strong>,</p>

<p>Your account has exceeded its quota limit.</p>

<p><strong>Usage Details:</strong><br>
Quota Limit: {{quota_limit}}<br>
Current Usage: {{quota_used}}</p>

<p>Please upgrade your plan or contact support to increase your quota.</p>

<p><small>Alert generated: {{timestamp}}</small></p>`,
    active: true
  },
  {
    action: 'report_ready',
    subject: 'Report Ready for Download',
    template: `<p>Hello <strong>{{recipient_name}}</strong>,</p>

<p>Your report is ready for download.</p>

<p><strong>Report Details:</strong><br>
Campaign: {{campaign_name}}<br>
Download URL: <a href="{{report_url}}">{{report_url}}</a></p>

<p><small>Generated: {{timestamp}}</small></p>`,
    active: true
  },
  {
    action: 'password_changed',
    subject: 'Password Changed Successfully',
    template: `<p>Hello <strong>{{user_name}}</strong>,</p>

<p>Your password has been successfully changed.</p>

<p><strong>Security Notice:</strong><br>
If you did not make this change, please contact support immediately and reset your password.</p>

<p><small>Changed on: {{timestamp}}</small></p>`,
    active: true
  },
  {
    action: 'campaign_created',
    subject: 'New Campaign Created',
    template: `<p>Hello <strong>{{recipient_name}}</strong>,</p>

<p>A new campaign has been created.</p>

<p><strong>Campaign Details:</strong><br>
Campaign: {{campaign_name}}<br>
Client: {{client_name}}<br>
Created by: {{action_by}}</p>

<p>You can now view and manage this campaign in your dashboard.</p>

<p><small>Created on: {{timestamp}}</small></p>`,
    active: true
  },
  {
    action: 'otp_login',
    subject: 'Your Login OTP Code',
    template: `<p>Hello <strong>{{recipient_name}}</strong>,</p>

<p>You requested a one-time password to log in to your account.</p>

<p><strong>Your OTP Code: {{otp_code}}</strong></p>

<p>Valid for {{validity_minutes}} minutes.</p>

<p><strong>Security Notice:</strong><br>
Never share this code with anyone. If you didn't request this, please ignore this email.</p>`,
    active: true
  },
  {
    action: 'otp_password_reset',
    subject: 'Password Reset OTP',
    template: `<p>Hello <strong>{{recipient_name}}</strong>,</p>

<p>You requested to reset your password.</p>

<p><strong>Your Reset Code: {{otp_code}}</strong></p>

<p>Valid for {{validity_minutes}} minutes.</p>

<p><strong>Security Warning:</strong><br>
Use this code only to reset your password. If you didn't request this, secure your account immediately.</p>`,
    active: true
  },
  {
    action: 'otp_account_verification',
    subject: 'Verify Your Account',
    template: `<p>Welcome, <strong>{{recipient_name}}</strong>!</p>

<p>Please verify your account to get started.</p>

<p><strong>Your Verification Code: {{otp_code}}</strong></p>

<p>Valid for {{validity_minutes}} minutes.</p>

<p>After verification, you'll have full access to your account and all features.</p>`,
    active: true
  },
  {
    action: 'user_activated',
    subject: 'Your Account Has Been Activated',
    template: `<p>Hello <strong>{{user_name}}</strong>,</p>

<p>Great news! Your account has been activated and you now have full access to the platform.</p>

<h3>Account Details</h3>
<p>
  <strong>Email:</strong> {{user_email}}<br>
  <strong>Role:</strong> {{user_role}}<br>
  <strong>Status:</strong> ACTIVE
</p>

<h3>What This Means</h3>
<ul>
  <li>You can now log in to your account</li>
  <li>Access all assigned clients and campaigns</li>
  <li>View reports and analytics</li>
  <li>Collaborate with your team</li>
</ul>

<p><small>Activated on: {{timestamp}}<br>Activated By: {{activated_by}}</small></p>

<p>If you have any questions, please contact your administrator or support team.</p>`,
    active: true
  },
  {
    action: 'user_deactivated',
    subject: 'Your Account Has Been Deactivated',
    template: `<p>Hello <strong>{{user_name}}</strong>,</p>

<p>Your account has been deactivated. This means you no longer have access to the platform.</p>

<h3>Account Details</h3>
<p>
  <strong>Email:</strong> {{user_email}}<br>
  <strong>Role:</strong> {{user_role}}<br>
  <strong>Status:</strong> INACTIVE
</p>

<h3>What This Means</h3>
<ul>
  <li>You cannot log in to your account</li>
  <li>Access to all clients and campaigns is suspended</li>
  <li>You will not receive any notifications</li>
  <li>Your data is preserved but inaccessible</li>
</ul>

<p><small>Deactivated on: {{timestamp}}<br>Deactivated By: {{deactivated_by}}</small></p>

<p>If you believe this is a mistake or have questions, please contact your administrator.</p>`,
    active: true
  },
  {
    action: 'user_deleted',
    subject: 'User Account Deleted',
    template: `<p>Hello Administrator,</p>

<p>A user account has been permanently deleted from the system.</p>

<h3>Deleted User Details</h3>
<p>
  <strong>Name:</strong> {{user_name}}<br>
  <strong>Email:</strong> {{user_email}}<br>
  <strong>Role:</strong> {{user_role}}<br>
  <strong>Status:</strong> DELETED
</p>

<h3>Important Notice</h3>
<ul>
  <li>This action is permanent and cannot be undone</li>
  <li>All user data has been removed from the system</li>
  <li>User will no longer have access to the platform</li>
  <li>Related records may have been affected</li>
</ul>

<p><small>Deleted on: {{timestamp}}<br>Deleted By: {{deleted_by}}</small></p>

<p>This is an automated notification for administrative purposes.</p>`,
    active: true
  },
  {
    action: 'user_profile_updated',
    subject: 'Your Profile Has Been Updated',
    template: `<p>Hello <strong>{{user_name}}</strong>,</p>

<p>Your account profile has been updated by an administrator.</p>

<h3>Account Details</h3>
<p>
  <strong>Email:</strong> {{user_email}}<br>
  <strong>Role:</strong> {{user_role}}<br>
  <strong>Updated Fields:</strong> {{updated_fields}}
</p>

<h3>What Changed</h3>
<p>The following information in your profile was modified: <strong>{{updated_fields}}</strong>. Please review your profile to see the updated information.</p>

<p><strong>Security Notice:</strong> If you did not request these changes or have any concerns, please contact your administrator immediately.</p>

<p><small>Updated on: {{timestamp}}<br>Updated By: {{updated_by}}</small></p>

<p>If you have any questions, please contact your administrator or support team.</p>`,
    active: true
  },
  {
    action: 'activity_logged',
    subject: 'System Activity Alert - {{action_label}}',
    template: `<p>Hello <strong>{{recipient_name}}</strong>,</p>

<p>A new activity has been logged in the system. Here are the details:</p>

<h3>{{action_label}}</h3>
<p>{{description}}</p>

<p>
  <strong>Performed By:</strong> {{actor_name}} ({{actor_role}})<br>
  <strong>Email:</strong> {{actor_email}}<br>
  <strong>Date & Time:</strong> {{timestamp}}
</p>

<p><small>This is an automated activity notification sent to all Super Admins. You can manage notification preferences in your Settings.</small></p>

<p>For more details about this activity, please log in to the platform and check the Activity Log section.</p>`,
    active: true
  }
];

async function seedNotificationTemplates() {
  console.log('Seeding notification templates...');
  
  try {
    // Step 1: Delete all existing templates
    const deleteResult = await prisma.notificationTemplate.deleteMany({});
    console.log(`Cleared ${deleteResult.count} old template(s)`);
    
    // Step 2: Insert new templates
    let created = 0;
    let failed = 0;
    
    for (const template of defaultNotificationTemplates) {
      try {
        await prisma.notificationTemplate.create({
          data: template
        });
        console.log(`Created template for '${template.action}'`);
        created++;
      } catch (error) {
        console.error(`Error creating template for '${template.action}':`, error.message);
        failed++;
      }
    }
    
    console.log(`\nSummary:`);
    console.log(`   Deleted: ${deleteResult.count}`);
    console.log(`   Created: ${created}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Total: ${defaultNotificationTemplates.length}`);
  } catch (error) {
    console.error('Error during seeding process:', error.message);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedNotificationTemplates()
    .then(() => {
      console.log('\nSeeding completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\nSeeding failed:', error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { seedNotificationTemplates };

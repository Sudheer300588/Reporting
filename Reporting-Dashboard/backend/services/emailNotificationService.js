import nodemailer from 'nodemailer';
import prisma from '../prisma/client.js';

/**
 * Enhanced Notification Service with Template Support
 * 
 * Sends emails based on action triggers using stored templates.
 * Supports variable interpolation in templates.
 */
class EmailNotificationService {
  
  /**
   * Send notification email for a specific action
   * 
   * @param {string} action - The action key (e.g., 'client_imported', 'sync_completed')
   * @param {Object} data - Data object containing:
   *   - recipientEmail: string (required)
   *   - recipientName: string (optional)
   *   - variables: object (optional) - Variables to interpolate in template
   * @returns {Promise<Object>} - Result object with success status
   */
  async sendActionEmail(action, data) {
    try {
      const { recipientEmail, recipientName, variables = {} } = data;
      
      console.log(`🔔 sendActionEmail called for action: ${action}, recipient: ${recipientEmail}`);
      
      if (!recipientEmail) {
        throw new Error('Recipient email is required');
      }
      
      // Get the template for this action
      const template = await prisma.notificationTemplate.findUnique({
        where: { action }
      });
      
      if (!template) {
        console.warn(`⚠️ No notification template found for action: ${action}`);
        return { success: false, message: 'Template not found' };
      }
      
      console.log(`✓ Template found for ${action}, active: ${template.active}`);
      
      if (!template.active) {
        console.log(`❌ Notification template for action '${action}' is inactive, skipping email`);
        return { success: false, message: 'Template is inactive' };
      }
      
      // Check if email notifications are globally enabled
      const settings = await prisma.settings.findFirst() || {};
      console.log(`✓ Settings check - notifEmailNotifications: ${settings.notifEmailNotifications}`);
      
      if (!settings.notifEmailNotifications) {
        console.log('❌ Email notifications are globally disabled');
        return { success: false, message: 'Email notifications disabled' };
      }
      
      // Fetch SMTP credentials
      const smtpCred = await prisma.sMTPCredential.findFirst({
        orderBy: { updatedAt: 'desc' }
      });
      
      if (!smtpCred) {
        console.error('❌ No SMTP credentials configured');
        return { success: false, message: 'SMTP not configured' };
      }
      
      console.log(`✓ SMTP configured: ${smtpCred.host}:${smtpCred.port}`);
      
      // Create transporter
      const transporter = nodemailer.createTransport({
        host: smtpCred.host,
        port: smtpCred.port,
        secure: smtpCred.port === 465,
        auth: {
          user: smtpCred.username,
          pass: smtpCred.password
        }
      });
      
      // Prepare variables for interpolation
      const templateVars = {
        recipient_name: recipientName || recipientEmail,
        ...variables
      };
      
      // Render template with variables
      const renderedBody = this.renderTemplate(template.template, templateVars);
      const renderedSubject = template.subject 
        ? this.renderTemplate(template.subject, templateVars)
        : `Notification: ${action.replace(/_/g, ' ')}`;
      
      // Send email
      const mailOptions = {
        from: smtpCred.fromAddress,
        to: recipientEmail,
        subject: renderedSubject,
        html: this.wrapInEmailTemplate(renderedBody, renderedSubject)
      };

      const info = await transporter.sendMail(mailOptions);
      
      // Log successful email
      await prisma.emailLog.create({
        data: {
          action,
          recipientEmail,
          recipientName: recipientName || recipientEmail,
          subject: renderedSubject,
          success: true,
          messageId: info.messageId
        }
      });
      
      console.log(`✅ Email sent successfully to ${recipientEmail} for action: ${action}`);
      console.log(`   Message ID: ${info.messageId}`);
      
      return { success: true, message: 'Email sent successfully', messageId: info.messageId };
      
    } catch (error) {
      console.error(`❌ Error sending email for action '${action}':`, error);
      
      // Log failed email attempt
      try {
        await prisma.emailLog.create({
          data: {
            action,
            recipientEmail: data.recipientEmail || 'unknown',
            recipientName: data.recipientName || null,
            subject: `Failed: ${action}`,
            success: false,
            errorMessage: error.message || 'Unknown error'
          }
        });
      } catch (logError) {
        console.error('Failed to log email error:', logError);
      }
      
      return { success: false, message: error.message };
    }
  }
  
  /**
   * Render template by replacing {{variables}} with actual values
   * 
   * @param {string} template - Template string with {{variable}} placeholders
   * @param {Object} variables - Object with variable values
   * @returns {string} - Rendered template
   */
  renderTemplate(template, variables = {}) {
    if (!template) return '';
    
    return template.replace(/{{\s*([\w\.]+)\s*}}/g, (match, key) => {
      const value = variables[key];
      return value !== undefined ? String(value) : match;
    });
  }
  
  /**
   * Wrap email content in a basic HTML template
   * 
   * @param {string} content - Email content (HTML or plain text)
   * @param {string} subject - Email subject for header
   * @returns {string} - Full HTML email
   */
  wrapInEmailTemplate(content, subject) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${subject}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Arial, sans-serif !important;}
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f5f7fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  
  <!-- Email Container -->
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f7fa;">
    <tr>
      <td style="padding: 40px 20px;">
        
        <!-- Main Card -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0; padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600; letter-spacing: -0.5px;">
                ${subject}
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <div style="color: #374151; font-size: 15px; line-height: 1.7;">
                ${content}
              </div>
            </td>
          </tr>
          
          <!-- Divider -->
          <tr>
            <td style="padding: 0 40px;">
              <div style="height: 1px; background: linear-gradient(to right, transparent, #e5e7eb, transparent);"></div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 32px 40px; text-align: center;">
              <p style="margin: 0 0 12px 0; color: #6b7280; font-size: 13px; line-height: 1.6;">
                This is an automated notification from your Reporting Dashboard
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                &copy; ${new Date().getFullYear()} Digital Bevy. All rights reserved.
              </p>
              <div style="margin-top: 20px;">
                <a href="#" style="color: #667eea; text-decoration: none; font-size: 12px; margin: 0 8px;">Privacy Policy</a>
                <span style="color: #d1d5db;">|</span>
                <a href="#" style="color: #667eea; text-decoration: none; font-size: 12px; margin: 0 8px;">Contact Support</a>
              </div>
            </td>
          </tr>
          
        </table>
        
        <!-- Bottom Spacing -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 20px auto 0;">
          <tr>
            <td style="text-align: center; padding: 0 20px;">
              <p style="margin: 0; color: #9ca3af; font-size: 11px; line-height: 1.5;">
                If you didn't expect this email, you can safely ignore it.
              </p>
            </td>
          </tr>
        </table>
        
      </td>
    </tr>
  </table>
  
</body>
</html>
    `;
  }
  
  /**
   * Send notification to multiple recipients
   * 
   * @param {string} action - Action key
   * @param {Array} recipients - Array of recipient objects
   * @param {Object} sharedVariables - Shared variables for all emails
   * @returns {Promise<Object>} - Summary of sent emails
   */
  async sendBulkActionEmail(action, recipients, sharedVariables = {}) {
    const results = await Promise.allSettled(
      recipients.map(recipient => 
        this.sendActionEmail(action, {
          ...recipient,
          variables: { ...sharedVariables, ...(recipient.variables || {}) }
        })
      )
    );
    
    const summary = {
      total: recipients.length,
      successful: results.filter(r => r.status === 'fulfilled' && r.value.success).length,
      failed: results.filter(r => r.status === 'rejected' || !r.value.success).length
    };
    
    console.log(`📧 Bulk email summary for '${action}':`, summary);
    
    return summary;
  }
}

// Export singleton instance
const emailNotificationService = new EmailNotificationService();
export default emailNotificationService;

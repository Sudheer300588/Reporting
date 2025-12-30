// Predefined notification actions with contextual variable mappings
// Each action includes relevant variables and a default template suggestion
export const ACTIONS = [
    // User Management Actions
    { 
        key: 'user_created', 
        label: 'User Created',
        category: 'User Management',
        variables: ['recipient_name', 'user_name', 'user_email', 'user_role', 'action_by', 'timestamp'],
        defaultTemplate: 'Hello {{recipient_name}},\n\nA new user account has been created:\n\nName: {{user_name}}\nEmail: {{user_email}}\nRole: {{user_role}}\n\nCreated by: {{action_by}}\nTime: {{timestamp}}'
    },
    { 
        key: 'user_updated', 
        label: 'User Updated',
        category: 'User Management',
        variables: ['recipient_name', 'user_name', 'user_email', 'user_role', 'action_by', 'timestamp'],
        defaultTemplate: 'Hello {{recipient_name}},\n\nUser account has been updated:\n\nName: {{user_name}}\nEmail: {{user_email}}\nRole: {{user_role}}\n\nUpdated by: {{action_by}}\nTime: {{timestamp}}'
    },
    { 
        key: 'user_deleted', 
        label: 'User Deleted',
        category: 'User Management',
        variables: ['recipient_name', 'user_name', 'user_email', 'action_by', 'timestamp'],
        defaultTemplate: 'Hello {{recipient_name}},\n\nUser account has been deleted:\n\nName: {{user_name}}\nEmail: {{user_email}}\n\nDeleted by: {{action_by}}\nTime: {{timestamp}}'
    },
    { 
        key: 'user_activated', 
        label: 'User Activated',
        category: 'User Management',
        variables: ['recipient_name', 'user_name', 'user_email', 'action_by', 'timestamp']
    },
    { 
        key: 'user_deactivated', 
        label: 'User Deactivated',
        category: 'User Management',
        variables: ['recipient_name', 'user_name', 'user_email', 'action_by', 'timestamp']
    },
    { 
        key: 'password_reset', 
        label: 'Password Reset',
        category: 'User Management',
        variables: ['recipient_name', 'user_name', 'user_email', 'timestamp'],
        defaultTemplate: 'Hello {{user_name}},\n\nYour password reset request has been received.\n\nIf you did not request this, please contact support immediately.\n\nTime: {{timestamp}}'
    },
    { 
        key: 'password_changed', 
        label: 'Password Changed',
        category: 'User Management',
        variables: ['recipient_name', 'user_name', 'user_email', 'timestamp'],
        defaultTemplate: 'Hello {{user_name}},\n\nYour password has been successfully changed.\n\nIf you did not make this change, please contact support immediately.\n\nTime: {{timestamp}}'
    },
    { 
        key: 'login_failed', 
        label: 'Login Failed',
        category: 'User Management',
        variables: ['recipient_name', 'user_name', 'user_email', 'timestamp']
    },
    { 
        key: 'account_locked', 
        label: 'Account Locked',
        category: 'User Management',
        variables: ['recipient_name', 'user_name', 'user_email', 'timestamp']
    },
    
    // Client Management Actions
    { 
        key: 'client_created', 
        label: 'Client Created',
        category: 'Client Management',
        variables: ['recipient_name', 'client_name', 'client_email', 'client_company', 'action_by', 'timestamp'],
        defaultTemplate: 'Hello {{recipient_name}},\n\nA new client has been created:\n\nCompany: {{client_company}}\nName: {{client_name}}\nEmail: {{client_email}}\n\nCreated by: {{action_by}}\nTime: {{timestamp}}'
    },
    { 
        key: 'client_updated', 
        label: 'Client Updated',
        category: 'Client Management',
        variables: ['recipient_name', 'client_name', 'client_email', 'client_company', 'action_by', 'timestamp']
    },
    { 
        key: 'client_deleted', 
        label: 'Client Deleted',
        category: 'Client Management',
        variables: ['recipient_name', 'client_name', 'client_company', 'action_by', 'timestamp']
    },
    { 
        key: 'client_assigned', 
        label: 'Client Assigned to User',
        category: 'Client Management',
        variables: ['recipient_name', 'client_name', 'client_company', 'user_name', 'action_by', 'timestamp'],
        defaultTemplate: 'Hello {{recipient_name}},\n\nClient "{{client_company}}" has been assigned to {{user_name}}.\n\nTime: {{timestamp}}'
    },
    { 
        key: 'client_unassigned', 
        label: 'Client Unassigned from User',
        category: 'Client Management',
        variables: ['recipient_name', 'client_name', 'client_company', 'user_name', 'action_by', 'timestamp']
    },
    { 
        key: 'mautic_client_imported', 
        label: 'Mautic Client Imported',
        category: 'Client Management',
        variables: ['recipient_name', 'client_name', 'client_url', 'report_id', 'timestamp'],
        defaultTemplate: 'Hello {{recipient_name}},\n\nMautic client has been successfully imported:\n\nClient: {{client_name}}\nURL: {{client_url}}\nReport ID: {{report_id}}\n\nTime: {{timestamp}}'
    },
    
    // Sync & Data Operations
    { 
        key: 'mautic_sync_started', 
        label: 'Mautic Sync Started',
        category: 'Sync Operations',
        variables: ['recipient_name', 'sync_type', 'timestamp']
    },
    { 
        key: 'mautic_sync_completed', 
        label: 'Mautic Sync Completed',
        category: 'Sync Operations',
        variables: ['recipient_name', 'sync_type', 'total_clients', 'successful_clients', 'failed_clients', 'duration_seconds', 'timestamp'],
        defaultTemplate: 'Hello {{recipient_name}},\n\nMautic synchronization completed successfully.\n\nType: {{sync_type}}\nTotal Clients: {{total_clients}}\nSuccessful: {{successful_clients}}\nFailed: {{failed_clients}}\nDuration: {{duration_seconds}} seconds\n\nTime: {{timestamp}}'
    },
    { 
        key: 'mautic_sync_failed', 
        label: 'Mautic Sync Failed',
        category: 'Sync Operations',
        variables: ['recipient_name', 'sync_type', 'error_message', 'timestamp'],
        defaultTemplate: 'Hello {{recipient_name}},\n\n⚠️ Mautic synchronization failed.\n\nType: {{sync_type}}\nError: {{error_message}}\n\nPlease check the system logs.\n\nTime: {{timestamp}}'
    },
    { 
        key: 'dropcowboy_sync_started', 
        label: 'Voicemail Sync Started',
        category: 'Sync Operations',
        variables: ['recipient_name', 'timestamp']
    },
    { 
        key: 'dropcowboy_sync_completed', 
        label: 'Voicemail Sync Completed',
        category: 'Sync Operations',
        variables: ['recipient_name', 'total_records', 'timestamp']
    },
    { 
        key: 'dropcowboy_sync_failed', 
        label: 'Voicemail Sync Failed',
        category: 'Sync Operations',
        variables: ['recipient_name', 'error_message', 'timestamp']
    },
    { 
        key: 'sftp_fetch_started', 
        label: 'SFTP Fetch Started',
        category: 'Sync Operations',
        variables: ['recipient_name', 'timestamp']
    },
    { 
        key: 'sftp_fetch_completed', 
        label: 'SFTP Fetch Completed',
        category: 'Sync Operations',
        variables: ['recipient_name', 'files_count', 'campaigns_processed', 'total_records', 'timestamp'],
        defaultTemplate: 'Hello {{recipient_name}},\n\nSFTP fetch completed successfully.\n\nFiles Downloaded: {{files_count}}\nCampaigns Processed: {{campaigns_processed}}\nTotal Records: {{total_records}}\n\nTime: {{timestamp}}'
    },
    { 
        key: 'sftp_fetch_failed', 
        label: 'SFTP Fetch Failed',
        category: 'Sync Operations',
        variables: ['recipient_name', 'error_message', 'timestamp']
    },
    
    // Campaign & Report Actions
    { 
        key: 'campaign_created', 
        label: 'Campaign Created',
        category: 'Campaigns',
        variables: ['recipient_name', 'campaign_name', 'client_name', 'action_by', 'timestamp'],
        defaultTemplate: 'Hello {{recipient_name}},\n\nA new campaign has been created:\n\nCampaign: {{campaign_name}}\nClient: {{client_name}}\n\nCreated by: {{action_by}}\nTime: {{timestamp}}'
    },
    { 
        key: 'campaign_updated', 
        label: 'Campaign Updated',
        category: 'Campaigns',
        variables: ['recipient_name', 'campaign_name', 'client_name', 'action_by', 'timestamp']
    },
    { 
        key: 'campaign_completed', 
        label: 'Campaign Completed',
        category: 'Campaigns',
        variables: ['recipient_name', 'campaign_name', 'client_name', 'bounce_rate', 'open_rate', 'timestamp']
    },
    { 
        key: 'report_generated', 
        label: 'Report Generated',
        category: 'Reports',
        variables: ['recipient_name', 'campaign_name', 'report_url', 'timestamp']
    },
    { 
        key: 'report_ready', 
        label: 'Report Ready for Download',
        category: 'Reports',
        variables: ['recipient_name', 'campaign_name', 'report_url', 'timestamp'],
        defaultTemplate: 'Hello {{recipient_name}},\n\nYour report is ready for download:\n\nCampaign: {{campaign_name}}\nDownload URL: {{report_url}}\n\nTime: {{timestamp}}'
    },
    { 
        key: 'data_export_ready', 
        label: 'Data Export Ready',
        category: 'Reports',
        variables: ['recipient_name', 'report_url', 'timestamp']
    },
    
    // System & Configuration
    { 
        key: 'smtp_configured', 
        label: 'SMTP Configured',
        category: 'System',
        variables: ['recipient_name', 'action_by', 'timestamp']
    },
    { 
        key: 'sftp_configured', 
        label: 'SFTP Configured',
        category: 'System',
        variables: ['recipient_name', 'action_by', 'timestamp']
    },
    { 
        key: 'system_settings_updated', 
        label: 'System Settings Updated',
        category: 'System',
        variables: ['recipient_name', 'action_by', 'timestamp']
    },
    { 
        key: 'backup_completed', 
        label: 'Backup Completed',
        category: 'System',
        variables: ['recipient_name', 'timestamp']
    },
    { 
        key: 'backup_failed', 
        label: 'Backup Failed',
        category: 'System',
        variables: ['recipient_name', 'error_message', 'timestamp']
    },
    
    // Threshold & Alert Actions
    { 
        key: 'high_bounce_rate', 
        label: 'High Bounce Rate Alert',
        category: 'Alerts',
        variables: ['recipient_name', 'campaign_name', 'bounce_rate', 'client_name', 'timestamp'],
        defaultTemplate: '⚠️ High Bounce Rate Alert\n\nHello {{recipient_name}},\n\nCampaign "{{campaign_name}}" for client {{client_name}} has a high bounce rate.\n\nBounce Rate: {{bounce_rate}}%\n\nPlease review the campaign settings.\n\nTime: {{timestamp}}'
    },
    { 
        key: 'low_open_rate', 
        label: 'Low Open Rate Alert',
        category: 'Alerts',
        variables: ['recipient_name', 'campaign_name', 'open_rate', 'client_name', 'timestamp']
    },
    { 
        key: 'quota_exceeded', 
        label: 'Quota Exceeded',
        category: 'Alerts',
        variables: ['recipient_name', 'quota_limit', 'quota_used', 'timestamp'],
        defaultTemplate: '⚠️ Quota Exceeded Alert\n\nHello {{recipient_name}},\n\nYour quota has been exceeded.\n\nLimit: {{quota_limit}}\nUsed: {{quota_used}}\n\nPlease upgrade your plan or contact support.\n\nTime: {{timestamp}}'
    },
    { 
        key: 'storage_warning', 
        label: 'Storage Warning',
        category: 'Alerts',
        variables: ['recipient_name', 'quota_limit', 'quota_used', 'timestamp']
    },
    { 
        key: 'error_threshold_reached', 
        label: 'Error Threshold Reached',
        category: 'Alerts',
        variables: ['recipient_name', 'error_message', 'timestamp']
    }
];

export const getActionLabel = (key) => {
    const found = ACTIONS.find(a => a.key === key);
    return found ? found.label : key;
};

export const getActionByKey = (key) => {
    return ACTIONS.find(a => a.key === key);
};

export const getVariablesForAction = (actionKey) => {
    const action = ACTIONS.find(a => a.key === actionKey);
    return action?.variables || [];
};

export const getDefaultTemplate = (actionKey) => {
    const action = ACTIONS.find(a => a.key === actionKey);
    return action?.defaultTemplate || '';
};

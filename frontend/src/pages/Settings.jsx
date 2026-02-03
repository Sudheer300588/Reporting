import {
  SettingsLayout,
  SettingsHeader,
  RolesAndPermissions,
  MauticSettings,
  SmsClientsSettings,
  NotificationsSettings,
  MaintenanceEmail,
  SmtpCredentials,
  SftpCredentials,
  VicidialCredentials,
  SiteBranding,
  AISettings
} from '../components/Settings';

const Settings = () => {
  return (
    <SettingsLayout>
      <SettingsHeader />
      <RolesAndPermissions />
      <MauticSettings />
      <SmsClientsSettings />
      <NotificationsSettings />
      <MaintenanceEmail />
      <SmtpCredentials />
      <SftpCredentials />
      <VicidialCredentials />
      <SiteBranding />
      <AISettings />
    </SettingsLayout>
  );
};

export default Settings;

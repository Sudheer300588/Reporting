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
  AISettings,
  TimezoneSettings
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
      <TimezoneSettings />
      <AISettings />
    </SettingsLayout>
  );
};

export default Settings;

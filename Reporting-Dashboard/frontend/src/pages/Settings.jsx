import {
  SettingsLayout,
  SettingsHeader,
  RolesAndPermissions,
  MauticSettings,
  NotificationsSettings,
  MaintenanceEmail,
  SmtpCredentials,
  SftpCredentials,
  VicidialCredentials,
  SiteBranding
} from '../components/Settings';

const Settings = () => {
  return (
    <SettingsLayout>
      <SettingsHeader />
      <RolesAndPermissions />
      <MauticSettings />
      <NotificationsSettings />
      <MaintenanceEmail />
      <SmtpCredentials />
      <SftpCredentials />
      <VicidialCredentials />
      <SiteBranding />
    </SettingsLayout>
  );
};

export default Settings;

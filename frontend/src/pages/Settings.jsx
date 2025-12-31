import { useRef, useEffect } from 'react';
import {
  SettingsLayout,
  SettingsHeader,
  useSettings,
  RolesAndPermissions,
  MauticSettings,
  NotificationsSettings,
  MaintenanceEmail,
  SmtpCredentials,
  SftpCredentials,
  VicidialCredentials,
  SiteBranding,
  AISettings
} from '../components/Settings';

const SettingsSection = ({ id, children }) => {
  const { registerSection } = useSettings();
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) {
      registerSection(id, ref.current);
    }
  }, [id, registerSection]);

  return (
    <div ref={ref} id={`settings-${id}`} className="mb-12 scroll-mt-24">
      {children}
    </div>
  );
};

const Settings = () => {
  return (
    <SettingsLayout>
      <SettingsHeader />

      <SettingsSection id="roles">
        <RolesAndPermissions />
      </SettingsSection>

      <SettingsSection id="mautic">
        <MauticSettings />
      </SettingsSection>

      <SettingsSection id="notifs">
        <NotificationsSettings />
      </SettingsSection>

      <SettingsSection id="maintenance">
        <MaintenanceEmail />
      </SettingsSection>

      <SettingsSection id="smtp">
        <SmtpCredentials />
      </SettingsSection>

      <SettingsSection id="sftp">
        <SftpCredentials />
      </SettingsSection>

      <SettingsSection id="vicidial">
        <VicidialCredentials />
      </SettingsSection>

      <SettingsSection id="sitecustom">
        <SiteBranding />
      </SettingsSection>

      <SettingsSection id="ai">
        <AISettings />
      </SettingsSection>
    </SettingsLayout>
  );
};

export default Settings;

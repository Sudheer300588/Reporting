import { Settings as SettingsIcon, CheckCircle } from 'lucide-react';

const SettingsHeader = () => {
  return (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-md">
          <SettingsIcon className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">System Settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">Configure and manage your system preferences</p>
        </div>
      </div>

      <div className="mt-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl shadow-sm">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-green-100 rounded-lg">
            <CheckCircle className="h-5 w-5 text-green-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-green-900 mb-1">Email Notifications Ready</h3>
            <p className="text-sm text-green-700 mb-2">Your email system is configured and ready to use.</p>
            <ul className="space-y-1.5 text-sm text-green-700">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-600"></span>
                Enable notifications in the <span className="font-medium">Notifications</span> section
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-600"></span>
                Customize reminder times and preferences
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-600"></span>
                Update email in <a href="/profile" className="font-semibold underline hover:text-green-900">Profile</a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsHeader;

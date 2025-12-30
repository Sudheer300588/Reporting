import { useEffect, useState } from "react";

const PERMISSIONS_SCHEMA = {
  Pages: ["Dashboard", "Clients", "Users", "Services", "Activities", "Settings"],
  Settings: [
    "Roles",
    "Autovation Clients",
    "Notifications",
    "System Maintenance Email",
    "SMTP Credentials",
    "Voicemail SFTP Credentials",
    "Vicidial Credentials",
    "Site Customization",
  ],
  Users: ["Create", "Read", "Update", "Delete"],
  Clients: ["Create", "Read", "Update", "Delete"],
};

export default function Permissions({ fullAccess }) {
  const modules = Object.keys(PERMISSIONS_SCHEMA);
  const [activeModule, setActiveModule] = useState(modules[0]);
  const [permissions, setPermissions] = useState({});

  /* ---------- Init ---------- */
  useEffect(() => {
    const initial = {};
    modules.forEach((module) => {
      initial[module] = {};
      PERMISSIONS_SCHEMA[module].forEach((action) => {
        initial[module][action] = false;
      });
    });
    setPermissions(initial);
  }, []);

  /* ---------- Full Access ---------- */
  useEffect(() => {
    if (!Object.keys(permissions).length) return;

    const updated = {};
    modules.forEach((module) => {
      updated[module] = {};
      PERMISSIONS_SCHEMA[module].forEach((action) => {
        updated[module][action] = fullAccess;
      });
    });
    setPermissions(updated);
  }, [fullAccess]);

  /* ---------- Handlers ---------- */
  const togglePermission = (module, action) => {
    setPermissions((prev) => ({
      ...prev,
      [module]: {
        ...prev[module],
        [action]: !prev[module][action],
      },
    }));
  };

  const selectedCount = Object.values(
    permissions[activeModule] || {}
  ).filter(Boolean).length;

  const totalCount = PERMISSIONS_SCHEMA[activeModule].length;

  /* ---------- UI ---------- */
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* LEFT COLUMN – MODULE LIST */}
      <div className="md:col-span-1 border border-gray-200 rounded-lg overflow-hidden">
        {modules.map((module) => {
          const selected = Object.values(permissions[module] || {}).filter(Boolean).length;
          const total = PERMISSIONS_SCHEMA[module].length;

          return (
            <button
              key={module}
              onClick={() => setActiveModule(module)}
              className={`w-full text-left px-4 py-3 text-sm border-b last:border-b-0 transition
                ${
                  activeModule === module
                    ? "bg-black text-white"
                    : "bg-white hover:bg-gray-50 text-gray-700"
                }
              `}
            >
              <div className="flex justify-between items-center">
                <span>{module}</span>
                <span className="text-xs opacity-80">
                  ({selected} / {total})
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* RIGHT COLUMN – PERMISSIONS */}
      <div className="md:col-span-2 border border-gray-200 rounded-lg p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">
          {activeModule} – User has access to
        </h3>

        <div className="space-y-3">
          {PERMISSIONS_SCHEMA[activeModule].map((action) => (
            <label
              key={action}
              className={`flex items-center gap-3 text-sm
                ${fullAccess ? "opacity-60 cursor-not-allowed" : ""}
              `}
            >
              <input
                type="checkbox"
                className="accent-blue-600"
                checked={permissions[activeModule]?.[action] || false}
                onChange={() => togglePermission(activeModule, action)}
                disabled={fullAccess}
              />
              {action}
            </label>
          ))}
        </div>

        <div className="mt-6 text-xs text-gray-500">
          Selected {selectedCount} of {totalCount}
        </div>
      </div>
    </div>
  );
}

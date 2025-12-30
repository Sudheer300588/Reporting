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

export default function Permissions({ fullAccess, permissions: externalPermissions, onPermissionsChange }) {
  const modules = Object.keys(PERMISSIONS_SCHEMA);
  const [activeModule, setActiveModule] = useState(modules[0]);
  const [permissions, setPermissions] = useState({});

  useEffect(() => {
    if (externalPermissions && Object.keys(externalPermissions).length > 0) {
      const merged = {};
      modules.forEach((module) => {
        merged[module] = {};
        PERMISSIONS_SCHEMA[module].forEach((action) => {
          merged[module][action] = externalPermissions[module]?.[action] || false;
        });
      });
      setPermissions(merged);
    } else {
      const initial = {};
      modules.forEach((module) => {
        initial[module] = {};
        PERMISSIONS_SCHEMA[module].forEach((action) => {
          initial[module][action] = false;
        });
      });
      setPermissions(initial);
    }
  }, [externalPermissions]);

  useEffect(() => {
    if (fullAccess) {
      const updated = {};
      modules.forEach((module) => {
        updated[module] = {};
        PERMISSIONS_SCHEMA[module].forEach((action) => {
          updated[module][action] = true;
        });
      });
      setPermissions(updated);
      if (onPermissionsChange) {
        onPermissionsChange(updated);
      }
    }
  }, [fullAccess]);

  const togglePermission = (module, action) => {
    if (fullAccess) return;
    
    const updated = {
      ...permissions,
      [module]: {
        ...permissions[module],
        [action]: !permissions[module]?.[action],
      },
    };
    setPermissions(updated);
    if (onPermissionsChange) {
      onPermissionsChange(updated);
    }
  };

  const toggleModuleAll = (module) => {
    if (fullAccess) return;
    
    const allChecked = PERMISSIONS_SCHEMA[module].every(
      (action) => permissions[module]?.[action]
    );
    
    const updated = {
      ...permissions,
      [module]: {},
    };
    PERMISSIONS_SCHEMA[module].forEach((action) => {
      updated[module][action] = !allChecked;
    });
    setPermissions(updated);
    if (onPermissionsChange) {
      onPermissionsChange(updated);
    }
  };

  const selectedCount = Object.values(permissions[activeModule] || {}).filter(Boolean).length;
  const totalCount = PERMISSIONS_SCHEMA[activeModule]?.length || 0;

  return (
    <div className={`grid grid-cols-1 md:grid-cols-3 gap-6 ${fullAccess ? "opacity-50 pointer-events-none" : ""}`}>
      <div className="md:col-span-1 border border-gray-200 rounded-lg overflow-hidden">
        {modules.map((module) => {
          const selected = Object.values(permissions[module] || {}).filter(Boolean).length;
          const total = PERMISSIONS_SCHEMA[module].length;

          return (
            <button
              key={module}
              onClick={() => setActiveModule(module)}
              disabled={fullAccess}
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

      <div className="md:col-span-2 border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">
            {activeModule} – User has access to
          </h3>
          <button
            onClick={() => toggleModuleAll(activeModule)}
            disabled={fullAccess}
            className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
          >
            {PERMISSIONS_SCHEMA[activeModule]?.every(
              (action) => permissions[activeModule]?.[action]
            )
              ? "Deselect All"
              : "Select All"}
          </button>
        </div>

        <div className="space-y-3">
          {PERMISSIONS_SCHEMA[activeModule]?.map((action) => (
            <label
              key={action}
              className={`flex items-center gap-3 text-sm cursor-pointer
                ${fullAccess ? "opacity-60 cursor-not-allowed" : ""}
              `}
            >
              <input
                type="checkbox"
                className="accent-blue-600 w-4 h-4"
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

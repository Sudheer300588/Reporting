import { useState } from "react";
import Permissions from "./Permissions";
import { Save, X } from "lucide-react";

const RolesAndPermissions = () => {
  const [activeTab, setActiveTab] = useState("details");
  const [form, setForm] = useState({
    name: "",
    description: "",
    fullAccess: false,
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSave = () => {
    console.log("Saved:", form);
  };

  const handleSaveAndClose = () => {
    console.log("Saved & Closed:", form);
  };

  const handleCancel = () => {
    setForm({
      name: "",
      description: "",
      fullAccess: false,
    });
  };

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            Roles – New Role
          </h2>
          <p className="text-sm text-gray-500">
            Define role details and assign permissions
          </p>
        </div>

        <div className="flex gap-2">
          <button onClick={handleSave} className="btn btn-primary flex items-center gap-2">
            <Save size={16} />
            Save
          </button>
          <button onClick={handleSaveAndClose} className="btn btn-secondary">
            Save & Close
          </button>
          <button onClick={handleCancel} className="btn btn-danger flex items-center gap-2">
            <X size={16} />
            Cancel
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6 text-sm font-medium">
          <button
            onClick={() => setActiveTab("details")}
            className={`pb-3 transition-colors ${
              activeTab === "details"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab("permissions")}
            className={`pb-3 transition-colors ${
              activeTab === "permissions"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Permissions
          </button>
        </nav>
      </div>

      {/* Content */}
      {activeTab === "details" && (
        <div className="max-w-2xl space-y-6">
          {/* Role Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              className="form-input w-full"
              placeholder="e.g. Campaign Manager"
            />
          </div>

          {/* Full Access */}
          <div className="flex items-center justify-between p-4 bg-gray-50 border rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-900">
                Full system access
              </p>
              <p className="text-xs text-gray-500">
                Grants access to all modules and actions
              </p>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                name="fullAccess"
                checked={form.fullAccess}
                onChange={handleChange}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              className="form-input w-full h-28"
              placeholder="Optional description for this role"
            />
          </div>
        </div>
      )}

      {activeTab === "permissions" && (
        <Permissions fullAccess={form.fullAccess} />
      )}
    </div>
  );
};

export default RolesAndPermissions;

import { useState, useEffect } from "react";
import Permissions from "./Permissions";
import { Save, X, Plus, Edit, Trash2, Users, Shield, ChevronLeft } from "lucide-react";
import { fetchRoles, createRole, updateRole, deleteRole } from "../../services/roles/api";

const RolesAndPermissions = () => {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState("list");
  const [editingRole, setEditingRole] = useState(null);
  const [activeTab, setActiveTab] = useState("details");
  const [form, setForm] = useState({
    name: "",
    description: "",
    fullAccess: false,
  });
  const [permissions, setPermissions] = useState({});

  useEffect(() => {
    loadRoles();
  }, []);

  const loadRoles = async () => {
    try {
      setLoading(true);
      const response = await fetchRoles();
      setRoles(response.data.data || []);
      setError(null);
    } catch (err) {
      console.error("Error loading roles:", err);
      setError(err.response?.data?.message || "Failed to load roles");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleNewRole = () => {
    setEditingRole(null);
    setForm({ name: "", description: "", fullAccess: false });
    setPermissions({});
    setActiveTab("details");
    setView("form");
  };

  const handleEditRole = (role) => {
    setEditingRole(role);
    setForm({
      name: role.name,
      description: role.description || "",
      fullAccess: role.fullAccess,
    });
    setPermissions(role.permissions || {});
    setActiveTab("details");
    setView("form");
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      alert("Role name is required");
      return;
    }

    try {
      setSaving(true);
      const data = {
        name: form.name.trim(),
        description: form.description,
        fullAccess: form.fullAccess,
        permissions: form.fullAccess ? {} : permissions,
      };

      if (editingRole) {
        await updateRole(editingRole.id, data);
        alert("Role updated successfully!");
      } else {
        await createRole(data);
        alert("Role created successfully!");
      }

      await loadRoles();
      setView("list");
    } catch (err) {
      console.error("Error saving role:", err);
      alert(err.response?.data?.message || "Failed to save role");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (role) => {
    if (role.isSystem) {
      alert("System roles cannot be deleted");
      return;
    }

    if (!window.confirm(`Are you sure you want to delete the role "${role.name}"?`)) {
      return;
    }

    try {
      await deleteRole(role.id);
      alert("Role deleted successfully!");
      await loadRoles();
    } catch (err) {
      console.error("Error deleting role:", err);
      alert(err.response?.data?.message || "Failed to delete role");
    }
  };

  const handleCancel = () => {
    setView("list");
    setEditingRole(null);
    setForm({ name: "", description: "", fullAccess: false });
    setPermissions({});
  };

  if (loading) {
    return (
      <div className="card p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-500">Loading roles...</p>
      </div>
    );
  }

  if (view === "list") {
    return (
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Roles & Permissions</h2>
            <p className="text-sm text-gray-500">Manage user roles and their permissions</p>
          </div>
          <button onClick={handleNewRole} className="btn btn-primary flex items-center gap-2">
            <Plus size={16} />
            New Role
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {roles.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Shield size={48} className="mx-auto mb-4 opacity-50" />
            <p>No roles configured yet.</p>
            <p className="text-sm">Click "New Role" to create your first role.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Access
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Users
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {roles.map((role) => (
                  <tr key={role.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Shield size={16} className={role.fullAccess ? "text-green-600" : "text-gray-400"} />
                        <span className="text-sm font-medium text-gray-900">{role.name}</span>
                        {role.isSystem && (
                          <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">System</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-500">{role.description || "-"}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {role.fullAccess ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Full Access
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Custom
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <Users size={14} />
                        <span>{role._count?.users || 0}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEditRole(role)}
                          disabled={role.isSystem}
                          className="text-blue-600 hover:text-blue-900 p-1.5 hover:bg-blue-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title={role.isSystem ? "System roles cannot be edited" : "Edit role"}
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(role)}
                          disabled={role.isSystem}
                          className="text-red-600 hover:text-red-900 p-1.5 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title={role.isSystem ? "System roles cannot be deleted" : "Delete role"}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={handleCancel}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {editingRole ? `Edit Role: ${editingRole.name}` : "New Role"}
            </h2>
            <p className="text-sm text-gray-500">
              Define role details and assign permissions
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? "Saving..." : "Save"}
          </button>
          <button onClick={handleCancel} className="btn btn-danger flex items-center gap-2">
            <X size={16} />
            Cancel
          </button>
        </div>
      </div>

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
            disabled={form.fullAccess}
            className={`pb-3 transition-colors ${
              activeTab === "permissions"
                ? "border-b-2 border-blue-600 text-blue-600"
                : form.fullAccess
                ? "text-gray-300 cursor-not-allowed"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Permissions {form.fullAccess && "(Full Access Enabled)"}
          </button>
        </nav>
      </div>

      {activeTab === "details" && (
        <div className="max-w-2xl space-y-6">
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

          <div className="flex items-center justify-between p-4 bg-gray-50 border rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-900">Full system access</p>
              <p className="text-xs text-gray-500">
                Grants access to all modules and actions. Permissions tab will be disabled.
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
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

      {activeTab === "permissions" && !form.fullAccess && (
        <Permissions
          fullAccess={form.fullAccess}
          permissions={permissions}
          onPermissionsChange={setPermissions}
        />
      )}
    </div>
  );
};

export default RolesAndPermissions;

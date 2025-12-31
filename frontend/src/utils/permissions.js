export const createPermissionHelpers = (user) => {
  const hasFullAccess = () => {
    if (user?.customRole?.fullAccess === true) return true
    if (!user?.customRoleId && ['superadmin', 'admin'].includes(user?.role)) return true
    return false
  }

  const hasPermission = (module, action) => {
    if (hasFullAccess()) return true
    const modulePerms = user?.customRole?.permissions?.[module]
    if (Array.isArray(modulePerms)) {
      if (modulePerms.includes(action)) return true
    } else if (modulePerms && typeof modulePerms === 'object') {
      if (modulePerms[action] === true) return true
    }
    // Backward compatibility for legacy manager without customRole
    if (!user?.customRoleId && user?.role === 'manager') {
      if (module === 'Users' && ['Create', 'Read', 'Update'].includes(action)) return true
      if (module === 'Clients' && ['Create', 'Read', 'Update', 'Delete'].includes(action)) return true
      if (module === 'Activities' && action === 'Read') return true
    }
    return false
  }

  const isTeamManager = () => {
    if (hasFullAccess()) return true
    if (user?.customRole?.isTeamManager === true) return true
    if (!user?.customRoleId && user?.role === 'manager') return true
    return false
  }

  const canViewClients = () => hasFullAccess() || hasPermission('Clients', 'Read')
  const canViewUsers = () => hasFullAccess() || hasPermission('Users', 'Read')
  const canEditClients = () => hasFullAccess() || hasPermission('Clients', 'Update')
  const canCreateClients = () => hasFullAccess() || hasPermission('Clients', 'Create')
  const canDeleteClients = () => hasFullAccess() || hasPermission('Clients', 'Delete')
  const canEditUsers = () => hasFullAccess() || hasPermission('Users', 'Update')
  const canCreateUsers = () => hasFullAccess() || hasPermission('Users', 'Create')
  const canDeleteUsers = () => hasFullAccess() || hasPermission('Users', 'Delete')
  const canViewActivities = () => hasFullAccess() || hasPermission('Activities', 'Read')
  const canViewSettings = () => hasFullAccess() || hasPermission('Settings', 'Read')
  const canEditSettings = () => hasFullAccess() || hasPermission('Settings', 'Update')

  return {
    hasFullAccess,
    hasPermission,
    isTeamManager,
    canViewClients,
    canViewUsers,
    canEditClients,
    canCreateClients,
    canDeleteClients,
    canEditUsers,
    canCreateUsers,
    canDeleteUsers,
    canViewActivities,
    canViewSettings,
    canEditSettings
  }
}

export const usePermissions = (user) => {
  return createPermissionHelpers(user)
}

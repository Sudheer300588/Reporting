// Standalone hasFullAccess function that accepts a user parameter
export const hasFullAccess = (user) => {
  if (user?.customRole?.fullAccess === true) return true
  if (!user?.customRoleId && ['superadmin', 'admin'].includes(user?.role)) return true
  return false
}

export const createPermissionHelpers = (user) => {
  const hasFullAccessFn = () => hasFullAccess(user)

  const hasPermission = (module, action) => {
    if (hasFullAccessFn()) return true
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
    if (hasFullAccessFn()) return true
    if (user?.customRole?.isTeamManager === true) return true
    if (!user?.customRoleId && user?.role === 'manager') return true
    return false
  }

  const canViewClients = () => hasFullAccessFn() || hasPermission('Clients', 'Read')
  const canViewUsers = () => hasFullAccessFn() || hasPermission('Users', 'Read')
  const canEditClients = () => hasFullAccessFn() || hasPermission('Clients', 'Update')
  const canCreateClients = () => hasFullAccessFn() || hasPermission('Clients', 'Create')
  const canDeleteClients = () => hasFullAccessFn() || hasPermission('Clients', 'Delete')
  const canEditUsers = () => hasFullAccessFn() || hasPermission('Users', 'Update')
  const canCreateUsers = () => hasFullAccessFn() || hasPermission('Users', 'Create')
  const canDeleteUsers = () => hasFullAccessFn() || hasPermission('Users', 'Delete')
  const canViewActivities = () => hasFullAccessFn() || hasPermission('Activities', 'Read')
  const canViewSettings = () => hasFullAccessFn() || hasPermission('Settings', 'Read')
  const canEditSettings = () => hasFullAccessFn() || hasPermission('Settings', 'Update')

  return {
    hasFullAccess: hasFullAccessFn,
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

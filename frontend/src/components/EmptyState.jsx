import { Users, FolderOpen, Inbox, FileQuestion } from 'lucide-react';

/**
 * Empty State Components
 * Shows helpful messages when there's no data to display
 */

const EmptyState = ({ 
  icon: Icon = Inbox, 
  title, 
  description, 
  action,
  className = '' 
}) => (
  <div className={`flex flex-col items-center justify-center py-16 px-4 ${className}`}>
    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
      <Icon className="w-10 h-10 text-gray-400" />
    </div>
    <h3 className="text-xl font-semibold text-gray-900 mb-2 text-center">
      {title}
    </h3>
    <p className="text-gray-500 text-center max-w-md mb-8">
      {description}
    </p>
    {action && (
      <button
        onClick={action.onClick}
        className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors"
      >
        {action.icon && <action.icon className="w-5 h-5" />}
        {action.label}
      </button>
    )}
  </div>
);

// Predefined Empty States for common scenarios
export const EmptyEmployeesState = ({ onAddClick }) => (
  <EmptyState
    icon={Users}
    title="No employees yet"
    description="Get started by adding your first team member to the platform. They'll be able to access assigned clients and manage their work."
    action={onAddClick ? {
      label: 'Add Employee',
      onClick: onAddClick,
      icon: Users
    } : null}
  />
);

export const EmptyClientsState = ({ onAddClick }) => (
  <EmptyState
    icon={FolderOpen}
    title="No clients found"
    description="Start by creating your first client. You'll be able to assign team members and track their activities."
    action={onAddClick ? {
      label: 'Add Client',
      onClick: onAddClick,
      icon: FolderOpen
    } : null}
  />
);

export const EmptyActivitiesState = () => (
  <EmptyState
    icon={Inbox}
    title="No activities yet"
    description="Activity logs will appear here as you and your team interact with the system. This includes user actions, client assignments, and more."
  />
);

export const EmptySearchState = ({ searchTerm }) => (
  <EmptyState
    icon={FileQuestion}
    title="No results found"
    description={`We couldn't find any matches for "${searchTerm}". Try adjusting your search terms or filters.`}
  />
);

export const EmptyNotificationsState = () => (
  <EmptyState
    icon={Inbox}
    title="All caught up!"
    description="You don't have any notifications at the moment. We'll let you know when something important happens."
  />
);

export default EmptyState;

export const WORKSPACE_PAGES = ['overview', 'calendar', 'clients', 'production', 'finance', 'reports', 'equipment', 'team', 'uploads', 'operations', 'settings'] as const;
export type WorkspacePage = typeof WORKSPACE_PAGES[number] | 'settings';

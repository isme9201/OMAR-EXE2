export const WORKSPACE_PAGES = ['overview', 'calendar', 'clients', 'production', 'finance', 'reports', 'equipment', 'team', 'uploads', 'operations'] as const;
export type WorkspacePage = typeof WORKSPACE_PAGES[number] | 'settings';

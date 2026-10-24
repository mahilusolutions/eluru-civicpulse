export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  COORDINATOR: 'coordinator',
  BOOTH_AGENT: 'booth_agent',
  VOLUNTEER: 'volunteer',
  VIEWER: 'viewer',
};

export const ROLE_OPTIONS = [
  { value: ROLES.SUPER_ADMIN, label: 'Super Admin' },
  { value: ROLES.ADMIN, label: 'Admin' },
  { value: ROLES.COORDINATOR, label: 'Coordinator' },
  { value: ROLES.BOOTH_AGENT, label: 'Booth Agent' },
  { value: ROLES.VOLUNTEER, label: 'Volunteer' },
  { value: ROLES.VIEWER, label: 'Viewer' },
];

/** What each role is for, in plain words (shown on the request form and when approving). */
export const ROLE_DESCRIPTIONS = {
  [ROLES.SUPER_ADMIN]: 'Full control, including approving new users.',
  [ROLES.ADMIN]: 'Runs the workspace: uploads voter lists, manages data and the team.',
  [ROLES.COORDINATOR]: 'Leads booths and wards: edits booth details, manages the team and contacts.',
  [ROLES.BOOTH_AGENT]: 'Works the ground at a booth: updates voters, logs contacts, records election-day counts.',
  [ROLES.VOLUNTEER]: 'Logs contacts and issues. Cannot edit voter details.',
  [ROLES.VIEWER]: 'Can look at the data and reports only.',
};

/** Roles a person can ask for (Super Admin is never requestable). */
export const REQUESTABLE_ROLES = [ROLES.ADMIN, ROLES.COORDINATOR, ROLES.BOOTH_AGENT, ROLES.VOLUNTEER, ROLES.VIEWER];

export const ROLE_LABELS = ROLE_OPTIONS.reduce((acc, role) => {
  acc[role.value] = role.label;
  return acc;
}, {});

/** 14 modules — each lists which roles can see it */
export const NAV_ITEMS = [
  {
    path: '/app/dashboard',
    label: 'Dashboard',
    icon: 'LayoutDashboard',
    group: 'Home',
    roles: Object.values(ROLES),
  },
  {
    path: '/app/voters',
    label: 'Voters',
    icon: 'Search',
    group: 'Field',
    roles: Object.values(ROLES),
  },
  {
    path: '/app/booths',
    label: 'Booths',
    icon: 'MapPinned',
    group: 'Field',
    roles: [
      ROLES.SUPER_ADMIN,
      ROLES.ADMIN,
      ROLES.COORDINATOR,
      ROLES.BOOTH_AGENT,
      ROLES.VIEWER,
    ],
  },
  {
    path: '/app/wards',
    label: 'Wards',
    icon: 'Landmark',
    group: 'Field',
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.COORDINATOR, ROLES.VIEWER],
  },
  {
    path: '/app/households',
    label: 'Households',
    icon: 'Home',
    group: 'Field',
    roles: [
      ROLES.SUPER_ADMIN,
      ROLES.ADMIN,
      ROLES.COORDINATOR,
      ROLES.BOOTH_AGENT,
      ROLES.VIEWER,
    ],
  },
  {
    path: '/app/outreach',
    label: 'Outreach',
    icon: 'Handshake',
    group: 'Field',
    roles: Object.values(ROLES),
  },
  {
    path: '/app/issues',
    label: 'Issues',
    icon: 'MessageSquareWarning',
    group: 'Engage',
    roles: Object.values(ROLES),
  },
  {
    path: '/app/survey',
    label: 'Survey',
    icon: 'ClipboardList',
    group: 'Engage',
    roles: Object.values(ROLES),
  },
  {
    path: '/app/election-day',
    label: 'Election Day',
    icon: 'Flag',
    group: 'Engage',
    roles: [
      ROLES.SUPER_ADMIN,
      ROLES.ADMIN,
      ROLES.COORDINATOR,
      ROLES.BOOTH_AGENT,
      ROLES.VIEWER,
    ],
  },
  {
    path: '/app/map',
    label: 'Map',
    icon: 'Map',
    group: 'Insight',
    roles: [
      ROLES.SUPER_ADMIN,
      ROLES.ADMIN,
      ROLES.COORDINATOR,
      ROLES.BOOTH_AGENT,
      ROLES.VIEWER,
    ],
  },
  {
    path: '/app/team',
    label: 'Team',
    icon: 'Users',
    group: 'Insight',
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.COORDINATOR],
  },
  {
    path: '/app/reports',
    label: 'Reports',
    icon: 'FileBarChart',
    group: 'Insight',
    roles: [
      ROLES.SUPER_ADMIN,
      ROLES.ADMIN,
      ROLES.COORDINATOR,
      ROLES.BOOTH_AGENT,
      ROLES.VIEWER,
    ],
  },
  {
    path: '/app/access',
    label: 'New requests',
    icon: 'UserPlus',
    group: 'Admin',
    roles: [ROLES.SUPER_ADMIN],
  },
  {
    path: '/app/data',
    label: 'Data',
    icon: 'Database',
    group: 'Admin',
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN],
  },
  {
    path: '/app/settings',
    label: 'Settings',
    icon: 'Settings',
    group: 'Admin',
    roles: Object.values(ROLES),
  },
];

export function getNavForRole(role) {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

export function getGroupedNavForRole(role) {
  const items = getNavForRole(role);
  const groups = [];
  const seen = new Map();

  items.forEach((item) => {
    if (!seen.has(item.group)) {
      seen.set(item.group, []);
      groups.push({ name: item.group, items: seen.get(item.group) });
    }
    seen.get(item.group).push(item);
  });

  return groups;
}

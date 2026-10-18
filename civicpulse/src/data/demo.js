export const CITY = {
  name: 'Eluru',
  assembly: 'AC S01-65',
  parts: 247,
  rollYear: 2026,
  revision: 'SIR Draft · Revision 1',
};

export const DASHBOARD_STATS = [
  { label: 'Booth parts', value: '247', hint: 'Full Eluru draft roll' },
  { label: 'Voters indexed', value: '1.82L', hint: 'Demo aggregate' },
  { label: 'Coverage', value: '68%', hint: 'Booths with active outreach' },
  { label: 'Open issues', value: '142', hint: 'Civic tickets this week' },
];

export const BOOTH_PROGRESS = [
  { part: 12, area: 'Powerpet', coverage: 92, agent: 'R. Naidu' },
  { part: 41, area: 'Sanivarapupeta', coverage: 78, agent: 'S. Lakshmi' },
  { part: 88, area: 'Vatluru', coverage: 64, agent: 'K. Raju' },
  { part: 156, area: 'Eluru Urban', coverage: 51, agent: 'P. Devi' },
  { part: 203, area: 'Denduluru Road', coverage: 37, agent: 'M. Babu' },
];

export const SAMPLE_VOTERS = [
  {
    epic: 'AP/65/0123456',
    name: 'Venkata Rama Rao',
    age: 54,
    gender: 'M',
    part: 12,
    house: '4-21',
    status: 'Active',
  },
  {
    epic: 'AP/65/0182211',
    name: 'Lakshmi Devi',
    age: 41,
    gender: 'F',
    part: 12,
    house: '4-21',
    status: 'Visited',
  },
  {
    epic: 'AP/65/0339012',
    name: 'Suresh Kumar',
    age: 29,
    gender: 'M',
    part: 41,
    house: '2-8',
    status: 'Active',
  },
  {
    epic: 'AP/65/0441109',
    name: 'Padma Priya',
    age: 36,
    gender: 'F',
    part: 88,
    house: '11-3',
    status: 'Callback',
  },
  {
    epic: 'AP/65/0557780',
    name: 'Anil Reddy',
    age: 47,
    gender: 'M',
    part: 156,
    house: '7-14',
    status: 'Active',
  },
  {
    epic: 'AP/65/0662204',
    name: 'Gayatri',
    age: 62,
    gender: 'F',
    part: 203,
    house: '1-9',
    status: 'Shifted',
  },
];

export const ISSUES = [
  { id: 'ISS-104', ward: 'Ward 8', title: 'Drainage overflow near market', priority: 'High', status: 'Open' },
  { id: 'ISS-118', ward: 'Ward 3', title: 'Streetlight outage — 2nd cross', priority: 'Medium', status: 'In progress' },
  { id: 'ISS-121', ward: 'Ward 14', title: 'Water supply delay (evening)', priority: 'High', status: 'Open' },
  { id: 'ISS-130', ward: 'Ward 6', title: 'Garbage pickup missed 3 days', priority: 'Medium', status: 'Resolved' },
];

export const TEAM = [
  { name: 'Campaign HQ', role: 'Admin', zone: 'City-wide', status: 'Online' },
  { name: 'Zone East Lead', role: 'Coordinator', zone: 'Parts 1–80', status: 'Online' },
  { name: 'R. Naidu', role: 'Booth Agent', zone: 'Part 12', status: 'Field' },
  { name: 'Volunteer Cell A', role: 'Volunteer', zone: 'Powerpet', status: 'Active' },
];

export const LANDING_MODULES = [
  {
    title: 'Booth intelligence',
    text: 'Map all 247 parts, assign agents, and track coverage in real time.',
  },
  {
    title: 'Voter reach',
    text: 'Search the roll, cluster households, and log every visit or call.',
  },
  {
    title: 'Civic issues',
    text: 'Capture local problems that move Mayor-race conversations.',
  },
  {
    title: 'Election day',
    text: 'Slip lists, turnout pulses, and missing-voter recovery.',
  },
];

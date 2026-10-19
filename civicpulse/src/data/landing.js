export const LANDING = {
  city: 'Eluru',
  assembly: 'Eluru Assembly Constituency (S01-65)',
  parts: 247,
  roll: '2026 draft voter list · Revision 1 · English',
  tagline: 'Know every booth in Eluru. Reach every voter.',
  support:
    'CivicPulse helps Eluru Mayor campaigns manage all 247 booth parts — find voters, assign field teams, track visits, and prepare for election day. Built by Mahilu Solutions.',
};

/** Rotating words in the hero headline */
export const HERO_WORDS = ['every booth', 'every household', 'every voter', 'election day'];

export const HERO_STATS = [
  { value: 247, label: 'Booth parts' },
  { value: 14, label: 'Modules' },
  { value: 6, label: 'User roles' },
  { value: 2026, label: 'Draft roll', plain: true },
];

/** Facts that scroll in the ticker strip */
export const TICKER = [
  'Eluru Assembly Constituency · S01-65',
  '2026 draft electoral roll · Revision 1',
  '247 polling-station parts',
  'Search by name, voter ID or house number',
  'Door · Phone · WhatsApp · SMS · Event outreach',
  'Live turnout & missing-voter calls',
  'Role-based menus for HQ to volunteers',
  'Light & dark modes for long field days',
];

export const PROBLEMS = [
  {
    title: 'The roll is locked in PDFs',
    text: 'Eluru’s voter list comes as 247 scanned PDF parts. Nobody can search a name or count a street from a scan.',
    icon: 'FileWarning',
  },
  {
    title: 'Field work lives in notebooks',
    text: 'Door visits, phone calls and local complaints get written down and lost. HQ can’t see which booths are covered.',
    icon: 'NotebookPen',
  },
  {
    title: 'Election day is chaos',
    text: 'Without a booth-wise list of who has voted, teams don’t know which voters still need a call.',
    icon: 'Siren',
  },
];

export const SOLUTION =
  'CivicPulse reads the voter-list files, turns every entry into a searchable voter record, and puts it in front of the right people — from the campaign office to the booth agent on the street.';

/** How a voter-list file becomes voter records */
export const PIPELINE = [
  {
    title: 'Upload the voter list',
    text: 'Admins upload a booth’s voter-list PDF on the Data screen. The booth number is picked up from the file name and the booth is added automatically.',
    meta: 'Waiting',
    icon: 'Upload',
  },
  {
    title: 'Prepare the pages',
    text: 'Each page is made clear and ready to read. Files are handled one at a time, so nothing gets mixed up.',
    meta: 'Preparing',
    icon: 'ScanLine',
  },
  {
    title: 'Read every page',
    text: 'Several pages are read at the same time, and you can watch progress page by page.',
    meta: 'Reading',
    icon: 'Cpu',
  },
  {
    title: 'Pick out each voter',
    text: 'Every entry becomes a voter record: serial number, voter ID, name, relative’s name, house number, age and gender.',
    meta: 'Sorting',
    icon: 'ListChecks',
  },
  {
    title: 'Ready for the field',
    text: 'Voters are saved and the booth is marked ready. If a page is too unclear to read, it is marked “Needs spreadsheet” and the voters can be added from a spreadsheet instead.',
    meta: 'Ready',
    icon: 'DatabaseZap',
  },
];

/** Illustrative sample shown in the reading animation (not a real voter) */
export const SAMPLE_ELECTOR = [
  { label: 'Serial no', value: '142' },
  { label: 'Voter ID', value: 'ABC1234567' },
  { label: 'Name', value: 'Sample Voter' },
  { label: 'Father', value: 'Sample Parent' },
  { label: 'House no', value: '12-4-87' },
  { label: 'Age · Gender', value: '34 · F' },
];

export const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Load Eluru voter lists',
    text: 'Upload the 247 booth voter lists, or add voters from a spreadsheet. See every booth as waiting, being read, ready or failed.',
    icon: 'FileInput',
  },
  {
    step: '02',
    title: 'Assign booths and wards',
    text: 'Group parts into wards. Give each booth a coordinator and a booth agent, and give volunteers their assigned parts.',
    icon: 'MapPinned',
  },
  {
    step: '03',
    title: 'Do field work clearly',
    text: 'Search voters, visit houses, log door/phone/WhatsApp contact, and report local problems such as water or roads.',
    icon: 'Handshake',
  },
  {
    step: '04',
    title: 'Win election day',
    text: 'Track slips printed, votes cast and missing voters booth by booth, with turnout % updating live.',
    icon: 'Flag',
  },
];

/** Descriptions for every module in NAV_ITEMS (keyed by path) */
export const MODULE_INFO = {
  '/app/dashboard': 'City-wide totals: voters, booths, coverage, open issues and recent outreach.',
  '/app/voters': 'Search the voter list by name, voter ID or booth. Update status: visited, callback, shifted, deceased.',
  '/app/booths': 'All 247 parts with polling station, agent, coordinator, voter count and coverage %.',
  '/app/wards': 'Group booth parts into wards so area coordinators can see their whole area.',
  '/app/households': 'Voters grouped by house number in each part — plan one visit per family.',
  '/app/outreach': 'Log every contact by door, phone, WhatsApp, SMS or event, with the outcome.',
  '/app/issues': 'Local problems by ward and booth, with priority from Low to Critical and progress from Open to Closed.',
  '/app/survey': 'Ask short questions in the field and compare answers booth by booth.',
  '/app/election-day': 'Slips printed, voted, missing and turnout % for every booth on polling day.',
  '/app/map': 'Booths on a map with status colours to spot weak areas quickly.',
  '/app/team': 'Coordinators, agents and volunteers with zones, phones and assigned parts.',
  '/app/reports': 'Booth and ward summaries ready to share with the campaign office.',
  '/app/data': 'Upload voter lists, follow reading progress, try again if a file fails, and add voters from a spreadsheet.',
  '/app/settings': 'Workspace details for Eluru (AC S01-65) and app preferences.',
};

export const AUDIENCES = [
  {
    role: 'Campaign office',
    text: 'See Eluru-wide progress, manage users, load roll data and export booth reports.',
    icon: 'Building2',
  },
  {
    role: 'Area coordinators',
    text: 'Own your wards and booths. Check coverage, team and open issues daily.',
    icon: 'Network',
  },
  {
    role: 'Booth agents',
    text: 'Work your assigned parts — voters, households, visits and day-of turnout.',
    icon: 'UserCheck',
  },
  {
    role: 'Volunteers',
    text: 'Clear tasks for doors, calls and surveys, without a cluttered city-wide view.',
    icon: 'HeartHandshake',
  },
];

/** Voter statuses used in the app */
export const VOTER_STATUSES = [
  { label: 'Active', tone: 'brand' },
  { label: 'Visited', tone: 'ok' },
  { label: 'Callback', tone: 'warn' },
  { label: 'Shifted', tone: 'muted' },
  { label: 'Deceased', tone: 'muted' },
  { label: 'Duplicate', tone: 'danger' },
  { label: 'Inactive', tone: 'muted' },
];

export const SUPPORT_SCALE = [
  { label: 'Strong yes', color: '#1f7a5c' },
  { label: 'Lean yes', color: '#3dba8f' },
  { label: 'Undecided', color: '#f0b429' },
  { label: 'Lean no', color: '#e0725f' },
  { label: 'Strong no', color: '#b8432f' },
];

export const OUTREACH_CHANNELS = [
  { label: 'Door', icon: 'DoorOpen' },
  { label: 'Phone', icon: 'Phone' },
  { label: 'WhatsApp', icon: 'MessageCircle' },
  { label: 'SMS', icon: 'MessageSquareText' },
  { label: 'Event', icon: 'Megaphone' },
];

export const HIGHLIGHTS = [
  'Voter search',
  'Door-to-door visits',
  'Phone & WhatsApp calls',
  'Local issues',
  'Field surveys',
  'Election-day turnout',
  'Reports for meetings',
];

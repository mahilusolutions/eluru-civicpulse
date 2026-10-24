/**
 * Who may call what. Evaluated in order, first match wins. Paths are relative to /api.
 * Reads are open to every signed-in user unless a rule below narrows them; every write must match a rule.
 * (The menu in the browser hides things too, but this is the real lock.)
 */
const SA = 'super_admin';
const AD = 'admin';
const CO = 'coordinator';
const BA = 'booth_agent';
const VO = 'volunteer';
const VW = 'viewer';

const ADMINS = [SA, AD];
const LEADS = [SA, AD, CO];
const FIELD = [SA, AD, CO, BA];
const NOT_VIEWER = [SA, AD, CO, BA, VO];

const RULES = [
  // Super Admin only: access requests and user accounts
  ['*', /^\/admin(\/|$)/, [SA]],

  // Reads that are narrower than "any signed-in user"
  ['GET', /^\/data(\/|$)/, ADMINS],
  ['GET', /^\/audit(\/|$)/, ADMINS],
  ['GET', /^\/team(\/|$)/, LEADS],
  ['GET', /^\/booths\/people$/, LEADS],
  ['GET', /^\/reports(\/|$)/, [SA, AD, CO, BA, VW]],
  ['GET', /^\/election-day(\/|$)/, [SA, AD, CO, BA, VW]],
  ['GET', /^\/voters\/export$/, LEADS],

  // Writes
  ['POST', /^\/data\//, ADMINS],
  ['PATCH', /^\/voters\/\d+$/, FIELD],
  ['PATCH', /^\/booths\/\d+$/, LEADS],
  ['PATCH', /^\/settings\//, ADMINS],
  ['PATCH', /^\/election-day\/\d+$/, FIELD],

  ['POST', /^\/issues$/, NOT_VIEWER],
  ['PATCH', /^\/issues\/\d+$/, NOT_VIEWER],
  ['DELETE', /^\/issues\/\d+$/, LEADS],

  ['POST', /^\/outreach$/, NOT_VIEWER],
  ['PUT', /^\/outreach\/\d+$/, NOT_VIEWER],
  ['DELETE', /^\/outreach\/\d+$/, LEADS],

  ['POST', /^\/surveys$/, LEADS],
  ['DELETE', /^\/surveys\/\d+$/, ADMINS],
  ['POST', /^\/surveys\/\d+\/responses$/, NOT_VIEWER],


  ['POST', /^\/wards$/, LEADS],
  ['PATCH', /^\/wards\/\d+$/, LEADS],
  ['DELETE', /^\/wards\/\d+$/, LEADS],
];

/** @returns {{allowed: boolean, known: boolean}} known=false means no rule covers this call. */
function check(method, path, role) {
  const m = String(method || '').toUpperCase();
  for (const [rm, re, roles] of RULES) {
    if ((rm === '*' || rm === m) && re.test(path)) return { allowed: roles.includes(role), known: true };
  }
  return { allowed: m === 'GET' || m === 'HEAD', known: false };
}

module.exports = { check, RULES };

/**
 * Creates the first Super Admin, or resets a Super Admin's password if you are locked out.
 *
 *   node scripts/createSuperAdmin.js superadmin "Full Name" 9848012345      # create
 *   node scripts/createSuperAdmin.js --reset superadmin                      # new temporary password for an existing Super Admin
 *
 * The temporary password is printed once. The account must choose its own password at first sign-in.
 * To use a password you choose instead of a random one, set TEMP_PASSWORD (it is still only temporary):
 *   TEMP_PASSWORD='something-to-hand-over' node scripts/createSuperAdmin.js adminname "Full Name"
 * Run it on the server (it talks to the same database as the app).
 */
const { prisma } = require('../db');
const { ensureAuthTables, normalizeMobile } = require('../lib/authStore');
const { hashPassword, generatePassword } = require('../lib/security');
const { logAudit } = require('../lib/audit');

const args = process.argv.slice(2);
const reset = args[0] === '--reset';

(async () => {
  await ensureAuthTables(prisma);
  const chosen = process.env.TEMP_PASSWORD || '';
  if (chosen && chosen.length < 8) throw new Error('TEMP_PASSWORD must be at least 8 characters.');
  const password = chosen || generatePassword();
  const hash = await hashPassword(password);

  if (reset) {
    const username = String(args[1] || '').trim().toLowerCase();
    if (!username) throw new Error('Usage: node scripts/createSuperAdmin.js --reset <username>');
    const n = await prisma.$executeRaw`
      UPDATE public.app_users SET password_hash = ${hash}, must_change_password = true, failed_attempts = 0, locked_until = NULL, status = 'active'
      WHERE lower(username) = ${username} AND role = 'super_admin'`;
    if (!n) throw new Error(`No Super Admin named "${username}".`);
    await prisma.$executeRaw`UPDATE public.auth_sessions SET revoked_at = now() WHERE user_id = (SELECT id FROM public.app_users WHERE lower(username) = ${username}) AND revoked_at IS NULL`;
    await logAudit(prisma, { entity: 'user', action: 'password_reset', actorRole: 'system', actorUser: 'cli', summary: `Super Admin ${username} password reset from the command line` });
    console.log(`\nPassword reset for ${username}\nTemporary password: ${password}\n(shown once - you must choose a new one when you sign in)\n`);
    return;
  }

  const username = String(args[0] || 'superadmin').trim().toLowerCase();
  const fullName = String(args[1] || 'Super Admin').trim();
  const mobile = args[2] ? normalizeMobile(args[2]) : null;
  if (!/^[a-z][a-z0-9._-]{2,29}$/.test(username)) throw new Error('Username: 3-30 characters, letters/numbers/dot/dash, starting with a letter.');
  if (args[2] && !mobile) throw new Error('That mobile number is not valid (10 digits).');
  const [exists] = await prisma.$queryRaw`SELECT 1 AS x FROM public.app_users WHERE lower(username) = ${username}`;
  if (exists) throw new Error(`The username "${username}" already exists. To reset its password: node scripts/createSuperAdmin.js --reset ${username}`);

  await prisma.$executeRaw`
    INSERT INTO public.app_users (username, full_name, mobile, role, password_hash, must_change_password)
    VALUES (${username}, ${fullName}, ${mobile}, 'super_admin', ${hash}, true)`;
  await logAudit(prisma, { entity: 'user', action: 'create', actorRole: 'system', actorUser: 'cli', summary: `Super Admin ${username} created from the command line` });
  console.log(`\nSuper Admin created\nUsername:           ${username}\nTemporary password: ${chosen ? '(the one you chose)' : password}\n(you must choose a new password when you first sign in)\n`);
})()
  .catch((e) => {
    console.error('Error:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

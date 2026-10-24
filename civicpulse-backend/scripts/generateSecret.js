/** Prints a new random AUTH_SECRET (64 hex characters). Put it in the server's .env file as AUTH_SECRET=... and keep it private. */
console.log(require('crypto').randomBytes(32).toString('hex'));

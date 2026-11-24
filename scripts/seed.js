import 'dotenv/config';
import { closeDatabase, syncDatabase, User } from '../src/db/index.js';
import { hashPassword } from '../src/lib/passwords.js';

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.error('ADMIN_EMAIL and ADMIN_PASSWORD must be set');
  process.exit(1);
}

await syncDatabase();

try {
  const existing = await User.findOne({ where: { email } });
  if (existing) {
    console.log(`User already exists: ${email}`);
  } else {
    const passwordHash = await hashPassword(password);
    await User.create({
      email,
      passwordHash,
      role: 'admin',
    });
    console.log(`Created admin user: ${email}`);
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}

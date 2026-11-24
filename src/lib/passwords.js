import bcrypt from 'bcrypt';

function bcryptCost() {
  const value = Number(process.env.BCRYPT_COST || 12);
  if (!Number.isInteger(value) || value < 4) {
    throw new Error('BCRYPT_COST must be an integer greater than or equal to 4');
  }
  return value;
}

export function hashPassword(password) {
  return bcrypt.hash(password, bcryptCost());
}

export function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

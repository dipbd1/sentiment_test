const REQUIRED_BOOT_KEYS = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];

export function assertBootConfig() {
  const missing = REQUIRED_BOOT_KEYS.filter((key) => {
    const value = process.env[key];
    return typeof value !== 'string' || value.length === 0;
  });

  if (missing.length > 0) {
    console.error(`Refusing to boot. Missing environment: ${missing.join(', ')}`);
    process.exit(1);
  }
}

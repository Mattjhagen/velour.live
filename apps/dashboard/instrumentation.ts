export async function register() {
  const required = [
    "NEXTAUTH_SECRET",
    "NEXTAUTH_URL",
    "VELOUR_ENCRYPTION_KEY",
    "DATABASE_URL",
    "REDIS_URL",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "VELOUR_ADMIN_EMAIL",
  ];

  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        "Copy .env.example to .env and fill in every placeholder.",
    );
  }
}

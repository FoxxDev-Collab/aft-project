// Seeder script to create one user per role with default credentials
// Run with: bun scripts/seed-users.ts (or via package.json script)

import { getDb, UserRole } from "../lib/database-bun";

async function main() {
  const db = getDb();

  const defaultPassword = "password123"; // as requested
  const hashedPassword = await Bun.password.hash(defaultPassword, {
    algorithm: "bcrypt",
    cost: 12,
  });

  type SeedUser = {
    role: (typeof UserRole)[keyof typeof UserRole];
    email: string;
    firstName: string;
    lastName: string;
    organization: string;
    phone: string;
  };

  const users: SeedUser[] = [
    {
      role: UserRole.ADMIN,
      email: "admin@aft.gov",
      firstName: "System",
      lastName: "Administrator",
      organization: "AFT HQ",
      phone: "555-0100",
    },
    {
      role: UserRole.REQUESTOR,
      email: "requestor@aft.gov",
      firstName: "Renee",
      lastName: "Requestor",
      organization: "AFT Org",
      phone: "555-0101",
    },
    {
      role: UserRole.DAO,
      email: "dao@aft.gov",
      firstName: "Derek",
      lastName: "DAO",
      organization: "AFT Org",
      phone: "555-0102",
    },
    {
      role: UserRole.APPROVER,
      email: "approver@aft.gov",
      firstName: "Iris",
      lastName: "ISSM",
      organization: "AFT Security",
      phone: "555-0103",
    },
    {
      role: UserRole.CPSO,
      email: "cpso@aft.gov",
      firstName: "Casey",
      lastName: "CPSO",
      organization: "AFT Contractor",
      phone: "555-0104",
    },
    {
      role: UserRole.DTA,
      email: "dta@aft.gov",
      firstName: "Dana",
      lastName: "DTA",
      organization: "AFT Transfer",
      phone: "555-0105",
    },
    {
      role: UserRole.SME,
      email: "sme@aft.gov",
      firstName: "Sam",
      lastName: "SME",
      organization: "AFT Engineering",
      phone: "555-0106",
    },
    {
      role: UserRole.MEDIA_CUSTODIAN,
      email: "custodian@aft.gov",
      firstName: "Mia",
      lastName: "Custodian",
      organization: "AFT Media",
      phone: "555-0107",
    },
  ];

  const selectUserByEmail = db.prepare(
    "SELECT id, primary_role FROM users WHERE email = ?"
  );
  const insertUser = db.prepare(
    `INSERT INTO users (email, password, first_name, last_name, primary_role, organization, phone, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
  );
  const updateUser = db.prepare(
    `UPDATE users
     SET password = ?, first_name = ?, last_name = ?, primary_role = ?, organization = ?, phone = ?, updated_at = unixepoch()
     WHERE email = ?`
  );
  const selectUserRole = db.prepare(
    "SELECT id FROM user_roles WHERE user_id = ? AND role = ? AND is_active = 1"
  );
  const insertUserRole = db.prepare(
    `INSERT INTO user_roles (user_id, role, is_active, assigned_by) VALUES (?, ?, 1, ?)`
  );

  let created = 0;
  let updated = 0;
  let rolesAttached = 0;

  db.transaction(() => {
    for (const u of users) {
      const existing = selectUserByEmail.get(u.email) as
        | { id: number; primary_role: string }
        | undefined;

      if (!existing) {
        const res = insertUser.run(
          u.email,
          hashedPassword,
          u.firstName,
          u.lastName,
          u.role,
          u.organization,
          u.phone
        ) as any;
        const userId = res.lastInsertRowid as number;
        created++;

        const hasRole = selectUserRole.get(userId, u.role) as
          | { id: number }
          | undefined;
        if (!hasRole) {
          insertUserRole.run(userId, u.role, userId);
          rolesAttached++;
        }
      } else {
        // Update profile and password to requested default
        updateUser.run(
          hashedPassword,
          u.firstName,
          u.lastName,
          u.role,
          u.organization,
          u.phone,
          u.email
        );
        updated++;

        const hasRole = selectUserRole.get(existing.id, u.role) as
          | { id: number }
          | undefined;
        if (!hasRole) {
          insertUserRole.run(existing.id, u.role, existing.id);
          rolesAttached++;
        }
      }
    }
  })();

  console.log("✓ User seeding complete");
  console.log(`  Created: ${created}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Roles attached: ${rolesAttached}`);
  console.log("\nDefault credentials for all users:");
  console.log("  Email: <role>@aft.gov (e.g., requestor@aft.gov)");
  console.log("  Password: password123");
}

main().catch((err) => {
  console.error("Seeder failed:", err);
  process.exit(1);
});

import bcrypt from "bcrypt";
import postgres from "postgres";
import { invoices, customers, revenue, users } from "../lib/placeholder-data";

// Initialize the client
const sql = postgres(process.env.POSTGRES_URL!, { ssl: "require" });
console.log(process.env.POSTGRES_URL_NON_POOLING);
console.log(process.env.POSTGRES_URL);
async function seedUsers() {
  await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL
    );
  `;

  // 1. Pre-hash passwords in-memory BEFORE talking to the database.
  // This keeps the Event Loop open so Neon doesn't timeout.
  const usersWithHashedPasswords = await Promise.all(
    users.map(async (user) => {
      const hashedPassword = await bcrypt.hash(user.password, 10);
      return { ...user, password: hashedPassword };
    }),
  );

  // 2. Perform sequential database inserts cleanly without heavy CPU blocking
  const insertedUsers = [];
  for (const user of usersWithHashedPasswords) {
    const result = await sql`
      INSERT INTO users (id, name, email, password)
      VALUES (${user.id}, ${user.name}, ${user.email}, ${user.password})
      ON CONFLICT (id) DO NOTHING;
    `;
    insertedUsers.push(result);
  }

  return insertedUsers;
}

async function seedInvoices() {
  await sql`
    CREATE TABLE IF NOT EXISTS invoices (
      id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
      customer_id UUID NOT NULL,
      amount INT NOT NULL,
      status VARCHAR(255) NOT NULL,
      date DATE NOT NULL
    );
  `;

  const insertedInvoices = [];
  for (const invoice of invoices) {
    const result = await sql`
      INSERT INTO invoices (customer_id, amount, status, date)
      VALUES (${invoice.customer_id}, ${invoice.amount}, ${invoice.status}, ${invoice.date})
      ON CONFLICT (id) DO NOTHING;
    `;
    insertedInvoices.push(result);
  }
  return insertedInvoices;
}

async function seedCustomers() {
  await sql`
    CREATE TABLE IF NOT EXISTS customers (
      id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      image_url VARCHAR(255) NOT NULL
    );
  `;

  const insertedCustomers = [];
  for (const customer of customers) {
    const result = await sql`
      INSERT INTO customers (id, name, email, image_url)
      VALUES (${customer.id}, ${customer.name}, ${customer.email}, ${customer.image_url})
      ON CONFLICT (id) DO NOTHING;
    `;
    insertedCustomers.push(result);
  }
  return insertedCustomers;
}

async function seedRevenue() {
  await sql`
    CREATE TABLE IF NOT EXISTS revenue (
      month VARCHAR(4) NOT NULL UNIQUE,
      revenue INT NOT NULL
    );
  `;

  const insertedRevenue = [];
  for (const rev of revenue) {
    const result = await sql`
      INSERT INTO revenue (month, revenue)
      VALUES (${rev.month}, ${rev.revenue})
      ON CONFLICT (month) DO NOTHING;
    `;
    insertedRevenue.push(result);
  }
  return insertedRevenue;
}

export async function GET() {
  try {
    // Run the isolated seeding scripts sequentially
    await seedUsers();
    await seedCustomers();
    await seedInvoices();
    await seedRevenue();

    return Response.json({ message: "Database seeded successfully" });
  } catch (error: any) {
    console.error("Seeding error:", error);
    return Response.json({ error: error?.message || error }, { status: 500 });
  }
}

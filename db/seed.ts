import { ensureSeed } from "../api/queries/wash";

async function seed() {
  console.log("Seeding demonstration history when the database is empty...");
  await ensureSeed();
  console.log("Done.");
  process.exit(0);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});

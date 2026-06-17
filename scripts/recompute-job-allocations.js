import mongoose from 'mongoose';
import Job from '../src/models/Job.js';
import Allocation from '../src/models/Allocation.js';
import dotenv from 'dotenv'
dotenv.config()

const MONGODB_URI = process.env.MONGO_URL;

async function migrate() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI or DATABASE_URL must be set');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);

  const jobs = await Job.find({}).lean();
  console.log(`[migration] Found ${jobs.length} jobs to process`);

  let updated = 0;
  for (const job of jobs) {
    const activeAllocations = await Allocation.aggregate([
      { $match: { job_id: job._id, status: 'active' } },
      {
        $group: {
          _id: '$month',
          allocated_percentage: { $sum: '$percentage' },
        },
      },
    ]);

    if (activeAllocations.length === 0) continue;

    const monthlyAllocations = {};
    let maxPct = 0;
    for (const row of activeAllocations) {
      const pct = row.allocated_percentage || 0;
      const status = pct >= 100 ? 'Fully Allocated' : pct > 0 ? 'Partially Allocated' : 'Pending';
      monthlyAllocations[row._id] = { allocated_percentage: pct, status };
      if (pct > maxPct) maxPct = pct;
    }

    await Job.updateOne(
      { _id: job._id },
      {
        $set: {
          monthly_allocations: monthlyAllocations,
          total_allocated_percentage: maxPct,
        },
      },
    );
    updated++;
  }

  console.log(`[migration] Updated ${updated} jobs with recomputed monthly allocations`);
  console.log('[migration] Job allocation recomputation complete.');
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error('[migration] Fatal error:', err);
  process.exit(1);
});

import 'dotenv/config';
import mongoose from 'mongoose';

import Allocation from '../src/models/Allocation.js';
import { getStaffCapacity } from '../src/services/capacityService.js';

const OVER_CAPACITY_THRESHOLD = 90;

const roundNumber = (value, digits = 2) => {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return 0;
  return Number(numeric.toFixed(digits));
};

const getCapacitySnapshot = async (cache, staffId, month) => {
  const key = `${String(staffId)}:${String(month)}`;
  if (!cache.has(key)) {
    const snapshot = await getStaffCapacity(staffId, month);
    cache.set(key, snapshot || null);
  }
  return cache.get(key);
};

const resolveMongoUrl = () => process.env.MONGO_URL || process.env.MONGODB_URI || null;

const flushBulk = async (ops) => {
  if (ops.length === 0) return;
  await Allocation.bulkWrite(ops, { ordered: false });
  ops.length = 0;
};

const main = async () => {
  const mongoUrl = resolveMongoUrl();
  if (!mongoUrl) {
    throw new Error('MONGO_URL (or MONGODB_URI) is required');
  }

  await mongoose.connect(mongoUrl, { dbName: process.env.MONGO_DB_NAME || undefined });
  console.log('Connected to MongoDB');

  const query = {
    month: { $regex: /^\d{4}-\d{2}$/ },
    staff_id: { $exists: true, $ne: null },
  };

  const total = await Allocation.countDocuments(query);
  console.log(`Found ${total} allocation rows to evaluate`);

  const cursor = Allocation.find(query)
    .select('_id staff_id month adjusted_hours created_at')
    .sort({ staff_id: 1, month: 1, created_at: 1, _id: 1 })
    .cursor();

  const capacityCache = new Map();
  const runningHoursByStaffMonth = new Map();
  const bulkOps = [];

  let processed = 0;
  let flagged = 0;

  for await (const allocation of cursor) {
    const staffId = String(allocation.staff_id);
    const month = String(allocation.month || '');
    const mapKey = `${staffId}:${month}`;

    const capacity = await getCapacitySnapshot(capacityCache, staffId, month);
    const effectiveCapacity = Number(capacity?.effective_capacity_hours || 0);

    const previousHours = Number(runningHoursByStaffMonth.get(mapKey) || 0);
    const additionalHours = Number(allocation.adjusted_hours || 0);
    const projectedHours = previousHours + additionalHours;

    const projectedUtilization = effectiveCapacity > 0 ? (projectedHours / effectiveCapacity) * 100 : 0;
    const isOverCapacity = projectedUtilization >= OVER_CAPACITY_THRESHOLD;

    if (isOverCapacity) {
      flagged += 1;
    }

    bulkOps.push({
      updateOne: {
        filter: { _id: allocation._id },
        update: {
          $set: {
            is_over_capacity: isOverCapacity,
            over_capacity_utilization_percentage: roundNumber(projectedUtilization, 1),
            over_capacity_projected_hours: roundNumber(projectedHours, 2),
            over_capacity_effective_capacity_hours: roundNumber(effectiveCapacity, 2),
            over_capacity_threshold: OVER_CAPACITY_THRESHOLD,
          },
        },
      },
    });

    runningHoursByStaffMonth.set(mapKey, projectedHours);
    processed += 1;

    if (bulkOps.length >= 500) {
      await flushBulk(bulkOps);
      console.log(`Processed ${processed}/${total}`);
    }
  }

  await flushBulk(bulkOps);

  console.log(`Backfill complete. Processed: ${processed}, over-capacity flagged: ${flagged}`);
  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error('Backfill failed:', error.message);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  process.exit(1);
});

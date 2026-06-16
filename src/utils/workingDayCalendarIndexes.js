import mongoose from 'mongoose';

export const ensureWorkingDayCalendarIndexes = async () => {
  const collection = mongoose.connection.collection('working_day_calendars');
  const indexes = await collection.indexes();

  const hasLegacy = indexes.some((idx) => idx.name === 'month_1' && idx.unique);
  const hasCompound = indexes.some((idx) => idx.name === 'organisation_id_1_month_1' && idx.unique);

  if (hasCompound) return;

  if (hasLegacy) {
    try {
      await collection.dropIndex('month_1');
    } catch {
    }
  }

  await collection.createIndex({ organisation_id: 1, month: 1 }, { unique: true, name: 'organisation_id_1_month_1' });
  await collection.createIndex({ month: 1 }, { name: 'month_1_nonunique' });
};


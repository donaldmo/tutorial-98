import Allocation from './src/models/Allocation.js';
import { connectDatabase, disconnectDatabase } from './src/config/db.js';
import {
  appendAllocationSnapshotVersion,
} from './src/services/allocationSnapshotService.js';

const getLatestCompletedVersion = (allocation) => {
  const history = Array.isArray(allocation.snapshot_versions) ? allocation.snapshot_versions : [];
  const completed = history
    .filter((entry) => entry?.state === 'completed')
    .sort((a, b) => Number(b?.version || 0) - Number(a?.version || 0));
  return Number(completed[0]?.version || 0);
};

const normalizeSnapshotVersionPointers = async (allocation) => {
  let changed = false;
  const history = Array.isArray(allocation.snapshot_versions) ? allocation.snapshot_versions : [];

  if (history.length > 0) {
    const maxVersion = Math.max(...history.map((entry) => Number(entry?.version || 0)));
    if (Number(allocation.snapshot_current_version || 0) !== maxVersion) {
      allocation.snapshot_current_version = maxVersion;
      changed = true;
    }
    if (!allocation.snapshot_current) {
      const lastPayload = history.find((entry) => Number(entry?.version || 0) === maxVersion)?.payload || null;
      if (lastPayload) {
        allocation.snapshot_current = lastPayload;
        changed = true;
      }
    }
  }

  const latestCompletedVersion = getLatestCompletedVersion(allocation);
  if (latestCompletedVersion > 0 && Number(allocation.last_completed_snapshot_version || 0) !== latestCompletedVersion) {
    allocation.last_completed_snapshot_version = latestCompletedVersion;
    changed = true;
  }

  if (changed) {
    await allocation.save();
  }

  return changed;
};

const run = async () => {
  await connectDatabase();

  const allocations = await Allocation.find({});

  let scanned = 0;
  let createdDraft = 0;
  let createdCompleted = 0;
  let normalized = 0;

  for (const allocation of allocations) {
    scanned += 1;

    const hasAnyVersions = Array.isArray(allocation.snapshot_versions) && allocation.snapshot_versions.length > 0;
    if (!hasAnyVersions) {
      await appendAllocationSnapshotVersion({
        allocation,
        state: allocation.workflow_status === 'Completed' ? 'completed' : 'draft',
        reason: 'backfill_initial',
        createdBy: null,
        monthScoped: false,
        force: true,
      });
      if (allocation.workflow_status === 'Completed') createdCompleted += 1;
      else createdDraft += 1;
      continue;
    }

    const latestCompletedVersion = getLatestCompletedVersion(allocation);
    if (allocation.workflow_status === 'Completed' && latestCompletedVersion <= 0) {
      await appendAllocationSnapshotVersion({
        allocation,
        state: 'completed',
        reason: 'backfill_missing_completed_version',
        createdBy: null,
        monthScoped: false,
        force: true,
      });
      createdCompleted += 1;
      continue;
    }

    const changed = await normalizeSnapshotVersionPointers(allocation);
    if (changed) normalized += 1;
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ scanned, createdDraft, createdCompleted, normalized }, null, 2));

  await disconnectDatabase();
};

run().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error('Backfill failed:', error);
  try {
    await disconnectDatabase();
  } catch (disconnectError) {
    // eslint-disable-next-line no-console
    console.error('Disconnect failed:', disconnectError);
  }
  process.exit(1);
});

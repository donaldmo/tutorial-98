/**
 * feeConfigService.js
 *
 * Group 3 – Task 3.2: Per-Client Role-Based Fee Split Configuration
 *
 * Helpers for reading and computing per-client role fee splits.
 * The split data lives as an embedded sub-document array on the Client
 * model (`role_fee_splits`), so no separate table is needed.
 */

import Client from '../models/Client.js';
import { round } from './planningService.js';

/**
 * Retrieve the role fee split configuration for a client.
 *
 * Returns a map of { [role]: { percentage, hourly_rate_override } }
 * or null when the client is not found.
 *
 * @param {string|import('mongoose').Types.ObjectId} clientId
 * @returns {Promise<Object|null>}
 */
export const getClientFeeSplitConfig = async (clientId) => {
  const client = await Client.findById(clientId);
  if (!client) return null;

  const splits = client.role_fee_splits || [];
  return splits.reduce((acc, split) => {
    acc[split.role] = {
      percentage: Number(split.percentage || 0),
      hourly_rate_override: split.hourly_rate_override ?? null,
    };
    return acc;
  }, {});
};

/**
 * Calculate how a total fee is distributed across roles for a client.
 *
 * When the client has no splits configured, the full fee is returned under
 * a single "Default" row representing 100 %.
 *
 * Percentages are normalised so that they always sum to 100 even when the
 * stored values do not add up perfectly.
 *
 * @param {string|import('mongoose').Types.ObjectId} clientId
 * @param {number} totalFee
 * @returns {Promise<Array<{role:string, percentage:number, hourly_rate_override:number|null, fee_amount:number}>>}
 */
export const calculateFeeSplit = async (clientId, totalFee = 0) => {
  const client = await Client.findById(clientId);
  if (!client) return [];

  const splits = client.role_fee_splits || [];

  if (!splits.length) {
    return [
      {
        role: 'Default',
        percentage: 100,
        hourly_rate_override: null,
        fee_amount: round(Number(totalFee)),
      },
    ];
  }

  const rawTotal = splits.reduce((acc, s) => acc + Number(s.percentage || 0), 0) || 100;

  return splits.map((s) => ({
    role: s.role,
    percentage: round((Number(s.percentage || 0) / rawTotal) * 100, 2),
    hourly_rate_override: s.hourly_rate_override ?? null,
    fee_amount: round((Number(totalFee) * Number(s.percentage || 0)) / rawTotal),
  }));
};

/**
 * Validate that split percentages for a client are configured and sum
 * within an acceptable tolerance of 100.
 *
 * @param {Array<{role:string, percentage:number}>} splits
 * @param {number} tolerance  Allowable deviation from 100 (default 0.5)
 * @returns {{ valid: boolean, total: number, message: string|null }}
 */
export const validateFeeSplitPercentages = (splits = [], tolerance = 0.5) => {
  if (!splits.length) {
    return { valid: true, total: 0, message: null };
  }

  const total = splits.reduce((acc, s) => acc + Number(s.percentage || 0), 0);
  const deviation = Math.abs(total - 100);

  if (deviation > tolerance) {
    return {
      valid: false,
      total: round(total, 2),
      message: `Role fee split percentages sum to ${round(total, 2)} % — expected 100 % (±${tolerance} %).`,
    };
  }

  return { valid: true, total: round(total, 2), message: null };
};

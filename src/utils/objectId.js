import mongoose from 'mongoose';

export const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));

export const toObjectId = (value, name = 'id') => {
  const raw = String(value || '').trim();
  if (!isValidObjectId(raw)) {
    const error = new Error(`Invalid ${name}`);
    error.status = 400;
    throw error;
  }
  return new mongoose.Types.ObjectId(raw);
};

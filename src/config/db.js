import mongoose from 'mongoose';

export const connectDatabase = async () => {
  mongoose.set('strictQuery', true);
  await mongoose.connect(process.env.MONGO_URL);
  // eslint-disable-next-line no-console
  console.log('MongoDB connected');
};

export const disconnectDatabase = async () => {
  await mongoose.connection.close();
};

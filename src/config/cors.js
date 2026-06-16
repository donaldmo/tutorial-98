import cors from 'cors';

const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// In development, always allow same-origin requests from the server itself
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT ?? 8080;
  const devOrigins = [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`, 'http://localhost:5173'];
  for (const o of devOrigins) {
    if (!corsOrigins.includes(o)) corsOrigins.push(o);
  }
}

export const corsMiddleware = cors({
  origin(origin, callback) {
    // Temporary: allow all origins
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

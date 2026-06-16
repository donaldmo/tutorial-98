import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { corsMiddleware } from './config/cors.js';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js'; // Group 4 – Task 4.4import cors from 'cors';
import cors from 'cors';


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../client/dist');

const app = express();
const destructiveRoutePatterns = [/^\/api\/system\/reset(?:\/|$)/i, /^\/api\/seed(?:\/|$)/i];
const captureRawJsonBody = (req, _res, buf) => {
  if (buf?.length) {
    req.rawBody = buf.toString('utf8');
  }
};

app.use(cors());
app.use(requestLogger); // Group 4 – Task 4.4: structured access logging
app.use(express.json({ limit: '5mb', verify: captureRawJsonBody }));
app.use(cookieParser());

app.use((req, res, next) => {
	const isDestructivePath = destructiveRoutePatterns.some((pattern) => pattern.test(req.path));
	if (!isDestructivePath) return next();

const allowDestructive = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.ALLOW_DESTRUCTIVE_ROUTES ?? '').toLowerCase()
  );
  if (process.env.NODE_ENV === 'production' || !allowDestructive) {
		return res.status(403).json({ detail: 'Destructive maintenance routes are disabled' });
	}

	return next();
});

app.use('/api', routes);

app.use(express.static(clientDist));
app.get('*', (_req, res) => {
	res.sendFile(path.join(clientDist, 'index.html'));
});

app.use(errorHandler);

export default app;

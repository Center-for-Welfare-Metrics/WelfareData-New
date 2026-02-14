import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { connectToDatabase } from './infrastructure/database/mongoose';
import { shutdownSvgProcessor } from './infrastructure/services/svg';

import authRoutes from './presentation/routes/authRoutes';
import specieRoutes from './presentation/routes/specieRoutes';
import productionModuleRoutes from './presentation/routes/productionModuleRoutes';
import processogramRoutes from './presentation/routes/processogramRoutes';
import processogramDataRoutes from './presentation/routes/processogramDataRoutes';
import processogramQuestionRoutes from './presentation/routes/processogramQuestionRoutes';
import chatRoutes from './presentation/routes/chatRoutes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Request timeout: 6 min para rotas pesadas (SVG processing), sem timeout para SSE, 30s para o resto
app.use((req, res, next) => {
  const isHeavyRoute =
    (req.method === 'POST' || req.method === 'PUT') &&
    req.path.includes('/processograms');
  const isStreamRoute =
    req.method === 'POST' && req.path.includes('/chat/stream');

  if (isStreamRoute) return next();

  const timeout = isHeavyRoute ? 360_000 : 30_000;

  res.setTimeout(timeout, () => {
    if (!res.headersSent) {
      res.status(408).json({ error: 'Request timeout' });
    }
  });
  next();
});

// Endpoint raiz temporário
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'WelfareData API v1 running. Frontend under construction.',
  });
});

// ─── API v1 ─────────────────────────────────────────────────
const apiV1 = express.Router();

apiV1.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

apiV1.use('/auth', authRoutes);
apiV1.use('/species', specieRoutes);
apiV1.use('/production-modules', productionModuleRoutes);
apiV1.use('/processograms', processogramRoutes);
apiV1.use('/processogram-data', processogramDataRoutes);
apiV1.use('/processogram-questions', processogramQuestionRoutes);
apiV1.use('/chat', chatRoutes);

app.use('/api/v1', apiV1);

/**
 * Função principal para iniciar o servidor
 * Garante que o banco de dados esteja conectado antes de aceitar requisições
 */
const startServer = async () => {
  try {
    // 1. Primeiro conecta ao Banco
    console.log('🔄 Conectando ao banco de dados...');
    await connectToDatabase();

    // 2. Depois sobe o servidor
    app.listen(PORT, () => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
      console.log(`🌐 Ambiente: ${process.env.NODE_ENV}`);
      console.log(`📍 URL: http://localhost:${PORT}`);
      console.log(`💚 Health Check: http://localhost:${PORT}/api/v1/health`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    });
  } catch (error) {
    console.error('❌ Falha ao iniciar o servidor:', error);
    process.exit(1);
  }
};

// Tratamento de erros não capturados
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

const gracefulShutdown = async (signal: string) => {
  console.log(`\n⚠️ ${signal} recebido. Encerrando servidor gracefully...`);
  await shutdownSvgProcessor();
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Inicia o servidor
startServer();

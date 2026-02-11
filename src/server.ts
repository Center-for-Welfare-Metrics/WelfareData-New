import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { connectToDatabase } from './infrastructure/database/mongoose';
import { shutdownSvgProcessor } from './infrastructure/services/svg';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Request timeout: 6 min para rotas pesadas (SVG processing), 30s para o resto
app.use((req, res, next) => {
  const isHeavyRoute =
    (req.method === 'POST' || req.method === 'PUT') &&
    req.path.startsWith('/processograms');
  const timeout = isHeavyRoute ? 360_000 : 30_000;

  res.setTimeout(timeout, () => {
    if (!res.headersSent) {
      res.status(408).json({ error: 'Request timeout' });
    }
  });
  next();
});

// Rota de health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// Rotas de autenticação
import authRoutes from './presentation/routes/authRoutes';
app.use('/auth', authRoutes);

// Rotas de espécies
import specieRoutes from './presentation/routes/specieRoutes';
app.use('/species', specieRoutes);

// Rotas de módulos de produção
import productionModuleRoutes from './presentation/routes/productionModuleRoutes';
app.use('/production-modules', productionModuleRoutes);

// Rotas de processogramas
import processogramRoutes from './presentation/routes/processogramRoutes';
app.use('/processograms', processogramRoutes);

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
      console.log(`💚 Health Check: http://localhost:${PORT}/health`);
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

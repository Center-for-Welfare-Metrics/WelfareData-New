import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { connectToDatabase } from './infrastructure/database/mongoose';

// Carrega variáveis de ambiente antes de tudo
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middlewares básicos
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

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
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('⚠️ SIGTERM recebido. Encerrando servidor gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n⚠️ SIGINT recebido. Encerrando servidor gracefully...');
  process.exit(0);
});

// Inicia o servidor
startServer();

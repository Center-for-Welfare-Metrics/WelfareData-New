import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Garante que as variáveis de ambiente foram carregadas
dotenv.config();

const MONGO_URI = process.env.MONGO_CONNECTION_URL;

// Configurações para robustez e performance
const options: mongoose.ConnectOptions = {
  maxPoolSize: 10, // Mantém até 10 conexões abertas para reuso (Performance)
  serverSelectionTimeoutMS: 5000, // Falha rápido se o banco não responder em 5s
  socketTimeoutMS: 45000, // Fecha sockets inativos após 45s
};

export const connectToDatabase = async (): Promise<void> => {
  if (!MONGO_URI) {
    console.error('❌ FATAL: A variável MONGO_CONNECTION_URL não está definida no .env');
    process.exit(1); // Encerra a aplicação se não houver banco
  }

  // Listeners de eventos para monitoramento em tempo real
  mongoose.connection.on('connected', () => {
    console.log('✅ MongoDB: Conexão estabelecida com sucesso.');
  });

  mongoose.connection.on('error', (err) => {
    console.error(`❌ MongoDB: Erro na conexão: ${err}`);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB: Conexão perdida. Tentando reconectar...');
  });

  try {
    // A conexão moderna com async/await
    await mongoose.connect(MONGO_URI, options);
  } catch (error) {
    console.error('❌ MongoDB: Falha crítica ao conectar na inicialização.');
    console.error(error);
    process.exit(1);
  }
};
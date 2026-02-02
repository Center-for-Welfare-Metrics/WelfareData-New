import mongoose from 'mongoose';

/**
 * Configuração e conexão com MongoDB usando Mongoose
 * Seguindo Clean Architecture: Infraestrutura isolada
 */

interface MongooseConnectionOptions {
  uri: string;
  options?: mongoose.ConnectOptions;
}

class MongooseConnection {
  private static instance: MongooseConnection;
  private isConnected: boolean = false;

  private constructor() {}

  public static getInstance(): MongooseConnection {
    if (!MongooseConnection.instance) {
      MongooseConnection.instance = new MongooseConnection();
    }
    return MongooseConnection.instance;
  }

  /**
   * Conecta ao MongoDB
   * @param config Configurações de conexão
   */
  public async connect(config: MongooseConnectionOptions): Promise<void> {
    if (this.isConnected) {
      console.log('MongoDB já está conectado');
      return;
    }

    try {
      await mongoose.connect(config.uri, {
        ...config.options,
      });

      this.isConnected = true;
      console.log('MongoDB conectado com sucesso');

      // Event handlers
      mongoose.connection.on('error', (error) => {
        console.error('Erro na conexão MongoDB:', error);
        this.isConnected = false;
      });

      mongoose.connection.on('disconnected', () => {
        console.warn('MongoDB desconectado');
        this.isConnected = false;
      });
    } catch (error) {
      console.error('Falha ao conectar ao MongoDB:', error);
      throw error;
    }
  }

  /**
   * Desconecta do MongoDB
   */
  public async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await mongoose.disconnect();
      this.isConnected = false;
      console.log('MongoDB desconectado com sucesso');
    } catch (error) {
      console.error('Erro ao desconectar do MongoDB:', error);
      throw error;
    }
  }

  /**
   * Retorna o status da conexão
   */
  public getConnectionStatus(): boolean {
    return this.isConnected;
  }
}

export default MongooseConnection.getInstance();

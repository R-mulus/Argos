import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Carrega as variáveis do arquivo .env
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3333;

// Middlewares globais
app.use(cors());
app.use(express.json());

// Rota de verificação de status
app.get('/', (req, res) => {
  res.json({ message: 'API do Argos está rodando!' });
});

// TODO: Configurar rotas MQTT/HTTP para recepção de dados dos microcontroladores ESP32 e leitores RFID UHF
// app.use('/api/tracking', trackingRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
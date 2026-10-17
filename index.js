require('dotenv').config();
process.env.TZ = process.env.TZ || 'Europe/Lisbon';

const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, Options, Partials } = require('discord.js');
const mongoose = require('mongoose'); // IMPORTAR MONGOOSE

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessageReactions // 👉 OBRIGATÓRIO PARA REAÇÕES
  ],
  partials: [
    Partials.Message,  // 👉 OBRIGATÓRIO PARA LER MENSAGENS ANTIGAS
    Partials.Channel,
    Partials.Reaction  // 👉 OBRIGATÓRIO PARA LER REAÇÕES ANTIGAS
  ],
  makeCache: Options.cacheWithLimits({
    MessageManager: 10, 
    PresenceManager: 0, 
    ThreadManager: 0,   
  }),
});

client.commands = new Collection();

require('./utils/antiCrash')(client);

// 👉 LIGAÇÃO AO MONGODB
if (!process.env.MONGO_URI) {
  console.error('❌ MONGO_URI não encontrada no ficheiro .env!');
} else {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('🍃 Conectado ao MongoDB com sucesso!'))
    .catch((err) => console.error('❌ Erro ao conectar ao MongoDB:', err));
}


/* ------------------------------------------------------------------ */
/*  Carregar Comandos (Command Handler)                                */
/* ------------------------------------------------------------------ */
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
    } else {
      console.log(`[AVISO] O comando em ${filePath} não tem a propriedade 'data' ou 'execute'.`);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Carregar Eventos (Event Handler)                                   */
/* ------------------------------------------------------------------ */
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
  }
}

client.login(process.env.TOKEN);
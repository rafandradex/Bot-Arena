require('dotenv').config();

process.env.TZ = process.env.TZ || 'Europe/Lisbon';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const {
  Client,
  GatewayIntentBits,
  Collection,
  Options,
  Partials
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration
  ],

  partials: [
    Partials.Message,
    Partials.Channel
  ],

  makeCache: Options.cacheWithLimits({
    MessageManager: 10,
    PresenceManager: 0,
    ThreadManager: 0
  })
});

client.commands = new Collection();

require('./utils/antiCrash')(client);

// Carregar comandos.
const commandsPath = path.join(__dirname, 'commands');

if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath)
    .filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));

    if (command.data && typeof command.execute === 'function') {
      client.commands.set(command.data.name, command);
    } else {
      console.warn(
        `[AVISO] O comando ${file} não tem data ou execute válidos.`
      );
    }
  }
}

// Carregar eventos.
const eventsPath = path.join(__dirname, 'events');

if (fs.existsSync(eventsPath)) {
  const eventFiles = fs.readdirSync(eventsPath)
    .filter(file => file.endsWith('.js'));

  for (const file of eventFiles) {
    const event = require(path.join(eventsPath, file));

    if (!event.name || typeof event.execute !== 'function') {
      console.warn(
        `[AVISO] O evento ${file} não tem name ou execute válidos.`
      );
      continue;
    }

    const handler = (...args) => {
      Promise.resolve()
        .then(() => event.execute(...args, client))
        .catch(error => {
          // Não imprime objetos de erro que possam conter
          // dados sensíveis de ligação.
          console.error(
            `❌ Erro no evento ${file}:`,
            error?.name || 'Error'
          );
        });
    };

    if (event.once) {
      client.once(event.name, handler);
    } else {
      client.on(event.name, handler);
    }
  }
}

// Evita operações ficarem em espera quando não há ligação.
mongoose.set('bufferCommands', false);

let shuttingDown = false;

async function shutdown(exitCode) {
  if (shuttingDown) return;

  shuttingDown = true;

  // Garante que o processo termina mesmo se a limpeza bloquear.
  const forceExit = setTimeout(() => {
    process.exit(exitCode);
  }, 10000);

  forceExit.unref();

  try {
    await client.destroy();
  } catch {
    console.error('❌ Erro ao desligar o cliente Discord.');
  }

  try {
    await mongoose.disconnect();
  } catch {
    console.error('❌ Erro ao fechar a ligação ao MongoDB.');
  }

  process.exit(exitCode);
}

// Se perder a ligação depois de iniciar, desliga o bot.
mongoose.connection.on('disconnected', () => {
  if (shuttingDown) return;

  console.error(
    '❌ Ligação ao MongoDB perdida. A desligar o bot.'
  );

  void shutdown(1);
});

mongoose.connection.on('error', () => {
  console.error('❌ Erro na ligação ao MongoDB.');
});

process.once('SIGINT', () => {
  void shutdown(0);
});

process.once('SIGTERM', () => {
  void shutdown(0);
});

async function start() {
  const requiredVariables = ['TOKEN', 'MONGO_URI'];

  const missingVariables = requiredVariables.filter(
    name => !process.env[name]?.trim()
  );

  if (missingVariables.length > 0) {
    console.error(
      `❌ Variáveis em falta no .env: ${missingVariables.join(', ')}`
    );

    return shutdown(1);
  }

  try {
    console.log('🍃 A ligar ao MongoDB...');

    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000
    });

    if (shuttingDown) return;

    // Confirma que o servidor responde.
    await mongoose.connection.db.admin().ping();

    // Garante os índices definidos nos modelos, incluindo
    // o índice único de "game" usado na proteção do /result.
    const models = require('./utils/models');

    await Promise.all(
      Object.values(models).map(model => model.init())
    );

    if (shuttingDown) return;

    console.log('✅ MongoDB ligado e modelos preparados.');
  } catch {
    console.error(
      '❌ Não foi possível preparar o MongoDB. Verifica a ligação, as credenciais e os índices. O bot não será iniciado.'
    );

    return shutdown(1);
  }

  try {
    console.log('🤖 A ligar ao Discord...');

    await client.login(process.env.TOKEN);
  } catch {
    console.error(
      '❌ Não foi possível ligar ao Discord. Verifica o token e os intents.'
    );

    return shutdown(1);
  }
}

start().catch(() => {
  console.error('❌ Falha inesperada durante o arranque.');
  void shutdown(1);
});
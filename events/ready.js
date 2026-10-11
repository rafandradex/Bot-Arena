const { Events } = require('discord.js');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`✅ Online as ${client.user.tag}`);
    
    // Registar os comandos no Discord quando o bot liga
    const commandsArray = client.commands.map(cmd => cmd.data.toJSON());
    
    try {
      if (process.env.GUILD_ID) {
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        await guild.commands.set(commandsArray);
        console.log(`📌 Commands registered in guild: ${guild.name}`);
      } else {
        await client.application.commands.set(commandsArray);
        console.log('📌 Global commands registered.');
      }
    } catch (error) {
      console.error('❌ Failed to register commands:', error);
    }
  },
};
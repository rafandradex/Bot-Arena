const { Events, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    // 1. Assign automatic roles
    const ids = (v) => (v || '').split(',').map(s => s.trim()).filter(Boolean);
    const roles = member.user.bot ? ids(process.env.BOT_ROLE_IDS) : ids(process.env.AUTO_ROLE_IDS);
    
    if (roles.length) await member.roles.add(roles, 'Auto-role').catch(() => {});

    if (!process.env.WELCOME_CHANNEL_ID) return;
    const channel = await member.guild.channels.fetch(process.env.WELCOME_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    try {
      // 2. Create the Canvas (700x250 pixels)
      const canvas = createCanvas(700, 250);
      const context = canvas.getContext('2d');

      // 3. Draw the background (Looks for the image, if not found, uses solid color)
      try {
        const background = await loadImage(path.join(__dirname, '../assets/welcome.jpg'));
        context.drawImage(background, 0, 0, canvas.width, canvas.height);
      } catch (err) {
        context.fillStyle = '#2b2d31';
        context.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Add a semi-transparent overlay to make the text stand out
      context.fillStyle = 'rgba(0, 0, 0, 0.6)';
      context.fillRect(0, 0, canvas.width, canvas.height);

      // 4. Write the text
      // Title
      context.font = 'bold 36px sans-serif';
      context.fillStyle = '#ffffff';
      context.fillText('WELCOME TO GLITCH ARENA', 225, 90);

      // Player Name
      context.font = 'bold 32px sans-serif';
      context.fillStyle = '#57f287'; // Discord Green
      let displayName = member.user.displayName;
      if (displayName.length > 20) displayName = displayName.substring(0, 17) + '...';
      context.fillText(displayName, 225, 140);

      // Member Number
      context.font = '22px sans-serif';
      context.fillStyle = '#aaaaaa';
      context.fillText(`Member #${member.guild.memberCount}`, 225, 180);

      // 5. Draw the Avatar in a perfect circle
      context.beginPath();
      context.arc(125, 125, 75, 0, Math.PI * 2, true); // (X, Y, Radius)
      context.closePath();
      context.clip();

      const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256 });
      const avatar = await loadImage(avatarUrl);
      context.drawImage(avatar, 50, 50, 150, 150);

      // 6. Convert the final image and send it
      const attachment = new AttachmentBuilder(await canvas.encode('png'), { name: 'welcome-image.png' });
      await channel.send({ content: `🎉 Look who arrived, ${member}!`, files: [attachment] });

    } catch (error) {
      console.error('❌ Error generating welcome image:', error);
      // Fallback: if the image fails, send a text-only message
      await channel.send({ content: `🎉 Welcome to **Glitch Arena**, ${member}! You are member #${member.guild.memberCount}!` }).catch(() => {});
    }
  }
};
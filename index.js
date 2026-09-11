const { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  Routes, 
  REST, 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ChannelType, 
  PermissionsBitField,
  EmbedBuilder 
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Message, Partials.Channel]
});

// Базова памет (за рестарти се препоръчва външна база като MongoDB или Quick.db)
const warnings = new Map();
const activeGiveaways = new Map();
let ticketChannelId = null;

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Проверка на забавянето на бота'),
  new SlashCommandBuilder().setName('about').setDescription('Информация за бота'),
  new SlashCommandBuilder().setName('serverinfo').setDescription('Информация за сървъра'),
  
  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Изтрива определен брой съобщения')
    .addIntegerOption(opt => opt.setName('amount').setDescription('Брой съобщения (1-100)').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Изпраща оформено съобщение')
    .addStringOption(opt => opt.setName('title').setDescription('Заглавие').setRequired(true))
    .addStringOption(opt => opt.setName('description').setDescription('Текст').setRequired(true))
    .addStringOption(opt => opt.setName('color').setDescription('Цвят Hex (напр. #FF0000)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Създава анкета')
    .addStringOption(opt => opt.setName('question').setDescription('Въпрос').setRequired(true))
    .addStringOption(opt => opt.setName('option1').setDescription('Опция 1').setRequired(true))
    .addStringOption(opt => opt.setName('option2').setDescription('Опция 2').setRequired(true)),

  new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Стартира giveaway')
    .addStringOption(opt => opt.setName('prize').setDescription('Награда').setRequired(true))
    .addIntegerOption(opt => opt.setName('duration').setDescription('Време в минути').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('setup-verify')
    .setDescription('Изпраща панел за верификация')
    .addRoleOption(opt => opt.setName('role').setDescription('Роля за даване').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Управление на тикети')
    .addSubcommand(sub => sub.setName('open').setDescription('Отвори тикет за помощ'))
    .addSubcommand(sub => sub.setName('close').setDescription('Затвори текущия тикет'))
    .addSubcommand(sub => sub.setName('setup').setDescription('Настройка на панел за тикети')),

  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Система за предупреждения')
    .addSubcommand(sub => 
      sub.setName('add')
        .setDescription('Предупреди потребител')
        .addUserOption(opt => opt.setName('user').setDescription('Потребител').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Причина').setRequired(true))
    )
    .addSubcommand(sub => 
      sub.setName('list')
        .setDescription('Покажи предупреждения')
        .addUserOption(opt => opt.setName('user').setDescription('Потребител').setRequired(true))
    )
    .addSubcommand(sub => 
      sub.setName('remove')
        .setDescription('Изтрий предупреждение')
        .addUserOption(opt => opt.setName('user').setDescription('Потребител').setRequired(true))
        .addIntegerOption(opt => opt.setName('index').setDescription('Номер на предупреждение').setRequired(true))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  // Последната дискутирана команда за ограничаване на канал
  new SlashCommandBuilder()
    .setName('set-ticket-channel')
    .setDescription('Задава канал, в който се позволява само /ticket open')
    .addChannelOption(opt => opt.setName('channel').setDescription('Избери канала').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(c => c.toJSON());

// Стартиране и регистриране на командите
client.once('ready', async () => {
  console.log(`Вписан като ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Slash командите са регистрирани успешно!');
  } catch (err) {
    console.error(err);
  }
});

// Защита на канала за тикети срещу спам и обикновен текст
client.on('messageCreate', async (message) => {
  if (message.author.bot || !ticketChannelId) return;
  if (message.channel.id === ticketChannelId) {
    try {
      await message.delete();
      const warnMsg = await message.channel.send({
        content: `${message.author}, в този канал е забранен обикновеният чат! Използвайте само \`/ticket open\`.`
      });
      setTimeout(() => warnMsg.delete().catch(() => {}), 4000);
    } catch (e) {}
  }
});

// Обработка на команди и бутони
client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const { commandName, options, guild, member, channel } = interaction;

    if (commandName === 'ping') {
      return interaction.reply(`Pong! 🏓 Забавяне: ${client.ws.ping}ms`);
    }

    if (commandName === 'about') {
      return interaction.reply({
        embeds: [new EmbedBuilder().setTitle('За бота').setDescription('Многофункционален бот за управление на сървъра.').setColor(0x00AE86)]
      });
    }

    if (commandName === 'serverinfo') {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(guild.name)
            .setThumbnail(guild.iconURL())
            .addFields(
              { name: 'Членове', value: `${guild.memberCount}`, inline: true },
              { name: 'Канали', value: `${guild.channels.cache.size}`, inline: true },
              { name: 'Роли', value: `${guild.roles.cache.size}`, inline: true }
            )
            .setColor(0x5865F2)
        ]
      });
    }

    if (commandName === 'clear') {
      const amount = options.getInteger('amount');
      if (amount < 1 || amount > 100) return interaction.reply({ content: 'Въведете число между 1 и 100.', ephemeral: true });
      await channel.bulkDelete(amount, true);
      return interaction.reply({ content: `Изтрити ${amount} съобщения.`, ephemeral: true });
    }

    if (commandName === 'embed') {
      const title = options.getString('title');
      const desc = options.getString('description');
      const color = options.getString('color') || '#5865F2';
      const embed = new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color);
      await channel.send({ embeds: [embed] });
      return interaction.reply({ content: 'Embed съобщението е изпратено!', ephemeral: true });
    }

    if (commandName === 'poll') {
      const q = options.getString('question');
      const o1 = options.getString('option1');
      const o2 = options.getString('option2');
      const embed = new EmbedBuilder().setTitle(`📊 Анкета: ${q}`).setDescription(`1️⃣ ${o1}\n2️⃣ ${o2}`).setColor(0x00FF88);
      const pollMsg = await channel.send({ embeds: [embed] });
      await pollMsg.react('1️⃣');
      await pollMsg.react('2️⃣');
      return interaction.reply({ content: 'Анкетата е създадена!', ephemeral: true });
    }

    if (commandName === 'set-ticket-channel') {
      const targetChan = options.getChannel('channel');
      ticketChannelId = targetChan.id;
      return interaction.reply({ content: `Каналът ${targetChan} вече е зададен само за билети. Обикновен текст в него ще се трие автоматично!`, ephemeral: true });
    }

    if (commandName === 'setup-verify') {
      const role = options.getRole('role');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`verify_${role.id}`).setLabel('Потвърди').setStyle(ButtonStyle.Success)
      );
      const embed = new EmbedBuilder().setTitle('Верификация').setDescription('Натиснете бутона отдолу за достъп до сървъра.').setColor(0x57F287);
      await channel.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: 'Панелът за верификация е настроен!', ephemeral: true });
    }

    if (commandName === 'giveaway') {
      const prize = options.getString('prize');
      const mins = options.getInteger('duration');
      const endsAt = Date.now() + mins * 60000;
      const gId = `${Date.now()}`;
      activeGiveaways.set(gId, []);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`giveaway_${gId}`).setLabel('🎉 Участвай').setStyle(ButtonStyle.Primary)
      );
      const embed = new EmbedBuilder().setTitle(`🎉 Giveaway: ${prize}`).setDescription(`Натиснете бутона за участие!\nВреме: ${mins} мин.`).setColor(0xFEE75C);
      const gMsg = await channel.send({ embeds: [embed], components: [row] });
      await interaction.reply({ content: 'Giveaway е пуснат!', ephemeral: true });

      setTimeout(async () => {
        const entries = activeGiveaways.get(gId) || [];
        if (entries.length === 0) {
          await channel.send(`🎉 Giveaway за **${prize}** приключи! Няма участници.`);
        } else {
          const winnerId = entries[Math.floor(Math.random() * entries.length)];
          await channel.send(`🎉 Честито на <@${winnerId}>! Печелиш **${prize}**!`);
        }
        activeGiveaways.delete(gId);
      }, mins * 60000);
    }

    if (commandName === 'warn') {
      const sub = options.getSubcommand();
      const target = options.getUser('user');
      if (!warnings.has(target.id)) warnings.set(target.id, []);

      if (sub === 'add') {
        const reason = options.getString('reason');
        warnings.get(target.id).push(reason);
        return interaction.reply({ content: `Предупреждение добавено на ${target.tag}: ${reason}` });
      }
      if (sub === 'list') {
        const userWarns = warnings.get(target.id);
        if (!userWarns.length) return interaction.reply({ content: `${target.tag} няма предупреждения.`, ephemeral: true });
        return interaction.reply({ content: `Предупреждения за ${target.tag}:\n${userWarns.map((w, i) => `${i + 1}. ${w}`).join('\n')}` });
      }
      if (sub === 'remove') {
        const idx = options.getInteger('index') - 1;
        const userWarns = warnings.get(target.id);
        if (idx >= 0 && idx < userWarns.length) {
          userWarns.splice(idx, 1);
          return interaction.reply({ content: `Предупреждението е премахнато.` });
        }
        return interaction.reply({ content: 'Невалиден номер.', ephemeral: true });
      }
    }

    if (commandName === 'ticket') {
      const sub = options.getSubcommand();
      if (sub === 'open') {
        const tChannel = await guild.channels.create({
          name: `ticket-${member.user.username}`,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
          ]
        });
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('close_ticket').setLabel('Затвори тикет').setStyle(ButtonStyle.Danger)
        );
        await tChannel.send({ content: `${member}, опишете вашия въпрос тук.`, components: [row] });
        return interaction.reply({ content: `Тикетът е създаден: ${tChannel}`, ephemeral: true });
      }
      if (sub === 'close') {
        if (!channel.name.startsWith('ticket-')) return interaction.reply({ content: 'Тази команда може да се ползва само в канал за тикет!', ephemeral: true });
        await interaction.reply('Тикетът ще бъде затворен...');
        return channel.delete();
      }
    }
  }

  // Обработка на бутони
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('verify_')) {
      const roleId = interaction.customId.split('_')[1];
      const role = interaction.guild.roles.cache.get(roleId);
      if (role) {
        await interaction.member.roles.add(role);
        return interaction.reply({ content: 'Успешна верификация!', ephemeral: true });
      }
    }

    if (interaction.customId.startsWith('giveaway_')) {
      const gId = interaction.customId.split('_')[1];
      const list = activeGiveaways.get(gId);
      if (list) {
        if (list.includes(interaction.user.id)) {
          return interaction.reply({ content: 'Вече участвате!', ephemeral: true });
        }
        list.push(interaction.user.id);
        return interaction.reply({ content: 'Успешно се записахте за giveaway-а!', ephemeral: true });
      }
    }

    if (interaction.customId === 'close_ticket') {
      await interaction.reply('Каналът се изтрива...');
      return interaction.channel.delete();
    }
  }
});

client.login(process.env.DISCORD_TOKEN);

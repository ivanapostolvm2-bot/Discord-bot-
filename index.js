const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers, GatewayIntentBits.MessageContent] });

const REP_FILE = path.join(__dirname, 'reputation.json');
const WARNS_FILE = path.join(__dirname, 'warns.json');

function updateRep(userId, amount) {
    let rep = {};
    if (fs.existsSync(REP_FILE)) { try { rep = JSON.parse(fs.readFileSync(REP_FILE)); } catch (e) {} }
    rep[userId] = (rep[userId] || 0) + amount;
    fs.writeFileSync(REP_FILE, JSON.stringify(rep, null, 2));
    return rep[userId];
}

function getWarns() {
    if (!fs.existsSync(WARNS_FILE)) return {};
    try { return JSON.parse(fs.readFileSync(WARNS_FILE)); } catch (e) { return {}; }
}
function saveWarns(data) { fs.writeFileSync(WARNS_FILE, JSON.stringify(data, null, 2)); }

const commands = [
    new SlashCommandBuilder().setName('about').setDescription('Информация за бота'),
    new SlashCommandBuilder().setName('clear').setDescription('Изтрива определен брой съобщения').addIntegerOption(o => o.setName('брой').setDescription('Колко съобщения да изтрия').setRequired(true)),
    new SlashCommandBuilder().setName('embed').setDescription('Изпраща оформено съобщение').addStringOption(o => o.setName('заглавие').setDescription('Заглавие').setRequired(true)).addStringOption(o => o.setName('описание').setDescription('Текст').setRequired(true)),
    new SlashCommandBuilder().setName('giveaway').setDescription('Стартира giveaway').addStringOption(o => o.setName('награда').setDescription('Каква е наградата').setRequired(true)),
    new SlashCommandBuilder().setName('ping').setDescription('Проверка на забавянето на бота'),
    new SlashCommandBuilder().setName('poll').setDescription('Създава анкета').addStringOption(o => o.setName('въпрос').setDescription('Въпрос за анкетата').setRequired(true)),
    new SlashCommandBuilder().setName('reb-minus').setDescription('Дава отрицателна репутация (reb-) на член').addUserOption(o => o.setName('потребител').setDescription('Кой член').setRequired(true)),
    new SlashCommandBuilder().setName('reb-plus').setDescription('Дава положителна репутация (reb+) на член').addUserOption(o => o.setName('потребител').setDescription('Кой член').setRequired(true)),
    new SlashCommandBuilder().setName('rules').setDescription('Показва правилата на сървъра'),
    new SlashCommandBuilder().setName('serverinfo').setDescription('Информация за сървъра'),
    new SlashCommandBuilder().setName('setup-verify').setDescription('Изпраща панел за верификация'),
    new SlashCommandBuilder().setName('ticket').setDescription('Система за тикети')
        .addSubcommand(sub => sub.setName('setup').setDescription('Настройка на панел за тикети'))
        .addSubcommand(sub => sub.setName('close').setDescription('Затвори текущия тикет'))
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
    console.log('Ботът New World Bulgaria е ОНЛАЙН!');
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try { await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); console.log('Командите са регистрирани успешно!'); } catch (e) { console.error(e); }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        if (interaction.customId === 'verify_user') {
            const role = interaction.guild.roles.cache.find(r => r.name.toLowerCase().includes('member') || r.name.toLowerCase().includes('играч'));
            if (!role) return interaction.reply({ content: 'Ролята не е намерена в сървъра.', ephemeral: true });
            await interaction.member.roles.add(role);
            return interaction.reply({ content: '✅ Успешно се верифицирахте!', ephemeral: true });
        }
        if (interaction.customId === 'open_ticket') {
            const channelName = 'ticket-' + interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
            const existing = interaction.guild.channels.cache.find(c => c.name === channelName);
            if (existing) return interaction.reply({ content: 'Вече имаш отворен тикет!', ephemeral: true });
            const ch = await interaction.guild.channels.create({
                name: channelName, type: ChannelType.GuildText, parent: interaction.channel.parentId,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]
            });
            const emb = new EmbedBuilder().setTitle('Нов Тикет').setDescription('Екипът на New World Bulgaria ще се свърже с теб.').setColor('#5865F2');
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('Затвори').setStyle(ButtonStyle.Danger));
            await ch.send({ content: String(interaction.user), embeds: [emb], components: [row] });
            return interaction.reply({ content: 'Тикетът е отворен успешно!', ephemeral: true });
        }
        if (interaction.customId === 'close_ticket') {
            await interaction.reply('🔒 Тикетът се изтрива след 5 сек...');
            setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, user, channel, guild } = interaction;

    if (commandName === 'about') await interaction.reply('🤖 **New world bulgaria** бот за FiveM.');
    if (commandName === 'ping') await interaction.reply('🏓 Понг! Забавяне: ' + Math.abs(Date.now() - interaction.createdTimestamp) + 'ms');
    if (commandName === 'clear') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) return interaction.reply({ content: 'Нямаш права!', ephemeral: true });
        const count = options.getInteger('брой');
        await channel.bulkDelete(count, true);
        await interaction.reply({ content: '🧹 Изтрити съобщения.', ephemeral: true });
    }
    if (commandName === 'embed') {
        const embed = new EmbedBuilder().setTitle(options.getString('заглавие')).setDescription(options.getString('описание')).setColor('#0099ff');
        await interaction.reply({ content: 'Изпратено!', ephemeral: true }); await channel.send({ embeds: [embed] });
    }
    if (commandName === 'giveaway') {
        const embed = new EmbedBuilder().setTitle('🎉 GIVEAWAY 🎉').setDescription('**Награда:** ' + options.getString('награда')).setColor('#ffaa00');
        const msg = await interaction.reply({ embeds: [embed], fetchReply: true }); await msg.react('🎉');
    }
    if (commandName === 'poll') {
        const embed = new EmbedBuilder().setTitle('📊 Анкета').setDescription(options.getString('въпрос')).setColor('#5865F2');
        const msg = await interaction.reply({ embeds: [embed], fetchReply: true }); await msg.react('✅'); await msg.react('❌');
    }
    if (commandName === 'reb-minus') {
        const target = options.getUser('потребител'); const r = updateRep(target.id, -1);
        await interaction.reply('📉 **' + user.username + '** даде **reb-** на **' + target.username + '**. Репутация: ' + r);
    }
    if (commandName === 'reb-plus') {
        const target = options.getUser('потребител'); const r = updateRep(target.id, 1);
        await interaction.reply('📈 **' + user.username + '** даде **reb+** на **' + target.username + '**. Репутация: ' + r);
    }
    if (commandName === 'rules') {
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('📜 ПРАВИЛА').setDescription('1. Спазвайте RP правилата.\n2. Без токсичност.').setColor('#ff0000')] });
    }
    if (commandName === 'serverinfo') {
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle(guild.name).setDescription('Общо членове: ' + guild.memberCount).setColor('#5865F2')] });
    }
    if (commandName === 'setup-verify') {
        const embed = new EmbedBuilder().setTitle('✅ Верификация').setDescription('Натисни бутона по-долу за достъп.').setColor('#00ff00');
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('verify_user').setLabel('Верифицирай се').setStyle(ButtonStyle.Success));
        await channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: 'Панелът е зареден.', ephemeral: true });
    }
    if (commandName === 'ticket') {
        const sub = options.getSubcommand();
        if (sub === 'setup') {
            const embed = new EmbedBuilder().setTitle('📩 Система за Тикети').setDescription('Натисни бутона, за да отвориш тикет към екипа.').setColor('#2ecc71');
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_ticket').setLabel('Отвори Тикет').setStyle(ButtonStyle.Success));
            await channel.send({ embeds: [embed], components: [row] });
            await interaction.reply({ content: 'Панелът е генериран успешно.', ephemeral: true });
        }
        if (sub === 'close') {
            if (!channel.name.startsWith('ticket-')) return interaction.reply('Не се намираш в тикет канал.');
            await interaction.reply('🔒 Изтриване на канала...'); setTimeout(() => channel.delete().catch(() => {}), 5000);
        }
    }
    if (commandName === 'warn') {
        const sub = options.getSubcommand(); const target = options.getUser('потребител'); let data = getWarns();
        if (sub === 'add') {
            const reason = options.getString('причина'); if (!data[target.id]) data[target.id] = [];

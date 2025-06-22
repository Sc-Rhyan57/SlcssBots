const { Client, GatewayIntentBits, EmbedBuilder, Collection, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');
const { Octokit } = require('@octokit/rest');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const octokit = new Octokit({
    auth: config.github.token
});

client.commands = new Collection();
client.userCooldowns = new Map();

const loadCommands = () => {
    const commandsPath = path.join(__dirname, 'comandos');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        client.commands.set(command.data.name, command);
    }
};

const updateGitHubFile = async (filename, content) => {
    try {
        let sha;
        try {
            const { data } = await octokit.rest.repos.getContent({
                owner: config.github.owner,
                repo: config.github.repo,
                path: filename
            });
            sha = data.sha;
        } catch (error) {
            if (error.status !== 404) throw error;
        }

        await octokit.rest.repos.createOrUpdateFileContents({
            owner: config.github.owner,
            repo: config.github.repo,
            path: filename,
            message: `Update ${filename}`,
            content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64'),
            sha
        });
    } catch (error) {
        console.error(`Erro ao atualizar ${filename}:`, error);
    }
};

const getGitHubFile = async (filename) => {
    try {
        const { data } = await octokit.rest.repos.getContent({
            owner: config.github.owner,
            repo: config.github.repo,
            path: filename
        });
        return JSON.parse(Buffer.from(data.content, 'base64').toString());
    } catch (error) {
        if (error.status === 404) {
            return filename === 'roles.json' ? {} : {};
        }
        console.error(`Erro ao buscar ${filename}:`, error);
        return {};
    }
};

const createLevelRoles = async (guild) => {
    const rolesData = await getGitHubFile('roles.json');
    
    for (let i = 1; i <= 100; i++) {
        if (!rolesData[i]) {
            try {
                const role = await guild.roles.create({
                    name: `LEVEL ${i}`,
                    color: i <= 20 ? 'Grey' : i <= 40 ? 'Green' : i <= 60 ? 'Blue' : i <= 80 ? 'Purple' : 'Gold',
                    reason: `Cargo de nível ${i} criado automaticamente`
                });
                rolesData[i] = role.id;
            } catch (error) {
                console.error(`Erro ao criar cargo LEVEL ${i}:`, error);
            }
        }
    }
    
    await updateGitHubFile('roles.json', rolesData);
    return rolesData;
};

const calculateXPForLevel = (level) => {
    return Math.floor(100 * Math.pow(1.5, level - 1));
};

const calculateLevelFromXP = (xp) => {
    let level = 1;
    while (calculateXPForLevel(level + 1) <= xp) {
        level++;
    }
    return level;
};

const updateUserLevel = async (guild, userId, newLevel, oldLevel) => {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;

    const rolesData = await getGitHubFile('roles.json');
    
    for (let i = 1; i <= oldLevel; i++) {
        if (rolesData[i] && member.roles.cache.has(rolesData[i])) {
            await member.roles.remove(rolesData[i]).catch(() => {});
        }
    }
    
    if (rolesData[newLevel]) {
        await member.roles.add(rolesData[newLevel]).catch(() => {});
    }
    
    if (newLevel > oldLevel && config.levelUpChannels.length > 0) {
        const embed = new EmbedBuilder()
            .setTitle('🎉 LEVEL UP!')
            .setDescription(`${member} subiu para o **LEVEL ${newLevel}**!`)
            .setColor('#00ff00')
            .setThumbnail(member.user.displayAvatarURL())
            .setTimestamp();
        
        for (const channelId of config.levelUpChannels) {
            const channel = guild.channels.cache.get(channelId);
            if (channel) {
                await channel.send({ embeds: [embed] }).catch(() => {});
            }
        }
    }
};

const registerCommands = async () => {
    const { REST, Routes } = require('discord.js');
    const commands = [];
    
    client.commands.forEach(command => {
        commands.push(command.data.toJSON());
    });
    
    const rest = new REST({ version: '10' }).setToken(config.token);
    
    try {
        console.log('Registrando comandos...');
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, config.guildId),
            { body: commands }
        );
        console.log('Comandos registrados com sucesso!');
    } catch (error) {
        console.error('Erro ao registrar comandos:', error);
    }
};

client.once('ready', async () => {
    console.log(`Bot conectado como ${client.user.tag}`);
    
    loadCommands();
    await registerCommands();
    
    const guild = client.guilds.cache.get(config.guildId);
    if (guild) {
        await createLevelRoles(guild);
    }
    
    const activities = [
        '🎮 Monitorizando XP',
        '⚡ Sistema de Níveis',
        '🏆 Evoluindo players',
        '📊 Calculando stats',
        '🚀 Subindo de level'
    ];
    
    let activityIndex = 0;
    setInterval(() => {
        client.user.setActivity(activities[activityIndex], { type: 'WATCHING' });
        activityIndex = (activityIndex + 1) % activities.length;
    }, 12000);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || message.guild?.id !== config.guildId) return;
    
    // Sistema de Contagem - ANTES do sistema de XP
    const countingData = await getGitHubFile('counting.json');
    if (countingData[message.guild.id] && message.channel.id === countingData[message.guild.id].channelId) {
        const countingCommand = client.commands.get('configurar-contagem');
        if (countingCommand && countingCommand.handleCountingMessage) {
            try {
                await countingCommand.handleCountingMessage(message, countingData[message.guild.id], { 
                    getGitHubFile, 
                    updateGitHubFile, 
                    config 
                });
            } catch (error) {
                console.error('Erro no sistema de contagem:', error);
            }
        }
        // NÃO colocar return aqui - deixa continuar para ganhar XP
    }
    
    const userId = message.author.id;
    const now = Date.now();
    
    if (client.userCooldowns.has(userId)) {
        const cooldownEnd = client.userCooldowns.get(userId);
        if (now < cooldownEnd) return;
    }
    
    client.userCooldowns.set(userId, now + 60000);
    
    const userData = await getGitHubFile('users.json');
    
    if (!userData[userId]) {
        userData[userId] = { xp: 0, level: 1 };
    }
    
    const xpGain = Math.floor(Math.random() * 15) + 5;
    userData[userId].xp += xpGain;
    
    const newLevel = calculateLevelFromXP(userData[userId].xp);
    const oldLevel = userData[userId].level;
    
    if (newLevel > oldLevel) {
        userData[userId].level = newLevel;
        await updateUserLevel(message.guild, userId, newLevel, oldLevel);
    }
    
    await updateGitHubFile('users.json', userData);
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    
    try {
        await command.execute(interaction, { getGitHubFile, updateGitHubFile, calculateLevelFromXP, calculateXPForLevel, updateUserLevel, config });
    } catch (error) {
        console.error('Erro ao executar comando:', error);
        const reply = { content: 'Erro ao executar o comando!', ephemeral: true };
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(reply);
        } else {
            await interaction.reply(reply);
        }
    }
});

client.login(config.token);
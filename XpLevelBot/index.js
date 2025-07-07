const { Client, GatewayIntentBits, EmbedBuilder, Collection, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');
const { Octokit } = require('@octokit/rest');
const { handleSuggestionInteraction, setupSuggestionMessage } = require('./suggestionHandler');

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
client.userLevels = new Map();

// Sistema de Cache
const cache = {
    users: null,
    roles: null,
    suggestions: null,
    counting: null,
    lastFetch: {
        users: 0,
        roles: 0,
        suggestions: 0,
        counting: 0
    },
    pendingUpdates: {
        users: false,
        roles: false,
        suggestions: false,
        counting: false
    }
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos
const COMMIT_INTERVAL = 10 * 60 * 1000; // 10 minutos

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
        
        console.log(`✅ ${filename} atualizado no GitHub`);
    } catch (error) {
        console.error(`❌ Erro ao atualizar ${filename}:`, error);
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

// Função para obter dados do cache ou do GitHub
const getCachedData = async (filename) => {
    const cacheKey = filename.replace('.json', '');
    const now = Date.now();
    
    // Se não tem cache ou está expirado, buscar do GitHub
    if (!cache[cacheKey] || (now - cache.lastFetch[cacheKey]) > CACHE_DURATION) {
        cache[cacheKey] = await getGitHubFile(filename);
        cache.lastFetch[cacheKey] = now;
        console.log(`🔄 Cache atualizado para ${filename}`);
    }
    
    return cache[cacheKey];
};

// Função para atualizar dados no cache
const updateCachedData = (filename, data) => {
    const cacheKey = filename.replace('.json', '');
    cache[cacheKey] = data;
    cache.pendingUpdates[cacheKey] = true;
    console.log(`📝 Cache modificado para ${filename}`);
};

// Função para commitar todas as alterações pendentes
const commitPendingUpdates = async () => {
    const filesToUpdate = [];
    
    if (cache.pendingUpdates.users && cache.users) {
        filesToUpdate.push({ filename: 'users.json', data: cache.users });
        cache.pendingUpdates.users = false;
    }
    
    if (cache.pendingUpdates.roles && cache.roles) {
        filesToUpdate.push({ filename: 'roles.json', data: cache.roles });
        cache.pendingUpdates.roles = false;
    }
    
    if (cache.pendingUpdates.suggestions && cache.suggestions) {
        filesToUpdate.push({ filename: 'suggestions.json', data: cache.suggestions });
        cache.pendingUpdates.suggestions = false;
    }
    
    if (cache.pendingUpdates.counting && cache.counting) {
        filesToUpdate.push({ filename: 'counting.json', data: cache.counting });
        cache.pendingUpdates.counting = false;
    }
    
    if (filesToUpdate.length > 0) {
        console.log(`🚀 Commitando ${filesToUpdate.length} arquivo(s) para o GitHub...`);
        
        for (const file of filesToUpdate) {
            await updateGitHubFile(file.filename, file.data);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Delay entre commits
        }
        
        console.log(`✅ Todos os commits foram realizados com sucesso!`);
    } else {
        console.log(`ℹ️ Nenhuma alteração pendente para commitar`);
    }
};

// Versões modificadas das funções para usar cache
const updateGitHubFileCache = async (filename, content) => {
    updateCachedData(filename, content);
};

const getGitHubFileCache = async (filename) => {
    return await getCachedData(filename);
};

const createLevelRoles = async (guild) => {
    const rolesData = await getCachedData('roles.json');
    let hasChanges = false;
    
    for (let i = 1; i <= 100; i++) {
        if (!rolesData[i]) {
            try {
                const role = await guild.roles.create({
                    name: `LEVEL ${i}`,
                    color: i <= 20 ? 'Grey' : i <= 40 ? 'Green' : i <= 60 ? 'Blue' : i <= 80 ? 'Purple' : 'Gold',
                    reason: `Cargo de nível ${i} criado automaticamente`
                });
                rolesData[i] = role.id;
                hasChanges = true;
            } catch (error) {
                console.error(`Erro ao criar cargo LEVEL ${i}:`, error);
            }
        }
    }
    
    if (hasChanges) {
        updateCachedData('roles.json', rolesData);
    }
    
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

    const rolesData = await getCachedData('roles.json');
    
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
    
    await setupSuggestionMessage(client, { getGitHubFile: getGitHubFileCache, updateGitHubFile: updateGitHubFileCache });
    
    // Configurar intervalo de commits
    setInterval(commitPendingUpdates, COMMIT_INTERVAL);
    console.log(`⏰ Sistema de commits automáticos configurado para a cada ${COMMIT_INTERVAL / 1000 / 60} minutos`);
    
    // Commit inicial se houver alterações pendentes
    setTimeout(commitPendingUpdates, 5000);
    
    client.user.setActivity('Sluccs is The best! ⭐', { type: 'STREAMING', url: 'https://twitch.tv/sluccs' });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || message.guild?.id !== config.guildId) return;
    
    const countingCommand = client.commands.get('configurar-contagem');
    if (countingCommand && countingCommand.handleCountingMessage) {
        try {
            await countingCommand.handleCountingMessage(message, null, { 
                getGitHubFile: getGitHubFileCache, 
                updateGitHubFile: updateGitHubFileCache, 
                config 
            });
        } catch (error) {
            console.error('Erro no sistema de contagem:', error);
        }
    }
    
    const userId = message.author.id;
    const now = Date.now();
    
    if (client.userCooldowns.has(userId)) {
        const cooldownEnd = client.userCooldowns.get(userId);
        if (now < cooldownEnd) return;
    }
    
    client.userCooldowns.set(userId, now + 60000);
    
    const userData = await getCachedData('users.json');
    
    if (!userData[userId]) {
        userData[userId] = { xp: 0, level: 1 };
    }
    
    const xpGain = Math.floor(Math.random() * 15) + 5;
    userData[userId].xp += xpGain;
    
    const newLevel = calculateLevelFromXP(userData[userId].xp);
    const oldLevel = userData[userId].level;
    
    if (newLevel > oldLevel) {
        userData[userId].level = newLevel;
        client.userLevels.set(userId, newLevel);
        await updateUserLevel(message.guild, userId, newLevel, oldLevel);
    }
    
    updateCachedData('users.json', userData);
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton() || interaction.isModalSubmit()) {
        if (interaction.customId === 'sugerir_app' || 
            interaction.customId === 'suggestion_modal' ||
            interaction.customId.startsWith('accept_suggestion_') ||
            interaction.customId.startsWith('deny_suggestion_') ||
            interaction.customId.startsWith('accept_modal_') ||
            interaction.customId.startsWith('deny_modal_')) {
            try {
                await handleSuggestionInteraction(interaction, { getGitHubFile: getGitHubFileCache, updateGitHubFile: updateGitHubFileCache });
                return;
            } catch (error) {
                console.error('Erro no sistema de sugestões:', error);
            }
        }
        
        if (interaction.isModalSubmit() && interaction.customId.startsWith('app_modal_')) {
            const postAppCommand = client.commands.get('post-app');
            if (postAppCommand && postAppCommand.handleModalSubmit) {
                try {
                    await postAppCommand.handleModalSubmit(interaction);
                    return;
                } catch (error) {
                    console.error('Erro no sistema de post-app:', error);
                }
            }
        }
    }
    
    if (!interaction.isChatInputCommand()) return;
    
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    
    try {
        await command.execute(interaction, { 
            getGitHubFile: getGitHubFileCache, 
            updateGitHubFile: updateGitHubFileCache, 
            calculateLevelFromXP, 
            calculateXPForLevel, 
            updateUserLevel, 
            config 
        });
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

// Graceful shutdown - commitar alterações pendentes ao encerrar
process.on('SIGINT', async () => {
    console.log('🔄 Encerrando bot... Commitando alterações pendentes...');
    await commitPendingUpdates();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('🔄 Encerrando bot... Commitando alterações pendentes...');
    await commitPendingUpdates();
    process.exit(0);
});

client.login(config.token);
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder, PermissionFlagsBits, ActivityType, ChannelType } = require('discord.js');
const { Octokit } = require('@octokit/rest');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
});

const [owner, repo] = process.env.GITHUB_REPO.split('/');

class Config {
    constructor() {
        this.data = {
            participant_role_id: 1375987414815866990,
            submission_channel_id: 1376328774630768701,
            menu_channel_id: 1371565278873391124,
            voting_channel_id: 1371565278873391124,
            first_place_role_id: 1375987414191046768,
            second_place_role_id: 1376317085537271989,
            third_place_role_id: 1376317084392357968,
            admin_role_id: null,
            event_active: false,
            voting_active: false,
            blacklisted_roles: [],
            blacklisted_users: []
        };
        this.loadConfig();
    }

    async loadConfig() {
        try {
            const data = await fs.readFile('config.json', 'utf8');
            this.data = { ...this.data, ...JSON.parse(data) };
        } catch (error) {
            console.log('Config file not found, creating default...');
            await this.saveConfig();
        }
    }

    async saveConfig() {
        try {
            await fs.writeFile('config.json', JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Error saving config:', error);
        }
    }
}

class BotPrefs {
    constructor() {
        this.menu_message_id = null;
        this.menu_channel_id = null;
        this.participants = [];
        this.submissions = {};
    }

    async loadFromGithub() {
        try {
            const { data } = await octokit.repos.getContent({
                owner,
                repo,
                path: 'bot/prefs.json'
            });
            
            const content = Buffer.from(data.content, 'base64').toString();
            const prefs = JSON.parse(content);
            
            this.menu_message_id = prefs.menu_message_id;
            this.menu_channel_id = prefs.menu_channel_id;
            this.participants = prefs.participants || [];
            this.submissions = prefs.submissions || {};
        } catch (error) {
            console.log('No prefs found on GitHub, using defaults');
        }
    }

    async saveToGithub() {
        try {
            const data = {
                menu_message_id: this.menu_message_id,
                menu_channel_id: this.menu_channel_id,
                participants: this.participants,
                submissions: this.submissions
            };

            const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');

            try {
                const file = await octokit.repos.getContent({
                    owner,
                    repo,
                    path: 'bot/prefs.json'
                });

                await octokit.repos.createOrUpdateFileContents({
                    owner,
                    repo,
                    path: 'bot/prefs.json',
                    message: 'Update bot preferences',
                    content,
                    sha: file.data.sha
                });
            } catch {
                await octokit.repos.createOrUpdateFileContents({
                    owner,
                    repo,
                    path: 'bot/prefs.json',
                    message: 'Create bot preferences',
                    content
                });
            }
        } catch (error) {
            console.error('Error saving to GitHub:', error);
        }
    }
}

const config = new Config();
const botPrefs = new BotPrefs();

const safeExecute = async (fn, errorMessage = 'Unknown error') => {
    try {
        return await fn();
    } catch (error) {
        console.error(`${errorMessage}:`, error);
        return null;
    }
};

function hasAdminPermission(interaction) {
    if (!config.data.admin_role_id) {
        return true;
    }
    
    const hasAdminRole = interaction.member.roles.cache.has(config.data.admin_role_id);
    return hasAdminRole;
}

async function checkAdminPermission(interaction) {
    if (!hasAdminPermission(interaction)) {
        await interaction.reply({ 
            content: '❌ Você não tem permissão para usar este comando!', 
            ephemeral: true 
        });
        return false;
    }
    return true;
}

async function loadParticipants() {
    return await safeExecute(async () => {
        const data = await fs.readFile('allpfs.json', 'utf8');
        return JSON.parse(data);
    }) || [];
}

async function saveParticipants(participants) {
    await safeExecute(async () => {
        await fs.writeFile('allpfs.json', JSON.stringify(participants, null, 2));
    }, 'Error saving participants');
}

async function saveUserData(userId, data) {
    await safeExecute(async () => {
        const userDir = path.join('data', userId);
        await fs.mkdir(userDir, { recursive: true });
        await fs.writeFile(path.join(userDir, 'config.json'), JSON.stringify(data, null, 2));
    }, `Error saving user data for ${userId}`);
}

async function loadUserData(userId) {
    return await safeExecute(async () => {
        const data = await fs.readFile(path.join('data', userId, 'config.json'), 'utf8');
        return JSON.parse(data);
    });
}

async function saveUserDataToGithub(userId, data) {
    await safeExecute(async () => {
        const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
        const filePath = `data/${userId}/config.json`;

        try {
            const file = await octokit.repos.getContent({
                owner,
                repo,
                path: filePath
            });

            await octokit.repos.createOrUpdateFileContents({
                owner,
                repo,
                path: filePath,
                message: `Update user ${userId} data`,
                content,
                sha: file.data.sha
            });
        } catch {
            await octokit.repos.createOrUpdateFileContents({
                owner,
                repo,
                path: filePath,
                message: `Create user ${userId} data`,
                content
            });
        }
    }, `Error saving user data to GitHub for ${userId}`);
}

async function deleteUserDataFromGithub(userId) {
    await safeExecute(async () => {
        const filePath = `data/${userId}/config.json`;
        
        try {
            const file = await octokit.repos.getContent({
                owner,
                repo,
                path: filePath
            });

            await octokit.repos.deleteFile({
                owner,
                repo,
                path: filePath,
                message: `Delete user ${userId} data`,
                sha: file.data.sha
            });
        } catch (error) {
            console.log(`File ${filePath} not found on GitHub`);
        }
    }, `Error deleting user data from GitHub for ${userId}`);
}

function createTournamentView(disabled = false) {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('participate')
                .setLabel('Participar')
                .setStyle(ButtonStyle.Success)
                .setDisabled(disabled || config.data.voting_active),
            new ButtonBuilder()
                .setCustomId('submit')
                .setLabel('Enviar Edit')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId('count')
                .setLabel('0 PESSOAS')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
        );
    
    return row;
}

async function updateMenuButtonColor() {
    if (!botPrefs.menu_message_id || !botPrefs.menu_channel_id) return;

    await safeExecute(async () => {
        const channel = client.channels.cache.get(botPrefs.menu_channel_id);
        if (!channel) return;

        const message = await channel.messages.fetch(botPrefs.menu_message_id);
        const participants = await loadParticipants();
        const count = participants.length;

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('participate')
                    .setLabel('Participar')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(!config.data.event_active || config.data.voting_active),
                new ButtonBuilder()
                    .setCustomId('submit')
                    .setLabel('Enviar Edit')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(!config.data.event_active)
            );

        let countButton;
        if (count === 0) {
            countButton = new ButtonBuilder()
                .setCustomId('count')
                .setLabel('0 PESSOAS')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true);
        } else if (count <= 3) {
            countButton = new ButtonBuilder()
                .setCustomId('count')
                .setLabel(`${count} PESSOAS`)
                .setStyle(ButtonStyle.Danger)
                .setDisabled(true);
        } else {
            countButton = new ButtonBuilder()
                .setCustomId('count')
                .setLabel(`${count} PESSOAS`)
                .setStyle(ButtonStyle.Success)
                .setDisabled(true);
        }

        row.addComponents(countButton);
        await message.edit({ components: [row] });
    }, 'Error updating menu button');
}

async function createOrUpdateMenu(channelId) {
    return await safeExecute(async () => {
        const channel = client.channels.cache.get(channelId);
        if (!channel) return null;

        const embed = new EmbedBuilder()
            .setTitle('🏆 Torneio de Edição')
            .setDescription('Participe do nosso torneio de edição!')
            .setColor(0x0099ff)
            .setTimestamp();

        const row = createTournamentView();

        let message;
        if (botPrefs.menu_message_id && botPrefs.menu_channel_id === channelId) {
            try {
                const existingMessage = await channel.messages.fetch(botPrefs.menu_message_id);
                message = await existingMessage.edit({ embeds: [embed], components: [row] });
            } catch {
                message = await channel.send({ embeds: [embed], components: [row] });
            }
        } else {
            if (botPrefs.menu_message_id && botPrefs.menu_channel_id) {
                try {
                    const oldChannel = client.channels.cache.get(botPrefs.menu_channel_id);
                    if (oldChannel) {
                        const oldMessage = await oldChannel.messages.fetch(botPrefs.menu_message_id);
                        await oldMessage.delete();
                    }
                } catch (error) {
                    console.log('Could not delete old menu message');
                }
            }
            message = await channel.send({ embeds: [embed], components: [row] });
        }

        botPrefs.menu_message_id = message.id;
        botPrefs.menu_channel_id = channelId;
        await botPrefs.saveToGithub();

        return message;
    }, 'Error creating/updating menu');
}

function updateStatus() {
    safeExecute(async () => {
        const participants = await loadParticipants();
        const count = participants.length;
        const status = config.data.event_active ? 
            (config.data.voting_active ? `🗳️ Votação ativa` : `🏆 ${count} participantes`) : 
            '😴 Evento inativo';
        
        client.user.setActivity(status, { type: ActivityType.Watching });
    }, 'Error updating status');
}

client.once('ready', async () => {
    console.log(`${client.user.tag} conectado!`);
    
    await botPrefs.loadFromGithub();
    await config.loadConfig();
    
    if (config.data.menu_channel_id) {
        await createOrUpdateMenu(config.data.menu_channel_id);
    }
    
    updateStatus();
    setInterval(updateStatus, 30000);

    const commands = [
        new SlashCommandBuilder()
            .setName('evento_stats')
            .setDescription('Ativar/desativar evento')
            .addBooleanOption(option =>
                option.setName('ativo')
                    .setDescription('Ativar ou desativar o evento')
                    .setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName('evento_menu')
            .setDescription('Configurar canal do menu')
            .addChannelOption(option =>
                option.setName('canal')
                    .setDescription('Canal para o menu do evento')
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName('evento_blacklistcargo')
            .setDescription('Blacklistar cargo')
            .addRoleOption(option =>
                option.setName('cargo')
                    .setDescription('Cargo para blacklistar')
                    .setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName('evento_blacklistmembro')
            .setDescription('Blacklistar membro')
            .addUserOption(option =>
                option.setName('membro')
                    .setDescription('Membro para blacklistar')
                    .setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName('enviar_menu')
            .setDescription('Enviar menu para outro canal')
            .addChannelOption(option =>
                option.setName('canal')
                    .setDescription('Canal para enviar o menu')
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName('sync_github')
            .setDescription('Sincronizar com GitHub'),
        new SlashCommandBuilder()
            .setName('evento_avisar')
            .setDescription('Avisar participantes')
            .addStringOption(option =>
                option.setName('anuncio')
                    .setDescription('Mensagem do anúncio')
                    .setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName('evento_finalizar')
            .setDescription('Finalizar evento'),
        new SlashCommandBuilder()
            .setName('final_vote')
            .setDescription('Iniciar votação final'),
        new SlashCommandBuilder()
            .setName('configurar_cargo_participante')
            .setDescription('Configurar cargo de participante')
            .addRoleOption(option =>
                option.setName('cargo')
                    .setDescription('Cargo que será dado aos participantes')
                    .setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName('configurar_cargo_admin')
            .setDescription('Configurar cargo de administrador')
            .addRoleOption(option =>
                option.setName('cargo')
                    .setDescription('Cargo que terá acesso aos comandos administrativos')
                    .setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName('configurar_canal_votacao')
            .setDescription('Configurar canal de votação')
            .addChannelOption(option =>
                option.setName('canal')
                    .setDescription('Canal para votação')
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(true)
            )
    ];

    await safeExecute(async () => {
        await client.application.commands.set(commands);
    }, 'Error setting commands');
});

client.on('interactionCreate', async interaction => {
    await safeExecute(async () => {
        if (interaction.isButton()) {
            await handleButtonInteraction(interaction);
        } else if (interaction.isModalSubmit()) {
            await handleModalSubmit(interaction);
        } else if (interaction.isChatInputCommand()) {
            await handleSlashCommandWithPermission(interaction);
        }
    }, 'Error handling interaction');
});

async function handleButtonInteraction(interaction) {
    if (interaction.customId === 'participate') {
        if (!config.data.event_active) {
            return await interaction.reply({ content: '❌ Evento não está ativo!', ephemeral: true });
        }

        if (config.data.voting_active) {
            return await interaction.reply({ content: '❌ Votação já iniciada! Não é possível participar.', ephemeral: true });
        }

        const userId = interaction.user.id;

        if (config.data.blacklisted_users.includes(userId)) {
            return await interaction.reply({ content: '❌ Você está bloqueado de participar!', ephemeral: true });
        }

        const userRoles = interaction.member.roles.cache.map(role => role.id);
        if (config.data.blacklisted_roles.some(roleId => userRoles.includes(roleId))) {
            return await interaction.reply({ content: '❌ Você não pode participar com seu cargo atual!', ephemeral: true });
        }

        const participants = await loadParticipants();

        if (participants.includes(userId)) {
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('leave_tournament')
                        .setLabel('Sair do Torneio')
                        .setStyle(ButtonStyle.Danger)
                );
            
            return await interaction.reply({ 
                content: 'Você já está participando do torneio.',
                components: [row],
                ephemeral: true
            });
        }

        const modal = new ModalBuilder()
            .setCustomId('participate_modal')
            .setTitle('Formulário de Participação');

        const editorInput = new TextInputBuilder()
            .setCustomId('editor')
            .setLabel('Por onde você vai editar?')
            .setPlaceholder('Exemplo: Capcut, After Motion')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const styleInput = new TextInputBuilder()
            .setCustomId('style')
            .setLabel('Qual será o estilo de edit?')
            .setPlaceholder('Exemplo: mangá')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const musicInput = new TextInputBuilder()
            .setCustomId('music')
            .setLabel('Qual música você usará?')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(editorInput),
            new ActionRowBuilder().addComponents(styleInput),
            new ActionRowBuilder().addComponents(musicInput)
        );

        await interaction.showModal(modal);
    }

    if (interaction.customId === 'submit') {
        if (!config.data.event_active) {
            return await interaction.reply({ content: '❌ Evento não está ativo!', ephemeral: true });
        }

        const userId = interaction.user.id;
        const participants = await loadParticipants();

        if (!participants.includes(userId)) {
            return await interaction.reply({ content: '❌ Você precisa participar do evento primeiro!', ephemeral: true });
        }

        if (botPrefs.submissions[userId]) {
            const submission = botPrefs.submissions[userId];
            const embed = new EmbedBuilder()
                .setTitle('Sua Submissão Atual')
                .setDescription(`**Link:** ${submission.link}`)
                .addFields(
                    { name: 'Data de Envio', value: submission.date, inline: true },
                    { name: 'Autor', value: `<@${userId}>`, inline: true }
                )
                .setColor(0x00ff00)
                .setTimestamp();

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('edit_submission')
                        .setLabel('Editar')
                        .setStyle(ButtonStyle.Primary)
                );

            return await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }

        const modal = new ModalBuilder()
            .setCustomId('submit_modal')
            .setTitle('Enviar Edit');

        const linkInput = new TextInputBuilder()
            .setCustomId('link')
            .setLabel('Link do vídeo')
            .setPlaceholder('TikTok, YouTube ou mensagem do Discord')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(linkInput));
        await interaction.showModal(modal);
    }

    if (interaction.customId === 'count') {
        const participants = await loadParticipants();
        const count = participants.length;
        await interaction.reply({ content: `Total de participantes: ${count}`, ephemeral: true });
    }

    if (interaction.customId === 'leave_tournament') {
        const userId = interaction.user.id;
        const participants = await loadParticipants();

        if (participants.includes(userId)) {
            const newParticipants = participants.filter(id => id !== userId);
            await saveParticipants(newParticipants);

            delete botPrefs.submissions[userId];
            await botPrefs.saveToGithub();
            await deleteUserDataFromGithub(userId);

            if (config.data.participant_role_id) {
                try {
                    const role = interaction.guild.roles.cache.get(config.data.participant_role_id);
                    if (role && interaction.member.roles.cache.has(role.id)) {
                        await interaction.member.roles.remove(role);
                        console.log(`Cargo ${role.name} removido de ${interaction.user.tag}`);
                    } else {
                        console.log(`Cargo não encontrado ou usuário não possui o cargo`);
                    }
                } catch (error) {
                    console.error(`Erro ao remover cargo de ${interaction.user.tag}:`, error);
                }
            } else {
                console.log('ID do cargo de participante não configurado');
            }

            await interaction.update({ content: '✅ Você saiu do torneio! O cargo foi removido.', components: [] });
            await updateMenuButtonColor();
        } else {
            await interaction.reply({ content: '❌ Você não está no torneio!', ephemeral: true });
        }
    }

    if (interaction.customId === 'edit_submission') {
        const modal = new ModalBuilder()
            .setCustomId('edit_submit_modal')
            .setTitle('Editar Submissão');

        const linkInput = new TextInputBuilder()
            .setCustomId('link')
            .setLabel('Link do vídeo')
            .setPlaceholder('TikTok, YouTube ou mensagem do Discord')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(botPrefs.submissions[interaction.user.id]?.link || '');

        modal.addComponents(new ActionRowBuilder().addComponents(linkInput));
        await interaction.showModal(modal);
    }
}

async function handleModalSubmit(interaction) {
    if (interaction.customId === 'participate_modal') {
        const userId = interaction.user.id;
        const participants = await loadParticipants();

        if (!participants.includes(userId)) {
            participants.push(userId);
            await saveParticipants(participants);

            const userData = {
                editor: interaction.fields.getTextInputValue('editor'),
                style: interaction.fields.getTextInputValue('style'),
                music: interaction.fields.getTextInputValue('music'),
                joinDate: new Date().toISOString()
            };

            await saveUserData(userId, userData);
            await saveUserDataToGithub(userId, userData);

            if (config.data.participant_role_id) {
                try {
                    const role = interaction.guild.roles.cache.get(config.data.participant_role_id);
                    if (role) {
                        await interaction.member.roles.add(role);
                        console.log(`Cargo ${role.name} adicionado para ${interaction.user.tag}`);
                    } else {
                        console.log(`Cargo com ID ${config.data.participant_role_id} não encontrado`);
                    }
                } catch (error) {
                    console.error(`Erro ao adicionar cargo para ${interaction.user.tag}:`, error);
                }
            } else {
                console.log('ID do cargo de participante não configurado');
            }

            await interaction.reply({ content: '✅ Você foi inscrito no torneio com sucesso! O cargo foi adicionado.', ephemeral: true });
            await updateMenuButtonColor();
        } else {
            await interaction.reply({ content: '❌ Você já está participando do torneio!', ephemeral: true });
        }
    }

    if (interaction.customId === 'submit_modal' || interaction.customId === 'edit_submit_modal') {
        if (!config.data.submission_channel_id) {
            return await interaction.reply({ content: '❌ Canal de submissão não configurado!', ephemeral: true });
        }

        const channel = client.channels.cache.get('1376328774630768701');
        if (!channel) {
            return await interaction.reply({ content: '❌ Canal de submissão não encontrado!', ephemeral: true });
        }

        const link = interaction.fields.getTextInputValue('link');
        const userId = interaction.user.id;

        botPrefs.submissions[userId] = {
            link: link,
            date: new Date().toLocaleDateString('pt-BR'),
            author: interaction.user.id
        };

        await botPrefs.saveToGithub();

        const embed = new EmbedBuilder()
            .setTitle('Nova Submissão')
            .setDescription(`**Link:** ${link}`)
            .setColor(0x00ff00)
            .setAuthor({ 
                name: interaction.user.displayName, 
                iconURL: interaction.user.displayAvatarURL() 
            })
            .setTimestamp();

        await channel.send({ embeds: [embed] });
        
        const action = interaction.customId === 'edit_submit_modal' ? 'editado' : 'enviado';
        await interaction.reply({ content: `✅ Edit ${action} com sucesso!`, ephemeral: true });
    }
}

async function handleSlashCommandWithPermission(interaction) {
    const { commandName } = interaction;

    const adminCommands = [
        'evento_stats',
        'evento_menu', 
        'evento_blacklistcargo',
        'evento_blacklistmembro',
        'enviar_menu',
        'sync_github',
        'evento_avisar',
        'evento_finalizar',
        'final_vote',
        'configurar_cargo_participante',
        'configurar_cargo_admin',
        'configurar_canal_votacao'
    ];

    if (adminCommands.includes(commandName)) {
        if (!hasAdminPermission(interaction)) {
            return await interaction.reply({ 
                content: '❌ Você não tem permissão para usar este comando!', 
                ephemeral: true 
            });
        }
    }

    switch (commandName) {
        case 'configurar_cargo_admin':
            const adminRole = interaction.options.getRole('cargo');
            config.data.admin_role_id = adminRole.id;
            await config.saveConfig();
            await interaction.reply(`✅ Cargo de administrador configurado: ${adminRole.name}`);
            break;

        case 'configurar_cargo_participante':
            const cargo_participante = interaction.options.getRole('cargo');
            config.data.participant_role_id = cargo_participante.id;
            await config.saveConfig();
            await interaction.reply(`✅ Cargo de participante configurado: ${cargo_participante.name}`);
            break;

        case 'evento_stats':
            const ativo = interaction.options.getBoolean('ativo');
            config.data.event_active = ativo;
            await config.saveConfig();
            const status = ativo ? 'ativado' : 'desativado';
            await interaction.reply(`✅ Evento ${status}!`);
            await updateMenuButtonColor();
            break;

        case 'evento_menu':
            const canal = interaction.options.getChannel('canal');
            config.data.menu_channel_id = canal.id;
            await config.saveConfig();
            await createOrUpdateMenu(canal.id);
            await interaction.reply(`✅ Menu configurado para ${canal}!`);
            break;

        case 'evento_blacklistcargo':
            const cargo = interaction.options.getRole('cargo');
            const cargoIndex = config.data.blacklisted_roles.indexOf(cargo.id);
            
            if (cargoIndex === -1) {
                config.data.blacklisted_roles.push(cargo.id);
                await config.saveConfig();
                await interaction.reply(`✅ Cargo ${cargo.name} adicionado à blacklist!`);
            } else {
                config.data.blacklisted_roles.splice(cargoIndex, 1);
                await config.saveConfig();
                await interaction.reply(`✅ Cargo ${cargo.name} removido da blacklist!`);
            }
            break;

        case 'evento_blacklistmembro':
            const membro = interaction.options.getUser('membro');
            const membroIndex = config.data.blacklisted_users.indexOf(membro.id);
            
            if (membroIndex === -1) {
                config.data.blacklisted_users.push(membro.id);
                await config.saveConfig();
                await interaction.reply(`✅ ${membro} adicionado à blacklist!`);
            } else {
                config.data.blacklisted_users.splice(membroIndex, 1);
                await config.saveConfig();
                await interaction.reply(`✅ ${membro} removido da blacklist!`);
            }
            break;

        case 'enviar_menu':
            const canalMenu = interaction.options.getChannel('canal');
            await createOrUpdateMenu(canalMenu.id);
            await interaction.reply(`✅ Menu enviado para ${canalMenu}!`);
            break;

        case 'sync_github':
            const participants = await loadParticipants();
            let syncCount = 0;

            for (const participantId of participants) {
                const userData = await loadUserData(participantId);
                if (userData) {
                    await saveUserDataToGithub(participantId, userData);
                    syncCount++;
                }
            }

            botPrefs.participants = participants;
            await botPrefs.saveToGithub();

            await interaction.reply(`✅ Sincronização com GitHub concluída! ${syncCount} usuários sincronizados.`);
            break;

        case 'evento_avisar':
            const anuncio = interaction.options.getString('anuncio');
            const participantsList = await loadParticipants();
            let sentCount = 0;

            for (const participantId of participantsList) {
                try {
                    const user = client.users.cache.get(participantId) || await client.users.fetch(participantId);
                    if (user) {
                        const embed = new EmbedBuilder()
                            .setTitle('📢 Anúncio do Torneio')
                            .setDescription(anuncio)
                            .setColor(0xff9900)
                            .setTimestamp();

                        await user.send({ embeds: [embed] });
                        sentCount++;
                    }
                } catch (error) {
                    console.error(`Error sending DM to ${participantId}:`, error);
                }
            }

            await interaction.reply(`✅ Anúncio enviado para ${sentCount} participantes!`);
            break;

        case 'evento_finalizar':
            if (botPrefs.menu_message_id && botPrefs.menu_channel_id) {
                const channel = client.channels.cache.get(botPrefs.menu_channel_id);
                if (channel) {
                    try {
                        const message = await channel.messages.fetch(botPrefs.menu_message_id);
                        const disabledRow = createTournamentView(true);
                        await message.edit({ components: [disabledRow] });
                    } catch (error) {
                        console.error('Error updating menu message:', error);
                    }
                }
            }

            config.data.event_active = false;
            config.data.voting_active = false;
            await config.saveConfig();

            const finalParticipants = await loadParticipants();
            
            await saveParticipants([]);
            botPrefs.submissions = {};
            await botPrefs.saveToGithub();

            if (config.data.participant_role_id) {
                try {
                    const role = interaction.guild.roles.cache.get(config.data.participant_role_id);
                    if (role) {
                        const membersWithRole = role.members;
                        for (const [memberId, member] of membersWithRole) {
                            try {
                                await member.roles.remove(role);
                                console.log(`Cargo removido de ${member.user.tag}`);
                            } catch (error) {
                                console.error(`Erro ao remover cargo de ${member.user.tag}:`, error);
                            }
                        }
                    }
                } catch (error) {
                    console.error('Erro ao remover cargos:', error);
                }
            }

            await interaction.reply(`✅ Evento finalizado! ${finalParticipants.length} participantes tiveram seus dados limpos e cargos removidos.`);
            await updateMenuButtonColor();
            break;

        case 'final_vote':
            if (Object.keys(botPrefs.submissions).length === 0) {
                return await interaction.reply('❌ Não há submissões para votar!');
            }

            if (!config.data.voting_channel_id) {
                return await interaction.reply('❌ Canal de votação não configurado!');
            }

            // Debug: log id e tipo
            console.log('Tentando buscar canal de votação:', config.data.voting_channel_id, typeof config.data.voting_channel_id);

            let votingChannel = client.channels.cache.get(String(config.data.voting_channel_id));
            if (!votingChannel) {
                try {
                    votingChannel = await client.channels.fetch(String(config.data.voting_channel_id));
                } catch (e) {
                    console.error('Erro ao buscar canal com fetch:', e);
                    votingChannel = null;
                }
            }
            if (!votingChannel) {
                console.error('Canal não encontrado nem no cache nem no fetch:', config.data.voting_channel_id);
                return await interaction.reply('❌ Canal de votação não encontrado!');
            }
            // Verifica se é canal de texto
            if (votingChannel.type !== ChannelType.GuildText && votingChannel.type !== 0) {
                console.error('Canal encontrado, mas não é de texto:', votingChannel.id, votingChannel.type);
                return await interaction.reply('❌ O canal de votação não é um canal de texto!');
            }

            config.data.voting_active = true;
            await config.saveConfig();

            const submissions = Object.entries(botPrefs.submissions);
            let voteMessage = "🗳️ **VOTAÇÃO FINAL**\n\n";
            
            const reactions = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
            
            for (let i = 0; i < submissions.length && i < 10; i++) {
                const [userId, submission] = submissions[i];
                const user = client.users.cache.get(userId) || await client.users.fetch(userId);
                voteMessage += `${reactions[i]} **${user.displayName}**\n${submission.link}\n\n`;
            }

            voteMessage += "Reaja com o emoji correspondente para votar!";

            const embed = new EmbedBuilder()
                .setTitle('🗳️ Votação do Torneio')
                .setDescription(voteMessage)
                .setColor(0xff0000)
                .setTimestamp();

            const votingMsg = await votingChannel.send({ embeds: [embed] });

            for (let i = 0; i < submissions.length && i < 10; i++) {
                await votingMsg.react(reactions[i]);
            }

            await interaction.reply('✅ Votação iniciada!');
            await updateMenuButtonColor();
            break;

        default:
            await interaction.reply('❌ Comando não reconhecido!');
    }
}

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    
    if (message.channel.id === config.data.submission_channel_id) {
        await safeExecute(async () => {
            await message.react('👍');
            await message.react('👎');
        }, 'Error adding reactions to submission');
    }
});

client.on('guildMemberAdd', member => {
    console.log(`${member.user.tag} joined the server`);
});

client.on('guildMemberRemove', async member => {
    console.log(`${member.user.tag} left the server`);
    
    const participants = await loadParticipants();
    if (participants.includes(member.id)) {
        const newParticipants = participants.filter(id => id !== member.id);
        await saveParticipants(newParticipants);
        
        delete botPrefs.submissions[member.id];
        await botPrefs.saveToGithub();
        await deleteUserDataFromGithub(member.id);
        
        await updateMenuButtonColor();
        console.log(`Removed ${member.user.tag} from tournament due to leaving server`);
    }
});

client.on('error', error => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully...');
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    client.destroy();
    process.exit(0);
});

console.log('ID do cargo lido do config:', config.data.participant_role_id);
console.log('Tipo do ID:', typeof config.data.participant_role_id);
client.login(process.env.DISCORD_TOKEN);
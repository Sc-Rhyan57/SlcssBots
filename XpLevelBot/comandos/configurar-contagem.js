const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('configurar-contagem')
        .setDescription('Configura o sistema de contagem do servidor')
        .addSubcommand(subcommand =>
            subcommand
                .setName('iniciar')
                .setDescription('Inicia o sistema de contagem em um canal')
                .addChannelOption(option =>
                    option
                        .setName('canal')
                        .setDescription('Canal onde a contagem acontecerá')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('numero-inicial')
                        .setDescription('Número para começar a contagem (padrão: 1)')
                        .setRequired(false)
                        .setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('parar')
                .setDescription('Para o sistema de contagem')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Mostra o status atual da contagem')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Reseta a contagem para o número 1')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, helpers) {
        const { getGitHubFile, updateGitHubFile } = helpers;
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        switch (subcommand) {
            case 'iniciar':
                await this.handleStart(interaction, guildId, getGitHubFile, updateGitHubFile);
                break;
            case 'parar':
                await this.handleStop(interaction, guildId, getGitHubFile, updateGitHubFile);
                break;
            case 'status':
                await this.handleStatus(interaction, guildId, getGitHubFile);
                break;
            case 'reset':
                await this.handleReset(interaction, guildId, getGitHubFile, updateGitHubFile);
                break;
        }
    },

    async handleStart(interaction, guildId, getGitHubFile, updateGitHubFile) {
        const channel = interaction.options.getChannel('canal');
        const startNumber = interaction.options.getInteger('numero-inicial') || 1;

        const countingData = await getGitHubFile('counting.json');
        
        if (!countingData[guildId]) {
            countingData[guildId] = {};
        }

        countingData[guildId] = {
            channelId: channel.id,
            currentNumber: startNumber,
            lastUserId: null,
            totalCount: 0,
            enabled: true,
            records: {
                highest: startNumber,
                fails: 0
            }
        };

        await updateGitHubFile('counting.json', countingData);

        const embed = new EmbedBuilder()
            .setTitle('🔢 Sistema de Contagem Configurado!')
            .setDescription(`Canal de contagem definido para ${channel}`)
            .addFields(
                { name: 'Número Inicial', value: startNumber.toString(), inline: true },
                { name: 'Canal', value: channel.toString(), inline: true }
            )
            .setColor('#00ff00')
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

        // Enviar mensagem inicial no canal
        const startEmbed = new EmbedBuilder()
            .setTitle('🎯 Contagem Iniciada!')
            .setDescription(`A contagem começou! Envie o número **${startNumber}** para iniciar.`)
            .setColor('#0099ff')
            .setTimestamp();

        await channel.send({ embeds: [startEmbed] });
    },

    async handleStop(interaction, guildId, getGitHubFile, updateGitHubFile) {
        const countingData = await getGitHubFile('counting.json');
        
        if (!countingData[guildId] || !countingData[guildId].enabled) {
            return await interaction.reply({ 
                content: '❌ Não há sistema de contagem ativo neste servidor.', 
                ephemeral: true 
            });
        }

        countingData[guildId].enabled = false;
        await updateGitHubFile('counting.json', countingData);

        const embed = new EmbedBuilder()
            .setTitle('🛑 Sistema de Contagem Parado')
            .setDescription('O sistema de contagem foi desativado.')
            .setColor('#ff0000')
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },

    async handleStatus(interaction, guildId, getGitHubFile) {
        const countingData = await getGitHubFile('counting.json');
        
        if (!countingData[guildId]) {
            return await interaction.reply({ 
                content: '❌ Sistema de contagem não configurado neste servidor.', 
                ephemeral: true 
            });
        }

        const data = countingData[guildId];
        const channel = interaction.guild.channels.cache.get(data.channelId);

        const embed = new EmbedBuilder()
            .setTitle('📊 Status da Contagem')
            .addFields(
                { name: 'Canal', value: channel ? channel.toString() : 'Canal não encontrado', inline: true },
                { name: 'Número Atual', value: data.currentNumber.toString(), inline: true },
                { name: 'Status', value: data.enabled ? '🟢 Ativo' : '🔴 Inativo', inline: true },
                { name: 'Total Contado', value: data.totalCount.toString(), inline: true },
                { name: 'Record Máximo', value: data.records.highest.toString(), inline: true },
                { name: 'Falhas Totais', value: data.records.fails.toString(), inline: true }
            )
            .setColor(data.enabled ? '#00ff00' : '#ff0000')
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },

    async handleReset(interaction, guildId, getGitHubFile, updateGitHubFile) {
        const countingData = await getGitHubFile('counting.json');
        
        if (!countingData[guildId]) {
            return await interaction.reply({ 
                content: '❌ Sistema de contagem não configurado neste servidor.', 
                ephemeral: true 
            });
        }

        countingData[guildId].currentNumber = 1;
        countingData[guildId].lastUserId = null;
        countingData[guildId].totalCount = 0;

        await updateGitHubFile('counting.json', countingData);

        const embed = new EmbedBuilder()
            .setTitle('🔄 Contagem Resetada')
            .setDescription('A contagem foi resetada para o número 1.')
            .setColor('#ffff00')
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

        // Notificar no canal de contagem
        const channel = interaction.guild.channels.cache.get(countingData[guildId].channelId);
        if (channel) {
            const resetEmbed = new EmbedBuilder()
                .setTitle('🔄 Reset!')
                .setDescription('A contagem foi resetada! Próximo número: **1**')
                .setColor('#ffff00')
                .setTimestamp();

            await channel.send({ embeds: [resetEmbed] });
        }
    },

    async handleCountingMessage(message, guildData, helpers) {
        const { getGitHubFile, updateGitHubFile } = helpers;
        
        if (!guildData.enabled) return;

        const messageContent = message.content.trim();
        const expectedNumber = guildData.currentNumber;
        const userNumber = parseInt(messageContent);

        // Verificar se é um número válido
        if (isNaN(userNumber) || userNumber.toString() !== messageContent) {
            await message.delete().catch(() => {});
            await this.sendFailMessage(message, guildData, 'Envie apenas números!', helpers);
            return;
        }

        // Verificar se é o número correto
        if (userNumber !== expectedNumber) {
            await message.delete().catch(() => {});
            await this.sendFailMessage(message, guildData, `Número errado! O próximo número é **${expectedNumber}**`, helpers);
            return;
        }

        await message.react('✅').catch(() => {});

        const countingData = await getGitHubFile('counting.json');
        const newData = countingData[message.guild.id];
        
        newData.currentNumber = expectedNumber + 1;
        newData.lastUserId = message.author.id;
        newData.totalCount++;
        
        if (expectedNumber > newData.records.highest) {
            newData.records.highest = expectedNumber;
        }

        await updateGitHubFile('counting.json', countingData);

        // Milestones especiais
        if (expectedNumber % 100 === 0) {
            const embed = new EmbedBuilder()
                .setTitle('🎉 Milestone Alcançado!')
                .setDescription(`Parabéns! Vocês chegaram ao número **${expectedNumber}**!`)
                .setColor('#gold')
                .setTimestamp();

            await message.channel.send({ embeds: [embed] });
        }
    },

    async sendFailMessage(message, guildData, reason, helpers) {
        const { getGitHubFile, updateGitHubFile } = helpers;
        
        const embed = new EmbedBuilder()
            .setTitle('❌ Erro na Contagem!')
            .setDescription(reason)
            .addFields(
                { name: 'Próximo Número', value: guildData.currentNumber.toString(), inline: true },
                { name: 'Usuário', value: message.author.toString(), inline: true }
            )
            .setColor('#ff0000')
            .setTimestamp();

        const failMessage = await message.channel.send({ embeds: [embed] });

        // Deletar a mensagem de erro após 5 segundos
        setTimeout(async () => {
            await failMessage.delete().catch(() => {});
        }, 5000);

        // Atualizar contador de falhas
        const countingData = await getGitHubFile('counting.json');
        countingData[message.guild.id].records.fails++;
        await updateGitHubFile('counting.json', countingData);

        // Reset da contagem em caso de erro
        countingData[message.guild.id].currentNumber = 1;
        countingData[message.guild.id].lastUserId = null;
        await updateGitHubFile('counting.json', countingData);
    }
};
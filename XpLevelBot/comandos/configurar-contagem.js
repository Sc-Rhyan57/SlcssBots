const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const countingChannels = new Map();
const countingCooldowns = new Map();

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
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        switch (subcommand) {
            case 'iniciar':
                await this.handleStart(interaction, guildId);
                break;
            case 'parar':
                await this.handleStop(interaction, guildId);
                break;
            case 'status':
                await this.handleStatus(interaction, guildId);
                break;
            case 'reset':
                await this.handleReset(interaction, guildId);
                break;
        }
    },

    async handleStart(interaction, guildId) {
        const channel = interaction.options.getChannel('canal');
        const startNumber = interaction.options.getInteger('numero-inicial') || 1;

        countingChannels.set(channel.id, {
            guildId: guildId,
            channelId: channel.id,
            enabled: true,
            currentNumber: startNumber,
            records: {
                fails: 0
            }
        });

        countingCooldowns.delete(channel.id);

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

        const startEmbed = new EmbedBuilder()
            .setTitle('🎯 Contagem Iniciada!')
            .setDescription(`A contagem começou! Envie o número **${startNumber}** para iniciar.`)
            .setColor('#0099ff')
            .setTimestamp();

        await channel.send({ embeds: [startEmbed] });
    },

    async handleStop(interaction, guildId) {
        const guildChannels = Array.from(countingChannels.entries())
            .filter(([channelId, data]) => data.guildId === guildId);
        
        if (guildChannels.length === 0) {
            return await interaction.reply({ 
                content: '❌ Não há sistema de contagem ativo neste servidor.', 
                ephemeral: true 
            });
        }

        guildChannels.forEach(([channelId, data]) => {
            countingChannels.delete(channelId);
            countingCooldowns.delete(channelId);
        });

        const embed = new EmbedBuilder()
            .setTitle('🛑 Sistema de Contagem Parado')
            .setDescription('O sistema de contagem foi desativado.')
            .setColor('#ff0000')
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },

    async handleStatus(interaction, guildId) {
        const guildChannels = Array.from(countingChannels.entries())
            .filter(([channelId, data]) => data.guildId === guildId);
        
        if (guildChannels.length === 0) {
            return await interaction.reply({ 
                content: '❌ Sistema de contagem não configurado neste servidor.', 
                ephemeral: true 
            });
        }

        const [channelId, data] = guildChannels[0];
        const channel = interaction.guild.channels.cache.get(channelId);
        
        const embed = new EmbedBuilder()
            .setTitle('📊 Status da Contagem')
            .addFields(
                { name: 'Canal', value: channel ? channel.toString() : 'Canal não encontrado', inline: true },
                { name: 'Próximo Número', value: data.currentNumber.toString(), inline: true },
                { name: 'Status', value: '🟢 Ativo', inline: true },
                { name: 'Falhas Totais', value: data.records.fails.toString(), inline: true }
            )
            .setColor('#00ff00')
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },

    async handleReset(interaction, guildId) {
        const guildChannels = Array.from(countingChannels.entries())
            .filter(([channelId, data]) => data.guildId === guildId);
        
        if (guildChannels.length === 0) {
            return await interaction.reply({ 
                content: '❌ Sistema de contagem não configurado neste servidor.', 
                ephemeral: true 
            });
        }

        const [channelId, data] = guildChannels[0];
        const channel = interaction.guild.channels.cache.get(channelId);

        data.currentNumber = 1;
        countingChannels.set(channelId, data);
        countingCooldowns.delete(channelId);

        const embed = new EmbedBuilder()
            .setTitle('🔄 Contagem Resetada')
            .setDescription('A contagem foi resetada para o número 1.')
            .setColor('#ffff00')
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

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
        const channelData = countingChannels.get(message.channel.id);
        
        if (!channelData || !channelData.enabled) return;

        const cooldownKey = `${message.channel.id}-${channelData.currentNumber}`;
        const now = Date.now();
        
        if (countingCooldowns.has(cooldownKey)) {
            const cooldownEnd = countingCooldowns.get(cooldownKey);
            if (now < cooldownEnd) {
                await message.delete().catch(() => {});
                return;
            }
        }

        const messageContent = message.content.trim();
        
        if (!/^\d+$/.test(messageContent)) {
            await message.delete().catch(() => {});
            await this.sendFailMessage(message, channelData, 'Envie apenas números, sem texto adicional!');
            return;
        }

        const userNumber = parseInt(messageContent);

        if (isNaN(userNumber)) {
            await message.delete().catch(() => {});
            await this.sendFailMessage(message, channelData, 'Número inválido!');
            return;
        }

        if (userNumber !== channelData.currentNumber) {
            await message.delete().catch(() => {});
            await this.sendFailMessage(message, channelData, `Número errado! O próximo número é **${channelData.currentNumber}**`);
            return;
        }

        countingCooldowns.set(cooldownKey, now + 500);
        
        await message.react('✅').catch(() => {});
        
        channelData.currentNumber++;
        countingChannels.set(message.channel.id, channelData);

        setTimeout(() => {
            countingCooldowns.delete(cooldownKey);
        }, 1000);

        if (userNumber % 100 === 0) {
            const embed = new EmbedBuilder()
                .setTitle('🎉 Milestone Alcançado!')
                .setDescription(`Parabéns ${message.author}! Vocês chegaram ao número **${userNumber}**!`)
                .setColor(0xFFD700)
                .setTimestamp();

            await message.channel.send({ embeds: [embed] });
        }
    },

    async handleMessageUpdate(oldMessage, newMessage) {
        const channelData = countingChannels.get(newMessage.channel.id);
        
        if (!channelData || !channelData.enabled) return;
        
        if (/^\d+/.test(oldMessage.content.trim()) || /^\d+/.test(newMessage.content.trim())) {
            await newMessage.delete().catch(() => {});
            await this.sendFailMessage(newMessage, channelData, 'Mensagens editadas não são permitidas na contagem!');
        }
    },

    async sendFailMessage(message, channelData, reason) {
        const embed = new EmbedBuilder()
            .setTitle('❌ Erro na Contagem!')
            .setDescription(reason)
            .addFields(
                { name: 'Próximo Número', value: channelData.currentNumber.toString(), inline: true },
                { name: 'Usuário', value: message.author.toString(), inline: true }
            )
            .setColor('#ff0000')
            .setTimestamp();

        const failMessage = await message.channel.send({ embeds: [embed] });

        setTimeout(async () => {
            await failMessage.delete().catch(() => {});
        }, 5000);

        channelData.records.fails++;
        countingChannels.set(message.channel.id, channelData);
    }
};
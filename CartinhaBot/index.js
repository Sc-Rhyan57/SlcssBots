const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config.js');
const axios = require('axios');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

let bannedWords = [];

async function loadBannedWords() {
    try {
        const [response1, response2] = await Promise.all([
            axios.get(''),
            axios.get('')
        ]);
        
        const processWords = (data) => {
            return data.split(/[\n\r,]/)
                .map(word => word.trim().toLowerCase())
                .filter(word => word && word.length > 0);
        };
        
        const words1 = processWords(response1.data);
        const words2 = processWords(response2.data);
        
        bannedWords = [...words1, ...words2];
        console.log(`Carregadas ${bannedWords.length} palavras banidas`);
    } catch (error) {
        console.log('Erro ao carregar palavras banidas:', error.message);
    }
}

function containsBannedWords(message) {
    const messageLower = message.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ');
    
    return bannedWords.some(word => {
        const cleanWord = word.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return messageLower.includes(cleanWord) || 
               messageLower.split(/\s+/).some(w => w === cleanWord);
    });
}

async function getHeartImage() {
    try {
        const response = await axios.get('https://api.unsplash.com/photos/random', {
            params: {
                query: 'heart love pink',
                orientation: 'squarish'
            },
            headers: {
                'Authorization': `Client-ID ${config.unsplashAccessKey}`
            }
        });
        return response.data.urls.small;
    } catch (error) {
        return 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=400&h=400&fit=crop';
    }
}

client.on('ready', async () => {
    console.log(`Bot logado como ${client.user.tag}`);
    await loadBannedWords();
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const content = message.content.toLowerCase();
    
    if (content.startsWith('d!cartinha ') || content.startsWith('D!cartinha ')) {
        try {
            await message.delete();
        } catch (error) {
            console.log('Erro ao deletar mensagem:', error.message);
        }
        
        const loveMessage = message.content.slice(11).trim();
        
        if (!loveMessage) {
            const errorMsg = await message.channel.send('Por favor, escreva uma mensagem para enviar!');
            setTimeout(() => errorMsg.delete().catch(() => {}), 5000);
            return;
        }
        
        if (containsBannedWords(loveMessage)) {
            const errorMsg = await message.channel.send('Sua mensagem contém palavras inadequadas e não pode ser enviada.');
            setTimeout(() => errorMsg.delete().catch(() => {}), 5000);
            return;
        }
        
        try {
            const guild = message.guild;
            const targetChannel = guild.channels.cache.get(config.loveChannelId);
            
            if (!targetChannel) {
                const errorMsg = await message.channel.send('Canal de cartinhas não configurado!');
                setTimeout(() => errorMsg.delete().catch(() => {}), 5000);
                return;
            }
            
            const member = guild.members.cache.get(message.author.id);
            if (member && config.loveRoleId) {
                await member.roles.add(config.loveRoleId);
            }
            
            const heartImage = await getHeartImage();
            
            const webhook = await targetChannel.createWebhook({
                name: 'Cupido do Amor',
                avatar: heartImage
            });
            
            const embed = {
                title: `${config.loveEmoji} Cartinha de Amor!`,
                description: loveMessage,
                color: 0xFF69B4,
                thumbnail: {
                    url: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=200&h=200&fit=crop'
                },
                footer: {
                    text: 'Ass: Admirador Secreto 💝'
                },
                timestamp: new Date()
            };

            const webhookMessage = await webhook.send({
                embeds: [embed]
            });
            
            await webhookMessage.react(config.loveEmoji);
            
            await webhook.delete();
            
        } catch (error) {
            console.log('Erro ao enviar cartinha:', error);
            const errorMsg = await message.channel.send('Erro ao enviar a cartinha. Tente novamente!');
            setTimeout(() => errorMsg.delete().catch(() => {}), 5000);
        }
    }
});

client.login(config.token);
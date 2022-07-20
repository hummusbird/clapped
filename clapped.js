let { Client: DiscordClient, Message, MessageEmbed, MessageAttachment } = require('discord.js'),
    fs = require('fs'),
    { config: loadEnv } = require('dotenv')
loadEnv()

let client = new DiscordClient();

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    let guilds = client.guilds.cache.map(guild => guild);
    console.log(`The bot is in ${guilds.length} guilds`);
});


let [arg] = process.argv.slice(2);
let token = process.env.BOT_TOKEN;
if (arg == "--dev") { token = process.env.DEV_TOKEN }
client.login(token);
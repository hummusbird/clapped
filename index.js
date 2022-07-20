let { Client: DiscordClient, Message, MessageEmbed, MessageAttachment } = require('discord.js'),
    fs = require('fs'),
    { config: loadEnv } = require('dotenv')
loadEnv()

let delay = ms => new Promise(res => setTimeout(res, ms));

let client = new DiscordClient();

let guildSettings = []

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    let guilds = client.guilds.cache.map(guild => guild);
    console.log(`The bot is in ${guilds.length} guilds`);

    console.log("\x1b[35m%s\x1b[0m", `Loading guild settings:`)
    for(let guild of guilds) {
        let exists = fs.existsSync(`${guild.id}_config.json`)
        await (exists ? loadConfig(guild) : createConfig(guild))
    }
});

client.on('guildCreate', async guild => {
    console.log("\x1b[32m", `Joined new guild: ${guild.name}`)
    let exists = fs.existsSync(`configs/${guild.id}_config.json`)
    await (exists ? loadConfig(guild) : createConfig(guild))
})

client.on('guildDelete', async guild => {
    console.log("\x1b[31m", `Kicked from Guild: ${guild.name}`)
})

// Config Functions

async function createConfig(guild) {
    console.log("\x1b[33m%s\x1b[0m",`Guild ${guild.name} does not have settings file, Creating...`)

    var config = {
        guildID: guild.id,
        prefix: "~"
    }

    fs.appendFile(`configs/${guild.id}_config.json`, JSON.stringify(config), function (err) {
        if (err) throw err;
        console.log('Saved!')
        loadConfig(guild)
    })

    const newconfig = guildSettings.find(config => config.guildID == guild.id)
    if (!fs.existsSync(`configs/${guild.id}_censored.txt`))
    {
        fs.writeFileSync(`configs/${guild.id}_censored.txt`, 'nword', function (err) {
            if (err) throw err;
            console.log("\x1b[33m%s\x1b[0m","No Censor list. Creating...")
        })
    }
    console.log("\x1b[32m%s\x1b[0m",`${guild.name} successfully created.`)
}

async function loadConfig(guild) {
    console.log(`loading ${guild.name} config file.`)
    if (guildSettings.find(config => config.guildID == guild.id)){
        var index = guildSettings.indexOf(guild)
        var data = fs.readFileSync(`configs/${guild.id}_config.json`, 'utf8')
        guildSettings[index] = JSON.parse(data)
        console.log("\x1b[33m%s\x1b[0m",`${guild.name} reloaded`)
    }
    else {
        try {
            var data = fs.readFileSync(`configs/${guild.id}_config.json`, 'utf8')
            guildSettings.push(JSON.parse(data))
            console.log("\x1b[32m%s\x1b[0m",`configs/${guild.name} successfully loaded.`)
        } 
        catch(error) {
            console.log(error);
            return -1
        }
    }
    
}

let [arg] = process.argv.slice(2);
let token = process.env.BOT_TOKEN;
if (arg == "--dev") { token = process.env.DEV_TOKEN }
client.login(token);
let { Client: DiscordClient, Message, MessageEmbed, MessageAttachment } = require('Discord.js'),
    fs = require('fs'),
    ytdl = require("ytdl-core"),
    moment = require('moment'),
    ytAPI = require('youtube-search-api'),
    { config: loadEnv } = require('dotenv')

loadEnv()

let guildSettings = []

let client = new DiscordClient();

/** @type {Map<string, any>} */
let queue = new Map();

/** 
 * Waits a set amount of time before continuing
 * @param {number} ms - Time in milliseconds to delay 
 * 
*/
let delay = ms => new Promise(res => setTimeout(res, ms));

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
    let exists = fs.existsSync(`${guild.id}_config.json`)
    await (exists ? loadConfig(guild) : createConfig(guild))
})

client.on('guildDelete', async guild => {
    console.log("\x1b[31m", `Kicked from Guild: ${guild.name}`)
})

// CONFIG FUNCTIONS

async function createConfig(e) {
    console.log("\x1b[33m%s\x1b[0m",`Guild ${e.name} does not have settings file, Creating....`)
    
    var logChannel = e.channels.cache.find(logChannel => logChannel.name == "logs")
    var loggingEnabled = true
    if (!logChannel) { logChannel = null; loggingEnabled = false}
    
    var config = {
        guildID: e.id,
        prefix: "~",

        logChannel: logChannel,
        loggingEnabled: loggingEnabled,

        noPermsReply: "```diff\n- You don't have the required permissions.```",
        
        welcomeTitle: "{member} has joined the server!",
        welcomeMessage: "Welcome to {server}!",
        welcomeEnabled: true,

        leaveMessage: "{member} has abandonded {server}!",
        leaveEnabled: true,
        mutedRole: e.roles.cache.find(mutedRole => mutedRole.name == "Muted"),

        autoRole: false
    }

    fs.appendFile(`${e.id}_config.json`, JSON.stringify(config), function (err) {
        if (err) throw err;
        console.log('Saved!')
        loadConfig(e)
    })

    //muted role shit

    var mutedRole = e.roles.cache.find(mutedRole => mutedRole.name == "Muted")
    if (!mutedRole) {
        try {
        console.log("\x1b[33m%s\x1b[0m","No muted role. Creating...")
        mutedRole = await e.roles.create({
            data: {
                name: "Muted",
                color: '#262626',
                permissions: 37031488
            }
        })
        } 
        catch{
            console.log("\x1b[31m%s\x1b[0m", `Error creating muted role in ${e.name}, bot most likely doesn't have permission.`)
        }
    }
    else if (mutedRole.permissions.bitfield != 37031488){
        mutedRole.setPermissions(37031488)
        .catch(function() {
            console.log("\x1b[31m%s\x1b[0m", `Error modifying mutedrole's permissions in ${e.name}, bot most likely doesn't have permission.`)
        })
        console.log("\x1b[33m%s\x1b[0m", `Changed Muted role's permissions in ${e.name}`)
    }
    const channels = e.channels.cache.map(channel => channel);
    if (mutedRole) { for ( const channel of channels ) {
        mutedPermissionOverwrite = channel.permissionOverwrites.get(mutedRole.id)
        if (!mutedPermissionOverwrite || (mutedPermissionOverwrite && mutedPermissionOverwrite.deny.bitfield != 2160704)) {
            channel.updateOverwrite( mutedRole, {
                SEND_MESSAGES: false,
                SPEAK: false,
                SEND_TTS_MESSAGES: false,
                ADD_REACTIONS: false,
                EMBED_LINKS: false,
                ATTACH_FILES: false,
                MANAGE_MESSAGES: false
            })
                .catch(function() {
                    console.log("\x1b[31m%s\x1b[0m", `Error modifying channel permissions for #${channel.name} in ${e.name}, bot most likely doesn't have permission.`)
                })
                .then(console.log("\x1b[33m%s\x1b[0m", `Changed permissions in #${channel.name}`))
        }
    }}

    const newconfig = guildSettings.find(config => config.guildID == e.id)
    if (newconfig && !newconfig.mutedRole){
        console.log("\x1b[33m%s\x1b[0m", `${e.name} doesn't have muted role attached to config. Modifying...`)
        newconfig.mutedRole = mutedRole
        writeConfig(newconfig, e)
    }

    if (!fs.existsSync(`${e.id}_censored.txt`))
    {
        fs.writeFileSync(`${e.id}_censored.txt`, 'nword', function (err) {
            if (err) throw err;
            console.log("\x1b[33m%s\x1b[0m","No Censor list. Creating...")
        })
    }
    console.log("\x1b[32m%s\x1b[0m",`${e.name} successfully created.`)
}

async function loadConfig(e) {
    console.log(`loading ${e.name} config file.`)
    if (guildSettings.find(config => config.guildID == e.id)){
        var index = guildSettings.indexOf(e)
        var data = fs.readFileSync(`${e.id}_config.json`, 'utf8')
        guildSettings[index] = JSON.parse(data)
        console.log("\x1b[33m%s\x1b[0m",`${e.name} reloaded`)
    }
    else {
        try {
            var data = fs.readFileSync(`${e.id}_config.json`, 'utf8')
            guildSettings.push(JSON.parse(data))
            console.log("\x1b[32m%s\x1b[0m",`${e.name} successfully loaded.`)
        } 
        catch(error) {
            console.log(error);
            return -1
        }
    }
    
}

function writeConfig(config, guild){
    fs.writeFile(`${guild.id}_config.json`, JSON.stringify(config), function (err) {
        if (err) throw err;
        console.log(`Saved new config for ${guild.name}`)
        loadConfig(guild)
    })
}

/** 
 * @param {Message} msg 
 * @param {"ban"|"kick"|"delete", "mute", "unmute", "purge", "config", "censor", "uncensor", "nick"} action
 * */
function log(mod, user, action, msg){
    const config = guildSettings.find(config => config.guildID == msg.guild.id)
    if (!config.loggingEnabled) return

    /** @typedef {{colour?: string, title?: string, fielddata?: string}} LogMessage */
    /** @type {LogMessage} */
    let defaultActions = {
        colour: "#000000",
        title: `${action} ${user.tag}`,
        fielddata: `performed by ${mod.tag}`
    }

    /** @enum {LogMessage} */
    let Actions = {
        'ban': {
            ...defaultActions,
            colour: '#ff3838',
        },
        'kick': { 
            ...defaultActions,
            colour: '#ff3838'
        },
        'delete': {
            ...defaultActions,
            colour: '#ff8e38',
            title: "Deleted message",
            fielddata: "Censored by bot"
        },
        'mute': {
            ...defaultActions,
            colour: '#ffd138',
        },
        'unmute': {
            ...defaultActions,
            colour: '#68d629',
        },
        'purge': {
            ...defaultActions,
            colour: '#34ebc3',
            title: `purged ${msg.channel.name}`,
        },
        'config': {
            ...defaultActions,
            colour: '#fff',
        },
        'censor': {
            ...defaultActions,
            colour: '#ff3838',
            title: "Censored phrase"
        },
        'uncensor': {
            ...defaultActions,
            colour: '#68d629',
            title: "Uncensored phrase"
        },
        'nick': {
            ...defaultActions,
            colour: '#f42069',
            title: 'Changed nickname',
        }
    }

    // /** @type {Map<Actions, LogMessage>} */
    // let actions = new Map()
    let {colour, title, fielddata} = Actions[action]

    const logEmbed = new MessageEmbed()
        .setThumbnail(user.avatarURL())
        .setColor(colour)
        .setTitle(title)
        .addFields(
            { name: fielddata, value: msg },
        )
        .setTimestamp()
    logChannel = msg.guild.channels.cache.find(logChannel => config.logChannel.id == logChannel.id)
    logChannel.send(logEmbed)
}

function noPerms(message, config){
    return(config.noPermsReply.replace('{member}', message.member.user.username).replace('{server}', message.member.guild.name))
}

client.on('guildMemberAdd', async member => {
    const config = guildSettings.find(config => config.guildID == member.guild.id)
    if (config.welcomeEnabled && member.guild.systemChannel != null){

        var greetingEmbed = new MessageEmbed()
            .setColor('#000000')
            .setTitle(config.welcomeTitle.replace('{member}', member.user.username).replace('{server}', member.guild.name))
            .setDescription(config.welcomeMessage.replace('{member}', member.user.username).replace('{server}', member.guild.name))
            .setThumbnail(member.user.displayAvatarURL( { size: 1024 } ))
            .setTimestamp()

        member.guild.systemChannel.send(greetingEmbed)
    }
    
    if (config.autoRole) {
        console.log(`Adding autorole to new members in ${member.guild}!`)
        var role = member.guild.roles.cache.find(role => config.autoRole.id == role.id)
        member.roles.add(role)
        .catch(function() {
            console.log(`autorole failed to add, most likely deleted.`)
        })

    }
})

client.on ('guildMemberRemove', async member => {
    const config = guildSettings.find(config => config.guildID == member.guild.id)
    if (config.leaveEnabled && member.guild.systemChannel != null){
        member.guild.systemChannel.send(config.leaveMessage.replace('{member}', member.user.username).replace('{server}', member.guild.name))
    }
})

client.on('message', async message => {
    if (!message.guild || message.author.bot) return;
    const config = guildSettings.find(config => config.guildID == message.guild.id)
    var censored;
    try {
        censored = fs.readFileSync(`${message.guild.id}_censored.txt`, 'utf8').replace(/\r?|\r/g, "").split("\n")
    } 
    catch(error) {
        console.log(`Error reading ${message.guild.name} censor list`);
    }

    const serverQueue = queue.get(message.guild.id);
    var msgArray = message.content.split(" ");

    // AUDIO SHIT

    if (message.content.startsWith(config.prefix + "play")){
        execute(message, serverQueue);
        return;
    }
    else if (message.content.startsWith(config.prefix + "skip")){
        skip(message, serverQueue)            
        return;
    }
    else if (message.content.startsWith(config.prefix + "stop") || message.content.startsWith(config.prefix + "fuckoff") || message.content.startsWith(config.prefix + "dc")) {
        stop(message, serverQueue)
        return;
    }
    else if (message.content.startsWith(config.prefix + "queue")){
        printQueue(message, serverQueue)
        return;
    }

    // BORING

    else if (message.content == (config.prefix + "ping")){
        message.channel.send("pong!")
    }
    
    else if (message.content == (config.prefix + "servers")) {
        let guilds = client.guilds.cache.map(guild => guild);
        message.channel.send(`\`\`\`diff\n+ This bot is in ${guilds.length} servers:\n- ${guilds.join('\n- ')}\`\`\``)
    }

    else if (message.content == (config.prefix + "uptime")){
        var time = moment.duration(moment().diff(message.client.readyAt))
        message.channel.send(`This bot has been up for ${time.days()} days, ${time.hours()} hours, ${time.minutes()} minutes and ${time.seconds()} seconds`)
    }

    else if (message.content.startsWith(config.prefix + "status")) {
        if (message.author.id == 403609667722412054 /* HughTB */ || message.author.id == 375671695240855553 /* hummusbird */|| message.author.id == 823957283213148172 /* rookie */) {
            var status = msgArray[1]
            var statusType = msgArray[2]
            var words = message.content.split(statusType)[1].trim()

            if ((status == "online" || status == "idle" || status == "dnd" || status == "invisible") && (statusType == "STREAMING" || statusType == "LISTENING" || statusType == "PLAYING" || statusType == "WATCHING" || statusType == "COMPETING")) {

                if (statusType == "STREAMING" || statusType == "WATCHING") {
                    client.user.setPresence({
                        status: status,
                        activity: {
                            name: words,
                            url: "https://www.twitch.tv/monstercat",
                            type: statusType
                        }
                    })
                } else {
                    client.user.setPresence({
                        status: status,
                        activity: {
                            name: words,
                            type: statusType
                        }
                    })
                }

                message.channel.send("```diff\n+ status set```")
                console.log(`${message.author.username} set status to ${status}, ${statusType}, ${words}`)
            } else {
                message.channel.send("```diff\n- invalid lol >:)```")
            }
        } else {
            message.channel.send(noPerms(message, config))
        }
    }
    
    else if (message.channel.name == "colours"){

        if (message.content.startsWith("#")){

            var colour = message.content.substring(0,7)
            var role = message.guild.roles.cache.find(role => role.name === colour)
            var memberRole = message.member.roles.cache.find(role => role.name.startsWith('#'))

            if(memberRole){
                message.member.roles.remove(memberRole)
                console.log(`Removed role "${memberRole.name}" from ${message.author.tag}`)
            }

            if(!role){
                var newRole = await message.guild.roles.create({
                    data: {
                    name: colour,
                    color: colour,
                    }
                })
                    .then(console.log(`Created role "${colour}"`))
                    .catch(console.error);
                message.member.roles.add(newRole)
                console.log(`Given role "${colour}" to ${message.author.tag}`)
                const colourEmbed = new MessageEmbed()
                    .setThumbnail(message.author.avatarURL())
                    .setColor(colour)
                    .setTitle(colour)
                    .addFields( { name: `Created new colour role`, value: `Given ${newRole} to <@${message.author.id}>` } )
                message.channel.send(colourEmbed)
                message.delete()
            }
            else{
                console.log("Role already exists!")
                message.member.roles.add(role)
                console.log(`Given role "${role.name}" to ${message.author.tag}`)
                const colourEmbed = new MessageEmbed()
                    .setThumbnail(message.author.avatarURL())
                    .setColor(colour)
                    .setTitle(colour)
                    .addFields( { name: `Assigned role`, value: `Given ${role} to <@${message.author.id}>` } )
                message.channel.send(colourEmbed)
                message.delete()
            }
        }
        else{ message.delete() }
    }

    // MODERATION

    else if (message.content.startsWith(config.prefix + "kick")){

        var user = message.mentions.users.first();
        
        if(!message.member.hasPermission("KICK_MEMBERS")) {
            message.channel.send(noPerms(message, config))
        }

        else if (!msgArray[1]) { message.channel.send("Please mention a user") }

        else if (user) {
            const member = message.guild.member(user)
            if (member){
                member
                    .kick(`kicked by ${message.author.tag}`)
                    .then(() => {
                        message.channel.send(`kicked <@${user.id}>`)
                        console.log(`${user.tag} was kicked by ${message.author.tag}`)
                        log(message.author, user, "kick", message)
                })
                    .catch(err => {
                        message.channel.send(`\`\`\`diff\n- Unable to kick <@${user.id}>\`\`\``)
                        console.log(err)
                })
            }
            else { message.channel.send("That user isn't in the server.") }
        }
        else { message.channel.send("Please mention a user") }
    }

    else if (message.content.startsWith(config.prefix + "ban")){

        var user = message.mentions.users.first();

        if(!message.member.hasPermission("BAN_MEMBERS")) {
            message.channel.send(noPerms(message, config))
        }

        else if (!msgArray[1]) { message.channel.send("Please mention a user") }

        else if (user) {
            const member = message.guild.member(user)
            if (member){
                member
                    .ban({reason: `banned by ${message.author.tag}`})
                    .then(() => {
                        message.channel.send(`banned <@${user.id}>`)
                        console.log(`${user.tag} was banned by ${message.author.tag}`)
                        log(message.author, user, "ban", message)
                })
                    .catch(err => {
                        message.channel.send(`\`\`\`diff\n- Unable to ban <@${user.id}>\`\`\``)
                        console.log(err)
                })
            }
            else { message.channel.send("That user isn't in the server.") }
        }
        else { message.channel.send("Please mention a user") }
    }

    else if (message.content.startsWith(config.prefix + "mute")){

        var user = message.mentions.users.first();

        if(!message.member.hasPermission("KICK_MEMBERS")) {
            message.channel.send(noPerms(message, config))
        }

        else if (!msgArray[1]) { message.channel.send("Please mention a user") }

        else if (user) {
            const member = message.guild.member(user)

            if(member.roles.cache.get(config.mutedRole.id)){
                message.channel.send(`<@${user.id}> is already muted`)
            }

            else if (member){
                member
                    .roles.add(message.guild.roles.cache.get(config.mutedRole.id))
                    .then(() => {
                        message.channel.send(`muted <@${user.id}>`)
                        console.log(`${user.tag} was muted by ${message.author.tag}`)
                        log(message.author, user, "mute", message)
                })
                    .catch(err => {
                        message.channel.send(`\`\`\`diff\n- unable to mute <@${user.id}>\`\`\``)
                        console.log(err)
                })
            }
            else { message.channel.send("That user isn't in the server.") }
        }
        else { message.channel.send("Please mention a user") }
    }

    else if (message.content.startsWith(config.prefix + "unmute")){
        
        var user = message.mentions.users.first();

        if(!message.member.hasPermission("KICK_MEMBERS")) {
            message.channel.send(noPerms(message, config))
        }

        else if (!msgArray[1]) { message.channel.send("Please mention a user") }
        
        else if (user) {
            const member = message.guild.member(user)

            if(!member.roles.cache.get(config.mutedRole.id)){
                message.channel.send(`<@${user.id}> isn't muted`)
            }

            else if (member){
                member
                    .roles.remove(member.roles.cache.get(config.mutedRole.id))
                    .then(() => {
                        message.channel.send(`unmuted <@${user.id}>`)
                        console.log(`${user.tag} was unmuted by ${message.author.tag}`)
                        log(message.author, user, "unmute", message)
                })
                    .catch(err => {
                        message.channel.send(`\`\`\`diff\n- unable to unmute <@${user.id}>\`\`\``)
                        console.log(err)
                })
            }
            else { message.channel.send("That user isn't in the server.") }
        }
        else { message.channel.send("Please mention a user") }
    }

    else if (message.content.startsWith(config.prefix + "purge" ) || message.content.startsWith(config.prefix + "clear")){
    
        if(!message.member.hasPermission("MANAGE_MESSAGES")) {
            message.channel.send(noPerms(message, config))
        }
        else {
            var purge = parseInt(msgArray[1])
            if (purge > 99) { purge = 100 }
            if (!msgArray[1] || isNaN(purge)) { purge = 10 }


            message.channel.bulkDelete(purge)
            .catch(error => message.channel.send('```diff\n- Unable to purge messages.```'))


            log(message.author, message.author, "purge", message)
            console.log(`${message.author.tag} purged ${purge} messages from ${message.channel.name}`)
        }
    }

    else if (message.content.startsWith(config.prefix + "censor ") || message.content == config.prefix + "censor") {
        if (!message.member.hasPermission("MANAGE_MESSAGES")) {
            message.channel.send(noPerms(message, config))
        }
        else if (!msgArray[1]) {message.channel.send('```diff\n- Please include a phrase or word to censor```')}
        else if (msgArray[1] && message.content.startsWith(config.prefix + "censor ")){
            string = message.content.replace(config.prefix + "censor ", "")
            fs.appendFile(`${config.guildID}_censored.txt`, "\n" + string.toLowerCase(), function (err) {
                if (err) {console.log(`Error adding to censor list.`)};
                console.log(`censored ${string}`)
                log(message.author, message.author, "censor", message)
            })
            message.channel.send('```diff\n+ Added phrase to censor list!```')
            if (message.deletable) {message.delete()}
        }
    }
    
    else if (message.content.startsWith(config.prefix + "uncensor ") || message.content == config.prefix + "uncensor") {
        if (!message.member.hasPermission("MANAGE_MESSAGES")) {
            message.channel.send(noPerms(message, config))
        }
        else if (!msgArray[1]) {message.channel.send('```diff\n- Please include a phrase or word to uncensor```')}
        else if (msgArray[1] && message.content.startsWith(config.prefix + "uncensor ")) {
            removeString = message.content.replace(config.prefix + "uncensor ", "")
            fs.readFile(`${config.guildID}_censored.txt`, 'utf8', function(err, data) {
                if (err) throw error;
                let dataArray = data.split('\n')
                let lineIndex = -1;

                for (let i = 0; i < dataArray.length; i++) {
                    if (dataArray[i].includes(removeString)){
                        lineIndex = i
                        break;
                    }
                }
                
                if (lineIndex == -1){
                    message.channel.send('```diff\n- Unable to remove from censor list.```')
                }
                else {
                    dataArray.splice(lineIndex, 1);
                    let newData = dataArray.join('\n')
                    fs.writeFile(`${config.guildID}_censored.txt`, newData, (err) => {
                        if (err) {console.log(`Error removing from censor list.`)};
                        message.channel.send('```diff\n+ Removed phrase from censor list!```')
                        console.log(`uncensored ${removeString}`)
                        log(message.author, message.author, "uncensor", message)
                    })
                }
            })
        }
    }

    else if (message.content == config.prefix + "censorlist") {
        if (!message.member.hasPermission("MANAGE_MESSAGES")) {
            message.channel.send(noPerms(message, config))
        }
        else{
            const attachment = new MessageAttachment(`${config.guildID}_censored.txt`, `censored.txt`)
            message.author.send(attachment)
        }
    }

    else if (message.content.startsWith(config.prefix + "nickname") || message.content.startsWith(config.prefix + "nick")){
        if (!message.member.hasPermission('MANAGE_NICKNAMES')) { return message.channel.send(noPerms(message, config)) }
        else {
            var user = message.mentions.members.first() || message.member
            nickname = message.content.replace(msgArray[0], '').replace(user, '').replace(`<@!${user.id}>`, '').trim()
            user.setNickname(nickname)
            .catch(function() {
                message.channel.send('```diff\n- Failed to change nickname```')
            })
            console.log(`${message.author.username} set ${user.user.username}'s nickname to ${nickname}`)
            log(message.author, user.user, "nick", message)
        }
    }
    
    else if (message.content.startsWith(config.prefix + "settings") || message.content.startsWith(config.prefix + "config")){
        if (!msgArray[1]) {
            let iconExtention = ".png"
            if (message.guild.icon.startsWith("a_")) { iconExtention = ".gif"}
            var settingsEmbed = new MessageEmbed()
                .setColor('#000000')
                .setTitle(`${message.guild.name} configuration`)
                .setThumbnail(`https://cdn.discordapp.com/icons/${message.guild.id}/${message.guild.icon}${iconExtention}?size=1024`)
                .addField('Prefix:', `\`${config.prefix}\`` , true)
                .addField('Log Channel:', config.loggingEnabled ? `<#${config.logChannel.id}>` : "Disabled", true)
                .addField('Autorole:', config.autoRole ? `<@&${config.autoRole.id}>` : 'Disabled', true)
                .addField('Permission message:', `${config.noPermsReply}`, false)
                .addField('Welcome title:', config.welcomeEnabled ? `\`${config.welcomeTitle}\`` : "Disabled", true)
                .addField('Welcome message:', config.welcomeEnabled ? `\`${config.welcomeMessage}\`` : "Disabled", true)
                .addField('Leave message', config.leaveEnabled ? `\`${config.leaveMessage}\`` : "Disabled", false)

                .setFooter(config.guildID)
                .setTimestamp()
            message.channel.send(settingsEmbed)
        }
        else {
            if (!message.member.hasPermission("ADMINISTRATOR")) {
                message.channel.send(noPerms(message, config))
            }
            else if (msgArray[1] == "help"){
                var helpEmbed = new MessageEmbed()
                    .setColor('#000000')
                    .setTitle('Config help')
                    .addField('Reload config:', `\`${config.prefix}config reload\``)
                    .addField('Prefix:', `\`${config.prefix}config prefix [new prefix]\``)
                    .addField('Logging:', `\`${config.prefix}config log [channel/false]\``)
                    .addField('"No Perms" reply:', `\`${config.prefix}config permreply [string]\``)
                    .addField('"Welcome" title:', `\`${config.prefix}config welcometitle [string]\``)
                    .addField('"Welcome" message:', `\`${config.prefix}config welcomemessage [string]\``)
                    .addField('"Welcome" on/off:', `\`${config.prefix}config welcome [true/false]\``)
                    .addField('"leave" message:', `\`${config.prefix}config leavemessage [string/false]\``)
                    .addField('Autorole:', `\`${config.prefix}config autorole [roleID/false]\``)
                    .addField('Modifiers:', `\`{member}\` is replaced with username, \`{server}\` with the server's name`)
                message.channel.send(helpEmbed)
            }
            else if (msgArray[1] == "prefix"){
                if (!msgArray[2]) {message.channel.send(`\`\`\`Current Prefix is '${config.prefix}'\`\`\``)}
                else {
                    config.prefix = msgArray[2]
                    writeConfig(config, message.guild)
                    message.channel.send(`\`\`\`diff\n+ Prefix changed to '${config.prefix}'\`\`\``)
                    log(message.author, message.author, "config", message)
                }
            }
            else if (msgArray[1] == "autorole"){
                if(!msgArray[2]){
                    message.channel.send(config.autoRole ? `\`\`\`diff\n+ Autorole is set to <@&${config.autoRole.id}>\`\`\`` : '```diff\n- Autorole is currently disabled```')
                }
                else if (message.mentions.roles.first()) {
                    let newRole = message.mentions.roles.first()
                    config.autoRole = newRole
                    writeConfig(config, message.guild)
                    message.channel.send(`\`\`\`diff\n+ Autorole has been enabled and set to <@&${config.autoRole.id}>\`\`\``)
                }
                else{
                    message.channel.send('```diff\n- Please mention a role to add```')
                }
            }
            else if (msgArray[1] == "log"){
                if (!msgArray[2]) {
                    if (!config.loggingEnabled) {message.channel.send('```diff\n- Logging is currently disabled.```')}
                    else {message.channel.send(`\`\`\`diff\n+ Logging is currently set to #${config.logChannel.name}\`\`\``)}
                }
                else {
                    if (msgArray[2] == "false") {
                        config.loggingEnabled = false
                        config.logChannel = null
                        writeConfig(config, message.guild)
                        message.channel.send('```diff\n- Logging has been disabled!```')
                    }
                    else if (message.mentions.channels.first()){
                        config.loggingEnabled = true
                        config.logChannel = message.mentions.channels.first()
                        writeConfig(config, message.guild)
                        message.channel.send(`\`\`\`diff\n+ Logging has been set to #${config.logChannel.name}!\`\`\``)
                    }
                    else {
                        message.channel.send(`\`\`\`diff\n- Please mention a valid channel.\`\`\``)
                    }
                }
            }
            else if (msgArray[1] == "permreply"){
                if (!msgArray[2]) {message.channel.send(`\`\`\`Current "No Permission" reply is "${config.noPermsReply}"\`\`\``)}
                else {
                    config.noPermsReply = message.content.replace(config.prefix + "settings permreply ", "").replace(config.prefix + "config permreply ", "")
                    writeConfig(config, message.guild)
                    message.channel.send(`\`\`\`diff\n+ "No Permissions" reply changed to "${config.noPermsReply}"\`\`\``)
                    log(message.author, message.author, "config", message)
                }
            }
            else if (msgArray[1] == "welcometitle"){
                if (!msgArray[2]) {message.channel.send(`\`\`\`Current "Welcome" title is "${config.welcomeTitle}"\`\`\``)}
                else {
                    config.welcomeTitle = message.content.replace(config.prefix + "settings welcometitle ", "").replace(config.prefix + "config welcometitle ", "")
                    writeConfig(config, message.guild)
                    message.channel.send(`\`\`\`diff\n+ "Welcome" title changed to "${config.welcomeTitle}"\`\`\``)
                    log(message.author, message.author, "config", message)
                }
            }
            else if (msgArray[1] == "welcomemessage"){
                if (!msgArray[2]) {message.channel.send(`\`\`\`Current "Welcome" message is "${config.welcomeMessage}"\`\`\``)}
                else {
                    config.welcomeMessage = message.content.replace(config.prefix + "settings welcomemessage ", "").replace(config.prefix + "config welcomemessage ", "")
                    writeConfig(config, message.guild)
                    message.channel.send(`\`\`\`diff\n+ "Welcome" message changed to "${config.welcomeMessage}"\`\`\``)
                    log(message.author, message.author, "config", message)
                }
            }
            else if (msgArray[1] == "welcome"){
                if (!msgArray[2]) {message.channel.send(`\`\`\`Server welcome is currently ${config.welcomeEnabled}\`\`\``)}
                else if (msgArray[2] == "false"){
                    config.welcomeEnabled = false
                    writeConfig(config, message.guild)
                    message.channel.send(`\`\`\`diff\n- Welcome greeting disabled!\`\`\``)
                    log(message.author, message.author, "config", message)
                }
                else if (msgArray[2] == "true"){
                    config.welcomeEnabled = true
                    writeConfig(config, message.guild)
                    message.channel.send(`\`\`\`diff\n+ Welcome greeting enabled!\`\`\``)
                    log(message.author, message.author, "config", message)
                }
                else{
                    message.channel.send(`\`\`\`diff\n- Please choose "true" or "false"\`\`\``)
                }
            }
            else if (msgArray[1] == "leavemessage"){
                if (!msgArray[2]) {message.channel.send(`\`\`\`Server leavemessage is currently ${config.leaveEnabled ? `"${config.leaveMessage}"` : "Disabled"}\`\`\``)}
                else if (msgArray[2] == "false"){
                    config.leaveEnabled = false
                    writeConfig(config, message.guild)
                    message.channel.send(`\`\`\`diff\n+ Leave message disabled!\`\`\``)
                    log(message.author, message.author, "config", message)
                }
                else if (msgArray[2] == "true"){
                    config.leaveEnabled = true
                    writeConfig(config, message.guild)
                    message.channel.send(`\`\`\`diff\n+ Leave message enabled!\`\`\``)
                    log(message.author, message.author, "config", message)
                }
                else {
                    config.leaveMessage = message.content.replace(config.prefix + "settings leavemessage ", "").replace(config.prefix + "config leavemessage ", "")
                    config.leaveEnabled = true
                    writeConfig(config, message.guild)
                    message.channel.send(`\`\`\`diff\n+ Leave message set to "${config.leaveMessage}"\`\`\``)
                    log(message.author, message.author, "config", message)
                }
            }
            else if (msgArray[1] == "reload"){
                loadConfig(message.guild)
                message.channel.send(`\`\`\`diff\n+ Configuration reloaded.\`\`\``)

            }
            else if (msgArray[1] == "reset"){
                if (!msgArray[2] ){
                    message.channel.send(`\`\`\`diff\n- Are you sure you want to reset this server's config? This cannot be undone.\nPlease run ${config.prefix}config reset confirm\`\`\``)
                }
                else if (msgArray[2] == "confirm"){
                    
                }
            }
        }
    }
    // FUN

    else if (message.content.startsWith(config.prefix + "avatar") || message.content.startsWith(config.prefix + "av") || message.content.startsWith(config.prefix + "pfp")){
        var user = message.mentions.users.first() || message.member.user
        message.channel.send(user.displayAvatarURL( { size: 1024 } ))
    }

    else if (message.content.startsWith(config.prefix + "userinfo") || message.content.startsWith(config.prefix + "ui")){
        let member = message.mentions.members.first() || message.member
        user = member.user;
        if (user) {
            let rolemap = member.roles.cache
                .sort((a, b) => b.position - a.position)
                .map(r => r)
                .join(", ");
            if (rolemap.length > 1024) rolemap = "Too many roles!";
            if (!rolemap) rolemap = "None";

            const UIEmbed = new MessageEmbed()
                .setThumbnail(user.displayAvatarURL( { size: 1024 } ))
                .setColor("#000000")
                .setTitle(`${user.tag}'s info`)
                .addField('Account created:', moment(user.createdAt).format('llll'), true)
                .addField('Joined Guild:', moment(member.joinedAt).format('llll'), true)
                .addField('Nickname:', member.nickname || user.username, true)
                .addField('Roles:', rolemap.replace(', @everyone', ''), false)
                .setFooter(user.id)
                .setTimestamp()
            message.channel.send(UIEmbed)
        }
        else { message.channel.send("Couldn't find user!") }
    }

    else if (message.content == (config.prefix + "serverinfo") || message.content == (config.prefix + "si")) {
        let iconExtention = ".png"
        if (message.guild.icon.startsWith("a_")) { iconExtention = ".gif"}
        const ServerEmbed = new MessageEmbed()
            .setThumbnail(`https://cdn.discordapp.com/icons/${message.guild.id}/${message.guild.icon}${iconExtention}?size=1024`)
            .setColor("#000000")
            .setTitle(`${message.guild.name} info`)

            .addField('Server created:', moment(message.guild.createdAt).format('llll'), false)

            .addField('Owner:', message.guild.owner || "Bot account", true)
            .addField('Region:', message.guild.region, true)
            .addField('Vanity:', message.guild.vanityURLCode || "None", true)

            .addField('Description:', message.guild.description || "Not set", false)

            .addField('Members:', message.guild.memberCount, true)
            .addField('Boosts:', message.guild.premiumSubscriptionCount, true)
            .addField('Emojis:', message.guild.emojis.cache.size, true)

            .addField('Roles:', message.guild.roles.cache.size, true)
            .addField('Channels:', message.guild.channels.cache.size, true)
            .addField('Enabled Features:', message.guild.features.length || "None", true)

            .setImage(`https://cdn.discordapp.com/banners/${message.guild.id}/${message.guild.banner}.jpg?size=2048`)
            .setFooter(message.guild.id)
            .setTimestamp()
        message.channel.send(ServerEmbed)

    }

    else if (message.content.startsWith(config.prefix + "map")) {
        let MapPool;

        if (msgArray[1] == "reserve"){
            MapPool = ['Train', 'Cache', 'Grind', 'Mocha'] 
        }
        else if (msgArray[1] == "hostage"){
            MapPool = ['Militia', 'Agency', 'Office', 'Italy', 'Assault']
        }
        else if (msgArray[1] == "wingman"){
            MapPool = ['Calavera', 'Lake', 'Pitstop', 'Shortdust', 'Shortnuke']
        }
        else if (msgArray[1] == "nuke"){
            MapPool = ['Nuke','Nuke','Nuke','Nuke','Nuke','Nuke','Nuke','Nuke','Nuke', 'Nuke']
        }
        else {
            MapPool = ['Inferno', 'Mirage', 'Nuke', 'Overpass', 'Dust_II', 'Vertigo', 'Ancient'] 
        }

        if ((msgArray[1] && parseInt(msgArray[1]) && parseInt(msgArray[1]) > 1) || (msgArray[2] && parseInt(msgArray[2])) && parseInt(msgArray[2]) > 1){
            let num = parseInt(msgArray[1]) || parseInt(msgArray[2])
            if (num >= MapPool.length) {
                message.channel.send("You should play all the maps!")
            }
            else{
                const mapEmbed = new MessageEmbed()
                    .setColor('#E9A331')
                    .setTitle('Map Selection')
                let mapList = ''
                for (let i = 0; i < num; i++ ) {
                    map = MapPool[Math.floor(Math.random() * MapPool.length)]
                    mapList += `\n${map}`
                    MapPool.splice(MapPool.indexOf(map), 1)
                }
                mapEmbed.addField('You should play:', `\`\`\`${mapList}\`\`\``)
                message.channel.send(mapEmbed)
            }
        }
        else {
            randomMap = Math.floor(Math.random() * MapPool.length)
            const attachment = new MessageAttachment(`./csgo_maps/${MapPool[randomMap].toLowerCase()}.jpg`, `${MapPool[randomMap]}.jpg`)
            const mapEmbed = new MessageEmbed()
                .setColor('#E9A331')
                .setTitle('Map Selection')
                .attachFiles(attachment)
                .setImage(`attachment://${MapPool[randomMap]}.jpg`)
                .setDescription(`You should play ${MapPool[randomMap]}!`)
            message.channel.send(mapEmbed)
        }
    }

    else if (message.content.startsWith(config.prefix + "roll")) {
        if (msgArray[1] && msgArray[1] == "monke"){
                const diceEmbed = new MessageEmbed()
                .setColor('#ffffff')
                .setTitle(`Rolling a D-monke!`)
                .setImage(`https://media.discordapp.net/attachments/845067108689248297/857595998385471508/monke.gif`)
            message.channel.send(diceEmbed)
            await delay(4000);
            message.channel.send(`${message.author} rolled a monke!`)
        }
        else{
            var length = 6
            if (msgArray[1] && parseInt(msgArray[1])) {length = parseInt(msgArray[1])}
            const diceEmbed = new MessageEmbed()
                .setColor('#ffffff')
                .setTitle(`Rolling a D-${length}!`)
                .setImage(`https://media.discordapp.net/attachments/433726065731698691/856310943448432660/roll.gif`)

            message.channel.send(diceEmbed)
            await delay(7000);
            message.channel.send(`${message.author} rolled a ${Math.floor(Math.random() * length) + 1}!`)
        }
    }
    
    else if (message.content.startsWith(config.prefix + "dm")){
        if (message.content == config.prefix + "dm") {message.channel.send("Please mention a user, and add a message to send")}
        else {
            let member = message.mentions.members.first()
            if (!member) {message.channel.send("Please mention a user")}
            else if (!msgArray[2]) {message.channel.send("Please enter a message")}
            else {
                let dmEmbed = new MessageEmbed()
                    .setColor("#f42069")
                    .setTitle("Direct Message")
                    .setAuthor(message.author.username, message.author.avatarURL())
                    .setTimestamp()
                    .setDescription(message.content.replace(config.prefix + "dm", ""))

                member.send(dmEmbed)
                .catch(function() {
                    message.channel.send("don't be daft")
                })
            }
        }
    }

    else if (parseInt(message.content).toString().length == 18) {
        muckEmbed = new MessageEmbed()
            .setColor("#FFC300")
            .setTitle("is that a **MUCK** Invite Code???")
            .setDescription(`${message.author} IS PLAYING MUCK!!!`)
            .addField("The Muck Invite Code Is:", `\`\`\`\n${message.content}\`\`\``)
        message.channel.send(muckEmbed)
    }

    else if (message.content.includes("<@!844980897912455238>")){
        client.api.channels[message.channel.id].messages.post({
            data: {
                content: "what",
                    message_reference: {
                    message_id: message.id,
                    channel_id: message.channel.id,
                    guild_id: message.guild.id
                }
            }
        })
    }

    else if (message.content.startsWith(config.prefix + "help")){
        message.channel.send(`\`\`\`diff
+ Current Prefix is ${config.prefix}
+ COMMANDS
${config.prefix}ping // Pong!
${config.prefix}uptime // Current uptime
${config.prefix}help // this
${config.prefix}avatar [user] // Displays the mentioned user's profile picture
${config.prefix}userinfo [user] // Displays the mentioned user's information
${config.prefix}serverinfo // Displays this server's information
${config.prefix}roll [int] // Roll a die
${config.prefix}map [mapgroup] [int] // Chooses some CS:GO maps for you to play
${config.prefix}dm [user] [message] // Sends a direct message to the mentioned user
+ AUDIO COMMANDS
${config.prefix}play [string] // Plays YouTube audio in your current channel
${config.prefix}skip // Skips to next song in queue
${config.prefix}stop // Stops audio playback
${config.prefix}queue // Lists currently queued songs
${message.member.hasPermission("BAN_MEMBERS") ? "+ MODERATION COMMANDS" : '- FOR USERS WITH "BAN_MEMBERS" PERMISSION'}
${config.prefix}kick [user] // kicks user
${config.prefix}ban [user] // bans user
${config.prefix}mute [user] // mutes user
${config.prefix}unmute [user] // unmutes user
${message.member.hasPermission("MANAGE_NICKNAMES") ? "+ USER MANAGEMENT" : '- FOR USERS WITH "MANAGE_NICKNAMES" PERMISSION'}
${config.prefix}nickname [user] [string]
${message.member.hasPermission("MANAGE_MESSAGES") ? "+ MODERATION COMMANDS" : '- FOR USERS WITH "MANAGE_MESSAGES" PERMISSION'}
${config.prefix}censor [phrase] // Censors phrase
${config.prefix}uncensor [phrase] // Uncensors phrase
${config.prefix}censorlist // Sends currently censored phrases to your DM's
${message.member.hasPermission("BAN_MEMBERS") ? "+ ADMINISTRATION COMMANDS" : '- FOR USERS WITH "ADMINISTRATOR" PERMISSION'}
${config.prefix}config [setting] [value] // Run ${config.prefix}config help for more information
\`\`\``)
    }

    for (const word of censored){
        if (message.content.includes(word) && message.deletable) {
            message.delete()
            .catch(function() {
                console.log("Unable to censor message")
            })
            log(message.author, message.author, "delete", message)
        } 
    }

})

// AUDIO FUNCTIONS

async function searchYT(args){
    args.splice(0, 1)
    console.log("Searching YouTube for ", args)
    var searchData = await ytAPI.GetListByKeyword(args, false)
    for (i = 0; i < searchData.items.length; i++){
        songInfo = await ytdl.getInfo(`https://youtube.com/watch?v=${searchData.items[i].id}`)
        .catch( function() {
            console.log("Invalid video");
            return
        });
        if (songInfo) {
            console.log("Found Video: ", songInfo.videoDetails.title)
            return songInfo
        }
    }
    return songInfo
}

async function execute(message, serverQueue) {
    const args = message.content.split(" ");
    let songInfo;
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) { return message.channel.send('```diff\n- Please join a voice channel.```') }
    if (!args[1]) { message.channel.send('```diff\n- Please specify search terms or a URL```')}
    if (args[1]){
        songInfo = await ytdl.getInfo(args[1])
            .catch( async function() {
                console.log("Invalid URL supplied");
                message.channel.send('```diff\n- Invalid URL - Searching YouTube...```')
                return songInfo = await searchYT(args)
            });
    }
    if (!songInfo) {
        message.channel.send('```diff\n- Video is private or unlisted!```')
        return
    }
    const song = {
        title: songInfo.videoDetails.title,
        url: songInfo.videoDetails.video_url,
        description: songInfo.videoDetails.description,
        thumbnails: songInfo.videoDetails.thumbnails,
        author: songInfo.videoDetails.author,
    }

    if (!serverQueue) {
        const queueConstruct = {
            textChannel: message.channel,
            voiceChannel: voiceChannel,
            connection: null,
            songs: [],
            volume: 5,
            playing: true
        };

        queue.set(message.guild.id, queueConstruct);

        queueConstruct.songs.push(song);

        try {
            var connection = await voiceChannel.join();
            queueConstruct.connection = connection;
            play(message.guild, queueConstruct.songs[0]);
        } 
        catch (err) {
            console.log(err);
            queue.delete(message.guild.id);
            return message.channel.send('```diff\n- Unable to join voice channel.```');
        }
    } 
    else {
        serverQueue.songs.push(song);
        return message.channel.send(`\`\`\`diff\n+ ${song.title} has been added to the queue!\`\`\``);
    }

}

function skip(message, serverQueue) {
    if (!message.member.voice.channel || !serverQueue) {return message.channel.send('```diff\n- Unable to skip song```')}
    serverQueue.connection.dispatcher.end();
    message.channel.send('```diff\n+ Skipped song.```')
}

function stop(message, serverQueue) {
    if (!message.member.voice.channel || !serverQueue) { return }
      
    serverQueue.songs = [];
    serverQueue.connection.dispatcher.end();
    message.channel.send('```diff\n- Stopped playing.```')
}

function play(guild, song) {
    const serverQueue = queue.get(guild.id);
    if (!song) {
        serverQueue.voiceChannel.leave();
        queue.delete(guild.id);
        return;
    }
  
    const dispatcher = serverQueue.connection
        .play(ytdl(song.url))
        .on("finish", () => {
        serverQueue.songs.shift();
        play(guild, serverQueue.songs[0]);
        })
        .on("error", error => console.error(error));
    dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);
    startEmbed = new MessageEmbed()
        .setColor('#f42069')
        .setTitle("Now Playing")
        .setURL(song.url)
        .setDescription(song.title)
        .setAuthor(song.author.name, song.author.thumbnails[song.author.thumbnails.length - 1].url, song.author.channel_url)
        .setTimestamp()

    serverQueue.textChannel.send(startEmbed);
}

function printQueue(message, serverQueue){
    if (!serverQueue) {return message.channel.send('```diff\n- The queue is currently empty.```')}
    var songList = "";
    for (var song of serverQueue.songs){
        songList = songList + song.title + "\n"
    }
    return(message.channel.send(`\`\`\`${songList}\`\`\``))
}

let [arg] = process.argv.slice(2);
let token = process.env.BOT_TOKEN;
if (arg == "dev") { token = process.env.DEV_TOKEN }
client.login(token);
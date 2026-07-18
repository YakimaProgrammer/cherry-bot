import "dotenv/config";

import {
  Client,
  Events,
  GatewayIntentBits,
  type Interaction,
  Partials,
} from "discord.js";
import { commands } from "./commands";
import { pushEmojiUsage } from "./models/emoji";
import { prisma } from "./shared";

const client = new Client({
  intents: [
    // Lets us recieve information about channels, roles, messages
    GatewayIntentBits.Guilds,

    // We need this intent to read actual user messages as they are sent to us.
    // This covers the case where an emoji is used in a message, but never as a reaction.
    // Without this, emojis might get deleted that are still in use.
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,

    // This intent allows us to listen for users joining and leaving the server.
    // This lets us clean up emojis when a user joins or leaves the server.
    GatewayIntentBits.GuildMembers,

    // This intent lets us create and manage emoji for the server.
    GatewayIntentBits.GuildExpressions,

    // This intent lets us listen for message reactions.
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  // If we add more commands, I'd definitely want to move towards an actual router

  if (!(interaction.isAutocomplete() || interaction.isChatInputCommand())) {
    // I have no idea, man
    return;
  }
  // ... gives a nice type assertion, though!

  const commandName = interaction.commandName;
  const subcommand = interaction.options.getSubcommand(false);
  const subcommandGroup = interaction.options.getSubcommandGroup(false);

  const routingKey = `${commandName}:${subcommandGroup}:${subcommand}`;

  if (interaction.isAutocomplete()) {
    const command = commands[routingKey];
    const autocomplete = command?.autocomplete;

    if (autocomplete === undefined) {
      await interaction.respond([]);
    } else {
      await autocomplete(interaction, prisma);
    }

    return;
  }

  if (interaction.isChatInputCommand()) {
    const command = commands[routingKey];
    const execute = command?.execute;

    if (execute === undefined) {
      await interaction.reply({
        flags: ["Ephemeral"],
        content: "A command with that name does not exist!",
      });
    } else {
      await execute(interaction, prisma);
    }

    return;
  }
});

const CUSTOM_EMOJI_REGEX = /<a?:[^:>]+:(\d+)>/g;
client.on(Events.MessageCreate, async (message) => {
  // Ignore DMs and bots
  if (!message.guildId || message.author.bot) {
    return;
  }

  const emojiIds = [...message.content.matchAll(CUSTOM_EMOJI_REGEX)].map(
    (match) => match[1],
  );

  for (const emojiId of emojiIds) {
    try {
      await pushEmojiUsage(
        prisma,
        emojiId,
        message.author.id,
        message.guildId,
        message.channelId,
      );
    } catch (_) {
      // Do nothing. This will throw, for example, on foreign key violations.
    }
  }
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  // Ignore bots
  if (user.bot) {
    return;
  }

  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (e) {
      console.error("Failed to fetch reaction:", e);
      return;
    }
  }

  const message = reaction.message;

  // Ignore DMs
  if (!message.guildId) {
    return;
  }

  const emojiId = reaction.emoji.id;

  // Unicode emoji don't have an ID. Custom Discord emoji do.
  if (!emojiId) {
    return;
  }

  try {
    await pushEmojiUsage(
      prisma,
      emojiId,
      user.id,
      message.guildId,
      message.channelId,
    );
  } catch (_) {
    // Do nothing. This will throw, for example, on foreign key violations.
    // For example, if you use an emoji from another server or one that CherryBot isn't responsible for managing.
  }
});

client.login(process.env.discord_token);

import { SlashCommandSubcommandBuilder } from "discord.js";
import { recordAuditEvent } from "../models/audit";
import {
  getEmojiOwner,
  getUserActiveEmoji,
  pushEmojiStatus,
} from "../models/emoji";
import type { DiscordCommand } from "../types";

export const command: DiscordCommand = {
  command: new SlashCommandSubcommandBuilder()
    .setName("delete")
    .setDescription(`Removes an emoji from the server.`)
    .addStringOption((opt) =>
      opt
        .setName("name")
        .setDescription("Which emoji to delete from this server.")
        .setRequired(true)
        .setAutocomplete(true),
    ),
  execute: async (interaction, prisma) => {
    await interaction.deferReply({ flags: ["Ephemeral"] });

    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const emojiName = interaction.options.getString("name")?.toLowerCase();

    if (guildId === null) {
      // For example, are we in DMs?
      await interaction.editReply({
        content: "This command can only be used in a server!",
      });
      return;
    }

    if (userId === null) {
      // I actually have no idea what would trigger a null user id...
      await interaction.editReply({
        content: "This command can only be used by a user!",
      });
      return;
    }

    if (emojiName === null) {
      await interaction.editReply({
        content: "You must specify which emoji to remove!",
      });
      return;
    }

    // For this bot, I don't really care about tracking emoji names myself since Discord.js tracks renames and stuff itself
    const discordEmoji = interaction.guild?.emojis.cache.find(
      (e) => e.name.toLowerCase() === emojiName,
    );

    if (discordEmoji === undefined) {
      await interaction.editReply({
        content: "Could not find an emoji with that name.",
      });
      return;
    }

    const ownerId = await getEmojiOwner(prisma, discordEmoji.id);

    if (ownerId === userId) {
      // Run this first in case in fails so we fail fast.
      await discordEmoji.delete();

      await prisma.$transaction(async (tx) => {
        // We don't actually delete emoji for auditing reasons if someone does something bad.
        // In `models/emoji.ts`, you can see how we add filters for the most recent status being "Ok".
        // The other statuses are just reasons the emoji was deleted.
        // @TODO could be, for example, to let users "restore" emojis they deleted or that expired.
        await pushEmojiStatus(tx, discordEmoji.id, userId, "UserDeleted");

        // Record an audit event so we know what happened
        await recordAuditEvent(
          tx,
          guildId,
          userId,
          `emoji::delete(<:${discordEmoji.name}:${discordEmoji.id}>)`,
          interaction.channelId,
        );
      });

      await interaction.editReply({
        content: "Successfully deleted the emoji!",
      });
      return;
    } else {
      await interaction.editReply({
        content: "You can only delete emoji you created.",
      });
      return;
    }
  },

  autocomplete: async (interaction, prisma) => {
    const guildId = interaction.guildId;

    if (guildId === null || interaction.guild === null) {
      await interaction.respond([]);
      return;
    }

    const focused = interaction.options.getFocused().toLowerCase();

    const userEmoji = await getUserActiveEmoji(
      prisma,
      guildId,
      interaction.user.id,
    );

    const ownedEmojiIds = new Set(userEmoji.map((emoji) => emoji.emojiId));

    const choices = interaction.guild.emojis.cache
      .filter(
        (emoji) =>
          ownedEmojiIds.has(emoji.id) &&
          emoji.name.toLowerCase().includes(focused),
      )
      .first(25)
      .map((emoji) => ({
        name: emoji.name,
        value: emoji.name.toLowerCase(),
      }));

    await interaction.respond(choices);
  },
};

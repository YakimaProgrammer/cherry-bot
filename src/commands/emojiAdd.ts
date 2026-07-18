import { type GuildEmoji, SlashCommandSubcommandBuilder } from "discord.js";
import { recordAuditEvent } from "../models/audit";
import { countUserActiveEmoji, createEmoji } from "../models/emoji";
import { upsertEmojiLimit } from "../models/guild";
import { uploadDiscordAttachment } from "../s3";
import { referenceEmoji, simplePlural } from "../shared";
import type { DiscordCommand } from "../types";

export const command: DiscordCommand = {
  command: new SlashCommandSubcommandBuilder()
    .setName("add")
    .setDescription(`Adds an emoji to the server.`)
    .addAttachmentOption((opt) =>
      opt
        .setName("image")
        .setDescription("The image to show for this emoji.")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("name")
        .setDescription("The name for the emoji.")
        .setRequired(true),
    ),
  execute: async (interaction, prisma) => {
    await interaction.deferReply({ flags: ["Ephemeral"] });

    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const emojiName = interaction.options.getString("name");
    const attachment = interaction.options.getAttachment("image");

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
        content: "You must name your emoji!",
      });
      return;
    }

    // I'm using `attachment.contentType` as a kiddie filter.
    // I'll let Discord be the ultimate judge for if something is a valid emoji or not
    if (attachment === null || !attachment.contentType?.startsWith("image/")) {
      await interaction.editReply({
        content: "You must provide an image!",
      });
      return;
    }

    // Does the user have enough slots to create this emoji?
    const emojiPerUserLimit = await upsertEmojiLimit(prisma, guildId);
    const userActiveEmoji = await countUserActiveEmoji(prisma, guildId, userId);

    if (userActiveEmoji >= emojiPerUserLimit) {
      await interaction.editReply({
        content: `You have ${userActiveEmoji} ${simplePlural("emoji", userActiveEmoji)} on this server. The limit is ${emojiPerUserLimit}.`,
      });
      return;
    }

    // Try to create the emoji
    let emoji: GuildEmoji;
    try {
      // assert `guild` because if the guild doesn't exist, that's also a problem!
      emoji = await interaction.guild!.emojis.create({
        name: emojiName,
        attachment: attachment.proxyURL,
      });
    } catch (e) {
      // TODO: what if I give a collided name, an invalid name, etc?
      await interaction.editReply({
        content: "There was an error creating the emoji.",
      });
      return;
    }

    try {
      // Push the emoji to Cloudflare R2
      const cloudflareId = `emoji/${emoji.id}.${attachment.contentType.split("/")[1]}`;
      await uploadDiscordAttachment(attachment, cloudflareId);

      prisma.$transaction(async (tx) => {
        // Persist the emoji to the database
        await createEmoji(
          tx,
          guildId,
          userId,
          emoji.id,
          cloudflareId,
          interaction.channelId,
        );

        // Record an audit event so we know what happened
        await recordAuditEvent(
          tx,
          guildId,
          userId,
          `emoji::create(<:${emojiName}:${emoji.id}>)`,
          interaction.channelId,
        );
      });
    } catch (_) {
      // The emoji exists in Discord, but we couldn't persist it to DB or to Cloudflare.
      // Prisma will unwind the transaction automatically, if it executed.
      await emoji.delete();
      await interaction.editReply({
        content: "There was an error creating the emoji.",
      });
      return;
    }

    const emojiRef = referenceEmoji({
      emojiId: emoji.id,
      animated: emoji.animated,
      name: emoji.name,
    });

    await interaction.editReply({
      content: `${emojiRef} (\`<:${emoji.name}:>\`) is now an emoji. Use it wisely.`,
    });
  },
};

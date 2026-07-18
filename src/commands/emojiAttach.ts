import { PermissionFlagsBits, SlashCommandSubcommandBuilder } from "discord.js";
import { recordAuditEvent } from "../models/audit";
import { createEmoji, getServerActiveEmoji } from "../models/emoji";
import { uploadDiscordAttachment } from "../s3";
import { CHERRY_BOT_USERID, referenceEmoji } from "../shared";
import type { DiscordCommand } from "../types";

export const command: DiscordCommand = {
  command: new SlashCommandSubcommandBuilder()
    .setName("attach")
    .setDescription("Attaches an existing emoji to CherryBot.")
    .addStringOption((opt) =>
      opt
        .setName("name")
        .setDescription("Which emoji to attach.")
        .setRequired(true)
        .setAutocomplete(true),
    ),
  execute: async (interaction, prisma) => {
    await interaction.deferReply({ flags: ["Ephemeral"] });

    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const emojiName = interaction.options.getString("name")?.toLowerCase();

    if (
      !interaction.memberPermissions?.has(
        PermissionFlagsBits.ManageGuildExpressions,
      )
    ) {
      await interaction.editReply({
        content:
          "This subcommand requires the `Manage Expressions` permission.",
      });
      return;
    }

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
        content: "You must specify which emoji to attach!",
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

    const managedEmoji = (await getServerActiveEmoji(prisma, guildId)).map(
      (e) => e.emojiId,
    );
    if (managedEmoji.includes(discordEmoji.id)) {
      // @TODO
      await interaction.editReply({
        content: "Currently cannot transfer emojis between users!",
      });
    }

    // @TODO: check if the emoji exists in cloudflare first by asking, at a minimum, the database
    const cloudflareId = `emoji/${discordEmoji.id}.webp`;
    try {
      await uploadDiscordAttachment(
        discordEmoji.imageURL({ extension: "webp" }),
        cloudflareId,
      );
    } catch (e) {
      console.error(e);
      await interaction.editReply({
        content: "There was an error uploading the emoji to the database.",
      });
      return;
    }

    try {
      prisma.$transaction(async (tx) => {
        // Persist the emoji to the database
        await createEmoji(
          tx,
          guildId,
          CHERRY_BOT_USERID,
          discordEmoji.id,
          cloudflareId,
          interaction.channelId,
        );

        // Record an audit event so we know what happened
        await recordAuditEvent(
          tx,
          guildId,
          userId,
          `emoji::attach(<:${emojiName}:${discordEmoji.id}>) via ${userId} (originally via ${discordEmoji.author?.id ?? "Unknown"})`,
          interaction.channelId,
        );
      });
    } catch (e) {
      console.error(e);
      await interaction.editReply({
        content:
          "There was an error creating the emoji object in the database.",
      });
      return;
    }

    const emojiRef = referenceEmoji({
      emojiId: discordEmoji.id,
      animated: discordEmoji.animated,
      name: discordEmoji.name,
    });

    await interaction.editReply({
      content: `<@${CHERRY_BOT_USERID}> now controls ${emojiRef}!`,
    });
  },

  autocomplete: async (interaction, prisma) => {
    const guildId = interaction.guildId;

    if (guildId === null || interaction.guild === null) {
      await interaction.respond([]);
      return;
    }

    const focused = interaction.options.getFocused().toLowerCase();

    const managedEmoji = new Set(
      (await getServerActiveEmoji(prisma, guildId)).map((e) => e.emojiId),
    );

    // Grab everything that isn't a CherryBot-managed emoji
    const choices = interaction.guild.emojis.cache
      .filter(
        (emoji) =>
          !managedEmoji.has(emoji.id) &&
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

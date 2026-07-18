import { SlashCommandSubcommandBuilder } from "discord.js";
import { getUserActiveEmoji } from "../models/emoji";
import { referenceEmoji, sendPagedReply, simplePlural } from "../shared";
import type { DiscordCommand } from "../types";

export const command: DiscordCommand = {
  command: new SlashCommandSubcommandBuilder()
    .setName("list")
    .setDescription("Lists all the emoji you own on the server.")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription(
          "Which user to list the emojis of. Defaults to yourself",
        ),
    ),
  execute: async (interaction, prisma) => {
    await interaction.deferReply({ flags: ["Ephemeral"] });

    const guildId = interaction.guildId;
    const forSelf =
      interaction.options.getUser("user")?.id === interaction.user.id;
    const userId =
      interaction.options.getUser("user")?.id ?? interaction.user.id;

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

    const emojis = await getUserActiveEmoji(prisma, guildId, userId);

    if (emojis.length === 0) {
      const target = forSelf ? "You don't" : `<@${userId}> doesn't`;
      const trailer = forSelf
        ? ` Try creating one with \`/cherry emoji add\`!`
        : "";
      await interaction.editReply({
        content: `${target} have any emoji yet.${trailer}`,
      });
    } else {
      const target = forSelf ? "You have" : `<@${userId}> has`;
      await sendPagedReply(
        interaction,
        true,
        `${target} the following emoji in this server:\n`,
        await Promise.all(
          emojis.map(async (emoji) => {
            // Get time returns milliseconds
            const lastUsageUnixTime = Math.floor(
              emoji.lastUsage.getTime() / 1000,
            );

            // Arguably, this could be dropped since Discord seems to resolve just fine without this info
            const discordEmoji = await interaction.guild?.emojis.fetch(
              emoji.emojiId,
            );
            const emojiRef = referenceEmoji({
              emojiId: emoji.emojiId,
              animated: discordEmoji?.animated,
              name: discordEmoji?.name,
            });

            // `<t:${lastUsageUnixTime}:d>` gives the last used time in the user's locale as a short date string.
            // We could use `:f` instead for a form like "6/21/26 at 9:26am"
            return `- ${emojiRef} - Last used <t:${lastUsageUnixTime}:d> (${emoji.usageCount} ${simplePlural("time", emoji.usageCount)} total)\n`;
          }),
        ),
      );
    }
  },
};

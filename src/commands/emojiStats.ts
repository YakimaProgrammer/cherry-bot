import { SlashCommandSubcommandBuilder } from "discord.js";
import { getServerActiveEmoji } from "../models/emoji";
import { referenceEmoji, sendPagedReply, simplePlural } from "../shared";
import type { DiscordCommand } from "../types";

const DEFAULT_LIMIT = 15;

export const command: DiscordCommand = {
  command: new SlashCommandSubcommandBuilder()
    .setName("stats")
    .setDescription(
      "Gives status about all the emoji managed by CherryBot on this server.",
    )
    .addNumberOption((opt) =>
      opt
        .setName("limit")
        .setDescription(
          `Optional emoji limit (default: ${DEFAULT_LIMIT}). Values below 1 return all emoji.`,
        ),
    ),
  execute: async (interaction, prisma) => {
    await interaction.deferReply({ flags: ["Ephemeral"] });

    const guildId = interaction.guildId;
    const limit = interaction.options.getNumber("limit") ?? DEFAULT_LIMIT;

    if (guildId === null) {
      // For example, are we in DMs?
      await interaction.editReply({
        content: "This command can only be used in a server!",
      });
      return;
    }

    const emojis = await getServerActiveEmoji(prisma, guildId);

    if (emojis.length === 0) {
      await interaction.editReply({
        content:
          "This server doesn't have any emoji yet. Create some with `/cherry emoji create`!",
      });
    } else {
      const header =
        limit > 0
          ? `Here are the top ${limit} ${simplePlural("emoji", limit)} in this server:\n`
          : "This server has the following emoji:\n";
      await sendPagedReply(
        interaction,
        true,
        header,
        (
          await Promise.all(
            emojis.map(async (emoji) => {
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
              return `- ${emojiRef} - created by <@${emoji.userId}> - used ${emoji.usageCount} ${simplePlural("time", emoji.usageCount)}\n`;
            }),
          )
        ).slice(0, limit > 0 ? limit : Number.MAX_VALUE),
      );
    }
  },
};

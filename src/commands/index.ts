import { SlashCommandBuilder } from "discord.js";
import type { DiscordCommand } from "../types";

import { command as emojiAdd } from "./emojiAdd";
import { command as emojiAttach } from "./emojiAttach";
import { command as emojiDelete } from "./emojiDelete";
import { command as emojiList } from "./emojiList";
import { command as emojiStats } from "./emojiStats";

export const command = new SlashCommandBuilder()
  .setName("cherry")
  .setDescription("CherryBot commands")
  .addSubcommandGroup((group) =>
    group
      .setName("emoji")
      .setDescription("Manage your emoji on this server.")
      .addSubcommand(emojiAdd.command)
      .addSubcommand(emojiDelete.command)
      .addSubcommand(emojiList.command)
      .addSubcommand(emojiStats.command)
      .addSubcommand(emojiAttach.command),
  );

export const commands: Record<string, DiscordCommand | undefined> = {
  [`cherry:emoji:${emojiAdd.command.name}`]: emojiAdd,
  [`cherry:emoji:${emojiDelete.command.name}`]: emojiDelete,
  [`cherry:emoji:${emojiList.command.name}`]: emojiList,
  [`cherry:emoji:${emojiStats.command.name}`]: emojiStats,
  [`cherry:emoji:${emojiAttach.command.name}`]: emojiAttach,
};

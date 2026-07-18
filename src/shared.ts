import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import type { ChatInputCommandInteraction } from "discord.js";
import { PrismaClient } from "./generated/prisma/client";

export const CHERRY_BOT_USERID = "1525906719945916527";

const DB_URL = process.env.DATABASE_URL;
if (DB_URL === undefined)
  throw "DATABASE_URL environment variable was not specified!";

export const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: DB_URL }),
});

export function simplePlural(text: string, count: number) {
  if (count === 1) return text;
  else return text + "s";
}

interface EmojiLike {
  emojiId: string;
  name?: string;
  animated?: boolean;
}
export function referenceEmoji({ emojiId, name, animated }: EmojiLike) {
  // I found the first two fields don't really matter as long as the emojiId is correct
  return `<${animated ? "a" : ""}:${name ?? "ACustomEmoji"}:${emojiId}>`;
}

const DISCORD_MESSAGE_LIMIT = 2000;

export async function sendPagedReply(
  interaction: ChatInputCommandInteraction,
  ephemeral: boolean,
  header: string | undefined,
  lines: string[],
) {
  if (lines.length === 0) return;
  let current = header || lines.shift();
  let first = true;

  for (const line of lines) {
    const candidate = `${current}${line}`;

    if (candidate.length <= DISCORD_MESSAGE_LIMIT) {
      current = candidate;
      continue;
    }

    if (first) {
      await interaction.editReply({ content: current });
      first = false;
    } else {
      await interaction.followUp({
        content: current,
        flags: ephemeral ? ["Ephemeral"] : [],
      });
    }

    current = line;
  }

  if (first) {
    await interaction.editReply({ content: current });
  } else if ((current?.length ?? 0) > 0) {
    await interaction.followUp({
      content: current,
      flags: ephemeral ? ["Ephemeral"] : [],
    });
  }
}
